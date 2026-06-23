import { TOOL_DECLARATIONS } from './toolDeclarations';
import type { ToolResult } from './toolExecutor';
import { executeTool } from './toolExecutor';

const AGENT_SYSTEM = `You are Zen Agent — an autonomous AI assistant with real tools.
You can read tasks, create tasks, schedule calendar blocks, and send reminders.
When the user asks you to do something: ALWAYS use the available tools to actually do it.
Never just describe what you would do — use the tools and DO IT.
After you've taken all needed actions, respond naturally explaining what you did.`;

export type AgentStep = 
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; toolName: string; args: any }
  | { type: 'tool_result'; toolName: string; result: ToolResult }
  | { type: 'answer'; text: string };

import { callWithFallback } from '../services/gemini/core';

export const runAgentLoop = async (
  userMessage: string,
  userTodos: any[],
  calendarEvents: any[],
  apiKey: string,
  onStep: (step: AgentStep) => void
): Promise<string> => {

  const contents: any[] = [{ role: 'user', parts: [{ text: userMessage }] }];
  let finalAnswer = '';
  const MAX_ITERATIONS = 10; // prevent infinite loops

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    onStep({ type: 'thinking', text: 'Zen AI is thinking...' });
    window.dispatchEvent(new CustomEvent('agent-log', { detail: { type: 'thinking', text: 'Zen AI is thinking...' } }));
    
    let response;
    try {
      response = await callWithFallback(async (genAI, modelName) => {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: AGENT_SYSTEM,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        });
        return await model.generateContent({ contents });
      });
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      let friendlyError = err.message || 'Unknown error occurred.';
      
      if (msg.includes('401') || msg.includes('authentication')) {
        friendlyError = 'My Gemini API key is invalid or expired. Please update VITE_GEMINI_API_KEY in the .env file.';
      } else if (msg.includes('429') || msg.includes('quota')) {
        friendlyError = 'I have reached my Gemini API rate limit. Please try again later or use a different key.';
      }

      window.dispatchEvent(new CustomEvent('agent-log', { detail: { type: 'answer', text: `⚠️ ${friendlyError}` } }));
      return `Agent Loop Failed: ${friendlyError}`;
    }

    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const parts = candidate.content.parts;
    
    // Check if AI wants to call a function
    const functionCallPart = parts.find((p: any) => !!p.functionCall);
    if (functionCallPart && functionCallPart.functionCall) {
      const name = functionCallPart.functionCall.name;
      const args = functionCallPart.functionCall.args as any;
      onStep({ type: 'tool_call', toolName: name, args });
      window.dispatchEvent(new CustomEvent('agent-log', { detail: { type: 'tool_call', toolName: name, args } }));
      
      // Execute the real tool
      const result = await executeTool(name, args, userTodos, calendarEvents);
      onStep({ type: 'tool_result', toolName: name, result });
      window.dispatchEvent(new CustomEvent('agent-log', { detail: { type: 'tool_result', toolName: name, result } }));
      
      // Add AI's function call + our result to the conversation
      contents.push({ role: 'model', parts: [{ functionCall: { name, args } }] });
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name, response: { result: result.data, message: result.message } } }]
      });
      continue; // loop again — AI may call more tools
    }

    // No function call → AI has a text response → done
    const textPart = parts.find((p: any) => !!p.text);
    if (textPart && textPart.text) {
      finalAnswer = textPart.text;
      onStep({ type: 'answer', text: finalAnswer });
      window.dispatchEvent(new CustomEvent('agent-log', { detail: { type: 'answer', text: finalAnswer } }));
      break;
    }
    break;
  }

  return finalAnswer;
};

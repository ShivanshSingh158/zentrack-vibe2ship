import { TOOL_DECLARATIONS } from './toolDeclarations';
import type { ToolResult } from './toolExecutor';
import { executeTool } from './toolExecutor';
import { callWithFallback } from '../services/gemini/core';

const AGENT_SYSTEM = `You are Zen Agent — an autonomous AI assistant with real tools.
You can read tasks, create tasks, schedule calendar blocks, and send reminders.
When the user asks you to do something: ALWAYS use the available tools to actually do it.
Never just describe what you would do — use the tools and DO IT.
After you've taken all needed actions, respond naturally explaining what you did.`;

export type AgentStep = 
  | { type: 'thinking'; title: string }
  | { type: 'tool_call'; toolName: string; args: any }
  | { type: 'tool_result'; toolName: string; result: ToolResult }
  | { type: 'answer'; title: string };

// Safe event dispatch — works in both browser and server contexts
const safeDispatch = (detail: any) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agent-log', { detail }));
  }
};

export const runAgentLoop = async (
  userMessage: string,
  userTodos: any[],
  calendarEvents: any[],
  apiKey: string,
  onStep: (step: AgentStep) => void,
  systemInstruction?: string,
  modelOverride?: string
): Promise<string> => {

  const effectiveSystem = systemInstruction || AGENT_SYSTEM;
  const contents: any[] = [{ role: 'user', parts: [{ text: userMessage }] }];
  let finalAnswer = '';
  const MAX_ITERATIONS = 10; // prevent infinite loops

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response;
    try {
      response = await callWithFallback(async (genAI, modelName) => {
        const activeModel = modelOverride || modelName;
        onStep({ type: 'thinking', title: `Zen AI is thinking... (${activeModel})` });
        safeDispatch({ type: 'thinking', title: `Zen AI is thinking... (${activeModel})` });

        const model = genAI.getGenerativeModel({
          model: activeModel,
          systemInstruction: effectiveSystem,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        });
        return await model.generateContent({ contents });
      });
    } catch (err: any) {
      const friendlyError = err.message || 'Unknown error occurred.';
      safeDispatch({ type: 'answer', title: `⚠️ ${friendlyError}` });
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
      safeDispatch({ type: 'tool_call', toolName: name, args });
      
      // Execute the real tool
      const result = await executeTool(name, args, userTodos, calendarEvents);
      onStep({ type: 'tool_result', toolName: name, result });
      safeDispatch({ type: 'tool_result', toolName: name, result });
      
      // Add AI's function call + our result to the conversation
      contents.push({ role: 'model', parts: candidate.content.parts });
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
      onStep({ type: 'answer', title: finalAnswer });
      safeDispatch({ type: 'answer', title: finalAnswer });
      break;
    }
    break;
  }

  return finalAnswer;
};

import { GoogleGenerativeAI } from '@google/generative-ai';
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

export const runAgentLoop = async (
  userMessage: string,
  userTodos: any[],
  calendarEvents: any[],
  apiKey: string,
  onStep: (step: AgentStep) => void
): Promise<string> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: AGENT_SYSTEM,
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
  });

  const contents: any[] = [{ role: 'user', parts: [{ text: userMessage }] }];
  let finalAnswer = '';
  const MAX_ITERATIONS = 10; // prevent infinite loops

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    onStep({ type: 'thinking', text: 'Zen AI is thinking...' });
    
    const response = await model.generateContent({ contents });
    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const parts = candidate.content.parts;
    
    // Check if AI wants to call a function
    const functionCallPart = parts.find((p: any) => !!p.functionCall);
    if (functionCallPart && functionCallPart.functionCall) {
      const name = functionCallPart.functionCall.name;
      const args = functionCallPart.functionCall.args as any;
      onStep({ type: 'tool_call', toolName: name, args });
      
      // Execute the real tool
      const result = await executeTool(name, args, userTodos, calendarEvents);
      onStep({ type: 'tool_result', toolName: name, result });
      
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
      break;
    }
    break;
  }

  return finalAnswer;
};

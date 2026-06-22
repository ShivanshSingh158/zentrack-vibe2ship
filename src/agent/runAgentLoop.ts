import { GoogleGenerativeAI } from '@google/generative-ai';
import { TOOL_DECLARATIONS } from './toolDeclarations';
import { executeTool } from './toolExecutor';
import type { ToolResult } from './toolExecutor';

const AGENT_SYSTEM = `You are Zen Agent — an autonomous AI assistant embedded inside the Zentrack productivity app.
You have real tools at your disposal. You can read tasks, create tasks, schedule calendar blocks, and send push notifications.

CRITICAL RULES:
1. When the user asks you to do something (e.g. "schedule my tasks", "remind me later", "what do I have today"), ALWAYS use the tools to actually do it.
2. Do NOT just tell the user what you *would* do. Use the tool and do it.
3. If you need to schedule multiple things, you can call multiple tools.
4. Always call get_free_calendar_slots BEFORE you call schedule_task_in_calendar so you don't double-book the user.
5. After you have executed all necessary tools, write a brief, friendly, natural language response confirming what you did. Be concise. Act like a high-performance coach.`;

export type AgentStep =
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; toolName: string; args: any }
  | { type: 'tool_result'; toolName: string; result: ToolResult }
  | { type: 'answer'; text: string };

/**
 * Runs the autonomous agent loop.
 * It sends the user message to Gemini, and if Gemini decides to call a tool,
 * it executes the tool, feeds the result back to Gemini, and loops until Gemini
 * produces a final text answer.
 */
export const runAgentLoop = async (
  userMessage: string,
  userTodos: any[],
  calendarEvents: any[],
  apiKey: string,
  onStep: (step: AgentStep) => void
): Promise<string> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // We use gemini-2.5-flash as it is extremely fast and great at function calling
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: AGENT_SYSTEM,
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
  });

  const contents: any[] = [{ role: 'user', parts: [{ text: userMessage }] }];
  let finalAnswer = '';
  const MAX_ITERATIONS = 10; // Failsafe to prevent infinite loops

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    onStep({ type: 'thinking', text: 'Zen Agent is thinking...' });

    const response = await model.generateContent({ contents });
    const candidate = response.response.candidates?.[0];
    
    if (!candidate) {
      throw new Error('No response from AI.');
    }

    const parts = candidate.content.parts;

    // 1. Check if the AI wants to call a tool
    const functionCallPart = parts.find((p: any) => p.functionCall);
    if (functionCallPart) {
      const { name, args } = functionCallPart.functionCall as any;
      onStep({ type: 'tool_call', toolName: name, args });

      // Execute the real tool
      const result = await executeTool(name, args, userTodos, calendarEvents);
      onStep({ type: 'tool_result', toolName: name, result });

      // Feed the tool call and the result back into the conversation history
      contents.push({
        role: 'model',
        parts: [{ functionCall: { name, args } }],
      });
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name,
              response: { result: result.data, message: result.message },
            },
          },
        ],
      });
      
      // Loop again so the AI can decide what to do next
      continue;
    }

    // 2. If no function call, the AI should have provided a text response
    const textPart = parts.find((p: any) => p.text);
    if (textPart) {
      finalAnswer = textPart.text || '';
      onStep({ type: 'answer', text: finalAnswer });
      break; // The loop is finished!
    }

    // Failsafe break
    break;
  }

  if (!finalAnswer) {
    return "I executed the tasks, but couldn't generate a final summary.";
  }

  return finalAnswer;
};

/**
 * @file GeminiLiveClient.ts
 * @module src/services/geminiLive/GeminiLiveClient
 *
 * A clean, production-grade WebSocket client for the Gemini Live API
 * (BidiGenerateContent endpoint).
 *
 * ## Architecture
 * - Audio IN:  raw 16kHz int16 PCM chunks from AudioWorklet → base64 → WebSocket
 * - Text OUT:  streaming text deltas → accumulated → Sarvam TTS
 * - Tool OUT:  function_call → dispatched to ZenTrack's 12-agent pipeline
 *
 * ## Protocol
 * 1. Open WebSocket
 * 2. Send `setup` message (first message, defines model + tools)
 * 3. Stream audio via `realtimeInput` messages
 * 4. Receive `serverContent` (text) and `toolCall` messages
 * 5. For tool calls: execute agent, send `toolResponse`
 *
 * @see https://ai.google.dev/api/live for API reference
 */

const GEMINI_LIVE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

// The Live model available for this account (discovered via /v1beta/models list)
const GEMINI_LIVE_MODEL = 'models/gemini-2.0-flash-exp';

const SARA_SYSTEM_PROMPT = `You are Sara, an intelligent personal AI assistant built into ZenTrack — a productivity app for students.

Your personality: friendly, concise, smart, warm. You speak in a natural, conversational Indian English tone.

Rules:
- Keep spoken responses SHORT (1-3 sentences max for conversation).
- For tasks (check calendar, add task, read emails, search YouTube, etc.) → call execute_task tool.
- For simple questions, greetings, chitchat → respond directly in text, no tool needed.
- Never say "As an AI language model...". Just be helpful.
- If user speaks in Hindi/Hinglish, respond in the same language naturally.

Examples of what triggers execute_task:
- "what's on my calendar tomorrow" → execute_task
- "add a task to study DSA" → execute_task  
- "check my emails" → execute_task
- "play some lofi music" → execute_task

Examples of direct text responses:
- "how are you" → "I'm doing great, thanks for asking! What can I help you with?"
- "what time is it" → "I don't have access to a clock, but your device should show it!"
- "stop" / "bye" → "Take care! I'll be here when you need me."`;

/** Convert Int16Array PCM → base64 string (in safe chunks to avoid stack overflow) */
function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export interface GeminiLiveCallbacks {
  onTextDelta: (text: string) => void;       // streaming text chunk
  onAudioDelta?: (base64Pcm: string) => void; // streaming audio chunk (raw PCM)
  onTurnComplete: () => void;                 // model finished speaking turn
  onToolCall: (id: string, args: { prompt: string }) => void; // execute_task requested
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (msg: string) => void;
}

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private callbacks: GeminiLiveCallbacks;
  private isConnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(apiKey: string, callbacks: GeminiLiveCallbacks) {
    this.apiKey = apiKey;
    this.callbacks = callbacks;
  }

  /** Open the WebSocket and send the setup message. Returns a promise that resolves when ready. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const url = `${GEMINI_LIVE_URL}?key=${this.apiKey}`;
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      let setupSent = false;

      ws.onopen = () => {
        console.log('[GeminiLive] ✅ WebSocket connected');
        this.isConnected = true;

        // CRITICAL: Setup must be the FIRST message sent
        ws.send(JSON.stringify({
          setup: {
            model: GEMINI_LIVE_MODEL,
            generationConfig: {
              responseModalities: ['AUDIO'], // This model ONLY supports AUDIO modality
            },
            systemInstruction: {
              parts: [{ text: SARA_SYSTEM_PROMPT }],
            },
            tools: [{
              functionDeclarations: [{
                name: 'execute_task',
                description: 'Execute any task in the ZenTrack app: check/add calendar events, read/send emails, manage tasks, search YouTube, check analytics, etc. Use this for anything that requires accessing the user\'s data.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    prompt: {
                      type: 'STRING',
                      description: 'The full natural language description of the task to execute.',
                    },
                  },
                  required: ['prompt'],
                },
              }],
            }],
          },
        }));

        setupSent = true;
        this.callbacks.onConnected();
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(
            typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)
          );
          this._handleMessage(data);
        } catch (err) {
          console.error('[GeminiLive] Failed to parse message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('[GeminiLive] WebSocket error:', event);
        if (!setupSent) {
          reject(new Error('WebSocket connection failed — the Gemini Live API may not be available for this key. Enable it at aistudio.google.com'));
        }
        this.callbacks.onError('Connection failed — check API key has Live API access (aistudio.google.com)');
      };

      ws.onclose = (event) => {
        console.log(`[GeminiLive] WebSocket closed: code=${event.code}, reason=${event.reason}`);
        this.isConnected = false;
        this.ws = null;
        this.callbacks.onDisconnected();
      };
    });
  }

  /** Handle incoming server messages */
  private _handleMessage(data: any) {
    // ── Server setup response (acknowledge)
    if (data.setupComplete) {
      console.log('[GeminiLive] ✅ Setup acknowledged by server');
      return;
    }

    // ── Streaming text or audio delta
    if (data.serverContent?.modelTurn?.parts) {
      for (const part of data.serverContent.modelTurn.parts) {
        if (typeof part.text === 'string' && part.text) {
          this.callbacks.onTextDelta(part.text);
        } else if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
          this.callbacks.onAudioDelta?.(part.inlineData.data);
        }
      }
    }

    // ── Turn complete (model finished its response)
    if (data.serverContent?.turnComplete === true) {
      this.callbacks.onTurnComplete();
    }

    // ── Tool call (execute_task)
    if (data.toolCall?.functionCalls?.length > 0) {
      for (const call of data.toolCall.functionCalls) {
        if (call.name === 'execute_task') {
          console.log('[GeminiLive] 🔧 Tool call received:', call.args);
          this.callbacks.onToolCall(call.id, call.args as { prompt: string });
        }
      }
    }
  }

  /**
   * Stream a chunk of raw 16kHz int16 PCM audio to Gemini.
   * Called repeatedly from the AudioWorklet message handler.
   */
  sendAudio(pcm: Int16Array) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const base64 = int16ToBase64(pcm);
    this.ws.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        }],
      },
    }));
  }

  /**
   * Signal to Gemini Live that the user has stopped speaking, forcing an immediate response.
   */
  sendEndOfTurn() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      clientContent: {
        turnComplete: true,
      }
    }));
  }

  /**
   * Send the result of an execute_task tool call back to Gemini.
   * Gemini will then generate a spoken summary of the result.
   */
  sendToolResult(callId: string, result: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    console.log('[GeminiLive] 📤 Sending tool result for id:', callId);
    this.ws.send(JSON.stringify({
      toolResponse: {
        functionResponses: [{
          id: callId,
          name: 'execute_task',
          response: { output: result.substring(0, 2000) }, // cap at 2000 chars
        }],
      },
    }));
  }

  /** Disconnect and clean up */
  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.isConnected = false;
    if (this.ws) {
      try { this.ws.close(1000, 'Client disconnected'); } catch {}
      this.ws = null;
    }
  }

  get connected() { return this.isConnected; }
}

# ZenTrack — Technical Architecture

This document is for engineers who want to understand the internals of ZenTrack's AI agentic system, voice pipeline, and data flow.

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Multi-Agent Orchestration](#multi-agent-orchestration)
3. [DAG Execution Engine](#dag-execution-engine)
4. [Gemini API Integration](#gemini-api-integration)
5. [Voice Pipeline](#voice-pipeline)
6. [Google Workspace Integration](#google-workspace-integration)
7. [Security Model](#security-model)
8. [Data Flow Diagrams](#data-flow-diagrams)

---

## System Overview

ZenTrack is a **multi-agent AI productivity system** where:

- The **frontend** (React/Vite PWA) is the user interface and event bus
- The **agent layer** (`src/agent/`) is the brain — planning, delegating, and executing
- The **server layer** (`api/`) is the secure bridge to external AI and Google APIs
- **Firebase** is the persistent data layer with real-time sync

The system uses a **window CustomEvent bus** (`agent-log`, `agent-shortcut`) as the internal message bus between the voice layer, UI layer, and agent execution layer. This decoupled approach means any component can dispatch or listen to agent events without prop drilling.

---

## Multi-Agent Orchestration

### Intent Classification

Every user command first passes through a **fast heuristic router** (no LLM needed):

```
User input
    │
    ├─► Fast Router (regex patterns + word count heuristic)
    │     If matched → dispatch single-agent task immediately
    │
    └─► LLM Intent Classifier (Gemini Flash, <1s)
          Returns: { intent: 'ACTIONABLE' | 'CHITCHAT', hardness: 1-4, response, delegation }
          │
          ├─► CHITCHAT / CLARIFICATION → respond directly, no agents spawned
          └─► ACTIONABLE → build DAG, spawn agent fleet
```

### Agent Routing by Complexity

| Level | Description | Agents Deployed |
|---|---|---|
| LEVEL_1 | Simple retrieval/navigation | NAVIGATOR or AEGIS only |
| LEVEL_2 | Single action | 1-2 specialist agents + AEGIS |
| LEVEL_3 | Multi-step orchestration | ORACLE + specialists (parallel) + AEGIS |
| LEVEL_4 | Emergency/full-fleet | All relevant agents in parallel + AEGIS |

---

## DAG Execution Engine

File: `src/agent/core/DagEngine.ts`

The DAG engine manages agent dependencies to:
1. Prevent redundant API calls (ORACLE fetches once, all agents share the data)
2. Run independent agents in parallel
3. Block dependent agents until their dependencies complete

```typescript
// Example DAG for "Read my emails and reschedule my day"
tasks = [
  { id: 'T1', agent: 'ORACLE',  deps: [],         parallel: true  },
  { id: 'T2', agent: 'HERMES',  deps: ['T1'],     parallel: false },
  { id: 'T3', agent: 'CHRONOS', deps: ['T1'],     parallel: true  },  // parallel with HERMES
  { id: 'T4', agent: 'AEGIS',   deps: ['T2','T3'] parallel: false },  // waits for both
]
```

### Shared State

File: `src/agent/core/SharedState.ts`

All agents within a single mission share a `SharedState` map. When ORACLE reads tasks or CHRONOS reads calendar slots, the results are stored here. Subsequent agents query the SharedState first before making API calls.

This eliminates the primary cause of the previous 18x API call amplification bug.

---

## Gemini API Integration

File: `src/services/gemini/core.ts`

### Key Architecture Decisions

**1. Server-Side Proxy (Production)**

Gemini API keys are NEVER bundled in the client JavaScript. On production, all Gemini calls are intercepted by a fetch monkey-patch and redirected to `/api/gemini-proxy`:

```
Browser fetch(https://generativelanguage.googleapis.com/...) with key='proxy_dummy_key'
    │
    └─► Intercepted by core.ts fetch monkey-patch
            │
            └─► POST /api/gemini-proxy
                    Authorization: Bearer <Firebase ID Token>
                    body: { model, contents, tools, toolConfig, systemInstruction }
                    │
                    └─► Verifies Firebase token
                    └─► Round-robin key rotation
                    └─► Returns Gemini response
```

**2. Two-Tier Model Strategy**

| Tier | Model | Use Case |
|---|---|---|
| Research | `gemini-2.5-flash` | Deep analysis: ORACLE, HERMES, CHRONOS, ENIGMA |
| Voice | `gemini-2.5-flash-lite-preview-06-17` | Fast responses: NAVIGATOR, AEGIS, TITAN |

**3. Global Semaphore**

A `MAX_CONCURRENT_API_CALLS = 8` semaphore prevents rate-limit cascades when multiple agents run in parallel.

**4. Multi-Key Rotation**

Up to 10 Gemini API keys in `GEMINI_KEYS` pool. On 429 (rate limit), the proxy automatically rotates to the next key.

---

## Voice Pipeline

### Conversational Loop (VoiceContext)

```
startConversation()
    │
    └─► startMicListening() — Browser SpeechRecognition (continuous)
              │
              onresult → accumulate text
              silence timer (1800ms) → sendToAgent()
                                            │
                                            ├─► correctTranscript() — LLM mishearing fix
                                            │
                                            └─► window.dispatchEvent('agent-shortcut')
                                                        │
                                                    HomeDashboard picks up
                                                        │
                                                    orchestrateAgent()
                                                        │
                                                    agent fleet runs
                                                        │
                                                    SPOKEN_SUMMARY extracted
                                                        │
                                                    speakText() → TTS queue
                                                        │
                                                    ┌─ isMuted?
                                                    │     NO  → Sarvam TTS API → audio
                                                    │     YES → skip audio
                                                    └─► startMicListening() restarts
```

### TTS Queue

TTS calls are queued (`ttsQueueRef`) and played sequentially to prevent overlapping audio. Each `onStep` event from the agent loop that produces an `answer` type is enqueued. After the queue drains, the mic restarts automatically.

---

## Google Workspace Integration

File: `src/services/googleWorkspace.ts`, `src/services/googleCalendar.ts`

### OAuth Flow

```
User clicks "Connect Google"
    │
    └─► google.accounts.oauth2.initTokenClient()
              │
              User approves scopes in Google popup
              │
              Google returns access_token (short-lived, ~1hr)
              │
              Token stored in memory (NOT localStorage for security)
              │
              zen_gcal_has_refresh_token flag set in localStorage
              │
              All workspace API calls use Bearer token
```

### Silent Token Refresh

When a token expires mid-mission, `forceSilentRefresh()` is called. This uses the existing refresh token to obtain a new access token without requiring user interaction. A singleton lock (`_oauthRefreshLock`) prevents parallel refresh attempts from multiple agents.

---

## Security Model

| Threat | Mitigation |
|---|---|
| Gemini key theft | Keys stored server-side in Vercel env vars, never in browser bundle |
| Proxy abuse | Firebase ID token verification on every proxy request |
| Rate limit DoS | Per-user 100 req/min limit tracked in Firestore |
| OAuth token theft | Access tokens stored in memory only, never localStorage |
| XSS → key extraction | No keys in DOM, window, or localStorage |
| Firestore unauthorized reads | Security rules enforce `request.auth.uid == resource.data.userId` |

---

## Data Flow Diagrams

### Task Creation Flow
```
User: "Create a task to finish the report by tomorrow"
    │
    Fast Router (no match → LLM)
    │
    Intent Classifier → LEVEL_2, deploy TITAN → AEGIS
    │
    TITAN.runAgentLoop()
      │── Tool call: create_task({ title: "Finish the report", date: "tomorrow" })
      │── toolExecutor → addDoc(Firestore, tasks collection)
      │── Firestore onSnapshot → GlobalDataContext updates
      │── UI re-renders with new task
    │
    AEGIS.runAgentLoop()
      │── Synthesizes: "I've created 'Finish the report' due tomorrow"
      │── SPOKEN_SUMMARY extracted
    │
    VoiceContext.speakText() → Sarvam TTS → Sara speaks the response
```

### Email Read Flow
```
User: "What important emails do I have?"
    │
    Intent Classifier → LEVEL_2, deploy HERMES → AEGIS
    │
    HERMES.runAgentLoop()
      │── Tool call: read_gmail({ query: "is:unread", maxResults: 15 })
      │── toolExecutor → Gmail API → fetchUnreadEmails()
      │── Returns: 15 emails with subject, sender, snippet
    │
    AEGIS.runAgentLoop()
      │── Synthesizes priority summary
      │── SPOKEN_SUMMARY: "You have 3 important emails..."
    │
    Sara speaks the summary
```

# Contributing to ZenTrack

Thank you for your interest in contributing to ZenTrack! This document explains our development workflow, code standards, and contribution process.

---

## Table of Contents
- [Development Setup](#development-setup)
- [Branch Strategy](#branch-strategy)
- [Code Standards](#code-standards)
- [Adding Features](#adding-features)
- [Pull Request Process](#pull-request-process)
- [Agent Development Guide](#agent-development-guide)

---

## Development Setup

### Prerequisites
- Node.js >= 18
- npm >= 9

### Quick Start
```bash
git clone https://github.com/ShivanshSingh158/zentrack-vibe2ship.git
cd zentrack-vibe2ship
npm install
cp .env.example .env.local    # fill in your keys
npm run dev
```

---

## Branch Strategy

We use **GitHub Flow** — simple, deployment-friendly:

```
main               → production (Vercel auto-deploys)
  └── feature/xyz  → feature branches (PR into main)
  └── fix/xyz      → bug fixes (PR into main)
  └── docs/xyz     → documentation changes
```

### Branch Naming
```
feature/add-whatsapp-notifications
fix/mic-not-opening-production
docs/update-agent-fleet-readme
refactor/voice-context-cleanup
```

---

## Code Standards

### TypeScript
- **Strict mode** is enabled — no `any` unless absolutely necessary
- All public functions and React components must have JSDoc comments
- Use `type` over `interface` for union types; `interface` for extensible objects

### React
- Functional components only — no class components
- Custom hooks for all stateful logic that spans more than one component
- `useCallback` + `useMemo` for expensive computations and event handlers in hot paths
- Avoid `useEffect` for data fetching — prefer event-driven patterns

### File Headers
Every source file must begin with a JSDoc block:

```typescript
/**
 * @file Brief description of what this file does.
 * @module path/to/module
 *
 * Longer description explaining the design decisions, constraints,
 * and any important gotchas a new developer should know.
 */
```

### Comments
- Explain **why**, not what. The code already shows what.
- Use `// ── Section Name ────────` dividers for long files
- Mark TODO items with `// TODO(username): description`
- Mark known bugs with `// FIXME: description`

---

## Adding Features

### New UI Feature (Feature Module)
1. Create `src/features/your-feature/` directory
2. Create `index.tsx` as the main entry point
3. Add a route in `src/App.tsx`
4. Export from `src/features/your-feature/index.ts`

### New API Route
1. Create `api/your-route.js` (or `.ts`)
2. Add the route to `vercel.json` rewrites
3. Document with a full JSDoc header explaining auth requirements

---

## Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch from `main`
3. **Write** your changes with proper JSDoc comments
4. **Test** locally: `npm run dev` and `npm run build`
5. **Submit** a PR with the template filled out
6. **Wait** for review — we aim for < 48 hour turnaround

### PR Checklist
- [ ] `npm run build` passes with no new errors
- [ ] All new functions have JSDoc comments
- [ ] No `console.log` statements left in production paths
- [ ] Environment variables documented in README if added
- [ ] No API keys or secrets committed

---

## Agent Development Guide

### Adding a New Agent

Agents are specialized Gemini instances with a restricted tool whitelist and a custom system prompt.

**Step 1: Define the System Prompt**
```typescript
// src/agent/fleet/NewAgents.ts
export const MY_AGENT_SYSTEM = `You are MyAgent...`;
```

**Step 2: Register Agent Details**
```typescript
// src/agent/fleet/agentDetails.ts
MY_AGENT: {
  title: 'My Agent',
  icon: '🔮',
  color: '#a78bfa',
  description: 'What this agent does',
}
```

**Step 3: Add to Tool Whitelist**
```typescript
// src/agent/runAgentLoop.ts — AGENT_TOOL_WHITELIST
MY_AGENT: ['tool_one', 'tool_two', 'read_gmail'],
```

**Step 4: Register in Orchestrator**
Add delegation instructions to `buildSupervisorPrompt()` in `src/agent/orchestrator.ts`.

---

## Questions?

Open a [GitHub Discussion](https://github.com/ShivanshSingh158/zentrack-vibe2ship/discussions) or reach out directly.

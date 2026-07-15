# ZenTrack Custom AI Rules

## 🔴 HARD CONSTRAINT: ARCHITECTURE FIRST (CRITICAL DIRECTIVE)
**UNDER NO CIRCUMSTANCES** are you allowed to use `grep_search`, `list_dir`, or start exploring the codebase blindly at the beginning of a task. 

Before doing **ANYTHING ELSE**, you **ABSOLUTELY MUST** read the `SYSTEM_ARCHITECTURE.md` file located in this `.agents/` folder. This is a non-negotiable hard constraint for this workspace.

This file is the single source of truth for the codebase map, data schemas, and custom events. Bypassing this step causes hallucinated file paths, wasted API tokens, and architectural drift.

**MANDATORY EXECUTION PROTOCOL:**
1. **FIRST ACTION:** Call `view_file` on `.agents/SYSTEM_ARCHITECTURE.md`. Do not perform any other action until this is done.
2. Locate your target component, hook, or service in the File Index or Critical Paths.
3. Call `view_file` directly on the exact file path found in the architecture doc.
4. Only then may you proceed with your execution or use generic search tools if the file was not listed.

---

## 🔴 HARD CONSTRAINT: MOBILE ARCHITECTURE FIRST (CRITICAL DIRECTIVE)

**KEYWORD TRIGGERS**: Any mention of "mobile app", "Expo", "React Native", "Sara on mobile", "mobile notification", "mobile screen", "mobile agent", "orchestrator.ts (mobile)", or any Expo/React Native specific feature **ABSOLUTELY MUST** trigger reading the mobile architecture file first.

**MANDATORY MOBILE EXECUTION PROTOCOL:**
1. **FIRST ACTION:** Call `view_file` on `mobile/MOBILE_ARCHITECTURE.md`. Do not do anything else until this is done.
2. Use **Section 4 (File Index)** to jump directly to the exact file you need.
3. Call `view_file` on that exact path.
4. Only then may you proceed. Do NOT use `grep_search` or `list_dir` on mobile code without reading the architecture first.

This file covers: all 35+ packages with exact versions, 30+ screen paths, all services/hooks/contexts, SARA AI flow (voice → Gemini transcription → Socket.IO → 16 agents → Sarvam TTS), 18 Firestore collections with TypeScript types, notification channels, AsyncStorage keys, XP system, gym plan, backend architecture, and known hotspots.


## Rule: No Scratch/Temp Files Inside the Project
Never create temporary, throwaway, or helper scripts inside the project workspace directory (`zentrack-vibe2ship/` or any subfolder within it).

**This includes:**
- One-off Python/JS/shell scripts used as workarounds (e.g., to write large files)
- Test files not part of the actual codebase
- Any file you plan to delete immediately after running

**Where scratch files MUST go instead:**
- Use the artifact scratch directory: `<appDataDir>\brain\<conversation-id>\scratch\`
- This path is always available and is never part of the user's project.

**Why:** Even if deleted immediately, creating temp files inside the project pollutes git history, breaks the user's mental model of their own codebase, and violates the principle of leaving the workspace clean.

---

## Rule: No Automatic Mission Report Popups
Never automatically display the full-screen or modal "Mission Report" after a task completes. The user prefers a clean interface where the mic simply closes and the agent relies on TTS (voice) and passive HUD indicators. The `show-mission-report` event should only be triggered by explicit user action (e.g., clicking a "View Report" button), never automatically at the end of an execution flow.

---

## Rule: Unified Render Branches (AnimatePresence)
When rendering top-level state changes (e.g., Auth Loading -> App, or Landing -> App), NEVER use disjoint early `return` statements that completely unmount the tree. This bypasses React's virtual DOM diffing and `framer-motion`'s `AnimatePresence`, causing a jarring black flash and layout shifts. Instead, always wrap top-level phase transitions inside a single `<AnimatePresence mode="wait">` and use conditional rendering (`{authLoading ? <Loader/> : <App/>}`) to ensure smooth cross-fading.

---

## Rule: Voice Orb 30-Second Idle Auto-Stop

When S.A.R.A's voice conversation is active and the mic reopens after a response (i.e., Sara finishes speaking and is waiting for user input), an idle timer of **30 seconds** MUST run in the background.

- If the user speaks before 30 seconds: reset the timer.
- If 30 seconds elapse with no speech: dispatch `agent-stop-conversation-command` to stop the conversation gracefully (which calls `stopConversation()` and speaks a goodbye message).

**Implementation location**: `src/contexts/VoiceContext.tsx` → `startMicListening()` → `recognition.onstart` starts a 30s `idleTimerRef` timeout. `recognition.onresult` clears it on any speech. `stopConversation()` also clears it in cleanup.

**Why**: Prevents the mic from staying open indefinitely when the user walks away or stops using the feature, draining battery and creating a poor UX.

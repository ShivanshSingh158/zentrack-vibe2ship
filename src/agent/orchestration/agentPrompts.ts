import {
  SEARCH_SYSTEM, DOCS_SYSTEM, DATA_SYSTEM, COMMS_SYSTEM, 
  SCHEDULER_SYSTEM, DRIVE_SYSTEM, CODING_SYSTEM, QA_SYSTEM,
  MEET_SYSTEM, PLANNER_SYSTEM, MONITOR_SYSTEM, GHOST_DETECTOR_SYSTEM, EXECUTOR_SYSTEM,
  NAVIGATOR_SYSTEM, WEB_SYSTEM, GYM_SYSTEM
} from '../fleet/NewAgents';

/**
 * Voice output rules appended to every agent's system prompt.
 * Ensures agents always emit a SPOKEN_SUMMARY block that the TTS pipeline
 * can extract — clean, plain English with no markdown artifacts.
 */
const VOICE_SPEECH_RULES = `

## VOICE OUTPUT RULE (MANDATORY)
You MUST end EVERY response with a SPOKEN_SUMMARY: block.
The TTS engine reads only this block aloud. Everything else is shown visually.

SPOKEN_SUMMARY: [Your summary here. Rules:]
- Maximum 3 short sentences. Plain conversational English only.
- NO markdown, NO bullet points, NO asterisks, NO backticks, NO emoji, NO headers.
- Spell out all numbers as words: "three emails" not "3 emails", "fifteen minutes" not "15 min".
- Never start with "I have", "Certainly", "Sure", your agent name, or a mission/task ID.
- Sound confident and direct. Speak to the user like a person, not a system log.
`;

export function getAgentPromptByRole(role: string): string {
  const base = (() => {
    switch(role) {
      case 'ORACLE':         return SEARCH_SYSTEM;
      case 'SCRIBE':         return DOCS_SYSTEM;
      case 'ENIGMA':         return DATA_SYSTEM;
      case 'HERMES':         return COMMS_SYSTEM;
      case 'CHRONOS':        return SCHEDULER_SYSTEM;
      case 'ARCHIVE':        return DRIVE_SYSTEM;
      case 'HEPHAESTUS':     return CODING_SYSTEM;
      case 'MEET':           return MEET_SYSTEM;
      case 'ATLAS':          return PLANNER_SYSTEM;
      case 'ARGUS':          return MONITOR_SYSTEM;
      case 'SPECTRE':        return GHOST_DETECTOR_SYSTEM;
      case 'TITAN':          return EXECUTOR_SYSTEM;
      case 'NAVIGATOR':      return NAVIGATOR_SYSTEM;
      case 'MERCURY':        return WEB_SYSTEM;
      case 'GAINS':          return GYM_SYSTEM;
      case 'AEGIS':          return QA_SYSTEM;
      // BUG-006 FIX: PROMETHEUS had no case here — fell through to the default
      // which logged a warning and used QA_SYSTEM (a synthesis agent prompt).
      // PROMETHEUS is a strategic planning agent, same toolset as ATLAS.
      case 'PROMETHEUS':     return PLANNER_SYSTEM;
      default:
        console.warn(`[Orchestrator] Unknown agent role "${role}", falling back to AEGIS.`);
        return QA_SYSTEM;
    }
  })();
  // Append voice rules to every agent prompt so TTS always gets clean output
  return base + VOICE_SPEECH_RULES;
}

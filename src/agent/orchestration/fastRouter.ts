import type { DagTask } from '../core/DagEngine';

export function fastRouter(instruction: string): DagTask[] | null {
  const text = instruction.toLowerCase().trim();
  
  // Guard against complex commands bypassing the LLM Supervisor
  // NOTE: Research/news queries can be long — only gate non-research queries
  const wordCount = text.split(' ').length;
  const isResearchQuery = /\b(news|search|latest|happening|going on|what is|who is|research|find out|look up|price of|chandigarh|delhi|mumbai|bangalore|bengaluru|hyderabad|chennai|pune|kolkata)\b/i.test(text);
  if (wordCount > 20 && !isResearchQuery) return null;
  
  // ── NAVIGATION ───────────────────────────────────────────────────────────────
  if (/^(go to|open|show me|take me to) (the )?(gym|calendar|tasks|habits|learning|goals|notes|analytics|jobs|dashboard|home)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'NAVIGATOR', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── GYM SCHEDULE (PATTERN A: NAVIGATOR + GAINS + AEGIS) ─────────────────────
  // "what's in my gym today", "gym schedule", "what exercises do I have", "today's workout"
  if (
    /\b(gym|workout|exercise|training|chest day|leg day|back day|push|pull|lifting)\b/i.test(text) &&
    /\b(today|schedule|plan|what|have|my|do i|should i)\b/i.test(text) &&
    !/\b(log|done|finish|complete|record)\b/i.test(text) // not a logging action
  ) {
    return [
      { id: 't1', assignedAgent: 'NAVIGATOR', instruction: 'Open the gym workout view for today', dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'GAINS', instruction: `Tell the user what's in their gym schedule today. Read their plan, provide exercises, sets, reps, and targets. Instruction: ${instruction}`, dependencies: [], status: 'pending' },
      { id: 't3', assignedAgent: 'AEGIS', instruction: 'Synthesize NAVIGATOR and GAINS results into a complete gym brief. NAVIGATOR opened the gym view. GAINS has the exercise details. Give a full spoken workout brief.', dependencies: ['t1', 't2'], status: 'pending' },
    ];
  }

  // ── NEWS / CITY QUERIES (PATTERN B: MERCURY + AEGIS) ────────────────────────────────────
  // "what's going on in Chandigarh", "chandigarh news", "latest delhi news", "what's happening"
  // BUG-009 FIX: Original pattern only matched Indian cities. International queries like
  // "what's happening in London" or "New York news" were rejected by the wordCount guard.
  // Extended to a generic location+news pattern that catches any city/country/topic combo.
  const indianCityPattern = /\b(chandigarh|delhi|mumbai|bangalore|bengaluru|hyderabad|chennai|pune|kolkata|ahmedabad|jaipur|lucknow|india)\b/i;
  const isNewsQuery = /\b(news|happening|going on|latest|today|update|current events|headlines)\b/i.test(text);
  const locationMatch = text.match(/\b(in|at|from)\s+([a-z][a-z\s]{2,20})/i);
  if (
    (indianCityPattern.test(text) && isNewsQuery) ||
    // Generic: "what's happening in [any place]", "[place] news today"
    (/\b(what'?s? (happening|going on))\b/i.test(text) && locationMatch) ||
    // City + news combo for any recognized location keyword
    (isNewsQuery && locationMatch && !text.match(/^(go to|open|show|navigate)/i))
  ) {
    const city = indianCityPattern.exec(text)?.[0] || locationMatch?.[2]?.trim() || 'your location';
    return [
      { id: 't1', assignedAgent: 'MERCURY', instruction: `Search for the latest news in ${city}. Query: "${instruction}"`, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: `Synthesize MERCURY's news findings about ${city} into a clear, spoken news brief. Read the top stories and give a concise update.`, dependencies: ['t1'], status: 'pending' },
    ];
  }

  // ── GENERAL NEWS QUERIES ─────────────────────────────────────────────────────
  if (/\b(latest news|today'?s? news|breaking news|current events|top headlines|news today|what'?s? in the news)\b/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'MERCURY', instruction: `Search for: ${instruction}`, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize MERCURY news results into a spoken news brief', dependencies: ['t1'], status: 'pending' },
    ];
  }

  // ── WEB SEARCH QUERIES (PATTERN C: MERCURY fast-route) ──────────────────────
  // "search for X", "what is X", "who is X", "look up X", "find info about X"
  if (/^(search (for|the web for|web for)?|look up|find (out|info|information) (about|on)|what is (a |an |the )?|who is |where is |how does |why does |tell me about )\b/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'MERCURY', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── TOPIC RESEARCH ───────────────────────────────────────────────────────────
  if (/^(research |summarize (this |the )?(link|url|article|page)|price of |track (the )?price)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'MERCURY', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── EMAIL ────────────────────────────────────────────────────────────────────
  if (/^(read|show|check|what is in|what's in) (my )?(emails|inbox|email)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'HERMES', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── TASKS ────────────────────────────────────────────────────────────────────
  // OPT-10: isFinal skips AEGIS on simple task reads
  if (/^(what are|show) (my )?(tasks|todos|to-dos)/.test(text) || /^(what is|what's) on my to do/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'ORACLE', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── CALENDAR ─────────────────────────────────────────────────────────────────
  if (/^(what is on|what's on|show) (my )?(calendar|schedule)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'CHRONOS', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── DRIVE ────────────────────────────────────────────────────────────────────
  if (/^(show|find|list) (my )?(recent )?(files|documents|drive files)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'ARCHIVE', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── CREATES (LEVEL 2 WRITE) ──────────────────────────────────────────────────
  if (/^(create a task|add a task|remind me to|add to my to do|add to my todo)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'TITAN', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/^(send an email|email |send a message to)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'HERMES', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/^(schedule a meeting|create a meeting|book a meeting)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'MEET', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/^(block|schedule) (some time|time|an hour|my calendar)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'CHRONOS', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── ANALYTICS ────────────────────────────────────────────────────────────────
  if (/am i on track|what'?s? my risk|will i finish|my productivity|completion (rate|probability)|am i productive/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'ENIGMA', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize ENIGMA risk analysis into a clear mission report', dependencies: ['t1'], status: 'pending' }
    ];
  }
  if (/analyze my (week|day|tasks|habits|goals|productivity)|what should i (focus|work) on|bottleneck|workload/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'ENIGMA', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize ENIGMA analytics findings', dependencies: ['t1'], status: 'pending' }
    ];
  }

  // ── SCRIPTING ────────────────────────────────────────────────────────────────
  if (/^(write (me )?(a )?script|generate (code|a script)|automate this|create (a )?python|create (a )?javascript)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'HEPHAESTUS', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/export (my )?(tasks|calendar|data) to (csv|json)|write (a )?script to (process|export|bulk)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'HEPHAESTUS', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── NOTES / GOALS / HABITS ───────────────────────────────────────────────────
  if (/^(save (a )?note|write (a )?note|note (that|this|down)|remember this|jot (this|that) down)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'TITAN', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/^(add (a )?goal|create (a )?goal|set (a )?goal|i want to achieve|track (my )?goal)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'ATLAS', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/^(add (a )?habit|create (a )?habit|track (a )?habit|i want to track|help me build a habit|remind me to .+ every day)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'TITAN', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── BROAD NAVIGATION ─────────────────────────────────────────────────────────
  if (/^(go to|open|show me|take me to|navigate to|open my) (tasks|habits|goals|gym|calendar|notes|analytics|jobs|learning|tools|integrations|review|attendance|assignments|grades|home|dashboard)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'NAVIGATOR', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── VIDEO ────────────────────────────────────────────────────────────────────
  if (/^(play|watch|put on|stream|open video of|show me the video|show video)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'NAVIGATOR', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ── AUDIT ADDITIONS ──────────────────────────────────────────────────────────
  if (/^(check my mails|any new emails|read my email)/i.test(text)) {
    return [{ id: 't1', assignedAgent: 'HERMES', instruction, dependencies: [], status: 'pending', isFinal: true }];
  }
  if (/^(what'?s my schedule today|my schedule|what do i have today)/i.test(text)) {
    return [{ id: 't1', assignedAgent: 'CHRONOS', instruction, dependencies: [], status: 'pending', isFinal: true }];
  }

  // ── GYM LOGGING (separate from schedule reads) ───────────────────────────────
  if (/^(log my workout|i did chest today|log chest|record workout|finished (my )?(gym|workout|training)|done with (gym|workout))/i.test(text)) {
    return [{ id: 't1', assignedAgent: 'GAINS', instruction, dependencies: [], status: 'pending', isFinal: true }];
  }

  if (/^(delete task|mark .* done|complete task)/i.test(text)) {
    return [{ id: 't1', assignedAgent: 'TITAN', instruction, dependencies: [], status: 'pending', isFinal: true }];
  }
  if (/^(search for .* in notes|search notes for|find .* in notes)/i.test(text)) {
    return [{ id: 't1', assignedAgent: 'ORACLE', instruction, dependencies: [], status: 'pending', isFinal: true }];
  }
  if (/^(how am i doing|quick status)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'ENIGMA', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize ENIGMA risk analysis into a clear mission report', dependencies: ['t1'], status: 'pending' }
    ];
  }

  return null;
}

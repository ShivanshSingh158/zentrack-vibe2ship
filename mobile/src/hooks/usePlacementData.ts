/**
 * usePlacementData — ZenTrack Mobile
 *
 * Reads and writes all Placement Hub data from Firestore.
 * Provides: DSA logs, focus sessions, skill ratings, project milestones, placement config.
 *
 * Used by: PlacementHubScreen and all its sub-components.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useMobileData } from '../contexts/MobileDataContext';
import { COLLECTION } from '../config/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DSADifficulty = 'Easy' | 'Medium' | 'Hard';
export type DSAOutcome = 'clean' | 'hints' | 'failed';
export type DSATopic =
  | 'Arrays' | 'Strings' | 'HashMap' | 'Sorting' | 'LinkedList'
  | 'Stack' | 'Queue' | 'Recursion' | 'BinarySearch' | 'Trees'
  | 'BST' | 'Heaps' | 'Graphs' | 'DP' | 'Tries' | 'Backtracking' | 'Mixed';

export type DevTopic =
  | 'JavaScript' | 'TypeScript' | 'React' | 'Node.js' | 'Express'
  | 'PostgreSQL' | 'Redis' | 'WebSockets' | 'GraphQL' | 'Docker'
  | 'SystemDesign' | 'Testing' | 'Security' | 'MachineLearning' | 'Other';

export type FocusCategory = 'DSA' | 'Dev' | 'College';
export type FocusQuality = 'focused' | 'distracted' | 'interrupted';

export type SkillMastery = 'notStarted' | 'learning' | 'comfortable' | 'confident';

export interface DSALog {
  id: string;
  userId: string;
  problemName: string;
  difficulty: DSADifficulty;
  topic: DSATopic;
  timeTaken: number; // minutes
  outcome: DSAOutcome;
  companyTag?: string;
  notes?: string;
  solvedAt: Date;
}

export interface FocusSession {
  id: string;
  userId: string;
  category: FocusCategory;
  topic: string;
  durationMins: number;
  quality: FocusQuality;
  startedAt: Date;
  endedAt: Date;
}

export interface CustomSkillSubtopic {
  id: string;
  name: string;
  done: boolean;
}

export interface CustomSkill {
  id: string;
  name: string;
  level: SkillMastery;
  subtopics?: CustomSkillSubtopic[];
}

export interface CustomSkillCategory {
  id: string;
  name: string;
  skills: CustomSkill[];
}

export type SkillRatings = CustomSkillCategory[];

export interface ProjectMilestone {
  id: string;
  title: string;
  done: boolean;
  doneAt?: Date;
}

export interface CustomProject {
  id: string;
  name: string;
  tasks: ProjectMilestone[];
}

export type ProjectMilestones = CustomProject[];

export interface PlacementWidget {
  id: string;
  type: 'dsa_snap' | 'streak_snap' | 'block_calendar' | 'weekly_targets' | 'total_problems';
  hidden: boolean;
  order: number;
}

export interface SyllabusSection {
  title: string;
  subtitle?: string;
  items: string[];
}

export interface RoadmapPhase {
  id: string;
  name: string;
  durationDays: number;
  description: string;
  topics?: string[];
  devSyllabus?: SyllabusSection[];
}

export interface CurrentPhaseInfo {
  phase: RoadmapPhase | null;
  weekInPhase: number;
  dayInWeek: number;
  dayInPhase: number;
  daysRemainingInPhase: number;
  totalDaysElapsed: number;
  status: 'Not started' | 'In progress' | 'Completed';
  phaseIndex: number;
}

export function calculateCurrentPhase(startDateStr: string, phases: RoadmapPhase[]): CurrentPhaseInfo {
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const totalDaysElapsed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (totalDaysElapsed < 0 || phases.length === 0) {
    return {
      phase: phases[0] || null, weekInPhase: 0, dayInWeek: 0,
      dayInPhase: 0, daysRemainingInPhase: phases[0] ? phases[0].durationDays : 0,
      totalDaysElapsed: 0, status: 'Not started', phaseIndex: 0,
    };
  }

  let elapsed = totalDaysElapsed;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const lengthDays = p.durationDays;
    if (elapsed < lengthDays) {
      const dayInPhase = elapsed + 1;
      const weekInPhase = Math.ceil(dayInPhase / 7);
      const dayInWeek = ((dayInPhase - 1) % 7) + 1;
      const daysRemainingInPhase = lengthDays - elapsed;
      return {
        phase: p, weekInPhase, dayInWeek, dayInPhase,
        daysRemainingInPhase, totalDaysElapsed, status: 'In progress', phaseIndex: i,
      };
    }
    elapsed -= lengthDays;
  }

  // Past all phases
  return {
    phase: phases[phases.length - 1] || null, weekInPhase: 0, dayInWeek: 0,
    dayInPhase: 0, daysRemainingInPhase: 0,
    totalDaysElapsed, status: 'Completed', phaseIndex: phases.length - 1,
  };
}

export interface PlacementConfig {
  startDate: string; // ISO date string YYYY-MM-DD
  phase1Target: number; // e.g., 420 total problems
  weeklyDSATarget: number; // e.g., 21 problems/week
  weeklyDevHours: number; // e.g., 10 hrs/week
  leetCodeUsername: string; // empty string if not linked
  widgets: PlacementWidget[];
  phases: RoadmapPhase[];
}

// ─── Default Data ─────────────────────────────────────────────────────────────

export const DEFAULT_WIDGETS: PlacementWidget[] = [
  { id: 'w1', type: 'dsa_snap', hidden: false, order: 1 },
  { id: 'w2', type: 'streak_snap', hidden: false, order: 2 },
  { id: 'w3', type: 'block_calendar', hidden: false, order: 3 },
  { id: 'w4', type: 'weekly_targets', hidden: false, order: 4 },
  { id: 'w5', type: 'total_problems', hidden: false, order: 5 },
];

export const DEFAULT_PHASES: RoadmapPhase[] = [
  { 
    id: 'ph_pre', name: 'Pre-Season Warm-up', durationDays: 5, description: 'Flexible. Setup + early start on Arrays/JS.',
    devSyllabus: [
      { title: 'Setup + JS Functions Start', subtitle: 'Jul 22–26 (~8–10 hrs)', items: ['Environment setup and accounts', 'JS functions basics'] }
    ]
  },
  { 
    id: 'ph_A', name: 'Block A', durationDays: 28, description: 'Arrays, Strings, Hashing, Sorting + JS/TS',
    devSyllabus: [
      { title: 'Functions — finish', subtitle: 'Jul 27 – Aug 2 — 4 hrs', items: ['Destructuring — arrays and objects (if not finished in pre-season)', 'Consolidate everything from pre-season with harder examples'] },
      { title: 'Asynchronous JavaScript', subtitle: 'Aug 3–9 — 10 hrs', items: ['The event loop — how JavaScript handles async code', 'Callbacks and callback hell', 'Promises — .then(), .catch(), .finally(), chaining', 'async/await — how it works under the hood', 'Promise.all, Promise.race, Promise.allSettled', 'Error handling with try/catch in async functions', 'fetch API'] },
      { title: 'Array Methods and Functional Patterns', subtitle: 'Aug 10–16 — 8 hrs', items: ['map, filter, reduce, find, findIndex', 'forEach vs map', 'flat, flatMap', 'Chaining array methods', 'Immutability, deep copy vs shallow copy'] },
      { title: 'Modules, Classes, and Modern JS', subtitle: 'Aug 17–23 — 10 hrs', items: ['ES Modules — named/default exports, re-exports', 'Classes — constructor, methods, inheritance, super', 'Prototype chain (conceptual)', 'Closures', 'this keyword — different contexts', 'WeakMap, WeakSet', 'Optional chaining (?.), nullish coalescing (??)'] },
      { title: 'TypeScript', subtitle: 'woven through the back half — 12 hrs', items: ['Type annotations, interfaces vs type aliases', 'Union and intersection types', 'Optional and readonly properties', 'Generics', 'Enums', 'Type narrowing (typeof, instanceof, type guards)', 'Utility types — Partial, Required, Pick, Omit, Record', 'as casting and when NOT to use it', 'tsconfig.json options'] },
      { title: 'Codebase integration', subtitle: 'throughout Block A — 7 hrs', items: ['Read your own ZenTrack files against each topic — src/config/constants.ts, mobile/src/utils/haptics.ts, mobile/src/services/xpSystem.ts, mobile/src/types/gym.types.ts', 'Keep a "concepts found in my own codebase" log'] }
    ]
  },
  { 
    id: 'ph_B', name: 'Block B', durationDays: 28, description: 'Linear Structures, Recursion, Binary Search + React',
    devSyllabus: [
      { title: 'Components and JSX', subtitle: 'Aug 24–30 — 6 hrs', items: ['Functional components', 'JSX compilation', 'Conditional rendering, list rendering and keys, fragments', 'Props — passing, destructuring, defaults, children'] },
      { title: 'State and Effects', subtitle: 'Aug 31 – Sep 6 — 8 hrs', items: ['useState — immutability, batching, lazy initialization', 'useEffect — dependency arrays, cleanup, lifecycle', 'Common mistakes (infinite loops, missing dependencies)', 'useRef'] },
      { title: 'React Intermediate', subtitle: 'Sep 7–13 — 9 hrs', items: ['useContext, createContext', 'useReducer', 'useMemo, useCallback, React.memo', 'Performance debugging — when to optimize, when not to'] },
      { title: 'React Advanced', subtitle: 'Sep 14–20 — 11 hrs', items: ['Custom hooks', 'React Router — <BrowserRouter>, <Routes>, <Route>, useNavigate, useParams, useSearchParams', 'React.lazy and Suspense', 'Error boundaries, portals', 'Compound components pattern', 'Forms — controlled vs uncontrolled, validation'] },
      { title: 'Project 1 — Task Manager, React-only', subtitle: 'weekends across this block, ~20 hrs', items: ['Codebase reading: src/App.tsx, src/contexts/VoiceContext.tsx, components in src/components/', 'Add, edit, delete tasks; mark complete; filter by status; sort by date/priority', 'Local state only, full TypeScript', 'Custom hooks for task logic, context for global filter state', 'React Router (list view + detail view)'] }
    ]
  },
  { 
    id: 'ph_buf1', name: 'Buffer 1', durationDays: 6, description: 'Catch-up / consolidation before mid-sem',
    devSyllabus: [
      { title: 'Catch-up', subtitle: 'Sep 21–26', items: ["Polish Project 1's UI, or get a light head start reading Node.js docs if you're ahead of schedule. Not required either way."] }
    ]
  },
  { 
    id: 'ph_C', name: 'Block C — Mid-sem', durationDays: 12, description: 'Rest',
    devSyllabus: [
      { title: 'Rest', subtitle: 'Sep 27 – Oct 8', items: ['No new dev content.'] }
    ]
  },
  { 
    id: 'ph_D', name: 'Block D', durationDays: 28, description: 'Trees, BST, Heaps + Node, Express, SQL',
    devSyllabus: [
      { title: 'Node.js Fundamentals', subtitle: 'Oct 9–15 — 10 hrs', items: ['V8 engine, single-threaded event loop', 'CommonJS vs ES Modules', 'Built-in modules — fs, path, http, crypto, os', 'npm — package.json, scripts, semantic versioning', 'Environment variables, .env, dotenv', 'Error-first callbacks (legacy pattern)', 'Streams (conceptual)'] },
      { title: 'Express.js', subtitle: 'Oct 16–22 — 12 hrs', items: ['Request/response objects', 'Route handlers — GET, POST, PUT, PATCH, DELETE', 'req.params, req.query, req.body', 'Middleware — execution order, next()', 'Express Router', 'Error handling middleware', 'CORS, rate limiting, request validation, static file serving'] },
      { title: 'SQL + PostgreSQL', subtitle: 'Oct 23 – Nov 5 — 18 hrs', items: ['Relational model, ACID, structured data', 'PostgreSQL vs MySQL vs SQLite', 'Core SQL — CREATE TABLE, INSERT, SELECT, UPDATE, DELETE', 'Constraints — PRIMARY KEY, FOREIGN KEY, UNIQUE, NOT NULL, DEFAULT', 'JOINs — INNER, LEFT, RIGHT, FULL OUTER', 'Aggregations — COUNT, SUM, AVG, MIN, MAX with GROUP BY/HAVING', 'Subqueries and CTEs', 'Indexes — B-tree, when to add, trade-offs', 'Transactions — BEGIN, COMMIT, ROLLBACK, SAVEPOINT', 'ACID properties with concrete examples', 'Normalization — 1NF, 2NF, 3NF', 'N+1 query problem', 'pg library, connection pooling'] },
      { title: 'Project 1 goes full-stack', subtitle: 'weekends, ~25 hrs', items: ['Node.js + Express backend, PostgreSQL schema (users, tasks)', 'JWT authentication — register, login, token refresh', 'Auth middleware, full CRUD via REST API', 'React frontend calls the API instead of local state', 'Postman collection, client + server validation'] }
    ]
  },
  { 
    id: 'ph_buf2', name: 'Buffer 2', durationDays: 6, description: 'Catch-up / consolidation before taper',
    devSyllabus: [
      { title: 'Catch-up', subtitle: 'Nov 6–11', items: ['Finish any lagging Block D content, or get ahead on JWT deep-dive reading before the taper block.'] }
    ]
  },
  { 
    id: 'ph_E', name: 'Block E — Taper', durationDays: 14, description: 'Graph Foundations + JWT Deep Dive',
    devSyllabus: [
      { title: 'JWT Deep Dive (Practical)', subtitle: 'Nov 12 – Nov 25 — ~12 hrs/week', items: ['JWT structure — header, payload, signature', 'HS256 vs RS256', 'Access vs refresh tokens', 'Token storage trade-offs (localStorage vs httpOnly cookies)', 'Token expiry and rotation', 'bcrypt password hashing', 'OAuth 2.0 flow (conceptual)', 'CSRF, XSS, SQL injection basics', "No new frameworks — hardens Project 1's existing auth."] }
    ]
  },
  { 
    id: 'ph_F', name: 'Block F — End term', durationDays: 10, description: 'Rest',
    devSyllabus: [
      { title: 'Rest', subtitle: 'Nov 26 – Dec 5', items: ['No dev work scheduled.'] }
    ]
  },
  { 
    id: 'ph_G', name: 'Block G — Winter surge', durationDays: 37, description: 'Graphs, DP, Tries + Redis, CS Fundamentals, WebSockets',
    devSyllabus: [
      { title: 'Redis', subtitle: 'Dec 6–12 — 10 hrs', items: ['In-memory data store, when to use it', 'Strings, Hashes, Lists, Sets, Sorted Sets', 'TTL, cache-aside pattern, invalidation strategies', 'ioredis in Node.js, rate limiting via sorted sets, session storage'] },
      { title: 'CS Fundamentals', subtitle: 'Dec 6–19 — 23 hrs', items: ['OS (6 hrs): Process vs thread, context switching, process states, deadlock, memory management, paging/segmentation, CPU scheduling, semaphores/mutex', 'DBMS (6 hrs): ACID with examples, normalization, B-tree indexes internally, EXPLAIN in PostgreSQL, locks/concurrency, CAP theorem', 'Networks (6 hrs): OSI model, TCP vs UDP, three-way handshake, HTTP vs HTTPS, DNS resolution, HTTP methods/status codes, REST principles, WebSockets vs HTTP, CDN, load balancing', 'OOP/Design Patterns (5 hrs): 4 pillars, SOLID, Singleton/Factory/Observer/Strategy/Repository, composition over inheritance'] },
      { title: 'DevConnect — Project 2', subtitle: 'Dec 13–26, ~30 hrs', items: ['Tech: React, TS, Node, Express, PostgreSQL, JWT, Redis', 'Features: user profiles, follow/unfollow, post feed, likes, Redis-cached feed'] },
      { title: 'WebSockets', subtitle: 'Dec 20–26 — 11 hrs', items: ['Polling vs long polling vs WebSockets', 'WebSocket handshake, ws library', 'Socket.IO — rooms, namespaces, broadcasting, acknowledgements', 'Connection lifecycle, reconnection strategy', 'When NOT to use WebSockets'] },
      { title: 'Testing Fundamentals', subtitle: 'Dec 27 – Jan 2 — 11 hrs', items: ['Unit, integration, end-to-end tests', 'Jest — runner, matchers, describe/it/expect', 'Mocking, test coverage', 'Supertest for Express endpoints', 'Testing async code, brief TDD attempt'] },
      { title: 'System Design Foundations + Practice', subtitle: 'Jan 3–9 — 21 hrs', items: ['7-step framework, scaling, load balancers, caching layers, replication, sharding, message queues (conceptual), microservices vs monolith, API Gateway, CDN', 'Timed 45-min designs: URL shortener, notification system, rate limiter, chat system, task platform (ZenTrack domain), Pastebin, Twitter feed'] },
      { title: 'AI Engineering Depth', subtitle: 'woven through surge weekends — 18 hrs', items: ['Tokens, context window, temperature/top-p/top-k', 'Attention mechanism (conceptual)', 'System prompts, prompt engineering patterns (zero-shot, few-shot, CoT, ReAct)', 'Tool use/function calling, streaming responses', 'RAG — embeddings, vector DBs conceptually, semantic search, context injection', 'Multi-agent patterns — routing, DAG execution, supervisor agent', 'Memory systems — episodic, semantic, procedural', 'Cost optimization — caching prompts, key rotation'] },
      { title: 'Collaborative Notes — Project 3 start', subtitle: 'Jan 7–11, ~15 hrs', items: ['Tech: React, TS, Node, Socket.IO, Redis pub/sub, PostgreSQL, JWT', 'Rooms, real-time editing groundwork, presence indicators — finished in Block H'] }
    ]
  },
  { 
    id: 'ph_H', name: 'Block H', durationDays: 27, description: 'Mixed hard practice, Mock Interviews',
    devSyllabus: [
      { title: 'Collaborative Notes — finish', subtitle: 'Jan 12–25, ~20 hrs', items: ['Real-time multi-user editing via Socket.IO', 'Redis pub/sub broadcasting across instances', 'PostgreSQL persistence, presence indicators', 'Basic Jest coverage on the API'] },
      { title: 'Interview Preparation', subtitle: 'Jan 26 – Feb 7, ~23 hrs', items: ['10 STAR-format behavioral stories', 'Project deep-dive prep across ZenTrack + all 3 built projects', 'HR question prep, 3-minute resume walkthrough', '3 technical mocks (Pramp) + 1 HR mock', 'Final week: CS fundamentals revision (2 hrs), re-solve 15 key problems without hints (4 hrs), rest and confidence-building'] }
    ]
  }
];

const DEFAULT_CONFIG: PlacementConfig = {
  startDate: '2026-07-22',
  phase1Target: 475,
  weeklyDSATarget: 21,
  weeklyDevHours: 20,
  leetCodeUsername: '',
  widgets: DEFAULT_WIDGETS,
  phases: DEFAULT_PHASES,
};

const DEFAULT_SKILLS: SkillRatings = [
  {
    id: 'cat_dsa', name: 'DSA Track',
    skills: [
      { id: 'sk_arr', name: 'Arrays & Strings (Pre-Season, Block A)', level: 'notStarted', subtopics: [
        { id: 'dsa_1_1', name: 'Two pointer technique', done: false },
        { id: 'dsa_1_2', name: 'Sliding window (fixed & variable)', done: false },
        { id: 'dsa_1_3', name: 'Prefix sum & difference array', done: false },
        { id: 'dsa_1_4', name: 'Kadane\'s algorithm', done: false },
        { id: 'dsa_1_5', name: 'Dutch National Flag', done: false },
        { id: 'dsa_2_1', name: 'String manipulation & reversal', done: false },
        { id: 'dsa_2_2', name: 'Anagram detection', done: false },
        { id: 'dsa_2_3', name: 'Palindrome checking (two pointer)', done: false },
        { id: 'dsa_2_4', name: 'Substring problems', done: false },
      ]},
      { id: 'sk_hash', name: 'Hashing & Sorting (Block A)', level: 'notStarted', subtopics: [
        { id: 'dsa_3_1', name: 'Frequency counting patterns', done: false },
        { id: 'dsa_3_2', name: 'Two-sum variations', done: false },
        { id: 'dsa_3_3', name: 'Subarray with target sum', done: false },
        { id: 'dsa_3_4', name: 'Longest consecutive sequence', done: false },
        { id: 'dsa_3_5', name: 'Group anagrams', done: false },
        { id: 'dsa_4_1', name: 'Merge sort & Quick sort', done: false },
        { id: 'dsa_4_2', name: 'Counting sort & Radix sort', done: false },
        { id: 'dsa_4_3', name: 'Custom comparators', done: false },
        { id: 'dsa_4_4', name: 'Interval problems', done: false },
      ]},
      { id: 'sk_lin', name: 'Linear Structs & Recursion (Block B)', level: 'notStarted', subtopics: [
        { id: 'dsa_5_1', name: 'Single/Doubly linked list ops', done: false },
        { id: 'dsa_5_2', name: 'Fast & slow pointer (Floyd\'s)', done: false },
        { id: 'dsa_5_3', name: 'Reversal (iterative & recursive)', done: false },
        { id: 'dsa_5_4', name: 'Merge sorted lists & LRU Cache', done: false },
        { id: 'dsa_6_1', name: 'Monotonic stack pattern', done: false },
        { id: 'dsa_6_2', name: 'Next greater element', done: false },
        { id: 'dsa_6_3', name: 'Valid parentheses', done: false },
        { id: 'dsa_6_4', name: 'Sliding window maximum (deque)', done: false },
        { id: 'dsa_7_1', name: 'Call stack visualization & Base cases', done: false },
        { id: 'dsa_7_2', name: 'Fibonacci (recursive + memoized)', done: false },
        { id: 'dsa_7_3', name: 'Print all subsets', done: false },
        { id: 'dsa_8_1', name: 'Classic binary search', done: false },
        { id: 'dsa_8_2', name: 'Binary search on answer', done: false },
        { id: 'dsa_8_3', name: 'Search in 2D matrix', done: false },
      ]},
      { id: 'sk_tree', name: 'Trees & Heaps (Block D)', level: 'notStarted', subtopics: [
        { id: 'dsa_9_1', name: 'DFS traversals (in/pre/post)', done: false },
        { id: 'dsa_9_2', name: 'BFS traversal (level order)', done: false },
        { id: 'dsa_9_3', name: 'Height, diameter, depth', done: false },
        { id: 'dsa_10_1', name: 'Lowest Common Ancestor', done: false },
        { id: 'dsa_10_2', name: 'Path sum & Zigzag traversal', done: false },
        { id: 'dsa_10_3', name: 'Serialize/deserialize tree', done: false },
        { id: 'dsa_11_1', name: 'BST insert/delete/search', done: false },
        { id: 'dsa_11_2', name: 'Validate BST & Kth smallest', done: false },
        { id: 'dsa_11_3', name: 'Inorder successor/predecessor', done: false },
        { id: 'dsa_12_1', name: 'Min-heap & Max-heap ops', done: false },
        { id: 'dsa_12_2', name: 'Top K frequent & Merge K lists', done: false },
        { id: 'dsa_12_3', name: 'Find median from data stream', done: false },
      ]},
      { id: 'sk_graph', name: 'Graphs & DP (Blocks E, G)', level: 'notStarted', subtopics: [
        { id: 'dsa_13_1', name: 'Graph representation (Adj List/Matrix)', done: false },
        { id: 'dsa_13_2', name: 'BFS & DFS on graphs', done: false },
        { id: 'dsa_13_3', name: 'Cycle detection', done: false },
        { id: 'dsa_14_1', name: 'Topological sort (Kahn\'s)', done: false },
        { id: 'dsa_14_2', name: 'Dijkstra\'s algorithm', done: false },
        { id: 'dsa_14_3', name: 'Bellman-Ford', done: false },
        { id: 'dsa_15_1', name: 'Union-Find (Disjoint Set)', done: false },
        { id: 'dsa_15_2', name: 'MST (Kruskal\'s/Prim\'s)', done: false },
        { id: 'dsa_15_3', name: 'Bipartite & Islands', done: false },
        { id: 'dsa_16_1', name: 'Optimal substructure & Overlapping subprobs', done: false },
        { id: 'dsa_16_2', name: 'Memoization vs tabulation', done: false },
        { id: 'dsa_16_3', name: 'LIS & Climbing stairs', done: false },
        { id: 'dsa_17_1', name: 'Unique paths & LCS', done: false },
        { id: 'dsa_17_2', name: 'Edit distance & Regex', done: false },
        { id: 'dsa_18_1', name: '0/1 Knapsack & Subset sum', done: false },
      ]},
      { id: 'sk_adv', name: 'Advanced DSA (Block G)', level: 'notStarted', subtopics: [
        { id: 'dsa_19_1', name: 'Trie implementation & Autocomplete', done: false },
        { id: 'dsa_19_2', name: 'Bit manipulation (AND, OR, XOR)', done: false },
        { id: 'dsa_19_3', name: 'Backtracking (N-Queens, Sudoku)', done: false },
      ]},
    ]
  },
  {
    id: 'cat_dev', name: 'Dev Track',
    skills: [
      { id: 'sk_js', name: 'JS & TS Fundamentals (Pre-Season, Block A)', level: 'notStarted', subtopics: [
        { id: 'dev_1_1', name: 'Variables (let, const), Scoping, Hoisting', done: false },
        { id: 'dev_1_2', name: 'Closures & lexical environment', done: false },
        { id: 'dev_1_3', name: 'Event loop, Macrotasks vs Microtasks', done: false },
        { id: 'dev_1_4', name: 'Promises, async/await, error handling', done: false },
        { id: 'dev_2_1', name: 'TS Types vs Interfaces', done: false },
        { id: 'dev_2_2', name: 'Generics & Utility types (Partial, Pick)', done: false },
        { id: 'dev_2_3', name: 'Type guards & Discriminated unions', done: false },
      ]},
      { id: 'sk_react', name: 'React (Block B)', level: 'notStarted', subtopics: [
        { id: 'dev_rc_1', name: 'Functional components & JSX', done: false },
        { id: 'dev_rc_2', name: 'useState & useEffect', done: false },
        { id: 'dev_rc_3', name: 'useContext & useReducer', done: false },
        { id: 'dev_rc_4', name: 'useMemo, useCallback, React.memo', done: false },
        { id: 'dev_rc_5', name: 'Custom hooks & React Router', done: false },
        { id: 'dev_rc_6', name: 'React.lazy & Suspense', done: false },
        { id: 'dev_rc_7', name: 'Error boundaries & portals', done: false },
      ]},
      { id: 'sk_node', name: 'Node.js & Express (Block D)', level: 'notStarted', subtopics: [
        { id: 'dev_nd_1', name: 'V8 engine & Event loop', done: false },
        { id: 'dev_nd_2', name: 'Built-in modules (fs, path, http)', done: false },
        { id: 'dev_nd_3', name: 'npm, package.json, dotenv', done: false },
        { id: 'dev_ex_1', name: 'Request/Response & Routes', done: false },
        { id: 'dev_ex_2', name: 'Middleware & execution order', done: false },
        { id: 'dev_ex_3', name: 'Error handling middleware', done: false },
        { id: 'dev_ex_4', name: 'CORS & rate limiting', done: false },
      ]},
      { id: 'sk_sql', name: 'SQL & PostgreSQL (Block D)', level: 'notStarted', subtopics: [
        { id: 'dev_sq_1', name: 'Core SQL (CREATE, INSERT, SELECT)', done: false },
        { id: 'dev_sq_2', name: 'Constraints (PK, FK, UNIQUE)', done: false },
        { id: 'dev_sq_3', name: 'JOINs & Aggregations', done: false },
        { id: 'dev_sq_4', name: 'Indexes (B-tree)', done: false },
        { id: 'dev_sq_5', name: 'Transactions & ACID', done: false },
        { id: 'dev_sq_6', name: 'Normalization (1NF-3NF)', done: false },
        { id: 'dev_sq_7', name: 'N+1 query problem & pg library', done: false },
      ]},
      { id: 'sk_adv', name: 'Advanced Auth & Systems (Blocks E, G)', level: 'notStarted', subtopics: [
        { id: 'dev_au_1', name: 'JWT structure & HS256/RS256', done: false },
        { id: 'dev_au_2', name: 'Access vs refresh tokens', done: false },
        { id: 'dev_au_3', name: 'bcrypt & Token storage tradeoffs', done: false },
        { id: 'dev_rd_1', name: 'Redis structures & TTL', done: false },
        { id: 'dev_ws_1', name: 'WebSockets vs long polling', done: false },
        { id: 'dev_ws_2', name: 'Socket.IO (rooms, broadcasting)', done: false },
        { id: 'dev_ai_1', name: 'LLM Context, tokens, temperature', done: false },
        { id: 'dev_ai_2', name: 'RAG & Vector DBs', done: false },
        { id: 'dev_ai_3', name: 'Multi-agent routing & DAGs', done: false },
      ]},
      { id: 'sk_cs', name: 'CS Fundamentals & Design (Block G)', level: 'notStarted', subtopics: [
        { id: 'dev_cs_1', name: 'OS (Process/thread, Memory, CPU)', done: false },
        { id: 'dev_cs_2', name: 'DBMS (ACID, Locks, CAP theorem)', done: false },
        { id: 'dev_cs_3', name: 'Networks (OSI, TCP/UDP, HTTP)', done: false },
        { id: 'dev_sd_1', name: 'Scaling (Vertical vs Horizontal)', done: false },
        { id: 'dev_sd_2', name: 'Load balancers & CDN', done: false },
        { id: 'dev_sd_3', name: 'Microservices vs Monolith', done: false },
        { id: 'dev_tst_1', name: 'Jest (Unit, integration, E2E)', done: false },
      ]},
    ]
  }
];

const DEFAULT_PROJECTS: ProjectMilestones = [
  {
    id: 'proj_1',
    name: '1. Task Manager (Full-Stack)',
    tasks: [
      { id: 'p1_1', title: 'React frontend (local state)', done: false },
      { id: 'p1_2', title: 'Node/Express API setup', done: false },
      { id: 'p1_3', title: 'PostgreSQL schema (Users, Tasks)', done: false },
      { id: 'p1_4', title: 'JWT Auth (register/login/refresh)', done: false },
      { id: 'p1_5', title: 'Connect frontend to REST API', done: false },
    ],
  },
  {
    id: 'proj_2',
    name: '2. DevConnect (Social)',
    tasks: [
      { id: 'p2_1', title: 'User profiles & follow system', done: false },
      { id: 'p2_2', title: 'Post feed & likes', done: false },
      { id: 'p2_3', title: 'Redis-cached feed optimization', done: false },
    ],
  },
  {
    id: 'proj_3',
    name: '3. Real-Time Collaborative Notes',
    tasks: [
      { id: 'p3_1', title: 'Socket.IO real-time sync', done: false },
      { id: 'p3_2', title: 'Redis pub/sub across instances', done: false },
      { id: 'p3_3', title: 'PostgreSQL persistence', done: false },
      { id: 'p3_4', title: 'Presence indicators', done: false },
      { id: 'p3_5', title: 'Jest API tests', done: false },
    ],
  },
  {
    id: 'proj_zt',
    name: '★ ZenTrack Deep-Dive',
    tasks: [
      { id: 'pz_1', title: 'Master DAG scheduling engine', done: false },
      { id: 'pz_2', title: 'Master Zero-trust Gemini proxy', done: false },
      { id: 'pz_3', title: 'Master Voice STT/TTS pipeline', done: false },
      { id: 'pz_4', title: 'Rehearse 5-min architecture pitch', done: false },
    ]
  }
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlacementData() {
  const { user } = useMobileData();

  const [dsaLogs, setDsaLogs] = useState<DSALog[]>([]);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [skillRatings, setSkillRatings] = useState<SkillRatings>(DEFAULT_SKILLS);
  const [milestones, setMilestones] = useState<ProjectMilestones>(DEFAULT_PROJECTS);
  const [config, setConfig] = useState<PlacementConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  // ── DSA Logs subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, COLLECTION.DSA_LOGS),
      where('userId', '==', user.uid)
    );
    return onSnapshot(q, snap => {
      const logs = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          solvedAt: (data.solvedAt as Timestamp)?.toDate?.() ?? new Date(),
        } as DSALog;
      });
      // Sort client-side to bypass composite index requirement
      logs.sort((a, b) => b.solvedAt.getTime() - a.solvedAt.getTime());
      setDsaLogs(logs);
    });
  }, [user]);

  // ── Focus Sessions subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, COLLECTION.FOCUS_SESSIONS),
      where('userId', '==', user.uid)
    );
    return onSnapshot(q, snap => {
      const sessions = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          startedAt: (data.startedAt as Timestamp)?.toDate?.() ?? new Date(),
          endedAt: (data.endedAt as Timestamp)?.toDate?.() ?? new Date(),
        } as FocusSession;
      });
      // Sort client-side to bypass composite index requirement
      sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      setFocusSessions(sessions);
    });
  }, [user]);


  // ── Skill Ratings subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, COLLECTION.SKILL_RATINGS, user.uid);
    return onSnapshot(docRef, snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.categories)) {
          setSkillRatings(data.categories as SkillRatings);
        } else {
          // Migration/fallback
          setSkillRatings(DEFAULT_SKILLS);
        }
      } else {
        setDoc(docRef, { categories: DEFAULT_SKILLS }).catch(() => {});
      }
      setLoading(false);
    });
  }, [user]);

  // ── Project Milestones subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, COLLECTION.PROJECT_MILESTONES, user.uid);
    return onSnapshot(docRef, snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.projects)) {
          setMilestones(data.projects as ProjectMilestones);
        } else {
          // Migration or fallback
          setMilestones(DEFAULT_PROJECTS);
        }
      } else {
        setDoc(docRef, { projects: DEFAULT_PROJECTS }).catch(() => {});
      }
    });
  }, [user]);

  // ── Placement Config subscription ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, COLLECTION.PLACEMENT_CONFIG, user.uid);
    return onSnapshot(docRef, snap => {
      if (snap.exists()) {
        const data = snap.data() as Partial<PlacementConfig>;
        setConfig({
          ...DEFAULT_CONFIG,
          ...data,
          widgets: data.widgets ?? DEFAULT_CONFIG.widgets,
          phases: data.phases ?? DEFAULT_CONFIG.phases,
        });
      } else {
        setDoc(docRef, DEFAULT_CONFIG).catch(() => {});
      }
    });
  }, [user]);

  // ─── Write Actions ──────────────────────────────────────────────────────────

  const addDSALog = useCallback(async (log: Omit<DSALog, 'id' | 'userId' | 'solvedAt'>) => {
    if (!user) return;
    await addDoc(collection(db, COLLECTION.DSA_LOGS), {
      ...log,
      userId: user.uid,
      solvedAt: serverTimestamp(),
    });
  }, [user]);

  const addFocusSession = useCallback(async (session: Omit<FocusSession, 'id' | 'userId'>) => {
    if (!user) return;
    await addDoc(collection(db, COLLECTION.FOCUS_SESSIONS), {
      ...session,
      userId: user.uid,
    });
  }, [user]);

  const updateSkillRatings = useCallback(async (newRatings: SkillRatings) => {
    if (!user) return;
    const docRef = doc(db, COLLECTION.SKILL_RATINGS, user.uid);
    await setDoc(docRef, { categories: newRatings }, { merge: true });
    setSkillRatings(newRatings);
  }, [user]);

  const toggleSkillSubtopic = useCallback(async (
    categoryId: string,
    skillId: string,
    subtopicId: string,
    done: boolean
  ) => {
    if (!user) return;
    const updated = skillRatings.map(cat => {
      if (cat.id !== categoryId) return cat;
      return {
        ...cat,
        skills: cat.skills.map(sk => {
          if (sk.id !== skillId || !sk.subtopics) return sk;
          return {
            ...sk,
            subtopics: sk.subtopics.map(sub => 
              sub.id === subtopicId ? { ...sub, done } : sub
            )
          };
        })
      };
    });
    
    // Auto-calculate mastery based on subtopics completion (optional logic, could be complex, for now we just update subtopics)
    
    setSkillRatings(updated);
    const docRef = doc(db, COLLECTION.SKILL_RATINGS, user.uid);
    await setDoc(docRef, { categories: updated }, { merge: true });
  }, [user, skillRatings]);

  const updateMilestones = async (newMilestones: ProjectMilestones) => {
    if (!user) return;
    setMilestones(newMilestones);
    try {
      await setDoc(doc(db, COLLECTION.PROJECT_MILESTONES, user.uid), { projects: newMilestones }, { merge: true });
    } catch (e) {
      console.error(e);
    }
  };

  const toggleMilestone = useCallback(async (
    projectId: string,
    milestoneId: string,
    done: boolean,
  ) => {
    if (!user) return;
    const updated = milestones.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        tasks: p.tasks.map(m =>
          m.id === milestoneId ? { ...m, done, doneAt: done ? new Date() : undefined } : m
        )
      };
    });
    await updateMilestones(updated);
  }, [user, milestones]);

  const updateConfig = useCallback(async (updates: Partial<PlacementConfig>) => {
    if (!user) return;
    const docRef = doc(db, COLLECTION.PLACEMENT_CONFIG, user.uid);
    await updateDoc(docRef, updates);
  }, [user]);

  // ─── Derived Stats ──────────────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);

  const dsaToday = dsaLogs.filter(
    l => l.solvedAt.toISOString().slice(0, 10) === today
  ).length;

  const getWeekStart = () => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1); // Monday
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const weekStart = getWeekStart();
  const dsaThisWeek = dsaLogs.filter(l => l.solvedAt >= weekStart).length;

  const focusHoursToday = focusSessions
    .filter(s => s.startedAt.toISOString().slice(0, 10) === today)
    .reduce((acc, s) => acc + s.durationMins, 0) / 60;

  const focusHoursThisWeek = {
    DSA: focusSessions.filter(s => s.startedAt >= weekStart && s.category === 'DSA').reduce((a, s) => a + s.durationMins, 0) / 60,
    Dev: focusSessions.filter(s => s.startedAt >= weekStart && s.category === 'Dev').reduce((a, s) => a + s.durationMins, 0) / 60,
    College: focusSessions.filter(s => s.startedAt >= weekStart && s.category === 'College').reduce((a, s) => a + s.durationMins, 0) / 60,
  };

  // DSA streak: consecutive days with at least 1 problem
  const dsaStreak = (() => {
    let streak = 0;
    const checkDate = new Date();
    while (true) {
      const dateStr = checkDate.toISOString().slice(0, 10);
      const hasLog = dsaLogs.some(l => l.solvedAt.toISOString().slice(0, 10) === dateStr);
      if (!hasLog) break;
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    return streak;
  })();

  const currentPhaseInfo = useMemo(() => calculateCurrentPhase(config.startDate, config.phases || []), [config.startDate, config.phases]);

  const resetToDefaults = useCallback(async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, COLLECTION.PLACEMENT_CONFIG, user.uid), DEFAULT_CONFIG);
      await setDoc(doc(db, COLLECTION.SKILL_RATINGS, user.uid), { categories: DEFAULT_SKILLS });
      await setDoc(doc(db, COLLECTION.PROJECT_MILESTONES, user.uid), { projects: DEFAULT_PROJECTS });
    } catch (e) {
      console.error('Failed to reset defaults', e);
    }
  }, [user]);

  return {
    dsaLogs,
    focusSessions,
    skillRatings,
    milestones,
    config,
    loading,
    currentPhaseInfo,
    // write actions
    addDSALog,
    addFocusSession,
    updateSkillRatings,
    toggleSkillSubtopic,
    toggleMilestone,
    updateMilestones,
    updateConfig,
    resetToDefaults,
    // derived stats
    dsaToday,
    dsaThisWeek,
    focusHoursToday,
    focusHoursThisWeek,
    dsaStreak,
  };
}

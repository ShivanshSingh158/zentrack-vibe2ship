const fs = require('fs');
const path = 'c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/usePlacementData.ts';
let content = fs.readFileSync(path, 'utf8');

const replacement = `export const DEFAULT_PHASES: RoadmapPhase[] = [
  { id: 'ph_pre', name: 'Pre-Season Warm-up', durationDays: 5, description: 'Flexible. Setup + early start on Arrays/JS.' },
  { id: 'ph_A', name: 'Block A', durationDays: 28, description: 'Arrays, Strings, Hashing, Sorting + JS/TS' },
  { id: 'ph_B', name: 'Block B', durationDays: 28, description: 'Linear Structures, Recursion, Binary Search + React' },
  { id: 'ph_buf1', name: 'Buffer 1', durationDays: 6, description: 'Catch-up / consolidation before mid-sem' },
  { id: 'ph_C', name: 'Block C — Mid-sem', durationDays: 12, description: 'Rest' },
  { id: 'ph_D', name: 'Block D', durationDays: 28, description: 'Trees, BST, Heaps + Node, Express, SQL' },
  { id: 'ph_buf2', name: 'Buffer 2', durationDays: 6, description: 'Catch-up / consolidation before taper' },
  { id: 'ph_E', name: 'Block E — Taper', durationDays: 14, description: 'Graph Foundations + JWT Deep Dive' },
  { id: 'ph_F', name: 'Block F — End term', durationDays: 10, description: 'Rest' },
  { id: 'ph_G', name: 'Block G — Winter surge', durationDays: 37, description: 'Graphs, DP, Tries + Redis, CS Fundamentals, WebSockets' },
  { id: 'ph_H', name: 'Block H', durationDays: 27, description: 'Mixed hard practice, Mock Interviews' }
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
      { id: 'sk_arr', name: 'Arrays & Strings (Block A)', level: 'notStarted', subtopics: [
        { id: 'dsa_1_1', name: 'Two pointer technique', done: false },
        { id: 'dsa_1_2', name: 'Sliding window (fixed & variable)', done: false },
        { id: 'dsa_1_3', name: 'Prefix sum & difference array', done: false },
        { id: 'dsa_1_4', name: 'Kadane\\'s algorithm', done: false },
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
        { id: 'dsa_5_2', name: 'Fast & slow pointer (Floyd\\'s)', done: false },
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
        { id: 'dsa_14_1', name: 'Topological sort (Kahn\\'s)', done: false },
        { id: 'dsa_14_2', name: 'Dijkstra\\'s algorithm', done: false },
        { id: 'dsa_14_3', name: 'Bellman-Ford', done: false },
        { id: 'dsa_15_1', name: 'Union-Find (Disjoint Set)', done: false },
        { id: 'dsa_15_2', name: 'MST (Kruskal\\'s/Prim\\'s)', done: false },
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
      { id: 'sk_js', name: 'JavaScript & TS (Block A)', level: 'notStarted', subtopics: [
        { id: 'dev_js_1', name: 'Arrow functions, default/rest params', done: false },
        { id: 'dev_js_2', name: 'Destructuring & Spread', done: false },
        { id: 'dev_js_3', name: 'Event loop & Callbacks', done: false },
        { id: 'dev_js_4', name: 'Promises & async/await', done: false },
        { id: 'dev_js_5', name: 'Array methods (map, filter, reduce)', done: false },
        { id: 'dev_js_6', name: 'ES Modules & Classes', done: false },
        { id: 'dev_ts_1', name: 'Type annotations & interfaces', done: false },
        { id: 'dev_ts_2', name: 'Union, intersection, generics', done: false },
        { id: 'dev_ts_3', name: 'Utility types & type narrowing', done: false },
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
];`;

const startIndex = content.indexOf('export const DEFAULT_PHASES: RoadmapPhase[] = [');
const endIndex = content.indexOf('// ─── Hook ─────────────────────────────────────────────────────────────────────');

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find start or end index for replacement.');
  process.exit(1);
}

const newContent = content.substring(0, startIndex) + replacement + '\n\n' + content.substring(endIndex);
fs.writeFileSync(path, newContent, 'utf8');
console.log('Successfully replaced defaults in usePlacementData.ts');

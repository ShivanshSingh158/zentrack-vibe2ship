import type { GymPlanDay } from '../types/gym.types';

// Day of week → plan day index
// Sunday=0→7(rest), Mon=1→1, Tue=2→2, Wed=3→3, Thu=4→4, Fri=5→5, Sat=6→6
export const WEEKDAY_TO_PLAN: Record<number, number> = {
  0: 7, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6,
};

export const GYM_PLAN_ARNOLD: GymPlanDay[] = [
  {
    dayIndex: 1,
    name: 'Chest & Back (Thickness)',
    subtitle: 'Upper/Lower Chest, Back Width & Thickness',
    focus: 'Perfectly balanced day focusing on all chest heads and lat width/mid-back thickness.',
    exercises: [
      { id: 'd1_e1', name: 'Incline Dumbbell Press', targetSets: 3, targetReps: '10–12', muscle: 'Upper Chest', videoId: '8fXfwG4ftaQ' },
      { id: 'd1_e2', name: 'Pec Deck Fly', targetSets: 3, targetReps: '10–12', muscle: 'Mid Chest', videoId: 'fgXSA2-o0NM' },
      { id: 'd1_e3', name: 'High-to-Low Cable Crossovers', targetSets: 3, targetReps: '10–15', muscle: 'Lower Chest', videoId: '8Um35Es-ROE' },
      { id: 'd1_e4', name: 'Neutral-Grip Lat Pulldowns', targetSets: 3, targetReps: '8–10', muscle: 'Lat Width', videoId: 'SALxEARiMkw' },
      { id: 'd1_e5', name: 'Lat Pulldowns (Standard)', targetSets: 3, targetReps: '10–12', muscle: 'Lat Width', videoId: 'SALxEARiMkw' },
      { id: 'd1_e6', name: 'Chest-Supported T-Bar Row', targetSets: 3, targetReps: '8–10', muscle: 'Mid-Back', videoId: 'TyLoy3n_a10' },
      { id: 'd1_e7', name: 'Seated Cable Rows', targetSets: 2, targetReps: '10–12', muscle: 'Mid-Back', videoId: '4mRy8U542Fo' },
      { id: 'd1_e8', name: 'Reverse Pec Deck (Back Focus)', targetSets: 3, targetReps: '12–15', muscle: 'Mid-Back', videoId: '-TKqxK7-ehc' },
    ],
  },
  {
    dayIndex: 2,
    name: 'Shoulders, Arms & Traps',
    subtitle: 'Front/Side Delts, Heavy Arms',
    focus: 'Shoulder width, trap thickness, and heavy arm isolations.',
    exercises: [
      { id: 'd2_e1', name: 'Machine Overhead Press', targetSets: 3, targetReps: '8–10', muscle: 'Front Delts', videoId: '6v4nrRVySj0' },
      { id: 'd2_e2', name: 'Cable Lateral Raises', targetSets: 3, targetReps: '12–15', muscle: 'Side Delts', videoId: 'f_OGBg2KxgY' },
      { id: 'd2_e3', name: 'Reverse Pec Deck', targetSets: 3, targetReps: '12–15', muscle: 'Rear Delts', videoId: '-TKqxK7-ehc' },
      { id: 'd2_e4', name: 'Cable Shrugs', targetSets: 3, targetReps: '10–12', muscle: 'Upper Traps', videoId: 'rFsSeClGnNA' },
      { id: 'd2_e5', name: 'EZ-Bar Skullcrushers', targetSets: 3, targetReps: '8–12', muscle: 'Long Tricep', videoId: 'd_KZxkY_0cM' },
      { id: 'd2_e6', name: 'Dual-Rope Tricep Pushdowns', targetSets: 3, targetReps: '10–15', muscle: 'Lat/Med Tricep', videoId: 'NvZKjiZ8NYc' },
      { id: 'd2_e7', name: 'Rope Tricep Pushdowns', targetSets: 3, targetReps: '10–15', muscle: 'Lat/Med Tricep', videoId: 'NvZKjiZ8NYc' },
      { id: 'd2_e8', name: 'Standing EZ-Bar Curls', targetSets: 3, targetReps: '8–12', muscle: 'Short Bicep', videoId: 'kwG2ipFRgfo' },
      { id: 'd2_e9', name: 'Incline Dumbbell Curls', targetSets: 3, targetReps: '10–12', muscle: 'Long Bicep', videoId: 'DCe8f6vMe9A' },
    ],
  },
  {
    dayIndex: 3,
    name: 'Legs, Core & Forearms A',
    subtitle: 'Hams, Heavy Quads, Upper Abs',
    focus: 'Heavy squats/hinges, upper core isolation, and forearm flexors.',
    exercises: [
      { id: 'd3_e1', name: 'Hack Squats OR Leg Press', targetSets: 3, targetReps: '8–10', muscle: 'Quads', videoId: 'fE5BWPy7uRc' },
      { id: 'd3_e2', name: 'Leg Extensions', targetSets: 3, targetReps: '12–15', muscle: 'Quads', videoId: 'RVEZruvfkqI' },
      { id: 'd3_e3', name: 'Romanian Deadlifts (RDLs)', targetSets: 3, targetReps: '8–10', muscle: 'Hamstrings', videoId: '2SHsk9AzdjA' },
      { id: 'd3_e4', name: 'Standing Machine Calf Raises', targetSets: 4, targetReps: '12–15', muscle: 'Gastrocnemius', videoId: 'SVtg-1loH4c' },
      { id: 'd3_e5', name: 'Kneeling Cable Crunches', targetSets: 3, targetReps: '10–15', muscle: 'Upper Abs', videoId: 'mnRhbUB3Fjs' },
      { id: 'd3_e6', name: 'Hanging Knee Raises', targetSets: 3, targetReps: '12–15', muscle: 'Lower Abs', videoId: '2n4UqRIJyk4' },
      { id: 'd3_e7', name: 'Cable Woodchoppers', targetSets: 3, targetReps: '10–12', muscle: 'Obliques', videoId: 'gcGNypjIQDo' },
      { id: 'd3_e8', name: 'Standing Behind Back Wrist Curls', targetSets: 3, targetReps: '15–20', muscle: 'Forearm Flexors', videoId: 'yz2eCSWoY4E' },
      { id: 'd3_e9', name: 'Machine Wrist Curls', targetSets: 3, targetReps: '15–20', muscle: 'Forearm Flexors', videoId: 'eL777V8a-6E' },
      { id: 'd3_e10', name: 'Machine Reverse Wrist Curls', targetSets: 3, targetReps: '15–20', muscle: 'Forearm Extensors', videoId: 'sKXqNO2KQp8' },
    ],
  },
  {
    dayIndex: 4,
    name: 'Chest & Back (Width)',
    subtitle: 'Mid Chest, Lat Width',
    focus: 'Mid chest thickness and massive lat width pulling.',
    exercises: [
      { id: 'd4_e1', name: 'Incline Machine Press', targetSets: 3, targetReps: '8–10', muscle: 'Upper Chest', videoId: 'VesHgJR14E8' },
      { id: 'd4_e2', name: 'Cable Crossovers', targetSets: 3, targetReps: '12–15', muscle: 'Mid Chest', videoId: '8Um35Es-ROE' },
      { id: 'd4_e3', name: 'Pec Deck Fly', targetSets: 3, targetReps: '10–12', muscle: 'Mid Chest', videoId: 'fgXSA2-o0NM' },
      { id: 'd4_e4', name: 'Assisted Pull-Ups / Chin-Ups', targetSets: 3, targetReps: '8–10', muscle: 'Lat Width', videoId: 'CdO5BvP6Ti8' },
      { id: 'd4_e5', name: 'Single-Arm Cable Rows (low pull)', targetSets: 3, targetReps: '10–12', muscle: 'Lat Width', videoId: 'qN54-QNO1eQ' },
      { id: 'd4_e6', name: 'Seated Cable Rows V-Bar', targetSets: 3, targetReps: '10–12', muscle: 'Mid-Back', videoId: '4mRy8U542Fo' },
      { id: 'd4_e7', name: 'Reverse Pec Deck (Back Focus)', targetSets: 3, targetReps: '12–15', muscle: 'Mid-Back', videoId: '-TKqxK7-ehc' },
    ],
  },
  {
    dayIndex: 5,
    name: 'Shoulders & Arms (Detail)',
    subtitle: '3D Delts, Brachialis, Tricep Stretch',
    focus: 'Full shoulder cap development and long head arm stretches.',
    exercises: [
      { id: 'd5_e1', name: 'Machine Overhead Press', targetSets: 3, targetReps: '8–10', muscle: 'Front Delts', videoId: '6v4nrRVySj0' },
      { id: 'd5_e2', name: 'Dumbbell Lateral Raises', targetSets: 3, targetReps: '12–15', muscle: 'Side Delts', videoId: 'Kl3LEzQ5Zqs' },
      { id: 'd5_e3', name: 'Face Pulls', targetSets: 3, targetReps: '12–15', muscle: 'Rear Delts', videoId: 'ljgqer1ZpXg' },
      { id: 'd5_e4', name: 'Overhead Cable Extensions', targetSets: 3, targetReps: '10–12', muscle: 'Long Tricep', videoId: 'b5le--KkyH0' },
      { id: 'd5_e5', name: 'Katana Cable Extensions', targetSets: 3, targetReps: '10–12', muscle: 'Long Tricep', videoId: 'b5le--KkyH0' },
      { id: 'd5_e6', name: 'Cable Cross-Body Tricep Extensions', targetSets: 3, targetReps: '10–15', muscle: 'Lat/Med Tricep', videoId: 'hp9IQlVcNW0' },
      { id: 'd5_e7', name: 'Alternating Dumbbell Curls w/ Supination', targetSets: 3, targetReps: '10–12', muscle: 'Short Bicep', videoId: 'iui51E31sX8' },
      { id: 'd5_e8', name: 'Face-Away Cable Curls', targetSets: 3, targetReps: '10–12', muscle: 'Long Bicep', videoId: 'kwG2ipFRgfo' },
      { id: 'd5_e9', name: 'Dumbbell Hammer Curls', targetSets: 3, targetReps: '10–12', muscle: 'Brachialis', videoId: '5FAuyZuvJFg' },
    ],
  },
  {
    dayIndex: 6,
    name: 'Legs, Core & Forearms B',
    subtitle: 'Squats, Glutes, Deep Core',
    focus: 'Quad teardrop, deep anti-rotation core, and forearm brachioradialis.',
    exercises: [
      { id: 'd6_e1', name: 'Heel-Elevated Goblet Squats', targetSets: 3, targetReps: '10–12', muscle: 'Quad Teardrop', videoId: 'RVEZruvfkqI' },
      { id: 'd6_e2', name: 'Seated Leg Curls', targetSets: 3, targetReps: '12–15', muscle: 'Hamstrings', videoId: '_lgE0gPvbik' },
      { id: 'd6_e3', name: 'Dumbbell Reverse Lunges', targetSets: 3, targetReps: '8–10', muscle: 'Glutes/Quads', videoId: '3Xy4_P86v2E' },
      { id: 'd6_e4', name: 'Seated Machine Abductions', targetSets: 3, targetReps: '15–20', muscle: 'Glutes/Abductors', videoId: '01HilwRf8m8' },
      { id: 'd6_e5', name: 'Seated Calf Raises', targetSets: 4, targetReps: '12–15', muscle: 'Soleus', videoId: '6O5hh1rBtx8' },
      { id: 'd6_e6', name: 'Seated Ab Crunch Machine', targetSets: 3, targetReps: '10–12', muscle: 'Upper Abs', videoId: 'mnRhbUB3Fjs' },
      { id: 'd6_e7', name: 'Reverse Crunches', targetSets: 3, targetReps: '12–15', muscle: 'Lower Abs', videoId: 'JonqVgFNiqE' },
      { id: 'd6_e8', name: 'Pallof Press', targetSets: 3, targetReps: '10–12', muscle: 'Transverse Abs', videoId: 'gcGNypjIQDo' },
      { id: 'd6_e9', name: 'Reverse Cable Curls', targetSets: 3, targetReps: '10–12', muscle: 'Brachioradialis', videoId: 'jjnJHhzZUUM' },
    ],
  },
  {
    dayIndex: 7,
    name: 'Rest Day',
    subtitle: 'Complete Rest',
    focus: 'No lifting. Light walk allowed. Focus on recovery.',
    exercises: [],
    isRest: true,
  },
];

export const GYM_PLAN_PPL: GymPlanDay[] = [
  {
    dayIndex: 1,
    name: 'Push A',
    subtitle: 'Heavy Chest & Triceps',
    focus: 'Compound pressing power, overhead triceps, and side/front delts.',
    exercises: [
      { id: 'ppl_d1_e1', name: 'Flat Barbell Bench Press', targetSets: 3, targetReps: '8–10', muscle: 'Mid Chest', videoId: 'vENMjPI-piM' },
      { id: 'ppl_d1_e2', name: 'Incline Machine Press', targetSets: 3, targetReps: '10–12', muscle: 'Upper Chest', videoId: 'WxrKIPbeQP8' },
      { id: 'ppl_d1_e3', name: 'High-to-Low Cable Crossovers', targetSets: 3, targetReps: '12–15', muscle: 'Lower Chest', videoId: 'jFx0mOgNSsc' },
      { id: 'ppl_d1_e4', name: 'Machine Overhead Press', targetSets: 3, targetReps: '8–12', muscle: 'Front Delts', videoId: 'TFayqrepbXE' },
      { id: 'ppl_d1_e5', name: 'Cable Lateral Raises', targetSets: 3, targetReps: '12–15', muscle: 'Side Delts', videoId: 'xrBcuPNTxLg' },
      { id: 'ppl_d1_e6', name: 'Dual-Rope Tricep Pushdowns', targetSets: 3, targetReps: '10–15', muscle: 'Lat/Med Tricep', videoId: 'i5I7RGyWwo8' },
      { id: 'ppl_d1_e7', name: 'Overhead Cable Extension (rope)', targetSets: 3, targetReps: '10–12', muscle: 'Long Tricep', videoId: 'b5le--KkyH0' },
    ],
  },
  {
    dayIndex: 2,
    name: 'Pull A',
    subtitle: 'Lat Width & Biceps',
    focus: 'Vertical pulling, rhomboid density, rear delts, and bicep isolation.',
    exercises: [
      { id: 'ppl_d2_e1', name: 'Neutral-Grip Lat Pulldowns', targetSets: 3, targetReps: '8–10', muscle: 'Lat Width', videoId: 'QuSqYj7tFbI' },
      { id: 'ppl_d2_e2', name: 'Single-Arm Cable Rows (low pull)', targetSets: 3, targetReps: '10–12', muscle: 'Lat Width', videoId: 'wYy32uk4Bu8' },
      { id: 'ppl_d2_e3', name: 'Chest-Supported T-Bar Row', targetSets: 3, targetReps: '8–10', muscle: 'Mid-Back', videoId: '-avLxYko1k0' },
      { id: 'ppl_d2_e4', name: 'Cable Shrugs', targetSets: 3, targetReps: '12–15', muscle: 'Upper Traps', videoId: '-FBZ2evfXVs' },
      { id: 'ppl_d2_e5', name: 'Reverse Pec Deck Fly', targetSets: 3, targetReps: '12–15', muscle: 'Rear Delts', videoId: 'O2J8Qs7Wl3U' },
      { id: 'ppl_d2_e6', name: 'Preacher Curls', targetSets: 3, targetReps: '10–12', muscle: 'Short Bicep', videoId: 'Cn_S3OKOWBc' },
      { id: 'ppl_d2_e7', name: 'Dumbbell Hammer Curls', targetSets: 3, targetReps: '10–12', muscle: 'Brachialis', videoId: 'lmIo_gVE8T4' },
    ],
  },
  {
    dayIndex: 3,
    name: 'Legs A',
    subtitle: 'Quads & Core A',
    focus: 'Heavy squats, glute abductions, deep core, and forearms.',
    exercises: [
      { id: 'ppl_d3_e1', name: 'Hack Squats OR Leg Press', targetSets: 3, targetReps: '8–10', muscle: 'Quads', videoId: 'xMzqkzmrKTM' },
      { id: 'ppl_d3_e2', name: 'Seated Machine Abductions', targetSets: 3, targetReps: '15–20', muscle: 'Glutes/Abductors', videoId: '01HilwRf8m8' },
      { id: 'ppl_d3_e3', name: 'Seated Leg Curls', targetSets: 3, targetReps: '12–15', muscle: 'Hamstrings', videoId: 'eKGgmvTVHDg' },
      { id: 'ppl_d3_e4', name: 'Seated Calf Raises', targetSets: 3, targetReps: '12–15', muscle: 'Soleus', videoId: '60XGTGOjdXA' },
      { id: 'ppl_d3_e5', name: 'Seated Ab Crunch Machine', targetSets: 3, targetReps: '10–15', muscle: 'Upper Abs', videoId: '7T0ZUEt1m8s' },
      { id: 'ppl_d3_e6', name: 'Cable Woodchoppers', targetSets: 3, targetReps: '10–15', muscle: 'Obliques', videoId: 'YIU0U_B57rU' },
      { id: 'ppl_d3_e7', name: 'Machine Wrist Curls', targetSets: 3, targetReps: '15–20', muscle: 'Forearm Flexors', videoId: '3VLTzIrnb5g' },
    ],
  },
  {
    dayIndex: 4,
    name: 'Push B',
    subtitle: 'Chest Detail & Side Delts',
    focus: 'Upper/Mid chest sculpting, lateral raises, and tricep horseshoe isolation.',
    exercises: [
      { id: 'ppl_d4_e1', name: 'Low-to-High Cable Fly', targetSets: 3, targetReps: '12–15', muscle: 'Upper Chest', videoId: 'u5X5x1fw_SA' },
      { id: 'ppl_d4_e2', name: 'Pec Deck Fly', targetSets: 3, targetReps: '10–15', muscle: 'Mid Chest', videoId: 'fgXSA2-o0NM' },
      { id: 'ppl_d4_e3', name: 'Incline Dumbbell Press', targetSets: 3, targetReps: '8–10', muscle: 'Upper Chest', videoId: '8fXfwG4ftaQ' },
      { id: 'ppl_d4_e4', name: 'Cable Lateral Raises', targetSets: 3, targetReps: '12–15', muscle: 'Side Delts', videoId: 'xrBcuPNTxLg' },
      { id: 'ppl_d4_e5', name: 'Cable Cross-Body Tricep Extensions', targetSets: 3, targetReps: '10–15', muscle: 'Lat/Med Tricep', videoId: '0rAlOwNPJno' },
      { id: 'ppl_d4_e6', name: 'Cable Skull Crusher', targetSets: 3, targetReps: '10–12', muscle: 'Long Tricep', videoId: 'q-mZQep-LMI' },
    ],
  },
  {
    dayIndex: 5,
    name: 'Pull B',
    subtitle: 'Mid-Back Thickness',
    focus: 'Chest-supported dumbbell rowing, spinal erector health, and brachialis.',
    exercises: [
      { id: 'ppl_d5_e1', name: 'Chest-Supported Incline Dumbbell Row', targetSets: 3, targetReps: '8–10', muscle: 'Mid-Back', videoId: 'H75im9fAUMc' },
      { id: 'ppl_d5_e2', name: 'Machine Lat Pulldown', targetSets: 3, targetReps: '10–12', muscle: 'Lat Width', videoId: 'bNmvKpJSWKM' },
      { id: 'ppl_d5_e3', name: 'Seated Cable Rows V-Bar', targetSets: 3, targetReps: '10–12', muscle: 'Mid-Back', videoId: 'HoWHac5nbLo' },
      { id: 'ppl_d5_e4', name: 'Back Extensions', targetSets: 3, targetReps: '12–15', muscle: 'Lower Back', videoId: 'EBui4Bt5N7o' },
      { id: 'ppl_d5_e5', name: 'Cable Rear Delt Fly', targetSets: 3, targetReps: '12–15', muscle: 'Rear Delts', videoId: 'FeERX9UwspY' },
      { id: 'ppl_d5_e6', name: 'Incline Dumbbell Curls', targetSets: 3, targetReps: '10–12', muscle: 'Long Bicep', videoId: '0-qmVm4tHDw' },
      { id: 'ppl_d5_e7', name: 'Reverse Cable Curls', targetSets: 3, targetReps: '10–12', muscle: 'Brachialis', videoId: 'z4D7dwPjsO8' },
    ],
  },
  {
    dayIndex: 6,
    name: 'Legs B',
    subtitle: 'Hams & Core B',
    focus: 'RDLs, quad teardrop VMO, and deep anti-rotation transverse abs.',
    exercises: [
      { id: 'ppl_d6_e1', name: 'Romanian Deadlifts (RDLs)', targetSets: 3, targetReps: '8–10', muscle: 'Hamstrings', videoId: 'cjRSNsvqpd8' },
      { id: 'ppl_d6_e2', name: 'Heel-Elevated Goblet Squats', targetSets: 3, targetReps: '10–12', muscle: 'Quad Teardrop', videoId: '0wz99W3lbAs' },
      { id: 'ppl_d6_e3', name: 'Leg Extensions', targetSets: 3, targetReps: '12–15', muscle: 'Quads', videoId: '2zZ3vkPsExQ' },
      { id: 'ppl_d6_e4', name: 'Standing Machine Calf Raises', targetSets: 3, targetReps: '12–15', muscle: 'Gastrocnemius', videoId: 'n-5T_oYc1oU' },
      { id: 'ppl_d6_e5', name: 'Hanging Knee Raises', targetSets: 3, targetReps: '12–15', muscle: 'Lower Abs', videoId: 'Fl8rJJ7mZJM' },
      { id: 'ppl_d6_e6', name: 'Pallof Press', targetSets: 3, targetReps: '10–12', muscle: 'Transverse Abs', videoId: '5aZ0IhJS8O8' },
      { id: 'ppl_d6_e7', name: 'Behind-the-Back Barbell Wrist Curls', targetSets: 3, targetReps: '15–20', muscle: 'Forearm Flexors', videoId: 'Cj9RNAYD7iY' },
    ],
  },
  {
    dayIndex: 7,
    name: 'Rest Day',
    subtitle: 'Complete Rest',
    focus: 'No lifting. Light walk allowed. Focus on recovery.',
    exercises: [],
    isRest: true,
  },
];

export const GYM_PLAN = GYM_PLAN_PPL;

// Curated 8 best distinct alternatives ranked by Biomechanical Hypertrophy Tiers (S Tier -> A+ Tier -> A Tier -> B Tier).
export const EXERCISE_ALTERNATIVES: Record<string, { 
  name: string; 
  tier: 'S Tier' | 'A+ Tier' | 'A Tier' | 'B Tier'; 
  targetSets: number; 
  targetReps: string; 
  restTimeSecs: number; 
  videoId?: string; 
  reason?: string; 
}[]> = {
  "Mid-Back": [
    {
      "name": "Chest-Supported T-Bar Row",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "TyLoy3n_a10",
      "reason": "Fixed chest support eliminates lower back fatigue"
    },
    {
      "name": "Chest-Supported Machine Row",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "TyLoy3n_a10",
      "reason": "Pure upper back & mid-trap isolation on fixed track"
    },
    {
      "name": "Seated Cable Rows (V-Bar)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "4mRy8U542Fo",
      "reason": "Continuous cable tension through full scapular retraction"
    },
    {
      "name": "Barbell Bent-Over Row",
      "tier": "A+ Tier",
      "targetSets": 4,
      "targetReps": "6–8",
      "restTimeSecs": 150,
      "videoId": "G8l_8chR5BE",
      "reason": "Heavy free-weight compound for overall back thickness"
    },
    {
      "name": "Single-Arm Dumbbell Row",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qN54-QNO1eQ",
      "reason": "Unilateral focus with deep lat and rhomboid stretch"
    },
    {
      "name": "Incline Dumbbell Row",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qN54-QNO1eQ",
      "reason": "Chest-supported dumbbell row targeting mid-back"
    },
    {
      "name": "Meadows Row (Landmine)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qN54-QNO1eQ",
      "reason": "Unilateral upper back row with extreme lat stretch"
    },
    {
      "name": "Conventional Barbell Deadlifts",
      "tier": "B Tier",
      "targetSets": 4,
      "targetReps": "6–8",
      "restTimeSecs": 150,
      "videoId": "ZaTM37cfiDs",
      "reason": "Full posterior chain strength builder"
    }
  ],
  "Lat Width": [
    {
      "name": "Neutral-Grip Lat Pulldowns",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "SALxEARiMkw",
      "reason": "Joint-friendly grip emphasizing lower lat fibers"
    },
    {
      "name": "Single-Arm Cable Lat Row (Low Pull)",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qN54-QNO1eQ",
      "reason": "Deep stretch aligned with lat fiber orientation"
    },
    {
      "name": "Weighted Pull-Ups / Chin-Ups",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "eGo4IYlbE5g",
      "reason": "Ultimate closed-chain bodyweight lat builder"
    },
    {
      "name": "Wide-Grip Lat Pulldowns",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "SALxEARiMkw",
      "reason": "Maximum lat sweep and upper back engagement"
    },
    {
      "name": "Straight-Arm Cable Lat Pulldowns",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qN54-QNO1eQ",
      "reason": "Pure lat isolation without bicep involvement"
    },
    {
      "name": "Dumbbell Lat Pullover",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qN54-QNO1eQ",
      "reason": "Expanded ribcage stretch and long-head lat recruitment"
    },
    {
      "name": "Assisted Pull-Ups",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "CdO5BvP6Ti8",
      "reason": "Controlled full range of motion lat contractions"
    },
    {
      "name": "Kneeling Single-Arm Lat Pulldown",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "SALxEARiMkw",
      "reason": "Unilateral stretch with cable resistance"
    }
  ],
  "Back": [
    {
      "name": "Chest-Supported T-Bar Row",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "TyLoy3n_a10",
      "reason": "Mid-back thickness with zero spinal shear"
    },
    {
      "name": "Neutral-Grip Lat Pulldowns",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "SALxEARiMkw",
      "reason": "Lat width & upper back development"
    },
    {
      "name": "Barbell Bent-Over Row",
      "tier": "A+ Tier",
      "targetSets": 4,
      "targetReps": "6–8",
      "restTimeSecs": 150,
      "videoId": "G8l_8chR5BE",
      "reason": "Heavy compound mass builder"
    },
    {
      "name": "Weighted Pull-Ups / Chin-Ups",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "eGo4IYlbE5g",
      "reason": "Bodyweight vertical pulling power"
    },
    {
      "name": "Seated Cable Rows",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "4mRy8U542Fo",
      "reason": "Mid-back contraction with constant cable tension"
    },
    {
      "name": "Single-Arm Dumbbell Row",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qN54-QNO1eQ",
      "reason": "Unilateral pulling for balanced lat strength"
    },
    {
      "name": "Straight-Arm Cable Pulldowns",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qN54-QNO1eQ",
      "reason": "Direct lat sweep isolation"
    },
    {
      "name": "Incline Dumbbell Row",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qN54-QNO1eQ",
      "reason": "Chest-supported dumbbell row"
    }
  ],
  "Upper Chest": [
    {
      "name": "Incline Dumbbell Press",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "8fXfwG4ftaQ",
      "reason": "Independent arm path for deep clavicular pec stretch"
    },
    {
      "name": "Converging Incline Chest Press",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "VesHgJR14E8",
      "reason": "High-stability converging plate-loaded upper pec press"
    },
    {
      "name": "Hammer Strength Incline Press",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "8fXfwG4ftaQ",
      "reason": "Pure progressive overload without stabilizer fatigue"
    },
    {
      "name": "Incline Barbell Bench Press",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "VesHgJR14E8",
      "reason": "Heavy barbell loading for upper chest mass"
    },
    {
      "name": "Low-to-High Cable Crossovers",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "8Um35Es-ROE",
      "reason": "Constant peak contraction across the upper chest"
    },
    {
      "name": "Incline Dumbbell Flyes",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "fgXSA2-o0NM",
      "reason": "Isolated upper chest stretch at the bottom"
    },
    {
      "name": "Reverse-Grip Incline Barbell Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "VesHgJR14E8",
      "reason": "Shifts emphasis directly to clavicular pec head"
    },
    {
      "name": "Landmine Chest Press",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "8fXfwG4ftaQ",
      "reason": "Shoulder-friendly converging pressing arc"
    }
  ],
  "Mid Chest": [
    {
      "name": "Flat Dumbbell Bench Press",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "8fXfwG4ftaQ",
      "reason": "Natural wrist rotation with greater range of motion"
    },
    {
      "name": "Flat Barbell Bench Press",
      "tier": "A+ Tier",
      "targetSets": 4,
      "targetReps": "6–8",
      "restTimeSecs": 150,
      "videoId": "hWbUlkb5Ms4",
      "reason": "Gold standard power & mass builder"
    },
    {
      "name": "Pec Deck Fly",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "fgXSA2-o0NM",
      "reason": "Strict adduction isolation with constant resistance"
    },
    {
      "name": "Close-Grip Barbell Bench Press",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "hWbUlkb5Ms4",
      "reason": "Heavy inner pec and tricep compound overload"
    },
    {
      "name": "Flat Machine Chest Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "VesHgJR14E8",
      "reason": "High stability to train close to true failure safely"
    },
    {
      "name": "Cable Crossovers",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "8Um35Es-ROE",
      "reason": "Squeeze & hold peak chest contraction"
    },
    {
      "name": "Weighted Push-Ups",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2z8JmcrW-As",
      "reason": "Closed-chain pressing with scapular movement"
    },
    {
      "name": "Flat Dumbbell Floor Press",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "8fXfwG4ftaQ",
      "reason": "Safe shoulder angle with heavy tricep lockout"
    }
  ],
  "Lower Chest": [
    {
      "name": "High-to-Low Cable Crossovers",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "8Um35Es-ROE",
      "reason": "Aligned directly with lower sternal pec fibers"
    },
    {
      "name": "Weighted Dips (Forward Lean)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "2z8JmcrW-As",
      "reason": "Heavy lower pec recruitment and stretch"
    },
    {
      "name": "Decline Hammer Strength Press",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "VesHgJR14E8",
      "reason": "Controlled lower chest path to true failure"
    },
    {
      "name": "Decline Dumbbell Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "8fXfwG4ftaQ",
      "reason": "Reduced shoulder stress while loading lower chest"
    },
    {
      "name": "Decline Barbell Bench Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "hWbUlkb5Ms4",
      "reason": "Barbell strength overload for lower chest"
    },
    {
      "name": "Decline Dumbbell Flyes",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "fgXSA2-o0NM",
      "reason": "Lower chest isolation fly"
    }
  ],
  "Chest": [
    {
      "name": "Incline Dumbbell Press",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "8fXfwG4ftaQ",
      "reason": "Upper chest hypertrophy"
    },
    {
      "name": "Flat Barbell Bench Press",
      "tier": "A+ Tier",
      "targetSets": 4,
      "targetReps": "6–8",
      "restTimeSecs": 150,
      "videoId": "hWbUlkb5Ms4",
      "reason": "Heavy compound pressing"
    },
    {
      "name": "Pec Deck Fly",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "fgXSA2-o0NM",
      "reason": "Direct chest isolation"
    },
    {
      "name": "Machine Chest Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "VesHgJR14E8",
      "reason": "Safe failure training with high stability"
    },
    {
      "name": "High-to-Low Cable Crossovers",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "8Um35Es-ROE",
      "reason": "Lower pec contouring"
    },
    {
      "name": "Weighted Dips",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "2z8JmcrW-As",
      "reason": "Compound chest & tricep builder"
    },
    {
      "name": "Incline Barbell Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "VesHgJR14E8",
      "reason": "Heavy incline overload"
    },
    {
      "name": "Flat Dumbbell Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "8fXfwG4ftaQ",
      "reason": "Free weight range of motion"
    }
  ],
  "Side Delts": [
    {
      "name": "Cable Lateral Raises",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "f_OGBg2KxgY",
      "reason": "Smooth resistance curve, especially at the bottom"
    },
    {
      "name": "Machine Lateral Raises",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "f_OGBg2KxgY",
      "reason": "Strict delt isolation without body swinging"
    },
    {
      "name": "Egyptian Cable Lateral Raises (Behind Back)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "f_OGBg2KxgY",
      "reason": "Extended range of motion and stretch tension"
    },
    {
      "name": "Dumbbell Lateral Raises",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "Kl3LEzQ5Zqs",
      "reason": "Classic free-weight side delt width builder"
    },
    {
      "name": "Lu Raises / Y-Raises",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "Kl3LEzQ5Zqs",
      "reason": "Full overhead abduction for side delt cap"
    },
    {
      "name": "Wide-Grip Upright Rows",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "DjoxaS1kxjQ",
      "reason": "Compound loading for side delts and upper traps"
    },
    {
      "name": "Incline Dumbbell Lateral Raises",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "Kl3LEzQ5Zqs",
      "reason": "Loads side delt in shortened position"
    },
    {
      "name": "Seated Dumbbell Lateral Raises",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "Kl3LEzQ5Zqs",
      "reason": "Strict seated side delt isolation"
    }
  ],
  "Rear Delts": [
    {
      "name": "Reverse Pec Deck",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "-TKqxK7-ehc",
      "reason": "Pure horizontal abduction without back takeover"
    },
    {
      "name": "Face Pulls (Rope)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "ljgqer1ZpXg",
      "reason": "Rear delts + external rotation postural health"
    },
    {
      "name": "Cross-Body Cable Rear Delt Flyes",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "-TKqxK7-ehc",
      "reason": "Dual cable alignment with rear delt fibers"
    },
    {
      "name": "Incline Dumbbell Rear Delt Flyes",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "-TKqxK7-ehc",
      "reason": "Chest supported free-weight isolation"
    },
    {
      "name": "Chest-Supported Rear Delt Rows",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "ljgqer1ZpXg",
      "reason": "Heavy row with elbows flared at 90 degrees"
    },
    {
      "name": "Band Pull-Aparts",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "ljgqer1ZpXg",
      "reason": "High-rep burn and rotator cuff activation"
    },
    {
      "name": "Single-Arm Cable Rear Delt Fly",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "-TKqxK7-ehc",
      "reason": "Unilateral rear delt isolation"
    },
    {
      "name": "Seated Bent-Over Dumbbell Fly",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "-TKqxK7-ehc",
      "reason": "Free weight rear delt isolation"
    }
  ],
  "Front Delts": [
    {
      "name": "Machine Overhead Press",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "6v4nrRVySj0",
      "reason": "High-stability overhead power builder"
    },
    {
      "name": "Seated Dumbbell Shoulder Press",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "qEwKCR5JCog",
      "reason": "Independent shoulder pressing with full ROM"
    },
    {
      "name": "Barbell Military Press (Standing OHP)",
      "tier": "A Tier",
      "targetSets": 4,
      "targetReps": "6–8",
      "restTimeSecs": 150,
      "videoId": "qEwKCR5JCog",
      "reason": "Core-stabilized full body overhead strength"
    },
    {
      "name": "Arnold Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qEwKCR5JCog",
      "reason": "Rotating motion engaging front and side delts"
    },
    {
      "name": "Cable Front Raises",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qEwKCR5JCog",
      "reason": "Continuous tension on anterior delt fibers"
    },
    {
      "name": "Smith Machine Shoulder Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "6v4nrRVySj0",
      "reason": "Controlled vertical pressing plane"
    },
    {
      "name": "Dumbbell Front Raises",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qEwKCR5JCog",
      "reason": "Anterior delt isolation"
    },
    {
      "name": "Push Press",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qEwKCR5JCog",
      "reason": "Explosive overhead athletic power"
    }
  ],
  "Upper Traps": [
    {
      "name": "Cable Shrugs",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "rFsSeClGnNA",
      "reason": "Angled line of pull aligned with upper trap fibers"
    },
    {
      "name": "Dumbbell Shrugs (Slight Lean)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "rFsSeClGnNA",
      "reason": "Freedom of wrist positioning and peak squeeze"
    },
    {
      "name": "Barbell Shrugs",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "rFsSeClGnNA",
      "reason": "Heavy overload for trap thickness"
    },
    {
      "name": "Trap Bar Shrugs",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "rFsSeClGnNA",
      "reason": "Neutral grip prevents shoulder rolling"
    },
    {
      "name": "Smith Machine Behind-the-Back Shrugs",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "rFsSeClGnNA",
      "reason": "Posterior trap squeeze"
    },
    {
      "name": "Farmer Walks",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "Fkzk_RqlYig",
      "reason": "Isometric trap and grip endurance"
    }
  ],
  "Shoulders": [
    {
      "name": "Cable Lateral Raises",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "f_OGBg2KxgY",
      "reason": "Side delt shoulder width"
    },
    {
      "name": "Reverse Pec Deck",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "-TKqxK7-ehc",
      "reason": "Rear delt 3D capping"
    },
    {
      "name": "Machine Overhead Press",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "6v4nrRVySj0",
      "reason": "Front delt overhead power"
    },
    {
      "name": "Seated Dumbbell Shoulder Press",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "qEwKCR5JCog",
      "reason": "Free weight overhead mass"
    },
    {
      "name": "Face Pulls",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "ljgqer1ZpXg",
      "reason": "Rear delt & rotator cuff health"
    },
    {
      "name": "Dumbbell Lateral Raises",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "Kl3LEzQ5Zqs",
      "reason": "Classic side delt isolation"
    },
    {
      "name": "Arnold Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "qEwKCR5JCog",
      "reason": "Full shoulder rotation"
    },
    {
      "name": "Cable Shrugs",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "rFsSeClGnNA",
      "reason": "Upper trap thickness"
    }
  ],
  "Long Tricep": [
    {
      "name": "Katana Cable Extensions",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "b5le--KkyH0",
      "reason": "Unilateral cross-body long head stretch"
    },
    {
      "name": "Overhead Cable Tricep Extensions",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "b5le--KkyH0",
      "reason": "Constant cable tension with arms elevated"
    },
    {
      "name": "EZ-Bar Skullcrushers",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "d_KZxkY_0cM",
      "reason": "Deep eccentric stretch on the long head"
    },
    {
      "name": "Incline Dumbbell Skullcrushers",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "d_KZxkY_0cM",
      "reason": "Increased stretch angle on an incline bench"
    },
    {
      "name": "French Press (Seated EZ-Bar OHP)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "d_KZxkY_0cM",
      "reason": "Heavy overhead loading for long head"
    },
    {
      "name": "Single-Arm Overhead Dumbbell Extension",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "b5le--KkyH0",
      "reason": "Unilateral stretch and squeeze"
    },
    {
      "name": "Dumbbell Skullcrushers (Flat)",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "d_KZxkY_0cM",
      "reason": "Independent arm control"
    }
  ],
  "Lat/Med Tricep": [
    {
      "name": "Dual-Rope Tricep Pushdowns",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "NvZKjiZ8NYc",
      "reason": "Allows complete extension past the hips"
    },
    {
      "name": "Close-Grip Barbell Bench Press",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "hWbUlkb5Ms4",
      "reason": "Heavy compound tricep overload"
    },
    {
      "name": "Straight-Bar Cable Pushdowns",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "NvZKjiZ8NYc",
      "reason": "Heavy loading on the lateral tricep head"
    },
    {
      "name": "Cable Cross-Body Tricep Extensions",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "hp9IQlVcNW0",
      "reason": "Aligned with lateral head line of pull"
    },
    {
      "name": "Tricep Dips (Upright)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2z8JmcrW-As",
      "reason": "Bodyweight lockout mass builder"
    },
    {
      "name": "Single-Arm Underhand Cable Pushdowns",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "NvZKjiZ8NYc",
      "reason": "Direct medial head isolation"
    },
    {
      "name": "Diamond Pushups",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "hWbUlkb5Ms4",
      "reason": "Closed-chain tricep overload"
    }
  ],
  "Triceps": [
    {
      "name": "Dual-Rope Tricep Pushdowns",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "NvZKjiZ8NYc",
      "reason": "Lateral/medial head pump & full lockout"
    },
    {
      "name": "Katana Cable Extensions",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "b5le--KkyH0",
      "reason": "Optimal cross-body stretch"
    },
    {
      "name": "Overhead Cable Extensions",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "b5le--KkyH0",
      "reason": "Full tricep long-head recruitment"
    },
    {
      "name": "EZ-Bar Skullcrushers",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "d_KZxkY_0cM",
      "reason": "Heavy long-head eccentric stretch"
    },
    {
      "name": "Close-Grip Bench Press",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "hWbUlkb5Ms4",
      "reason": "Compound tricep mass builder"
    },
    {
      "name": "Tricep Dips",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2z8JmcrW-As",
      "reason": "Classic compound lockout power"
    },
    {
      "name": "Straight-Bar Cable Pushdowns",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "NvZKjiZ8NYc",
      "reason": "Heavy lateral head pushdown"
    },
    {
      "name": "Incline Dumbbell Skullcrushers",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "d_KZxkY_0cM",
      "reason": "Incline tricep stretch"
    }
  ],
  "Short Bicep": [
    {
      "name": "Preacher Curls (EZ-Bar / Dumbbell)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "R-8Sa0_qiws",
      "reason": "Eliminates shoulder swing for strict bicep contraction"
    },
    {
      "name": "Standing EZ-Bar Curls",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "kwG2ipFRgfo",
      "reason": "Heavy bicep overload with joint-safe wrist angle"
    },
    {
      "name": "Alternating Dumbbell Curls w/ Supination",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "iui51E31sX8",
      "reason": "Active wrist rotation maximizes inner short head peak"
    },
    {
      "name": "Spider Curls (Chest on Incline)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "R-8Sa0_qiws",
      "reason": "Peak short-head contraction at the top"
    },
    {
      "name": "High Cable Bicep Curls (Hercules)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "kwG2ipFRgfo",
      "reason": "Direct bicep peak isolation from overhead cables"
    },
    {
      "name": "Concentration Curls",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "iui51E31sX8",
      "reason": "Isolated single-arm peak squeeze"
    }
  ],
  "Long Bicep": [
    {
      "name": "Incline Dumbbell Curls",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "DCe8f6vMe9A",
      "reason": "Deepest stretch on the outer long head bicep"
    },
    {
      "name": "Face-Away Cable Curls",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "kwG2ipFRgfo",
      "reason": "Continuous tension with shoulder in extension"
    },
    {
      "name": "Bayesian Cable Curls",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "kwG2ipFRgfo",
      "reason": "Modern single-arm lengthened bicep stretch"
    },
    {
      "name": "Close-Grip EZ-Bar Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "kwG2ipFRgfo",
      "reason": "Narrow grip shifts emphasis to long head"
    },
    {
      "name": "Drag Curls (Barbell / Dumbbell)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "kwG2ipFRgfo",
      "reason": "Pulls bar up torso to target the outer head"
    },
    {
      "name": "Seated Incline Hammer Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "DCe8f6vMe9A",
      "reason": "Long head + brachialis combination stretch"
    }
  ],
  "Brachialis": [
    {
      "name": "Dumbbell Hammer Curls",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "5FAuyZuvJFg",
      "reason": "Pushes bicep up for thicker upper arm appearance"
    },
    {
      "name": "Cable Rope Hammer Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "5FAuyZuvJFg",
      "reason": "Constant tension on brachialis & brachioradialis"
    },
    {
      "name": "Cross-Body Hammer Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "5FAuyZuvJFg",
      "reason": "Strict brachialis isolation across the chest"
    },
    {
      "name": "Reverse Barbell Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "jjnJHhzZUUM",
      "reason": "Heavy forearm extensor & brachioradialis loading"
    },
    {
      "name": "Zottman Curls",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "iui51E31sX8",
      "reason": "Supinated curl up, pronated eccentric lower"
    },
    {
      "name": "Preacher Hammer Curls",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "5FAuyZuvJFg",
      "reason": "Locked-in brachialis isolation"
    }
  ],
  "Biceps": [
    {
      "name": "Incline Dumbbell Curls",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "DCe8f6vMe9A",
      "reason": "Long-head stretch under load"
    },
    {
      "name": "Face-Away Cable Curls",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "kwG2ipFRgfo",
      "reason": "Continuous cable tension throughout"
    },
    {
      "name": "Standing EZ-Bar Curls",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "kwG2ipFRgfo",
      "reason": "Heavy bicep mass & peak"
    },
    {
      "name": "Dumbbell Hammer Curls",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "5FAuyZuvJFg",
      "reason": "Brachialis thickness & forearm tie-in"
    },
    {
      "name": "Preacher Curls",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "R-8Sa0_qiws",
      "reason": "Strict isolated bicep squeeze"
    },
    {
      "name": "Alternating Dumbbell Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "iui51E31sX8",
      "reason": "Supinated free-weight builder"
    },
    {
      "name": "Spider Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "R-8Sa0_qiws",
      "reason": "Peak short-head contraction"
    },
    {
      "name": "Cable Rope Hammer Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "5FAuyZuvJFg",
      "reason": "Forearm & brachialis tension"
    }
  ],
  "Quads": [
    {
      "name": "Hack Squats",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "fE5BWPy7uRc",
      "reason": "Fixed torso allows deep knee flexion and quad tear-drop focus"
    },
    {
      "name": "Heel-Elevated Goblet Squats",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "0wz99W3lbAs",
      "reason": "Quad teardrop isolation with upright torso"
    },
    {
      "name": "Leg Press (Mid-Low Foot Stance)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "RVEZruvfkqI",
      "reason": "Heavy quad loading without spinal compression"
    },
    {
      "name": "Barbell Back Squats",
      "tier": "A+ Tier",
      "targetSets": 4,
      "targetReps": "6–8",
      "restTimeSecs": 150,
      "videoId": "RVEZruvfkqI",
      "reason": "Foundational lower body strength & quad mass"
    },
    {
      "name": "Leg Extensions",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "RVEZruvfkqI",
      "reason": "Direct rectus femoris isolation in fully shortened position"
    },
    {
      "name": "Bulgarian Split Squats",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2C-uNgKwPLE",
      "reason": "Unilateral quad overload and hip stability"
    },
    {
      "name": "Sissy Squats (Bodyweight / Machine)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "fE5BWPy7uRc",
      "reason": "Extreme quad stretch and eccentric load"
    },
    {
      "name": "Front Squats",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "RVEZruvfkqI",
      "reason": "Vertical torso heavily loads anterior chain"
    }
  ],
  "Quad Teardrop": [
    {
      "name": "Heel-Elevated Goblet Squats",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "0wz99W3lbAs",
      "reason": "Maximizes vastus medialis (VMO) recruitment"
    },
    {
      "name": "Hack Squats (Narrow Stance)",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "fE5BWPy7uRc",
      "reason": "Direct knee-forward tracking for teardrop"
    },
    {
      "name": "Leg Extensions (Toes Neutral)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "RVEZruvfkqI",
      "reason": "Squeeze & lock out at top for VMO contraction"
    },
    {
      "name": "Sissy Squats (Bodyweight / Machine)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "fE5BWPy7uRc",
      "reason": "Extreme quad stretch and eccentric load"
    },
    {
      "name": "Front Squats",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "RVEZruvfkqI",
      "reason": "Vertical torso heavily loads anterior chain"
    },
    {
      "name": "Cyclist Squats (Close Stance)",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "0wz99W3lbAs",
      "reason": "Targeted teardrop isolation"
    }
  ],
  "Hamstrings": [
    {
      "name": "Romanian Deadlifts (RDLs - Barbell)",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2SHsk9AzdjA",
      "reason": "Heavy eccentric stretch on hamstring origin"
    },
    {
      "name": "Seated Leg Curls",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "_lgE0gPvbik",
      "reason": "Hamstrings loaded in lengthened hip flexion position"
    },
    {
      "name": "Lying Leg Curls",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "1Tq3QdYUuHs",
      "reason": "Direct knee flexion isolation for hamstring belly"
    },
    {
      "name": "Glute-Ham Raises (GHR)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "1Tq3QdYUuHs",
      "reason": "High-intensity eccentric bodyweight hamstring builder"
    },
    {
      "name": "Dumbbell Romanian Deadlifts",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2SHsk9AzdjA",
      "reason": "Adjustable wrist plane for comfortable hinge"
    },
    {
      "name": "Stiff-Leg Deadlifts (Deficit Block)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2SHsk9AzdjA",
      "reason": "Maximum hamstring stretch off deficit block"
    },
    {
      "name": "Single-Leg Standing Cable Leg Curl",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "1Tq3QdYUuHs",
      "reason": "Unilateral hamstring knee flexion"
    },
    {
      "name": "Good Mornings (Barbell)",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "JCXUYuzwNrM",
      "reason": "Deep posterior chain hinge stretch"
    }
  ],
  "Glutes": [
    {
      "name": "Barbell Hip Thrusts",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "SEdqd1n0cvg",
      "reason": "Maximum gluteus maximus contraction at full extension"
    },
    {
      "name": "KAS Glute Bridges (Barbell / Machine)",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "SEdqd1n0cvg",
      "reason": "Restricted ROM strictly targeting upper glute contraction"
    },
    {
      "name": "Deficit Reverse Lunges (Dumbbell)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "L8fvypPrzzs",
      "reason": "Deep lengthened glute stretch at bottom of stride"
    },
    {
      "name": "Bulgarian Split Squats (Glute Bias)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2C-uNgKwPLE",
      "reason": "Heavy unilateral glute overload with forward torso lean"
    },
    {
      "name": "Single-Leg Hip Thrusts",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "SEdqd1n0cvg",
      "reason": "Corrects bilateral glute strength imbalances"
    },
    {
      "name": "Cable Glute Kickbacks (Straight Back)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "L8fvypPrzzs",
      "reason": "Peak hip extension squeeze"
    },
    {
      "name": "Smith Machine Hip Thrusts",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "SEdqd1n0cvg",
      "reason": "High-stability progressive overload"
    },
    {
      "name": "Glute Bridges (Dumbbell / Barbell)",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "SEdqd1n0cvg",
      "reason": "Floor hip extension squeeze"
    }
  ],
  "Glutes/Hams": [
    {
      "name": "Barbell Hip Thrusts",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–10",
      "restTimeSecs": 120,
      "videoId": "SEdqd1n0cvg",
      "reason": "Maximum gluteus maximus contraction at peak extension"
    },
    {
      "name": "Romanian Deadlifts (RDLs - Barbell)",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2SHsk9AzdjA",
      "reason": "Hamstring & glute eccentric hinge"
    },
    {
      "name": "Deficit Reverse Lunges",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "L8fvypPrzzs",
      "reason": "Deep glute stretch at bottom of stride"
    },
    {
      "name": "Glute Bridges (Dumbbell / Barbell)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "SEdqd1n0cvg",
      "reason": "Direct glute squeeze with minimal knee bend"
    },
    {
      "name": "Cable Glute Kickbacks",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "L8fvypPrzzs",
      "reason": "Isolated upper glute contraction"
    },
    {
      "name": "Cable Pull-Throughs",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2SHsk9AzdjA",
      "reason": "Continuous hinge resistance through lockout"
    }
  ],
  "Glutes/Abductors": [
    {
      "name": "Seated Machine Hip Abductions (Lean Forward)",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "0wz99W3lbAs",
      "reason": "Direct loaded stretch on gluteus medius & minimus"
    },
    {
      "name": "Cable Standing Hip Abductions",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "0wz99W3lbAs",
      "reason": "Continuous cable tension throughout abduction arc"
    },
    {
      "name": "Side-Lying Hip Abductions (Cable / Ankle Weight)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "0wz99W3lbAs",
      "reason": "Strict gluteus medius isolation without hip flexor takeover"
    },
    {
      "name": "Cable Kickbacks (45-Degree Angle)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "L8fvypPrzzs",
      "reason": "Loads upper glute shelf and gluteus medius"
    },
    {
      "name": "Deficit Curtsy Lunges",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "L8fvypPrzzs",
      "reason": "Deep dynamic glute medius stretch under load"
    },
    {
      "name": "Banded Clamshells",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "15–20",
      "restTimeSecs": 45,
      "videoId": "0wz99W3lbAs",
      "reason": "High-rep abductor and external rotator activation"
    },
    {
      "name": "Lateral Band Walks",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "15–20",
      "restTimeSecs": 45,
      "videoId": "0wz99W3lbAs",
      "reason": "Constant isometric abductor tension"
    },
    {
      "name": "Fire Hydrants (Weighted / Bodyweight)",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "15–20",
      "restTimeSecs": 45,
      "videoId": "0wz99W3lbAs",
      "reason": "Bodyweight glute abductor accessory"
    }
  ],
  "Glutes/Abductors (Outer glutes)": [
    {
      "name": "Seated Machine Hip Abductions (Lean Forward)",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "0wz99W3lbAs",
      "reason": "Direct loaded stretch on gluteus medius & minimus"
    },
    {
      "name": "Cable Standing Hip Abductions",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "0wz99W3lbAs",
      "reason": "Continuous cable tension throughout abduction arc"
    },
    {
      "name": "Side-Lying Hip Abductions (Cable / Ankle Weight)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "0wz99W3lbAs",
      "reason": "Strict gluteus medius isolation without hip flexor takeover"
    },
    {
      "name": "Cable Kickbacks (45-Degree Angle)",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "L8fvypPrzzs",
      "reason": "Loads upper glute shelf and gluteus medius"
    },
    {
      "name": "Deficit Curtsy Lunges",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "L8fvypPrzzs",
      "reason": "Deep dynamic glute medius stretch under load"
    },
    {
      "name": "Banded Clamshells",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "15–20",
      "restTimeSecs": 45,
      "videoId": "0wz99W3lbAs",
      "reason": "High-rep abductor and external rotator activation"
    },
    {
      "name": "Lateral Band Walks",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "15–20",
      "restTimeSecs": 45,
      "videoId": "0wz99W3lbAs",
      "reason": "Constant isometric abductor tension"
    },
    {
      "name": "Fire Hydrants (Weighted / Bodyweight)",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "15–20",
      "restTimeSecs": 45,
      "videoId": "0wz99W3lbAs",
      "reason": "Bodyweight glute abductor accessory"
    }
  ],
  "Calves": [
    {
      "name": "Standing Machine Calf Raises",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "SVtg-1loH4c",
      "reason": "Loads gastrocnemius with extended knees"
    },
    {
      "name": "Seated Calf Raises",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "6O5hh1rBtx8",
      "reason": "Bent knees isolate the deep soleus muscle"
    },
    {
      "name": "Leg Press Calf Raises",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "SVtg-1loH4c",
      "reason": "Heavy safe overload without spinal load"
    },
    {
      "name": "Smith Machine Calf Raises (on Block)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "SVtg-1loH4c",
      "reason": "Deep deficit heel stretch"
    },
    {
      "name": "Single-Leg Dumbbell Calf Raises",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "SVtg-1loH4c",
      "reason": "Corrects bilateral calf strength imbalances"
    },
    {
      "name": "Donkey Calf Raises",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "SVtg-1loH4c",
      "reason": "Hinged hip angle deeply stretches calves"
    }
  ],
  "Gastrocnemius": [
    {
      "name": "Standing Machine Calf Raises",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "SVtg-1loH4c",
      "reason": "Straight-leg calf mass builder"
    },
    {
      "name": "Leg Press Calf Raises",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "SVtg-1loH4c",
      "reason": "Heavy controlled gastrocnemius stretch"
    },
    {
      "name": "Smith Machine Calf Raises",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "SVtg-1loH4c",
      "reason": "Controlled deficit extension"
    },
    {
      "name": "Single-Leg Standing Calf Raises",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "SVtg-1loH4c",
      "reason": "Unilateral focus and balance"
    },
    {
      "name": "Donkey Calf Raises",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "SVtg-1loH4c",
      "reason": "Lengthened gastrocnemius stretch"
    }
  ],
  "Soleus": [
    {
      "name": "Seated Calf Raises",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "6O5hh1rBtx8",
      "reason": "Gold standard bent-knee soleus builder"
    },
    {
      "name": "Seated Dumbbell Calf Raises (on Block)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "6O5hh1rBtx8",
      "reason": "Free weight soleus isolation"
    },
    {
      "name": "Squat Hold Calf Raises",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "6O5hh1rBtx8",
      "reason": "Isometric knee flexion soleus burn"
    },
    {
      "name": "Bent-Knee Single Leg Calf Raises",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "6O5hh1rBtx8",
      "reason": "Unilateral soleus focus"
    },
    {
      "name": "Machine Soleus Raises",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "6O5hh1rBtx8",
      "reason": "Fixed soleus resistance path"
    }
  ],
  "Upper Abs": [
    {
      "name": "Kneeling Cable Crunches",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "mnRhbUB3Fjs",
      "reason": "Progressive overload for spinal flexion"
    },
    {
      "name": "Machine Ab Crunches",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "mnRhbUB3Fjs",
      "reason": "Direct resistance track for upper rectus abdominis"
    },
    {
      "name": "Decline Bench Weighted Crunches",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "mnRhbUB3Fjs",
      "reason": "Extended range of motion crunch"
    },
    {
      "name": "Ab Wheel Rollouts",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "mnRhbUB3Fjs",
      "reason": "Anti-extension core strength"
    },
    {
      "name": "Swiss Ball Crunches",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "mnRhbUB3Fjs",
      "reason": "Deep stretch over rounded ball surface"
    }
  ],
  "Lower Abs": [
    {
      "name": "Hanging Knee Raises",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "2n4UqRIJyk4",
      "reason": "Posterior pelvic tilt activates lower abs"
    },
    {
      "name": "Hanging Straight Leg Raises",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "2n4UqRIJyk4",
      "reason": "High-intensity lower core & hip flexor builder"
    },
    {
      "name": "Captain’s Chair Leg Raises",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "2n4UqRIJyk4",
      "reason": "Stable back support for strict lower ab curls"
    },
    {
      "name": "Reverse Crunches (Incline Bench)",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2n4UqRIJyk4",
      "reason": "Curling pelvis up without hip flexor takeover"
    },
    {
      "name": "Lying Leg Raises (with Hip Lift)",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "2n4UqRIJyk4",
      "reason": "Bodyweight lower ab control"
    }
  ],
  "Abs": [
    {
      "name": "Kneeling Cable Crunches",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "mnRhbUB3Fjs",
      "reason": "Upper ab spinal flexion with load"
    },
    {
      "name": "Hanging Knee Raises",
      "tier": "S Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "2n4UqRIJyk4",
      "reason": "Lower ab pelvic curl"
    },
    {
      "name": "Ab Wheel Rollouts",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "mnRhbUB3Fjs",
      "reason": "Anti-extension deep core strength"
    },
    {
      "name": "Machine Ab Crunches",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "mnRhbUB3Fjs",
      "reason": "Targeted progressive abdominal load"
    },
    {
      "name": "Pallof Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "5aZ0IhJS8O8",
      "reason": "Anti-rotation stability"
    },
    {
      "name": "Cable Woodchoppers",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "gcGNypjIQDo",
      "reason": "Oblique & rotational power"
    }
  ],
  "Obliques": [
    {
      "name": "Cable Woodchoppers",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "gcGNypjIQDo",
      "reason": "Dynamic rotational power under cable tension"
    },
    {
      "name": "Hanging Oblique Knee Raises",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "2n4UqRIJyk4",
      "reason": "Rotational lower core crunch"
    },
    {
      "name": "Pallof Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "5aZ0IhJS8O8",
      "reason": "Isomeric anti-rotation core brace"
    },
    {
      "name": "Russian Twists (Weighted)",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "2n4UqRIJyk4",
      "reason": "Rotational core endurance"
    },
    {
      "name": "Side Planks with Hip Dips",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "mnRhbUB3Fjs",
      "reason": "Lateral core & quadratus lumborum stability"
    }
  ],
  "Transverse Abs": [
    {
      "name": "Pallof Press",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "5aZ0IhJS8O8",
      "reason": "Deep transverse abdominal bracing against rotation"
    },
    {
      "name": "Ab Wheel Rollouts",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "mnRhbUB3Fjs",
      "reason": "Full anterior chain stabilization"
    },
    {
      "name": "Stomach Vacuums",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "5aZ0IhJS8O8",
      "reason": "Direct transverse abdominis waist control"
    },
    {
      "name": "Plank with Shoulder Taps",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "mnRhbUB3Fjs",
      "reason": "Dynamic anti-rotational core hold"
    }
  ],
  "Forearm Flexors": [
    {
      "name": "Standing Behind Back Wrist Curls",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "yz2eCSWoY4E",
      "reason": "Deep inner forearm pump without wrist pain"
    },
    {
      "name": "Machine Wrist Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "eL777V8a-6E",
      "reason": "Smooth track for wrist flexor burnout"
    },
    {
      "name": "Seated Barbell Wrist Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "eL777V8a-6E",
      "reason": "Direct forearm flexor hypertrophy"
    },
    {
      "name": "Dumbbell Wrist Curls on Bench",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "yz2eCSWoY4E",
      "reason": "Unilateral forearm control"
    },
    {
      "name": "Farmer Walks (Heavy DBs)",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "Fkzk_RqlYig",
      "reason": "Isometric crush grip & forearm thickness"
    },
    {
      "name": "Dead Hangs (Towel Grip)",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "Fkzk_RqlYig",
      "reason": "Grip endurance and forearm recruitment"
    }
  ],
  "Forearm Extensors": [
    {
      "name": "Machine Reverse Wrist Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "sKXqNO2KQp8",
      "reason": "Direct top-of-forearm extensor isolation"
    },
    {
      "name": "Standing Reverse Barbell Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "jjnJHhzZUUM",
      "reason": "Heavy brachioradialis and extensor builder"
    },
    {
      "name": "Dumbbell Reverse Wrist Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "sKXqNO2KQp8",
      "reason": "Extensor strength and wrist stability"
    },
    {
      "name": "Cable Reverse Grip Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "jjnJHhzZUUM",
      "reason": "Continuous tension on top forearm muscles"
    },
    {
      "name": "Plate Pinches",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "yz2eCSWoY4E",
      "reason": "Pinch grip and extensor endurance"
    }
  ],
  "Forearms": [
    {
      "name": "Standing Behind Back Wrist Curls",
      "tier": "A+ Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "yz2eCSWoY4E",
      "reason": "Inner forearm flexor mass"
    },
    {
      "name": "Reverse Barbell Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "10–12",
      "restTimeSecs": 75,
      "videoId": "jjnJHhzZUUM",
      "reason": "Brachioradialis & top forearm thickness"
    },
    {
      "name": "Machine Wrist Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "eL777V8a-6E",
      "reason": "Isolated flexor loading"
    },
    {
      "name": "Machine Reverse Wrist Curls",
      "tier": "A Tier",
      "targetSets": 3,
      "targetReps": "12–15",
      "restTimeSecs": 60,
      "videoId": "sKXqNO2KQp8",
      "reason": "Forearm extensor development"
    },
    {
      "name": "Farmer Walks",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "Fkzk_RqlYig",
      "reason": "Heavy isometric crush grip"
    },
    {
      "name": "Plate Pinches",
      "tier": "B Tier",
      "targetSets": 3,
      "targetReps": "8–12",
      "restTimeSecs": 90,
      "videoId": "yz2eCSWoY4E",
      "reason": "Thumb and pinch grip strength"
    }
  ]
};


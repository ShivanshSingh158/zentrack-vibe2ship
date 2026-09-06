export interface ExerciseDBEntry {
  id: string;
  name: string;
  aliases: string[];
  muscle: string;
  tier?: 'S Tier' | 'A+ Tier' | 'A Tier' | 'B Tier' | 'C Tier';
}

export const EXERCISE_DATABASE: ExerciseDBEntry[] = [
  {
    "id": "upper_chest_incline_dumbbell_press",
    "name": "Incline Dumbbell Press",
    "muscle": "Upper Chest",
    "tier": "S Tier",
    "aliases": [
      "Incline Dumbbell Bench Press",
      "Incline DB Press",
      "Incline Dumbbell Chest Press",
      "DB Incline Press",
      "Dumbbell Incline Bench Press",
      "Incline DB Bench Press"
    ]
  },
  {
    "id": "upper_chest_incline_barbell_bench_press",
    "name": "Incline Barbell Bench Press",
    "muscle": "Upper Chest",
    "tier": "A+ Tier",
    "aliases": [
      "Incline Barbell Press",
      "Incline Bench Press",
      "Barbell Incline Bench Press",
      "Incline Chest Press",
      "Incline Barbell"
    ]
  },
  {
    "id": "upper_chest_incline_machine_press",
    "name": "Incline Machine Press",
    "muscle": "Upper Chest",
    "tier": "A+ Tier",
    "aliases": [
      "Hammer Strength Incline Press",
      "Smith Machine Incline Press",
      "Machine Incline Chest Press",
      "Converging Incline Machine Press",
      "Incline Chest Machine Press"
    ]
  },
  {
    "id": "upper_chest_low_to_high_cable_fly",
    "name": "Low To High Cable Fly",
    "muscle": "Upper Chest",
    "tier": "S Tier",
    "aliases": [
      "Low-to-High Cable Fly",
      "Low to High Cable Flyes",
      "Low Cable Crossover",
      "Incline Cable Fly",
      "Incline Cable Flyes",
      "Low-to-High Cable Crossovers"
    ]
  },
  {
    "id": "upper_chest_incline_dumbbell_fly",
    "name": "Incline Dumbbell Fly",
    "muscle": "Upper Chest",
    "tier": "A Tier",
    "aliases": [
      "Incline Dumbbell Flyes",
      "Incline DB Fly",
      "Incline DB Flyes"
    ]
  },
  {
    "id": "upper_chest_landmine_chest_press",
    "name": "Landmine Chest Press",
    "muscle": "Upper Chest",
    "tier": "B Tier",
    "aliases": [
      "Single Arm Landmine Press",
      "Landmine Incline Press"
    ]
  },
  {
    "id": "mid_chest_flat_barbell_bench_press",
    "name": "Flat Barbell Bench Press",
    "muscle": "Mid Chest",
    "tier": "A+ Tier",
    "aliases": [
      "Barbell Bench Press",
      "Flat Barbell Press",
      "Bench Press",
      "Flat Bench Press",
      "Smith Machine Bench Press"
    ]
  },
  {
    "id": "mid_chest_barbell_floor_press",
    "name": "Barbell Floor Press",
    "muscle": "Mid Chest",
    "tier": "B Tier",
    "aliases": [
      "Floor Press",
      "BB Floor Press",
      "Dumbbell Floor Press",
      "DB Floor Press"
    ]
  },
  {
    "id": "mid_chest_flat_dumbbell_press",
    "name": "Flat Dumbbell Press",
    "muscle": "Mid Chest",
    "tier": "S Tier",
    "aliases": [
      "Flat Dumbbell Bench Press",
      "Dumbbell Bench Press",
      "Dumbbell Press",
      "Flat DB Press",
      "DB Bench Press"
    ]
  },
  {
    "id": "mid_chest_pec_deck_fly",
    "name": "Pec Deck Fly",
    "muscle": "Mid Chest",
    "tier": "A+ Tier",
    "aliases": [
      "Pec Deck",
      "Pec Deck Flyes",
      "Machine Chest Fly",
      "Butterfly Machine Fly",
      "Butterfly Machine",
      "Pec Fly",
      "Machine Pec Deck Fly",
      "Seated Machine Fly",
      "Pec Deck Machine",
      "Machine Fly"
    ]
  },
  {
    "id": "mid_chest_cable_crossovers",
    "name": "Cable Crossovers",
    "muscle": "Mid Chest",
    "tier": "A Tier",
    "aliases": [
      "Cable Crossover",
      "Middle Cable Chest Fly",
      "Standing Cable Chest Fly",
      "Standing Cable Fly",
      "Cable Chest Fly",
      "Middle Cable Fly"
    ]
  },
  {
    "id": "mid_chest_flat_dumbbell_fly",
    "name": "Flat Dumbbell Fly",
    "muscle": "Mid Chest",
    "tier": "C Tier",
    "aliases": [
      "Flat Dumbbell Flyes",
      "Dumbbell Chest Fly",
      "DB Flyes"
    ]
  },
  {
    "id": "mid_chest_pushups",
    "name": "Push Ups",
    "muscle": "Mid Chest",
    "tier": "A Tier",
    "aliases": [
      "Pushups",
      "Bodyweight Push Ups",
      "Incline Push Ups",
      "Decline Push Ups",
      "Weighted Push Ups",
      "Diamond Pushups",
      "Push-ups"
    ]
  },
  {
    "id": "mid_chest_seated_machine_chest_press",
    "name": "Seated Machine Chest Press",
    "muscle": "Mid Chest",
    "tier": "A Tier",
    "aliases": [
      "Machine Chest Press",
      "Chest Press Machine",
      "Hammer Strength Flat Press"
    ]
  },
  {
    "id": "lower_chest_high_to_low_cable_crossovers",
    "name": "High-to-Low Cable Crossovers",
    "muscle": "Lower Chest",
    "tier": "A+ Tier",
    "aliases": [
      "High-to-Low Cable Crossover",
      "High to Low Cable Fly",
      "High to Low Cable Flyes",
      "Decline Cable Fly",
      "Decline Cable Crossover",
      "High To Low Cable Fly"
    ]
  },
  {
    "id": "lower_chest_chest_dips",
    "name": "Chest Dips",
    "muscle": "Lower Chest",
    "tier": "S Tier",
    "aliases": [
      "Dips",
      "Parallel Bar Dips",
      "Assisted Chest Dips",
      "Weighted Chest Dips",
      "Bodyweight Dips",
      "Weighted Dips",
      "Dip"
    ]
  },
  {
    "id": "lower_chest_decline_barbell_bench_press",
    "name": "Decline Barbell Bench Press",
    "muscle": "Lower Chest",
    "tier": "A+ Tier",
    "aliases": [
      "Decline Barbell Press",
      "Decline Bench Press",
      "Barbell Decline Bench Press"
    ]
  },
  {
    "id": "lower_chest_decline_dumbbell_press",
    "name": "Decline Dumbbell Press",
    "muscle": "Lower Chest",
    "tier": "A Tier",
    "aliases": [
      "Decline Dumbbell Bench Press",
      "Decline DB Press",
      "DB Decline Press"
    ]
  },
  {
    "id": "lower_chest_decline_dumbbell_flyes",
    "name": "Decline Dumbbell Flyes",
    "muscle": "Lower Chest",
    "tier": "B Tier",
    "aliases": [
      "Decline DB Fly",
      "Decline Dumbbell Fly",
      "Decline DB Flyes"
    ]
  },
  {
    "id": "front_delts_standing_overhead_barbell_press",
    "name": "Standing Overhead Barbell Press",
    "muscle": "Front Delts",
    "tier": "S Tier",
    "aliases": [
      "Military Press",
      "Barbell Military Press",
      "Overhead Press",
      "OHP",
      "Standing Barbell Military Press",
      "Standing Military Press",
      "Barbell Overhead Press"
    ]
  },
  {
    "id": "front_delts_seated_dumbbell_shoulder_press",
    "name": "Seated Dumbbell Shoulder Press",
    "muscle": "Front Delts",
    "tier": "S Tier",
    "aliases": [
      "Dumbbell Shoulder Press",
      "Seated DB Shoulder Press",
      "Dumbbell Overhead Press",
      "Seated Dumbbell Overhead Press",
      "DB Shoulder Press"
    ]
  },
  {
    "id": "front_delts_machine_overhead_press",
    "name": "Machine Overhead Press",
    "muscle": "Front Delts",
    "tier": "A+ Tier",
    "aliases": [
      "Machine Shoulder Press",
      "Hammer Strength Shoulder Press",
      "Smith Machine Shoulder Press",
      "Seated Machine Shoulder Press",
      "Shoulder Press Machine"
    ]
  },
  {
    "id": "front_delts_arnold_press",
    "name": "Arnold Press",
    "muscle": "Front Delts",
    "tier": "A Tier",
    "aliases": [
      "Dumbbell Arnold Press",
      "Seated Arnold Press",
      "Arnold Dumbbell Press"
    ]
  },
  {
    "id": "front_delts_dumbbell_front_raise",
    "name": "Dumbbell Front Raise",
    "muscle": "Front Delts",
    "tier": "B Tier",
    "aliases": [
      "Front Raises",
      "Front Raise",
      "Barbell Front Raise",
      "Cable Front Raise",
      "Plate Front Raise"
    ]
  },
  {
    "id": "side_delts_dumbbell_lateral_raises",
    "name": "Dumbbell Lateral Raises",
    "muscle": "Side Delts",
    "tier": "S Tier",
    "aliases": [
      "Dumbbell Lateral Raise",
      "Lateral Raise",
      "Lateral Raises",
      "Side Lateral Raise",
      "Side Lateral Raises",
      "Side Raises",
      "Incline Dumbbell Lateral Raise",
      "Leaning Lateral Raise",
      "DB Lateral Raise"
    ]
  },
  {
    "id": "side_delts_cable_lateral_raises",
    "name": "Cable Lateral Raises",
    "muscle": "Side Delts",
    "tier": "S Tier",
    "aliases": [
      "Cable Lateral Raise",
      "Single-Arm Cable Lateral Raise",
      "Behind-the-Back Cable Lateral Raise",
      "Egyptian Cable Lateral Raise",
      "Dual Cable Lateral Raise",
      "Behind The Back Cable Lateral Raise",
      "Single Arm Cable Lateral Raise"
    ]
  },
  {
    "id": "side_delts_machine_lateral_raise",
    "name": "Machine Lateral Raise",
    "muscle": "Side Delts",
    "tier": "A+ Tier",
    "aliases": [
      "Seated Machine Lateral Raise",
      "Side Delt Machine",
      "Lateral Raise Machine"
    ]
  },
  {
    "id": "side_delts_upright_rows",
    "name": "Upright Rows",
    "muscle": "Side Delts",
    "tier": "B Tier",
    "aliases": [
      "Barbell Upright Row",
      "Cable Upright Row",
      "Dumbbell Upright Row",
      "Upright Row"
    ]
  },
  {
    "id": "rear_delts_reverse_pec_deck",
    "name": "Reverse Pec Deck",
    "muscle": "Rear Delts",
    "tier": "S Tier",
    "aliases": [
      "Reverse Pec Deck Fly",
      "Rear Delt Fly Machine",
      "Machine Rear Delt Fly",
      "Reverse Fly Machine",
      "Reverse Pec Deck (Rear Delts)",
      "Rear Delt Machine"
    ]
  },
  {
    "id": "rear_delts_face_pulls",
    "name": "Face Pulls",
    "muscle": "Rear Delts",
    "tier": "S Tier",
    "aliases": [
      "Face Pull",
      "Rope Face Pulls",
      "Cable Face Pulls",
      "Cable Face Pull",
      "Seated Face Pulls"
    ]
  },
  {
    "id": "rear_delts_rear_delt_dumbbell_flyes",
    "name": "Rear Delt Dumbbell Flyes",
    "muscle": "Rear Delts",
    "tier": "A Tier",
    "aliases": [
      "Rear Delt Dumbbell Fly",
      "Bent-Over Dumbbell Lateral Raise",
      "Bent Over Rear Delt Fly",
      "Seated Rear Delt Dumbbell Fly",
      "Rear Delt Fly"
    ]
  },
  {
    "id": "rear_delts_rear_delt_cable_flyes",
    "name": "Rear Delt Cable Flyes",
    "muscle": "Rear Delts",
    "tier": "A+ Tier",
    "aliases": [
      "Rear Delt Cable Fly",
      "Cable Rear Delt Fly",
      "Cross Cable Rear Delt Fly",
      "Cable Reverse Fly"
    ]
  },
  {
    "id": "traps_cable_shrugs",
    "name": "Cable Shrugs",
    "muscle": "Upper Traps",
    "tier": "A+ Tier",
    "aliases": [
      "Cable Shrug",
      "Dual Cable Shrugs"
    ]
  },
  {
    "id": "traps_barbell_shrugs",
    "name": "Barbell Shrugs",
    "muscle": "Upper Traps",
    "tier": "A Tier",
    "aliases": [
      "Barbell Shrug",
      "Smith Machine Shrugs",
      "Behind the Back Shrugs",
      "Shrugs"
    ]
  },
  {
    "id": "traps_dumbbell_shrugs",
    "name": "Dumbbell Shrugs",
    "muscle": "Upper Traps",
    "tier": "A Tier",
    "aliases": [
      "Dumbbell Shrug",
      "DB Shrugs",
      "Seated Dumbbell Shrugs"
    ]
  },
  {
    "id": "lat_width_lat_pulldowns_standard",
    "name": "Lat Pulldowns (Standard)",
    "muscle": "Lat Width",
    "tier": "S Tier",
    "aliases": [
      "Lat Pulldown",
      "Wide Grip Lat Pulldown",
      "Wide-Grip Lat Pulldown",
      "Cable Lat Pulldown",
      "Lat Pulldowns",
      "Machine Lat Pulldown",
      "Lat Pull Down",
      "Wide-grip Lat Pulldown"
    ]
  },
  {
    "id": "lat_width_neutral_grip_lat_pulldowns",
    "name": "Neutral-Grip Lat Pulldowns",
    "muscle": "Lat Width",
    "tier": "S Tier",
    "aliases": [
      "Close-Grip Lat Pulldown",
      "V-Bar Lat Pulldown",
      "Mag-Grip Lat Pulldown",
      "Parallel Grip Lat Pulldown",
      "Neutral Grip Lat Pulldown",
      "Close Grip Lat Pulldown",
      "V-bar Lat Pulldown"
    ]
  },
  {
    "id": "lat_width_pull_ups_chin_ups",
    "name": "Pull-Ups / Chin-Ups",
    "muscle": "Lat Width",
    "tier": "S Tier",
    "aliases": [
      "Pull-Ups",
      "Pull Ups",
      "Pullups",
      "Chin-Ups",
      "Chin Ups",
      "Chinups",
      "Assisted Pull-Ups / Chin-Ups",
      "Weighted Pull-Ups",
      "Weighted Chin-Ups",
      "Assisted Pull-Ups",
      "Pull Up",
      "Chin Up",
      "Assisted Pull Ups",
      "Chin-up",
      "Pull-up",
      "Weighted Chin Ups",
      "Weighted Pull Ups"
    ]
  },
  {
    "id": "lat_width_single_arm_cable_rows_low_pull",
    "name": "Single-Arm Cable Rows (low pull)",
    "muscle": "Lat Width",
    "tier": "S Tier",
    "aliases": [
      "Single-Arm Cable Row",
      "Single Arm Lat Cable Row",
      "Half-Kneeling Cable Row",
      "Low Cable Lat Row",
      "Single Arm Cable Row"
    ]
  },
  {
    "id": "lat_width_straight_arm_cable_pulldown",
    "name": "Straight-Arm Cable Pulldown",
    "muscle": "Lat Width",
    "tier": "A Tier",
    "aliases": [
      "Straight Arm Pulldown",
      "Cable Pullover",
      "Dumbbell Pullover",
      "Rope Straight Arm Pulldown",
      "Lat Prayer",
      "Straight-Arm Lat Pulldown",
      "Straight Arm Lat Pulldown"
    ]
  },
  {
    "id": "lat_width_single_arm_dumbbell_row",
    "name": "Single-Arm Dumbbell Row",
    "muscle": "Lat Width",
    "tier": "A+ Tier",
    "aliases": [
      "Dumbbell Row",
      "One-Arm Dumbbell Row",
      "Single Arm DB Row",
      "Kroc Row",
      "DB Row"
    ]
  },
  {
    "id": "mid_back_chest_supported_t_bar_row",
    "name": "Chest-Supported T-Bar Row",
    "muscle": "Mid-Back",
    "tier": "S Tier",
    "aliases": [
      "T-Bar Row",
      "Chest Supported T-Bar Row",
      "Machine T-Bar Row",
      "Chest-Supported Row",
      "Chest Supported Machine Row",
      "T Bar Row",
      "T-bar Row",
      "Tbar Row"
    ]
  },
  {
    "id": "mid_back_barbell_bent_over_row",
    "name": "Barbell Bent-Over Row",
    "muscle": "Mid-Back",
    "tier": "S Tier",
    "aliases": [
      "Barbell Row",
      "Bent Over Barbell Row",
      "Pendlay Row",
      "Underhand Barbell Row",
      "Yates Row",
      "Bent-Over Row"
    ]
  },
  {
    "id": "mid_back_seated_cable_rows",
    "name": "Seated Cable Rows",
    "muscle": "Mid-Back",
    "tier": "S Tier",
    "aliases": [
      "Seated Cable Row",
      "Cable Row",
      "Low Cable Row",
      "Seated Cable Rows V-Bar",
      "Close-Grip Cable Row",
      "Wide-Grip Cable Row",
      "Seated Row"
    ]
  },
  {
    "id": "mid_back_reverse_pec_deck_back_focus",
    "name": "Reverse Pec Deck (Back Focus)",
    "muscle": "Mid-Back",
    "tier": "A+ Tier",
    "aliases": [
      "Rear Delt Machine (Mid Back)",
      "Reverse Fly (Upper Back)"
    ]
  },
  {
    "id": "mid_back_conventional_barbell_deadlift",
    "name": "Conventional Barbell Deadlift",
    "muscle": "Mid-Back",
    "tier": "S Tier",
    "aliases": [
      "Deadlift",
      "Barbell Deadlift",
      "Deadlifts",
      "Sumo Deadlift",
      "Trap Bar Deadlift",
      "Rack Pulls",
      "Rack Pull"
    ]
  },
  {
    "id": "short_bicep_standing_ez_bar_curls",
    "name": "Standing EZ-Bar Curls",
    "muscle": "Short Bicep",
    "tier": "S Tier",
    "aliases": [
      "EZ-Bar Curl",
      "EZ Bar Bicep Curl",
      "Barbell Curl",
      "Standing Barbell Curl",
      "EZ Bar Curl",
      "Barbell Bicep Curl",
      "Ez-bar Curl"
    ]
  },
  {
    "id": "short_bicep_alternating_dumbbell_curls_w_supination",
    "name": "Alternating Dumbbell Curls w/ Supination",
    "muscle": "Short Bicep",
    "tier": "S Tier",
    "aliases": [
      "Dumbbell Bicep Curl",
      "Dumbbell Curls",
      "Standing Dumbbell Curl",
      "Seated Dumbbell Curl",
      "Bicep Curls",
      "Dumbbell Curl"
    ]
  },
  {
    "id": "long_bicep_incline_dumbbell_curls",
    "name": "Incline Dumbbell Curls",
    "muscle": "Long Bicep",
    "tier": "S Tier",
    "aliases": [
      "Incline Dumbbell Curl",
      "Incline DB Curl",
      "Incline Bicep Curl",
      "Incline Curl"
    ]
  },
  {
    "id": "short_bicep_preacher_curl",
    "name": "Preacher Curl",
    "muscle": "Short Bicep",
    "tier": "A+ Tier",
    "aliases": [
      "EZ-Bar Preacher Curl",
      "Machine Preacher Curl",
      "Dumbbell Preacher Curl",
      "Preacher Curls",
      "Scott Curl",
      "One-Arm Preacher Curl",
      "Ez-bar Preacher Curl"
    ]
  },
  {
    "id": "long_bicep_face_away_cable_curls",
    "name": "Face-Away Cable Curls",
    "muscle": "Long Bicep",
    "tier": "S Tier",
    "aliases": [
      "Bayesian Cable Curl",
      "Cable Bicep Curl",
      "Behind-the-Back Cable Curl",
      "Cable Curl",
      "Dual Cable Curls",
      "Face Away Cable Curl"
    ]
  },
  {
    "id": "brachialis_dumbbell_hammer_curls",
    "name": "Dumbbell Hammer Curls",
    "muscle": "Brachialis",
    "tier": "S Tier",
    "aliases": [
      "Hammer Curls",
      "Hammer Curl",
      "Dumbbell Hammer Curl",
      "Cross-Body Hammer Curl",
      "Rope Hammer Curl",
      "Cable Hammer Curls",
      "DB Hammer Curl",
      "Cross Body Hammer Curl"
    ]
  },
  {
    "id": "short_bicep_spider_curls",
    "name": "Spider Curls",
    "muscle": "Short Bicep",
    "tier": "A Tier",
    "aliases": [
      "Spider Curl",
      "Dumbbell Spider Curl",
      "Barbell Spider Curl"
    ]
  },
  {
    "id": "short_bicep_concentration_curls",
    "name": "Concentration Curls",
    "muscle": "Short Bicep",
    "tier": "A Tier",
    "aliases": [
      "Concentration Curl",
      "Dumbbell Concentration Curl"
    ]
  },
  {
    "id": "brachioradialis_reverse_cable_curls",
    "name": "Reverse Cable Curls",
    "muscle": "Brachioradialis",
    "tier": "A Tier",
    "aliases": [
      "Reverse Barbell Curl",
      "Reverse EZ-Bar Curl",
      "Reverse Curl",
      "Reverse Curls",
      "Reverse Ez Bar Curl"
    ]
  },
  {
    "id": "forearm_flexors_standing_behind_back_wrist_curls",
    "name": "Standing Behind Back Wrist Curls",
    "muscle": "Forearm Flexors",
    "tier": "A Tier",
    "aliases": [
      "Barbell Wrist Curls Behind Back",
      "Behind-the-Back Wrist Curl",
      "Behind Back Wrist Curl"
    ]
  },
  {
    "id": "forearm_flexors_machine_wrist_curls",
    "name": "Machine Wrist Curls",
    "muscle": "Forearm Flexors",
    "tier": "A Tier",
    "aliases": [
      "Dumbbell Wrist Curls",
      "Seated Wrist Curl",
      "Wrist Curls",
      "Forearm Curls",
      "Wrist Curl"
    ]
  },
  {
    "id": "forearm_extensors_machine_reverse_wrist_curls",
    "name": "Machine Reverse Wrist Curls",
    "muscle": "Forearm Extensors",
    "tier": "A Tier",
    "aliases": [
      "Reverse Wrist Curls",
      "Dumbbell Reverse Wrist Curl",
      "Reverse Wrist Curl",
      "Reverse Forearm Curl"
    ]
  },
  {
    "id": "lat_med_tricep_dual_rope_tricep_pushdowns",
    "name": "Dual-Rope Tricep Pushdowns",
    "muscle": "Lat/Med Tricep",
    "tier": "S Tier",
    "aliases": [
      "Rope Tricep Pushdowns",
      "Rope Tricep Pushdown",
      "Tricep Rope Pushdown",
      "Cable Tricep Pushdown",
      "Tricep Pushdowns",
      "Triceps Pushdown",
      "Tricep Pushdown"
    ]
  },
  {
    "id": "lat_med_tricep_straight_bar_tricep_pushdown",
    "name": "Straight-Bar Tricep Pushdown",
    "muscle": "Lat/Med Tricep",
    "tier": "A+ Tier",
    "aliases": [
      "V-Bar Tricep Pushdown",
      "Bar Tricep Pushdown",
      "Cable Bar Pushdown"
    ]
  },
  {
    "id": "long_tricep_ez_bar_skullcrushers",
    "name": "EZ-Bar Skullcrushers",
    "muscle": "Long Tricep",
    "tier": "S Tier",
    "aliases": [
      "Skull Crushers",
      "Skullcrushers",
      "Lying Tricep Extension",
      "EZ-Bar Lying Triceps Extension",
      "Dumbbell Skull Crushers",
      "Incline Skull Crushers",
      "Decline Skull Crushers",
      "Skull Crusher"
    ]
  },
  {
    "id": "long_tricep_overhead_cable_extensions",
    "name": "Overhead Cable Extensions",
    "muscle": "Long Tricep",
    "tier": "S Tier",
    "aliases": [
      "Overhead Cable Tricep Extension",
      "Rope Overhead Tricep Extension",
      "Cable Overhead Extension",
      "French Press",
      "Overhead Tricep Extension"
    ]
  },
  {
    "id": "long_tricep_katana_cable_extensions",
    "name": "Katana Cable Extensions",
    "muscle": "Long Tricep",
    "tier": "S Tier",
    "aliases": [
      "Cross-Body Overhead Cable Extension",
      "Katana Tricep Extension",
      "Dual Arm Katana Extension"
    ]
  },
  {
    "id": "lat_med_tricep_cable_cross_body_tricep_extensions",
    "name": "Cable Cross-Body Tricep Extensions",
    "muscle": "Lat/Med Tricep",
    "tier": "S Tier",
    "aliases": [
      "Cross-Body Cable Pushdown",
      "Single-Arm Cable Tricep Extension",
      "Cable Cross Body Extension"
    ]
  },
  {
    "id": "lat_med_tricep_close_grip_barbell_bench_press",
    "name": "Close-Grip Barbell Bench Press",
    "muscle": "Lat/Med Tricep",
    "tier": "A+ Tier",
    "aliases": [
      "Close Grip Bench Press",
      "Close-Grip Bench",
      "CG Bench Press",
      "JM Press",
      "Jm Press"
    ]
  },
  {
    "id": "long_tricep_dumbbell_overhead_triceps_extension",
    "name": "Dumbbell Overhead Triceps Extension",
    "muscle": "Long Tricep",
    "tier": "A Tier",
    "aliases": [
      "Seated Dumbbell Overhead Extension",
      "Single-Arm Dumbbell Overhead Extension",
      "Dumbbell French Press",
      "DB Overhead Extension",
      "Overhead Dumbbell Triceps Extension"
    ]
  },
  {
    "id": "quads_barbell_back_squat",
    "name": "Barbell Back Squat",
    "muscle": "Quads",
    "tier": "S Tier",
    "aliases": [
      "Barbell Squat",
      "Back Squat",
      "Squats",
      "Squat",
      "Barbell Back Squats",
      "Pause Squat",
      "Front Squat",
      "Barbell Front Squat"
    ]
  },
  {
    "id": "quads_hack_squats",
    "name": "Hack Squats",
    "muscle": "Quads",
    "tier": "S Tier",
    "aliases": [
      "Hack Squat",
      "Machine Hack Squat",
      "Reverse Hack Squat"
    ]
  },
  {
    "id": "quads_45_degree_leg_press",
    "name": "45-Degree Leg Press",
    "muscle": "Quads",
    "tier": "S Tier",
    "aliases": [
      "Leg Press",
      "Incline Leg Press",
      "Machine Leg Press",
      "Horizontal Leg Press"
    ]
  },
  {
    "id": "quads_leg_extensions",
    "name": "Leg Extensions",
    "muscle": "Quads",
    "tier": "S Tier",
    "aliases": [
      "Leg Extension",
      "Machine Leg Extension",
      "Seated Leg Extension",
      "Single-Leg Extension",
      "Single Leg Extension"
    ]
  },
  {
    "id": "quads_bulgarian_split_squats",
    "name": "Bulgarian Split Squats",
    "muscle": "Quads/Glutes",
    "tier": "S Tier",
    "aliases": [
      "Bulgarian Split Squat",
      "Dumbbell Split Squat",
      "Rear Foot Elevated Split Squat",
      "BSS"
    ]
  },
  {
    "id": "quad_teardrop_heel_elevated_goblet_squats",
    "name": "Heel-Elevated Goblet Squats",
    "muscle": "Quad Teardrop",
    "tier": "A+ Tier",
    "aliases": [
      "Goblet Squat",
      "Heel Elevated Squat",
      "Cyclist Squat",
      "Sissy Squat",
      "Goblet Squats"
    ]
  },
  {
    "id": "glutes_quads_dumbbell_walking_reverse_lunges",
    "name": "Dumbbell Reverse Lunges",
    "muscle": "Glutes/Quads",
    "tier": "A+ Tier",
    "aliases": [
      "Walking Lunges",
      "Dumbbell Walking / Reverse Lunges",
      "Lunges",
      "Barbell Lunges",
      "Reverse Lunges"
    ]
  },
  {
    "id": "hamstrings_romanian_deadlifts_rdls",
    "name": "Romanian Deadlifts (RDLs)",
    "muscle": "Hamstrings",
    "tier": "S Tier",
    "aliases": [
      "Romanian Deadlift",
      "RDL",
      "RDLs",
      "Barbell RDL",
      "Dumbbell RDL",
      "Dumbbell Romanian Deadlift",
      "Stiff-Leg Deadlift",
      "Stiff Legged Deadlift",
      "Romanian Deadlift (RDL)",
      "Romanian Deadlifts (RDL - Barbell)",
      "Barbell Rdl",
      "Dumbbell Rdl",
      "Rdl",
      "Stiff Leg Deadlift"
    ]
  },
  {
    "id": "hamstrings_seated_leg_curls",
    "name": "Seated Leg Curls",
    "muscle": "Hamstrings",
    "tier": "S Tier",
    "aliases": [
      "Seated Leg Curl",
      "Machine Leg Curl",
      "Hamstring Curl",
      "Leg Curls (Seated)",
      "Leg Curls"
    ]
  },
  {
    "id": "hamstrings_lying_leg_curls",
    "name": "Lying Leg Curls",
    "muscle": "Hamstrings",
    "tier": "S Tier",
    "aliases": [
      "Lying Leg Curl",
      "Prone Leg Curl",
      "Lying Hamstring Curl",
      "Single-Leg Lying Curl"
    ]
  },
  {
    "id": "glutes_barbell_hip_thrust",
    "name": "Barbell Hip Thrust",
    "muscle": "Glutes",
    "tier": "S Tier",
    "aliases": [
      "Hip Thrust",
      "Barbell Glute Bridge",
      "Kas Glute Bridge",
      "Machine Hip Thrust",
      "Dumbbell Hip Thrust"
    ]
  },
  {
    "id": "glutes_abductors_seated_machine_abductions",
    "name": "Seated Machine Abductions",
    "muscle": "Glutes/Abductors",
    "tier": "A+ Tier",
    "aliases": [
      "Hip Abduction Machine",
      "Seated Hip Abduction",
      "Cable Hip Abduction",
      "Glute Abduction",
      "Machine Abductions"
    ]
  },
  {
    "id": "gastrocnemius_standing_machine_calf_raises",
    "name": "Standing Machine Calf Raises",
    "muscle": "Gastrocnemius",
    "tier": "S Tier",
    "aliases": [
      "Standing Calf Raises",
      "Standing Calf Raise",
      "Machine Calf Raise",
      "Smith Machine Calf Raise",
      "Calf Raises"
    ]
  },
  {
    "id": "gastrocnemius_donkey_calf_raise",
    "name": "Donkey Calf Raise",
    "muscle": "Gastrocnemius",
    "tier": "B Tier",
    "aliases": [
      "Donkey Calf Raises",
      "Machine Donkey Calf Raise"
    ]
  },
  {
    "id": "soleus_seated_calf_raises",
    "name": "Seated Calf Raises",
    "muscle": "Soleus",
    "tier": "A+ Tier",
    "aliases": [
      "Seated Calf Raise",
      "Machine Seated Calf Raise",
      "Dumbbell Seated Calf Raise"
    ]
  },
  {
    "id": "upper_abs_kneeling_cable_crunches",
    "name": "Kneeling Cable Crunches",
    "muscle": "Upper Abs",
    "tier": "S Tier",
    "aliases": [
      "Cable Crunch",
      "Cable Crunches",
      "Rope Cable Crunch",
      "Kneeling Cable Crunch"
    ]
  },
  {
    "id": "lower_abs_hanging_knee_raises",
    "name": "Hanging Knee Raises",
    "muscle": "Lower Abs",
    "tier": "S Tier",
    "aliases": [
      "Hanging Knee / Leg Raises",
      "Hanging Leg Raise",
      "Hanging Leg Raises",
      "Captain's Chair Leg Raise",
      "Roman Chair Leg Raise",
      "Hanging Knee Raise"
    ]
  },
  {
    "id": "upper_abs_seated_ab_crunch_machine",
    "name": "Seated Ab Crunch Machine",
    "muscle": "Upper Abs",
    "tier": "A Tier",
    "aliases": [
      "Machine Crunch",
      "Ab Machine",
      "Ab Crunch Machine",
      "Abdominal Crunch Machine"
    ]
  },
  {
    "id": "lower_abs_reverse_crunches",
    "name": "Reverse Crunches",
    "muscle": "Lower Abs",
    "tier": "A Tier",
    "aliases": [
      "Reverse Crunch",
      "Decline Reverse Crunch"
    ]
  },
  {
    "id": "lower_abs_lying_leg_raise",
    "name": "Lying Leg Raise",
    "muscle": "Lower Abs",
    "tier": "B Tier",
    "aliases": [
      "Lying Leg Raises",
      "Floor Leg Raise",
      "Straight Leg Raise"
    ]
  },
  {
    "id": "obliques_cable_woodchoppers",
    "name": "Cable Woodchoppers",
    "muscle": "Obliques",
    "tier": "A Tier",
    "aliases": [
      "Woodchoppers",
      "Cable Woodchopper",
      "High to Low Woodchoppers",
      "Low to High Woodchoppers"
    ]
  },
  {
    "id": "transverse_abs_ab_wheel_rollout",
    "name": "Ab Wheel Rollout",
    "muscle": "Transverse Abs (Deep core)",
    "tier": "A+ Tier",
    "aliases": [
      "Ab Wheel Rollouts",
      "Ab Rollout",
      "Ab Roller",
      "Wheel Rollout",
      "Ab Wheel",
      "Abs Wheel Roller"
    ]
  },
  {
    "id": "transverse_abs_pallof_press",
    "name": "Pallof Press",
    "muscle": "Transverse Abs",
    "tier": "A+ Tier",
    "aliases": [
      "Cable Pallof Press",
      "Band Pallof Press",
      "Pallof Press Hold",
      "Kneeling Pallof Press"
    ]
  },
  {
    "id": "mid_chest_plate_press",
    "name": "Plate Press",
    "muscle": "Mid Chest",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lower_chest_hammer_strength_decline_press",
    "name": "Hammer Strength Decline Press",
    "muscle": "Lower Chest",
    "tier": "A+ Tier",
    "aliases": []
  },
  {
    "id": "lower_chest_high_to_low_woodchoppers",
    "name": "High To Low Woodchoppers",
    "muscle": "Obliques",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lower_chest_smith_machine_decline_press",
    "name": "Smith Machine Decline Press",
    "muscle": "Lower Chest",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "serratus___pec_minor_barbell_pullover",
    "name": "Barbell Pullover",
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "serratus___pec_minor_machine_pullover",
    "name": "Machine Pullover",
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "serratus___pec_minor_svend_press",
    "name": "Svend Press",
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_width__lats__assisted_chin_ups",
    "name": "Assisted Chin Ups",
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_width__lats__kneeling_cable_lat_pulldown",
    "name": "Kneeling Cable Lat Pulldown",
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_width__lats__reverse_grip_lat_pulldown",
    "name": "Reverse Grip Lat Pulldown",
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_width__lats__single_arm_lat_pulldown",
    "name": "Single Arm Lat Pulldown",
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_width__lats__underhand_lat_pulldown",
    "name": "Underhand Lat Pulldown",
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_width__lats__wide_grip_pull_ups",
    "name": "Wide Grip Pull Ups",
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "mid_back_chest_supported_dumbbell_row",
    "name": "Chest Supported Dumbbell Row",
    "muscle": "Mid-Back",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "mid_back_chest_supported_t_bar",
    "name": "Chest-supported T-bar",
    "muscle": "Mid-Back",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "mid_back_hammer_strength_row",
    "name": "Hammer Strength Row",
    "muscle": "Mid-Back",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "mid_back_incline_dumbbell_row",
    "name": "Incline Dumbbell Row",
    "muscle": "Upper Chest",
    "tier": "A Tier",
    "aliases": []
  },
  {
    "id": "mid_back_landmine_t_bar_row",
    "name": "Landmine T-bar Row",
    "muscle": "Mid-Back",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "mid_back_machine_seated_row",
    "name": "Machine Seated Row",
    "muscle": "Mid-Back",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "mid_back_meadows_row",
    "name": "Meadows Row",
    "muscle": "Mid-Back",
    "tier": "A Tier",
    "aliases": []
  },
  {
    "id": "mid_back_seal_row",
    "name": "Seal Row",
    "muscle": "Mid-Back",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "mid_back_two_arm_dumbbell_row",
    "name": "Two Arm Dumbbell Row",
    "muscle": "Mid-Back",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "mid_back_v_bar_seated_row",
    "name": "V-bar Seated Row",
    "muscle": "Mid-Back",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "mid_back_wide_grip_seated_row",
    "name": "Wide Grip Seated Row",
    "muscle": "Mid-Back",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "front_delts_dumbbell_press_shoulder",
    "name": "Dumbbell Press Shoulder",
    "muscle": "Front Delts",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "front_delts_landmine_shoulder_press",
    "name": "Landmine Shoulder Press",
    "muscle": "Front Delts",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "front_delts_push_press",
    "name": "Push Press",
    "muscle": "Front Delts",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "front_delts_seated_barbell_shoulder_press",
    "name": "Seated Barbell Shoulder Press",
    "muscle": "Front Delts",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "front_delts_seated_machine_press",
    "name": "Seated Machine Press",
    "muscle": "Front Delts",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "front_delts_standing_barbell_overhead_press",
    "name": "Standing Barbell Overhead Press",
    "muscle": "Front Delts",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "side_delts_lean_away_cable_lateral_raise",
    "name": "Lean-away Cable Lateral Raise",
    "muscle": "Side Delts",
    "tier": "S Tier",
    "aliases": []
  },
  {
    "id": "side_delts_seated_dumbbell_lateral_raise",
    "name": "Seated Dumbbell Lateral Raise",
    "muscle": "Side Delts",
    "tier": "A Tier",
    "aliases": []
  },
  {
    "id": "side_delts_wide_grip_upright_row",
    "name": "Wide Grip Upright Row",
    "muscle": "Side Delts",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "rear_delts_high_cable_rear_delt_row",
    "name": "High Cable Rear Delt Row",
    "muscle": "Rear Delts",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "rear_delts_incline_rear_delt_dumbbell_fly",
    "name": "Incline Rear Delt Dumbbell Fly",
    "muscle": "Rear Delts",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "rear_delts_rear_delt_machine_fly",
    "name": "Rear Delt Machine Fly",
    "muscle": "Rear Delts",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "rear_delts_reverse_machine_fly",
    "name": "Reverse Machine Fly",
    "muscle": "Rear Delts",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "rear_delts_seated_rear_delt_fly",
    "name": "Seated Rear Delt Fly",
    "muscle": "Rear Delts",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "long_tricep__long_head__barbell_skull_crushers",
    "name": "Barbell Skull Crushers",
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier",
    "aliases": []
  },
  {
    "id": "long_tricep__long_head__cable_french_press",
    "name": "Cable French Press",
    "muscle": "Long Tricep (Long Head)",
    "tier": "A Tier",
    "aliases": []
  },
  {
    "id": "long_tricep__long_head__seated_dumbbell_overhead_tricep_extension",
    "name": "Seated Dumbbell Overhead Tricep Extension",
    "muscle": "Long Tricep (Long Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "long_tricep__long_head__single_arm_overhead_cable_extension",
    "name": "Single Arm Overhead Cable Extension",
    "muscle": "Long Tricep (Long Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__assisted_tricep_dips",
    "name": "Assisted Tricep Dips",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__bench_dips",
    "name": "Bench Dips",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "glutes_cable_glute_kickbacks",
    "name": "Cable Glute Kickbacks",
    "muscle": "Glutes",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__cable_kickback",
    "name": "Cable Kickback",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__cable_lat_pushdown",
    "name": "Cable Lat Pushdown",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__cable_tricep_kickbacks",
    "name": "Cable Tricep Kickbacks",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__close_grip_press",
    "name": "Close Grip Press",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__dumbbell_tricep_kickbacks",
    "name": "Dumbbell Tricep Kickbacks",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": [
      "Tricep Kickbacks",
      "Dumbbell Kickbacks",
      "Tricep Kickback",
      "Kickbacks",
      "Dumbbell Tricep Kickback"
    ]
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__reverse_grip_tricep_pushdown",
    "name": "Reverse Grip Tricep Pushdown",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__rope_lat_pushdown",
    "name": "Rope Lat Pushdown",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__rope_pushdowns",
    "name": "Rope Pushdowns",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__single_arm_tricep_pushdown",
    "name": "Single Arm Tricep Pushdown",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__tate_press",
    "name": "Tate Press",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__tricep_dips",
    "name": "Tricep Dips",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__v_bar_cable_pushdowns",
    "name": "V-bar Cable Pushdowns",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__v_bar_pushdown",
    "name": "V-bar Pushdown",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__weighted_tricep_dips",
    "name": "Weighted Tricep Dips",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "short_bicep__inner_head__dumbbell_concentration_curls",
    "name": "Dumbbell Concentration Curls",
    "muscle": "Short Bicep (Inner head)",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "short_bicep__inner_head__machine_preacher_curls",
    "name": "Machine Preacher Curls",
    "muscle": "Short Bicep (Inner head)",
    "tier": "S Tier",
    "aliases": []
  },
  {
    "id": "short_bicep__inner_head__rope_cable_curl",
    "name": "Rope Cable Curl",
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "short_bicep__inner_head__single_arm_preacher_curl",
    "name": "Single Arm Preacher Curl",
    "muscle": "Short Bicep (Inner head)",
    "tier": "S Tier",
    "aliases": []
  },
  {
    "id": "short_bicep__inner_head__standing_barbell_curls",
    "name": "Standing Barbell Curls",
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "short_bicep__inner_head__standing_cable_curls",
    "name": "Standing Cable Curls",
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "long_bicep__outer_peak__alternating_dumbbell_curls",
    "name": "Alternating Dumbbell Curls",
    "muscle": "Short Bicep (Inner head)",
    "tier": "A Tier",
    "aliases": []
  },
  {
    "id": "long_bicep__outer_peak__bayesian_curls",
    "name": "Bayesian Curls",
    "muscle": "Long Bicep (Outer peak)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "long_bicep__outer_peak__drag_curls",
    "name": "Drag Curls",
    "muscle": "Long Bicep (Outer peak)",
    "tier": "A Tier",
    "aliases": []
  },
  {
    "id": "long_bicep__outer_peak__dumbbell_bicep_curls",
    "name": "Dumbbell Bicep Curls",
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "long_bicep__outer_peak__incline_bicep_curls",
    "name": "Incline Bicep Curls",
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "long_bicep__outer_peak__seated_dumbbell_curls",
    "name": "Seated Dumbbell Curls",
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "brachialis_cable_hammer_curl",
    "name": "Cable Hammer Curl",
    "muscle": "Brachialis",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "quad_teardrop__vmo__pendulum_squat",
    "name": "Pendulum Squat",
    "muscle": "Quads",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "quad_teardrop__vmo__seated_leg_extensions",
    "name": "Seated Leg Extensions",
    "muscle": "Quads",
    "tier": "A Tier",
    "aliases": []
  },
  {
    "id": "quads_glutes__compound_leg_focus__barbell_reverse_lunge",
    "name": "Barbell Reverse Lunge",
    "muscle": "Quads",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "quads_glutes__compound_leg_focus__dumbbell_goblet_squat",
    "name": "Dumbbell Goblet Squat",
    "muscle": "Quads",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "quads_glutes__compound_leg_focus__dumbbell_step_ups",
    "name": "Dumbbell Step Ups",
    "muscle": "Quads",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "quads_glutes__compound_leg_focus__dumbbell_walking_lunges",
    "name": "Dumbbell Walking Lunges",
    "muscle": "Quads",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "quads_glutes__compound_leg_focus__forward_lunges",
    "name": "Forward Lunges",
    "muscle": "Quads",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "quads_glutes__compound_leg_focus__kettlebell_goblet_squat",
    "name": "Kettlebell Goblet Squat",
    "muscle": "Quads",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "quads_glutes__compound_leg_focus__reverse_lunge",
    "name": "Reverse Lunge",
    "muscle": "Quads",
    "tier": "B Tier",
    "aliases": [
      "reverse lunges"
    ]
  },
  {
    "id": "quads_glutes__compound_leg_focus__single_leg_press",
    "name": "Single Leg Press",
    "muscle": "Quads",
    "tier": "A+ Tier",
    "aliases": []
  },
  {
    "id": "quads_glutes__compound_leg_focus__smith_machine_squat",
    "name": "Smith Machine Squat",
    "muscle": "Quads",
    "tier": "C Tier",
    "aliases": [
      "smith machine squats"
    ]
  },
  {
    "id": "quads_glutes__compound_leg_focus__spanish_squat",
    "name": "Spanish Squat",
    "muscle": "Quads",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "quads_glutes__compound_leg_focus__split_squat",
    "name": "Split Squat",
    "muscle": "Quads",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "quads_glutes__compound_leg_focus__step_ups",
    "name": "Step Ups",
    "muscle": "Quads",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "quads_glutes__compound_leg_focus__walking_lunge",
    "name": "Walking Lunge",
    "muscle": "Quads",
    "tier": "B Tier",
    "aliases": [
      "walking lunges"
    ]
  },
  {
    "id": "quads_glutes__compound_leg_focus__zercher_squat",
    "name": "Zercher Squat",
    "muscle": "Quads",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_45_degree_weighted_back_extensions",
    "name": "45-degree Weighted Back Extensions",
    "muscle": "Lower Back",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_american_kettlebell_swing",
    "name": "American Kettlebell Swing",
    "muscle": "Glutes/Hams",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_back_extensions",
    "name": "Back Extensions",
    "muscle": "Lower Back",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_barbell_good_morning",
    "name": "Barbell Good Morning",
    "muscle": "Hamstrings",
    "tier": "B Tier",
    "aliases": [
      "barbell good mornings"
    ]
  },
  {
    "id": "glutes_hams_deficit_deadlift",
    "name": "Deficit Deadlift",
    "muscle": "Lower Back",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_good_morning",
    "name": "Good Morning",
    "muscle": "Hamstrings",
    "tier": "B Tier",
    "aliases": [
      "good mornings"
    ]
  },
  {
    "id": "glutes_hams_hex_bar_deadlift",
    "name": "Hex Bar Deadlift",
    "muscle": "Lower Back",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_hyperextensions",
    "name": "Hyperextensions",
    "muscle": "Lower Back",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_kb_swing",
    "name": "Kb Swing",
    "muscle": "Glutes/Hams",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_kettlebell_deadlift",
    "name": "Kettlebell Deadlift",
    "muscle": "Lower Back",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_kettlebell_swing",
    "name": "Kettlebell Swing",
    "muscle": "Glutes/Hams",
    "tier": "B Tier",
    "aliases": [
      "kettlebell swings"
    ]
  },
  {
    "id": "glutes_hams_nordic_hamstring_curls",
    "name": "Nordic Hamstring Curls",
    "muscle": "Hamstrings",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_russian_kettlebell_swing",
    "name": "Russian Kettlebell Swing",
    "muscle": "Glutes/Hams",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_single_leg_rdl",
    "name": "Single Leg Rdl",
    "muscle": "Hamstrings",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_standard_barbell_deadlifts",
    "name": "Standard Barbell Deadlifts",
    "muscle": "Lower Back",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_standing_leg_curl",
    "name": "Standing Leg Curl",
    "muscle": "Hamstrings",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "glutes_hams_stiff_leg_barbell_deadlift",
    "name": "Stiff-leg Barbell Deadlift",
    "muscle": "Hamstrings",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "glutes_abductors__outer_glutes__barbell_hip_thrusts",
    "name": "Barbell Hip Thrusts",
    "muscle": "Glutes",
    "tier": "S Tier",
    "aliases": []
  },
  {
    "id": "glutes_abductors__outer_glutes__glute_bridge",
    "name": "Glute Bridge",
    "muscle": "Glutes",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "glutes_abductors__outer_glutes__hip_abductions",
    "name": "Hip Abductions",
    "muscle": "Glutes/Abductors (Outer glutes)",
    "tier": "S Tier",
    "aliases": []
  },
  {
    "id": "glutes_abductors__outer_glutes__machine_adductions",
    "name": "Machine Adductions",
    "muscle": "Glutes/Abductors (Outer glutes)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "glutes_abductors__outer_glutes__single_leg_hip_thrust",
    "name": "Single Leg Hip Thrust",
    "muscle": "Glutes",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "gastrocnemius__upper_calf__tibialis_raise",
    "name": "Tibialis Raise",
    "muscle": "Tibialis Anterior",
    "tier": "B Tier",
    "aliases": [
      "tibialis raises"
    ]
  },
  {
    "id": "soleus__lower_calf__barbell_calf_raise",
    "name": "Barbell Calf Raise",
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "soleus__lower_calf__dumbbell_calf_raise",
    "name": "Dumbbell Calf Raise",
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "soleus__lower_calf__seated_machine_calf_raise",
    "name": "Seated Machine Calf Raise",
    "muscle": "Soleus (Lower calf)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "soleus__lower_calf__single_leg_calf_raise",
    "name": "Single Leg Calf Raise",
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "soleus__lower_calf__standing_machine_calf_raise",
    "name": "Standing Machine Calf Raise",
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "S Tier",
    "aliases": [
      "standing machine calf raises"
    ]
  },
  {
    "id": "upper_abs_bicycle_crunch",
    "name": "Bicycle Crunch",
    "muscle": "Upper Abs",
    "tier": "C Tier",
    "aliases": [
      "Bicycle Crunches"
    ]
  },
  {
    "id": "upper_abs_cable_ab_crunches",
    "name": "Cable Ab Crunches",
    "muscle": "Upper Abs",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "upper_abs_machine_ab_crunch",
    "name": "Machine Ab Crunch",
    "muscle": "Upper Abs",
    "tier": "A+ Tier",
    "aliases": []
  },
  {
    "id": "upper_abs_machine_ab_crunches",
    "name": "Machine Ab Crunches",
    "muscle": "Upper Abs",
    "tier": "A+ Tier",
    "aliases": []
  },
  {
    "id": "lower_abs_captain_chair_leg_raise",
    "name": "Captain Chair Leg Raise",
    "muscle": "Lower Abs",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lower_abs_dragon_flags",
    "name": "Dragon Flags",
    "muscle": "Upper Abs",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "lower_abs_hanging_oblique_knee_raise",
    "name": "Hanging Oblique Knee Raise",
    "muscle": "Obliques",
    "tier": "A Tier",
    "aliases": [
      "hanging oblique knee raises"
    ]
  },
  {
    "id": "lower_abs_oblique_knee_raise",
    "name": "Oblique Knee Raise",
    "muscle": "Obliques",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "transverse_abs__deep_core__ab_roller",
    "name": "Ab Roller",
    "muscle": "Transverse Abs (Deep core)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "transverse_abs__deep_core__bodyweight_plank",
    "name": "Bodyweight Plank",
    "muscle": "Transverse Abs (Deep core)",
    "tier": "B Tier",
    "aliases": [
      "Plank",
      "Planks",
      "Front Plank",
      "Standard Plank"
    ]
  },
  {
    "id": "transverse_abs__deep_core__wrist_roller",
    "name": "Wrist Roller",
    "muscle": "Transverse Abs (Deep core)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "obliques_dumbbell_side_bend",
    "name": "Dumbbell Side Bend",
    "muscle": "Obliques",
    "tier": "C Tier",
    "aliases": [
      "dumbbell side bends"
    ]
  },
  {
    "id": "obliques_side_bend",
    "name": "Side Bend",
    "muscle": "Obliques",
    "tier": "C Tier",
    "aliases": [
      "side bends"
    ]
  },
  {
    "id": "obliques_weighted_russian_twist",
    "name": "Weighted Russian Twist",
    "muscle": "Obliques",
    "tier": "B Tier",
    "aliases": [
      "Russian Twists",
      "Russian Twist",
      "Weighted Russian Twists"
    ]
  },
  {
    "id": "obliques_woodchopper",
    "name": "Woodchopper",
    "muscle": "Obliques",
    "tier": "C Tier",
    "aliases": [
      "woodchoppers"
    ]
  },
  {
    "id": "forearm_flexors__inside__dumbbell_wrist_curl",
    "name": "Dumbbell Wrist Curl",
    "muscle": "Forearm Flexors (Inside)",
    "tier": "A Tier",
    "aliases": [
      "dumbbell wrist curls"
    ]
  },
  {
    "id": "forearm_flexors__inside__seated_dumbbell_wrist_curls",
    "name": "Seated Dumbbell Wrist Curls",
    "muscle": "Forearm Flexors (Inside)",
    "tier": "A Tier",
    "aliases": []
  },
  {
    "id": "forearm_extensors__outside__bar_hang",
    "name": "Bar Hang",
    "muscle": "Forearm Extensors (Outside)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "forearm_extensors__outside__dead_hang",
    "name": "Dead Hang",
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier",
    "aliases": [
      "dead hangs"
    ]
  },
  {
    "id": "forearm_extensors__outside__dumbbell_farmer_carry",
    "name": "Dumbbell Farmer Carry",
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "forearm_extensors__outside__farmer_carry",
    "name": "Farmer Carry",
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "forearm_extensors__outside__farmer_walk",
    "name": "Farmer Walk",
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier",
    "aliases": [
      "farmer walks",
      "farmers walk"
    ]
  },
  {
    "id": "forearm_extensors__outside__pinch_hold",
    "name": "Pinch Hold",
    "muscle": "Forearm Extensors (Outside)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "forearm_extensors__outside__plate_pinch",
    "name": "Plate Pinch",
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "forearm_extensors__outside__plate_pinches",
    "name": "Plate Pinches",
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier",
    "aliases": []
  },
  {
    "id": "brachioradialis__upper_forearm__reverse_dumbbell_curl",
    "name": "Reverse Dumbbell Curl",
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "brachioradialis__upper_forearm__zottman_curl",
    "name": "Zottman Curl",
    "muscle": "Brachialis",
    "tier": "B Tier",
    "aliases": [
      "zottman curls"
    ]
  },
  {
    "id": "uncategorized_hammer_strength_chest_press",
    "name": "Hammer Strength Chest Press",
    "muscle": "Mid Chest",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "uncategorized_standing_dumbbell_overhead_extension",
    "name": "Standing Dumbbell Overhead Extension",
    "muscle": "Uncategorized",
    "tier": "C Tier",
    "aliases": []
  },
  {
    "id": "transverse_abs_deep_core_stomach_vacuum",
    "name": "Stomach Vacuum",
    "muscle": "Transverse Abs (Deep core)",
    "tier": "B Tier",
    "aliases": [
      "vacuums",
      "stomach vacuums"
    ]
  },
  {
    "id": "transverse_abs_deep_core_bird_dog",
    "name": "Bird Dog",
    "muscle": "Transverse Abs (Deep core)",
    "tier": "C Tier",
    "aliases": [
      "bird dogs"
    ]
  },
  {
    "id": "transverse_abs_deep_core_dead_bug",
    "name": "Dead Bug",
    "muscle": "Transverse Abs (Deep core)",
    "tier": "C Tier",
    "aliases": [
      "dead bugs"
    ]
  },
  {
    "id": "transverse_abs_deep_core_hollow_body_hold",
    "name": "Hollow Body Hold",
    "muscle": "Transverse Abs (Deep core)",
    "tier": "C Tier",
    "aliases": [
      "hollow hold"
    ]
  },
  {
    "id": "upper_traps_farmers_walk",
    "name": "Farmer's Walk",
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier",
    "aliases": [
      "farmers carry",
      "farmer's carry"
    ]
  },
  {
    "id": "neck_flexors_neck_curl",
    "name": "Neck Curl",
    "muscle": "Upper Traps",
    "tier": "C Tier",
    "aliases": [
      "neck flexion",
      "weight plate neck curl"
    ]
  },
  {
    "id": "neck_extensors_neck_extension",
    "name": "Neck Extension",
    "muscle": "Upper Traps",
    "tier": "C Tier",
    "aliases": [
      "neck harness extension"
    ]
  },
  {
    "id": "hip_flexors_cable_hip_flexion",
    "name": "Cable Hip Flexion",
    "muscle": "Hip Flexors",
    "tier": "C Tier",
    "aliases": [
      "cable knee raise"
    ]
  },
  {
    "id": "serratus_anterior_scapular_pushup",
    "name": "Scapular Pushup",
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier",
    "aliases": [
      "scap pushups",
      "scap pushup"
    ]
  },
  {
    "id": "upper_chest_converging_incline_chest_press",
    "name": "Converging Incline Chest Press",
    "muscle": "Upper Chest",
    "tier": "S Tier",
    "aliases": [
      "plate loaded incline press"
    ]
  },
  {
    "id": "mid_chest_plate_loaded_chest_press",
    "name": "Plate-Loaded Chest Press",
    "muscle": "Mid Chest",
    "tier": "C Tier",
    "aliases": [
      "converging chest press"
    ]
  },
  {
    "id": "mid_chest_deficit_pushup",
    "name": "Deficit Pushup",
    "muscle": "Mid Chest",
    "tier": "C Tier",
    "aliases": [
      "deficit push-ups"
    ]
  },
  {
    "id": "lat_width_single_arm_iliac_lat_pulldown",
    "name": "Single Arm Iliac Lat Pulldown",
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier",
    "aliases": [
      "iliac lat pulldown"
    ]
  },
  {
    "id": "lat_width_lat_prayer_cable_pullover",
    "name": "Lat Prayer (Kneeling Cable Pullover)",
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier",
    "aliases": [
      "lat prayer",
      "cable lat pullover"
    ]
  },
  {
    "id": "mid_back_kelso_shrug",
    "name": "Kelso Shrug",
    "muscle": "Upper Traps",
    "tier": "C Tier",
    "aliases": [
      "scapular retraction row"
    ]
  },
  {
    "id": "mid_back_chest_supported_y_raise",
    "name": "Chest Supported Incline Y-Raise",
    "muscle": "Side Delts",
    "tier": "A Tier",
    "aliases": [
      "incline y raise",
      "lower trap y raise"
    ]
  },
  {
    "id": "side_delts_dual_cable_cross_body_lateral_raise",
    "name": "Dual Cable Cross-Body Lateral Raise",
    "muscle": "Side Delts",
    "tier": "C Tier",
    "aliases": [
      "cross body cable lateral raise"
    ]
  },
  {
    "id": "side_delts_lu_raise",
    "name": "Lu Raise",
    "muscle": "Side Delts",
    "tier": "A Tier",
    "aliases": [
      "olympic lateral raise"
    ]
  },
  {
    "id": "rear_delts_high_cable_rear_delt_fly",
    "name": "High Cable Rear Delt Fly",
    "muscle": "Rear Delts",
    "tier": "C Tier",
    "aliases": [
      "high cable rear delt crossover"
    ]
  },
  {
    "id": "brachialis_preacher_hammer_curl",
    "name": "Preacher Hammer Curl",
    "muscle": "Brachialis",
    "tier": "B Tier",
    "aliases": [
      "dumbbell preacher hammer curl"
    ]
  },
  {
    "id": "long_tricep_katana_extension",
    "name": "Katana Extension (Dual Cable Overhead)",
    "muscle": "Long Tricep (Long Head)",
    "tier": "C Tier",
    "aliases": [
      "katana cable extension"
    ]
  },
  {
    "id": "lat_med_tricep_cross_body_cable_tricep_extension",
    "name": "Cross-Body Cable Tricep Extension",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": [
      "cuffed cable tricep extension"
    ]
  },
  {
    "id": "quads_belt_squat",
    "name": "Belt Squat",
    "muscle": "Quads",
    "tier": "C Tier",
    "aliases": [
      "pit shark belt squat"
    ]
  },
  {
    "id": "quads_heel_elevated_goblet_squat",
    "name": "Heel-Elevated Goblet Squat",
    "muscle": "Quad Teardrop (VMO)",
    "tier": "S Tier",
    "aliases": [
      "atg goblet squat"
    ]
  },
  {
    "id": "hamstrings_nordic_hamstring_curl",
    "name": "Nordic Hamstring Curl",
    "muscle": "Hamstrings",
    "tier": "C Tier",
    "aliases": [
      "nordic curl",
      "natural glute ham raise"
    ]
  },
  {
    "id": "hamstrings_b_stance_romanian_deadlift",
    "name": "B-Stance Romanian Deadlift",
    "muscle": "Hamstrings",
    "tier": "B Tier",
    "aliases": [
      "b-stance rdl"
    ]
  },
  {
    "id": "abs_dragon_flag",
    "name": "Dragon Flag",
    "muscle": "Upper Abs",
    "tier": "C Tier",
    "aliases": [
      "bruce lee dragon flag"
    ]
  },
  {
    "id": "upper_chest_incline_hex_press",
    "name": "Incline Hex Press",
    "muscle": "Upper Chest",
    "tier": "C Tier",
    "aliases": [
      "dumbbell hex press",
      "incline squeeze press"
    ]
  },
  {
    "id": "upper_chest_reverse_grip_incline_barbell_press",
    "name": "Reverse-Grip Incline Barbell Press",
    "muscle": "Upper Chest",
    "tier": "A Tier",
    "aliases": [
      "reverse grip incline bench press"
    ]
  },
  {
    "id": "upper_chest_cable_upper_chest_scoops",
    "name": "Cable Upper Chest Scoops",
    "muscle": "Upper Chest",
    "tier": "C Tier",
    "aliases": [
      "low-to-high cable scoops",
      "cable chest scoops"
    ]
  },
  {
    "id": "upper_chest_smith_machine_guillotine_incline_press",
    "name": "Smith Machine Guillotine Incline Press",
    "muscle": "Upper Chest",
    "tier": "C Tier",
    "aliases": [
      "incline guillotine press"
    ]
  },
  {
    "id": "upper_chest_single_arm_incline_cable_press",
    "name": "Single-Arm Incline Cable Press",
    "muscle": "Upper Chest",
    "tier": "C Tier",
    "aliases": [
      "one arm incline cable press"
    ]
  },
  {
    "id": "mid_chest_spoto_press",
    "name": "Spoto Press",
    "muscle": "Mid Chest",
    "tier": "C Tier",
    "aliases": [
      "paused bench press",
      "spoto bench"
    ]
  },
  {
    "id": "mid_chest_floor_dumbbell_flyes",
    "name": "Floor Dumbbell Flyes",
    "muscle": "Mid Chest",
    "tier": "C Tier",
    "aliases": [
      "floor db fly",
      "dumbbell floor fly"
    ]
  },
  {
    "id": "mid_chest_cable_fly_constant_tension",
    "name": "Cable Fly with Constant Tension",
    "muscle": "Mid Chest",
    "tier": "C Tier",
    "aliases": [
      "standing cable chest fly"
    ]
  },
  {
    "id": "mid_chest_resistance_band_pushups",
    "name": "Resistance Band Pushups",
    "muscle": "Mid Chest",
    "tier": "C Tier",
    "aliases": [
      "banded pushups",
      "banded push ups"
    ]
  },
  {
    "id": "mid_chest_isometric_squeeze_machine_fly",
    "name": "Isometric Squeeze Machine Fly",
    "muscle": "Mid Chest",
    "tier": "C Tier",
    "aliases": [
      "paused machine chest fly"
    ]
  },
  {
    "id": "lower_chest_gironda_dips",
    "name": "Gironda Dips (Flared Elbows)",
    "muscle": "Lower Chest",
    "tier": "C Tier",
    "aliases": [
      "vince gironda dips",
      "pec dips"
    ]
  },
  {
    "id": "lower_chest_decline_standing_cable_crossover",
    "name": "Decline Standing Cable Crossover",
    "muscle": "Lower Chest",
    "tier": "A Tier",
    "aliases": [
      "high to low standing cable fly"
    ]
  },
  {
    "id": "serratus_incline_dumbbell_pullover",
    "name": "Incline Dumbbell Pullover",
    "muscle": "Serratus / Pec Minor",
    "tier": "A Tier",
    "aliases": [
      "incline db pullover"
    ]
  },
  {
    "id": "serratus_cable_serratus_punch",
    "name": "Cable Serratus Punch",
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier",
    "aliases": [
      "cable punch",
      "serratus push"
    ]
  },
  {
    "id": "lower_chest_decline_hammer_strength_press",
    "name": "Decline Hammer Strength Press",
    "muscle": "Lower Chest",
    "tier": "A+ Tier",
    "aliases": [
      "hammer strength decline chest press"
    ]
  },
  {
    "id": "lat_width_half_kneeling_single_arm_lat_pulldown",
    "name": "Half-Kneeling Single-Arm Lat Pulldown",
    "muscle": "Lat Width (Lats)",
    "tier": "B Tier",
    "aliases": [
      "kneeling single arm pulldown",
      "one arm kneeling pulldown"
    ]
  },
  {
    "id": "lat_width_meadows_single_arm_lat_pulldown",
    "name": "Meadows Single-Arm Lat Pulldown",
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier",
    "aliases": [
      "meadows lat pulldown"
    ]
  },
  {
    "id": "lat_width_dual_rope_straight_arm_lat_pushdown",
    "name": "Dual-Rope Straight-Arm Lat Pushdown",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "A Tier",
    "aliases": [
      "double rope lat pushdown",
      "long rope pullover"
    ]
  },
  {
    "id": "lat_width_cross_body_cable_lat_extension",
    "name": "Cross-Body Cable Lat Extension",
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier",
    "aliases": [
      "cross body lat pullover"
    ]
  },
  {
    "id": "lat_width_neutral_underhand_close_grip_pulldown",
    "name": "Neutral Underhand Close-Grip Pulldown",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": [
      "close grip reverse pulldown"
    ]
  },
  {
    "id": "mid_back_seal_row_bench_elevated",
    "name": "Seal Row (Bench Elevated)",
    "muscle": "Mid-Back",
    "tier": "C Tier",
    "aliases": [
      "bench seal row",
      "elevated prone row"
    ]
  },
  {
    "id": "mid_back_chest_supported_incline_row_45_deg",
    "name": "Chest-Supported Incline Row (45° Elbows)",
    "muscle": "Upper Chest",
    "tier": "C Tier",
    "aliases": [
      "incline db row 45 degrees",
      "flared incline row"
    ]
  },
  {
    "id": "mid_back_fat_gripz_barbell_bent_over_row",
    "name": "Fat Gripz Barbell Bent-Over Row",
    "muscle": "Mid-Back",
    "tier": "A+ Tier",
    "aliases": [
      "thick bar bent over row"
    ]
  },
  {
    "id": "mid_back_wide_grip_seated_cable_row_to_sternum",
    "name": "Wide-Grip Seated Cable Row to Sternum",
    "muscle": "Mid-Back",
    "tier": "A+ Tier",
    "aliases": [
      "wide cable row",
      "scapular retraction cable row"
    ]
  },
  {
    "id": "mid_back_landmine_single_arm_meadows_row",
    "name": "Landmine Single-Arm Meadows Row",
    "muscle": "Mid-Back",
    "tier": "A Tier",
    "aliases": [
      "landmine meadows row",
      "one arm landmine row"
    ]
  },
  {
    "id": "mid_back_batwing_row",
    "name": "Batwing Row (Paused on Bench)",
    "muscle": "Mid-Back",
    "tier": "C Tier",
    "aliases": [
      "batwing db row",
      "paused prone row"
    ]
  },
  {
    "id": "mid_back_incline_prone_dumbbell_shrug",
    "name": "Incline Prone Dumbbell Shrug",
    "muscle": "Upper Traps",
    "tier": "A Tier",
    "aliases": [
      "prone incline shrug",
      "lower trap shrug"
    ]
  },
  {
    "id": "upper_traps_behind_the_back_smith_machine_shrug",
    "name": "Behind-the-Back Smith Machine Shrug",
    "muscle": "Upper Traps",
    "tier": "C Tier",
    "aliases": [
      "smith machine rear shrug",
      "lee haney shrug"
    ]
  },
  {
    "id": "upper_traps_trap_bar_farmers_carry",
    "name": "Trap Bar Farmer's Carry",
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier",
    "aliases": [
      "trap bar carry",
      "farmer walk with trap bar"
    ]
  },
  {
    "id": "upper_traps_cable_rope_face_pull_overhead_reach",
    "name": "Cable Rope Face Pull with Overhead Reach",
    "muscle": "Rear Delts",
    "tier": "A+ Tier",
    "aliases": [
      "face pull overhead press",
      "face pull y press"
    ]
  },
  {
    "id": "lower_back_jefferson_curl",
    "name": "Jefferson Curl",
    "muscle": "Lower Back",
    "tier": "C Tier",
    "aliases": [
      "jefferson curls",
      "spinal flexion deadlift"
    ]
  },
  {
    "id": "lower_back_snatch_grip_romanian_deadlift",
    "name": "Snatch-Grip Romanian Deadlift",
    "muscle": "Hamstrings",
    "tier": "B Tier",
    "aliases": [
      "snatch grip rdl"
    ]
  },
  {
    "id": "lower_back_45_degree_barbell_hyperextension",
    "name": "45-Degree Barbell Hyperextension",
    "muscle": "Lower Back",
    "tier": "C Tier",
    "aliases": [
      "weighted back extension",
      "barbell back extension"
    ]
  },
  {
    "id": "lower_back_zercher_good_morning",
    "name": "Zercher Good Morning",
    "muscle": "Hamstrings",
    "tier": "B Tier",
    "aliases": [
      "zercher good mornings"
    ]
  },
  {
    "id": "side_delts_dumbbell_lateral_raise_3s_eccentric",
    "name": "Dumbbell Lateral Raise (3s Eccentric)",
    "muscle": "Side Delts",
    "tier": "A Tier",
    "aliases": [
      "slow eccentric lateral raise",
      "tempo db lateral raise"
    ]
  },
  {
    "id": "side_delts_kneeling_cable_lateral_raise",
    "name": "Kneeling Cable Lateral Raise",
    "muscle": "Side Delts",
    "tier": "S Tier",
    "aliases": [
      "half kneeling lateral raise"
    ]
  },
  {
    "id": "side_delts_bottoms_up_kettlebell_lateral_raise",
    "name": "Bottoms-Up Kettlebell Lateral Raise",
    "muscle": "Side Delts",
    "tier": "B Tier",
    "aliases": [
      "kettlebell lateral raise"
    ]
  },
  {
    "id": "side_delts_seated_chest_supported_lateral_raise",
    "name": "Seated Chest-Supported Lateral Raise",
    "muscle": "Side Delts",
    "tier": "C Tier",
    "aliases": [
      "chest supported lateral raise",
      "strict seated lateral raise"
    ]
  },
  {
    "id": "rear_delts_prone_incline_rear_delt_w_raise",
    "name": "Prone Incline Rear Delt W-Raise",
    "muscle": "Rear Delts",
    "tier": "C Tier",
    "aliases": [
      "incline w raise",
      "rear delt w raise"
    ]
  },
  {
    "id": "rear_delts_cross_cable_rear_delt_fly_no_handles",
    "name": "Cross-Cable Rear Delt Fly (No Handles)",
    "muscle": "Rear Delts",
    "tier": "C Tier",
    "aliases": [
      "cable rear delt crossover",
      "cuff rear delt fly"
    ]
  },
  {
    "id": "rear_delts_single_arm_cable_rear_delt_pull",
    "name": "Single-Arm Cable Rear Delt Pull",
    "muscle": "Rear Delts",
    "tier": "B Tier",
    "aliases": [
      "one arm rear delt cable fly"
    ]
  },
  {
    "id": "rear_delts_skiier_rear_delt_swings",
    "name": "Skiier Rear Delt Swings",
    "muscle": "Rear Delts",
    "tier": "C Tier",
    "aliases": [
      "rear delt swings",
      "meadows rear delt swings"
    ]
  },
  {
    "id": "rear_delts_incline_bench_rear_delt_row",
    "name": "Incline Bench Rear Delt Row",
    "muscle": "Rear Delts",
    "tier": "C Tier",
    "aliases": [
      "incline flared db row"
    ]
  },
  {
    "id": "front_delts_z_press",
    "name": "Z-Press (Seated on Floor)",
    "muscle": "Front Delts",
    "tier": "C Tier",
    "aliases": [
      "seated z press",
      "floor overhead press"
    ]
  },
  {
    "id": "front_delts_half_kneeling_landmine_shoulder_press",
    "name": "Half-Kneeling Landmine Shoulder Press",
    "muscle": "Front Delts",
    "tier": "B Tier",
    "aliases": [
      "half kneeling landmine press"
    ]
  },
  {
    "id": "front_delts_dumbbell_front_raise_with_pronation",
    "name": "Dumbbell Front Raise with Pronation",
    "muscle": "Front Delts",
    "tier": "B Tier",
    "aliases": [
      "thumbs down front raise",
      "pronated db front raise"
    ]
  },
  {
    "id": "shoulders_kettlebell_halos",
    "name": "Kettlebell Halos",
    "muscle": "Shoulders",
    "tier": "B Tier",
    "aliases": [
      "kb halos",
      "shoulder halo"
    ]
  },
  {
    "id": "shoulders_cable_external_shoulder_rotation",
    "name": "Cable External Shoulder Rotation",
    "muscle": "Shoulders",
    "tier": "C Tier",
    "aliases": [
      "rotator cuff external rotation"
    ]
  },
  {
    "id": "shoulders_cuban_press",
    "name": "Cuban Press",
    "muscle": "Shoulders",
    "tier": "C Tier",
    "aliases": [
      "cuban rotation press"
    ]
  },
  {
    "id": "long_bicep_incline_dumbbell_curl_with_supination",
    "name": "Incline Dumbbell Curl with Supination",
    "muscle": "Long Bicep (Outer peak)",
    "tier": "S Tier",
    "aliases": [
      "incline supinating db curl"
    ]
  },
  {
    "id": "brachialis_cable_rope_hammer_curl",
    "name": "Cable Rope Hammer Curl",
    "muscle": "Brachialis",
    "tier": "A Tier",
    "aliases": [
      "rope hammer curl"
    ]
  },
  {
    "id": "short_bicep_ez_bar_21s",
    "name": "EZ-Bar 21s (7-7-7)",
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier",
    "aliases": [
      "21s bicep curl",
      "bicep 21s"
    ]
  },
  {
    "id": "short_bicep_hercules_cable_curl",
    "name": "Hercules Cable Curl (High Pulley)",
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier",
    "aliases": [
      "high cable curl",
      "overhead bicep cable curl"
    ]
  },
  {
    "id": "short_bicep_fat_gripz_dumbbell_preacher_curl",
    "name": "Fat Gripz Dumbbell Preacher Curl",
    "muscle": "Short Bicep (Inner head)",
    "tier": "S Tier",
    "aliases": [
      "thick bar preacher curl"
    ]
  },
  {
    "id": "brachialis_cross_body_pinwheel_curl",
    "name": "Cross-Body Pinwheel Curl",
    "muscle": "Brachialis",
    "tier": "C Tier",
    "aliases": [
      "pinwheel curl",
      "cross body db hammer curl"
    ]
  },
  {
    "id": "lat_med_tricep_dual_rope_tricep_pushdown",
    "name": "Dual-Rope Tricep Pushdown",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "S Tier",
    "aliases": [
      "double rope pushdown",
      "long rope pushdowns"
    ]
  },
  {
    "id": "long_tricep_floor_ez_bar_skull_crusher_dead_stop",
    "name": "Floor EZ-Bar Skull Crusher (Dead-Stop)",
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier",
    "aliases": [
      "dead stop skull crusher",
      "floor skull crushers"
    ]
  },
  {
    "id": "lat_med_tricep_single_arm_reverse_grip_pushdown",
    "name": "Single-Arm Reverse Grip Pushdown",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": [
      "one arm underhand tricep pushdown"
    ]
  },
  {
    "id": "long_tricep_two_handed_overhead_db_extension",
    "name": "Two-Handed Overhead DB Extension",
    "muscle": "Long Tricep (Long Head)",
    "tier": "C Tier",
    "aliases": [
      "seated two arm db overhead extension"
    ]
  },
  {
    "id": "long_tricep_incline_cable_skull_crusher_30_deg",
    "name": "Incline Cable Skull Crusher (30° Bench)",
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier",
    "aliases": [
      "incline bench cable skull crusher"
    ]
  },
  {
    "id": "lat_med_tricep_barbell_bodyweight_tricep_extension",
    "name": "Barbell Bodyweight Tricep Extension",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": [
      "bodyweight skull crusher",
      "rack tricep extension"
    ]
  },
  {
    "id": "lat_med_tricep_tate_press_on_flat_bench",
    "name": "Tate Press on Flat Bench",
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier",
    "aliases": [
      "dumbbell tate press"
    ]
  },
  {
    "id": "forearms_behind_the_back_barbell_wrist_curl",
    "name": "Behind-the-Back Barbell Wrist Curl",
    "muscle": "Forearm Flexors (Inside)",
    "tier": "A+ Tier",
    "aliases": [
      "standing wrist curl"
    ]
  },
  {
    "id": "forearms_reverse_barbell_wrist_curl",
    "name": "Reverse Barbell Wrist Curl",
    "muscle": "Forearm Flexors (Inside)",
    "tier": "C Tier",
    "aliases": [
      "overhand wrist curl"
    ]
  },
  {
    "id": "forearms_wrist_roller",
    "name": "Wrist Roller (Plate on Rope)",
    "muscle": "Forearms",
    "tier": "C Tier",
    "aliases": [
      "wrist roller extension"
    ]
  },
  {
    "id": "forearms_dumbbell_finger_curls",
    "name": "Dumbbell Finger Curls",
    "muscle": "Forearm Flexors (Inside)",
    "tier": "C Tier",
    "aliases": [
      "finger curls"
    ]
  },
  {
    "id": "forearms_pinch_grip_plate_hold",
    "name": "Pinch-Grip Plate Hold",
    "muscle": "Forearms",
    "tier": "C Tier",
    "aliases": [
      "plate pinch hold"
    ]
  },
  {
    "id": "forearms_towel_grip_pull_ups",
    "name": "Towel Grip Pull-ups",
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier",
    "aliases": [
      "towel pullups"
    ]
  },
  {
    "id": "quads_bulgarian_split_squat_front_foot_elevated",
    "name": "Bulgarian Split Squat (Front Foot Elevated)",
    "muscle": "Quads",
    "tier": "A Tier",
    "aliases": [
      "deficit bulgarian split squat"
    ]
  },
  {
    "id": "quads_cyclist_squat_heels_high_wedge",
    "name": "Cyclist Squat (Heels High Wedge)",
    "muscle": "Quad Teardrop (VMO)",
    "tier": "C Tier",
    "aliases": [
      "cyclist squat",
      "vmo squat"
    ]
  },
  {
    "id": "quads_high_box_step_up",
    "name": "High Box Step-Up",
    "muscle": "Quads",
    "tier": "B Tier",
    "aliases": [
      "deficit step up",
      "weighted high step up"
    ]
  },
  {
    "id": "quads_spanish_squat_band_behind_knees",
    "name": "Spanish Squat (Band Behind Knees)",
    "muscle": "Quads",
    "tier": "C Tier",
    "aliases": [
      "banded spanish squat"
    ]
  },
  {
    "id": "hamstrings_seated_leg_curl_torso_lean",
    "name": "Seated Leg Curl with Torso Lean",
    "muscle": "Hamstrings",
    "tier": "S Tier",
    "aliases": [
      "forward lean seated leg curl"
    ]
  },
  {
    "id": "hamstrings_deficit_romanian_deadlift",
    "name": "Deficit Romanian Deadlift (Standing on Plate)",
    "muscle": "Hamstrings",
    "tier": "B Tier",
    "aliases": [
      "deficit rdl"
    ]
  },
  {
    "id": "hamstrings_single_leg_kettlebell_rdl",
    "name": "Single-Leg Kettlebell RDL",
    "muscle": "Hamstrings",
    "tier": "B Tier",
    "aliases": [
      "one leg kb rdl"
    ]
  },
  {
    "id": "hamstrings_copenhagen_plank",
    "name": "Copenhagen Plank",
    "muscle": "Transverse Abs (Deep core)",
    "tier": "B Tier",
    "aliases": [
      "copenhagen adductor plank"
    ]
  },
  {
    "id": "hamstrings_glute_ham_raise_ghr",
    "name": "Glute-Ham Raise (GHR Machine)",
    "muscle": "Hamstrings",
    "tier": "A+ Tier",
    "aliases": [
      "ghr raise"
    ]
  },
  {
    "id": "hamstrings_swiss_ball_leg_curl",
    "name": "Swiss Ball Leg Curl",
    "muscle": "Hamstrings",
    "tier": "C Tier",
    "aliases": [
      "stability ball leg curl",
      "swiss ball hamstring curl"
    ]
  },
  {
    "id": "glutes_single_leg_hip_thrust",
    "name": "Single-Leg Barbell / DB Hip Thrust",
    "muscle": "Glutes",
    "tier": "C Tier",
    "aliases": [
      "one leg hip thrust"
    ]
  },
  {
    "id": "glutes_cable_pull_through",
    "name": "Cable Pull-Through",
    "muscle": "Glutes",
    "tier": "B Tier",
    "aliases": [
      "rope pull through"
    ]
  },
  {
    "id": "glutes_curtsy_lunge",
    "name": "Curtsy Lunge",
    "muscle": "Glutes/Abductors (Outer glutes)",
    "tier": "C Tier",
    "aliases": [
      "dumbbell curtsy lunge"
    ]
  },
  {
    "id": "glutes_frog_pumps",
    "name": "Frog Pumps",
    "muscle": "Glutes",
    "tier": "C Tier",
    "aliases": [
      "dumbbell frog pump"
    ]
  },
  {
    "id": "glutes_eccentric_step_down",
    "name": "Eccentric Step-Down",
    "muscle": "Glutes",
    "tier": "C Tier",
    "aliases": [
      "peterson step down"
    ]
  },
  {
    "id": "calves_single_leg_standing_db_calf_raise",
    "name": "Single-Leg Standing DB Calf Raise",
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "C Tier",
    "aliases": [
      "one leg standing calf raise"
    ]
  },
  {
    "id": "calves_leg_press_calf_extension",
    "name": "Leg Press Calf Extension",
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "A+ Tier",
    "aliases": [
      "45 degree leg press calf press",
      "Leg Press Calf Raise",
      "Leg Press Calf Raises",
      "Calf Press on Leg Press"
    ]
  },
  {
    "id": "calves_seated_tibialis_bar_raise",
    "name": "Seated Tibialis Bar Raise",
    "muscle": "Tibialis Anterior",
    "tier": "B Tier",
    "aliases": [
      "tib bar raise"
    ]
  },
  {
    "id": "calves_deficit_calf_raise_3s_stretch",
    "name": "Deficit Calf Raise with 3-Second Stretch Pause",
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "C Tier",
    "aliases": [
      "paused deficit calf raise"
    ]
  },
  {
    "id": "lower_abs_garhammer_raise",
    "name": "Garhammer Raise",
    "muscle": "Lower Abs",
    "tier": "C Tier",
    "aliases": [
      "hanging garhammer raise"
    ]
  },
  {
    "id": "abs_decline_bench_dragon_flag",
    "name": "Decline Bench Dragon Flag",
    "muscle": "Upper Abs",
    "tier": "C Tier",
    "aliases": [
      "dragon flag on decline"
    ]
  },
  {
    "id": "upper_abs_swiss_ball_crunch_extended_stretch",
    "name": "Swiss Ball Crunch (Extended Stretch)",
    "muscle": "Upper Abs",
    "tier": "C Tier",
    "aliases": [
      "stability ball crunch"
    ]
  },
  {
    "id": "lower_abs_l_sit_hold_parallettes",
    "name": "L-Sit Hold on Parallettes",
    "muscle": "Lower Abs",
    "tier": "C Tier",
    "aliases": [
      "parallette l sit hold"
    ]
  },
  {
    "id": "abs_ab_wheel_rollout_to_pike",
    "name": "Ab Wheel Rollout to Pike",
    "muscle": "Transverse Abs (Deep core)",
    "tier": "A+ Tier",
    "aliases": [
      "rollout pike"
    ]
  },
  {
    "id": "abs_hollow_body_rock",
    "name": "Hollow Body Rock",
    "muscle": "Upper Abs",
    "tier": "C Tier",
    "aliases": [
      "gymnastic hollow rock"
    ]
  },
  {
    "id": "obliques_landmine_180s",
    "name": "Landmine 180s (Rotations)",
    "muscle": "Obliques",
    "tier": "B Tier",
    "aliases": [
      "landmine rotation",
      "landmine twists"
    ]
  },
  {
    "id": "obliques_standing_low_to_high_cable_woodchopper",
    "name": "Standing Low-to-High Cable Woodchopper",
    "muscle": "Obliques",
    "tier": "S Tier",
    "aliases": [
      "diagonal cable woodchopper"
    ]
  },
  {
    "id": "obliques_side_plank_with_hip_dips",
    "name": "Side Plank with Hip Dips",
    "muscle": "Obliques",
    "tier": "B Tier",
    "aliases": [
      "side plank hip drops"
    ]
  },
  {
    "id": "obliques_side_plank",
    "name": "Side Plank",
    "muscle": "Obliques",
    "tier": "B Tier",
    "aliases": [
      "Side Planks",
      "Isometric Side Plank",
      "Bodyweight Side Plank"
    ]
  },
  {
    "id": "obliques_heavy_suitcase_carry",
    "name": "Heavy Suitcase Carry",
    "muscle": "Obliques",
    "tier": "C Tier",
    "aliases": [
      "single arm farmer walk"
    ]
  },
  {
    "id": "obliques_kettlebell_windmill",
    "name": "Kettlebell Windmill",
    "muscle": "Obliques",
    "tier": "B Tier",
    "aliases": [
      "kb windmill"
    ]
  },
  {
    "id": "abs_bird_dog_on_bench_band",
    "name": "Bird Dog on Bench with Resistance Band",
    "muscle": "Transverse Abs",
    "tier": "C Tier",
    "aliases": [
      "banded bird dog"
    ]
  }
];

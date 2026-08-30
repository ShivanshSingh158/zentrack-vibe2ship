export interface ExerciseDBEntry {
  id: string;
  name: string;
  aliases: string[];
  muscle: string;
  tier?: 'S Tier' | 'A+ Tier' | 'A Tier' | 'B Tier' | 'C Tier';
}

export const EXERCISE_DATABASE: ExerciseDBEntry[] = [
  {
    "id": "upper_chest_hammer_strength_incline_press",
    "name": "Hammer Strength Incline Press",
    "aliases": [],
    "muscle": "Upper Chest",
    "tier": "A+ Tier"
  },
  {
    "id": "upper_chest_incline_barbell_bench_press",
    "name": "Incline Barbell Bench Press",
    "aliases": [],
    "muscle": "Upper Chest",
    "tier": "A+ Tier"
  },
  {
    "id": "upper_chest_incline_barbell_press",
    "name": "Incline Barbell Press",
    "aliases": [],
    "muscle": "Upper Chest",
    "tier": "A Tier"
  },
  {
    "id": "upper_chest_incline_bench_press",
    "name": "Incline Bench Press",
    "aliases": [],
    "muscle": "Upper Chest",
    "tier": "C Tier"
  },
  {
    "id": "upper_chest_incline_dumbbell_bench_press",
    "name": "Incline Dumbbell Bench Press",
    "aliases": [],
    "muscle": "Upper Chest",
    "tier": "C Tier"
  },
  {
    "id": "upper_chest_incline_dumbbell_fly",
    "name": "Incline Dumbbell Fly",
    "aliases": [
      "incline dumbbell flyes"
    ],
    "muscle": "Upper Chest",
    "tier": "A Tier"
  },
  {
    "id": "upper_chest_incline_dumbbell_lateral_raise",
    "name": "Incline Dumbbell Lateral Raise",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "A Tier"
  },
  {
    "id": "upper_chest_incline_dumbbell_press",
    "name": "Incline Dumbbell Press",
    "aliases": [],
    "muscle": "Upper Chest",
    "tier": "S Tier"
  },
  {
    "id": "upper_chest_incline_machine_press",
    "name": "Incline Machine Press",
    "aliases": [],
    "muscle": "Upper Chest",
    "tier": "A+ Tier"
  },
  {
    "id": "upper_chest_incline_push_ups",
    "name": "Incline Push Ups",
    "aliases": [],
    "muscle": "Upper Chest",
    "tier": "C Tier"
  },
  {
    "id": "upper_chest_incline_skull_crushers",
    "name": "Incline Skull Crushers",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier"
  },
  {
    "id": "upper_chest_landmine_chest_press",
    "name": "Landmine Chest Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "B Tier"
  },
  {
    "id": "upper_chest_low_to_high_cable_fly",
    "name": "Low To High Cable Fly",
    "aliases": [
      "low-to-high cable flyes"
    ],
    "muscle": "Upper Chest",
    "tier": "S Tier"
  },
  {
    "id": "upper_chest_single_arm_landmine_press",
    "name": "Single Arm Landmine Press",
    "aliases": [],
    "muscle": "Upper Chest",
    "tier": "B Tier"
  },
  {
    "id": "upper_chest_smith_machine_incline_press",
    "name": "Smith Machine Incline Press",
    "aliases": [],
    "muscle": "Upper Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_barbell_bench_press",
    "name": "Barbell Bench Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "A+ Tier"
  },
  {
    "id": "mid_chest_barbell_floor_press",
    "name": "Barbell Floor Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "B Tier"
  },
  {
    "id": "mid_chest_bench_press",
    "name": "Bench Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_bodyweight_push_ups",
    "name": "Bodyweight Push Ups",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_butterfly_machine_fly",
    "name": "Butterfly Machine Fly",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_cable_crossovers",
    "name": "Cable Crossovers",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "A Tier"
  },
  {
    "id": "mid_chest_close_grip_barbell_bench_press",
    "name": "Close-grip Barbell Bench Press",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "A+ Tier"
  },
  {
    "id": "mid_chest_decline_barbell_bench_press",
    "name": "Decline Barbell Bench Press",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "A+ Tier"
  },
  {
    "id": "mid_chest_decline_bench_press",
    "name": "Decline Bench Press",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_decline_dumbbell_bench_press",
    "name": "Decline Dumbbell Bench Press",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_decline_push_ups",
    "name": "Decline Push Ups",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_diamond_pushups",
    "name": "Diamond Pushups",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "B Tier"
  },
  {
    "id": "mid_chest_dumbbell_bench_press",
    "name": "Dumbbell Bench Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_dumbbell_floor_press",
    "name": "Dumbbell Floor Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "B Tier"
  },
  {
    "id": "mid_chest_dumbbell_press",
    "name": "Dumbbell Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_flat_barbell_bench_press",
    "name": "Flat Barbell Bench Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "A+ Tier"
  },
  {
    "id": "mid_chest_flat_barbell_press",
    "name": "Flat Barbell Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_flat_dumbbell_bench_press",
    "name": "Flat Dumbbell Bench Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "S Tier"
  },
  {
    "id": "mid_chest_flat_dumbbell_fly",
    "name": "Flat Dumbbell Fly",
    "aliases": [
      "flat dumbbell flyes"
    ],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_flat_dumbbell_press",
    "name": "Flat Dumbbell Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "S Tier"
  },
  {
    "id": "mid_chest_high_to_low_cable_crossovers",
    "name": "High-to-low Cable Crossovers",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "A+ Tier"
  },
  {
    "id": "mid_chest_machine_chest_fly",
    "name": "Machine Chest Fly",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_machine_chest_press",
    "name": "Machine Chest Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_middle_cable_chest_fly",
    "name": "Middle Cable Chest Fly",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_pec_deck",
    "name": "Pec Deck",
    "aliases": [
      "pec deck fly"
    ],
    "muscle": "Mid Chest",
    "tier": "A+ Tier"
  },
  {
    "id": "mid_chest_plate_press",
    "name": "Plate Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_pushups",
    "name": "Pushups",
    "aliases": [
      "push ups"
    ],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_reverse_pec_deck",
    "name": "Reverse Pec Deck",
    "aliases": [
      "reverse pec deck fly"
    ],
    "muscle": "Rear Delts",
    "tier": "S Tier"
  },
  {
    "id": "mid_chest_seated_machine_chest_press",
    "name": "Seated Machine Chest Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_smith_machine_bench_press",
    "name": "Smith Machine Bench Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_standing_cable_chest_fly",
    "name": "Standing Cable Chest Fly",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_weighted_push_ups",
    "name": "Weighted Push Ups",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "lower_chest_assisted_chest_dips",
    "name": "Assisted Chest Dips",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "C Tier"
  },
  {
    "id": "lower_chest_chest_dips",
    "name": "Chest Dips",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "C Tier"
  },
  {
    "id": "lower_chest_decline_barbell_press",
    "name": "Decline Barbell Press",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "C Tier"
  },
  {
    "id": "lower_chest_decline_dumbbell_flyes",
    "name": "Decline Dumbbell Flyes",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "B Tier"
  },
  {
    "id": "lower_chest_decline_dumbbell_press",
    "name": "Decline Dumbbell Press",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "A Tier"
  },
  {
    "id": "lower_chest_decline_reverse_crunch",
    "name": "Decline Reverse Crunch",
    "aliases": [],
    "muscle": "Lower Abs",
    "tier": "C Tier"
  },
  {
    "id": "lower_chest_decline_skull_crushers",
    "name": "Decline Skull Crushers",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier"
  },
  {
    "id": "lower_chest_hammer_strength_decline_press",
    "name": "Hammer Strength Decline Press",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "A+ Tier"
  },
  {
    "id": "lower_chest_high_to_low_cable_fly",
    "name": "High To Low Cable Fly",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "A+ Tier"
  },
  {
    "id": "lower_chest_high_to_low_woodchoppers",
    "name": "High To Low Woodchoppers",
    "aliases": [],
    "muscle": "Obliques",
    "tier": "C Tier"
  },
  {
    "id": "lower_chest_smith_machine_decline_press",
    "name": "Smith Machine Decline Press",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "C Tier"
  },
  {
    "id": "lower_chest_weighted_chest_dips",
    "name": "Weighted Chest Dips",
    "aliases": [],
    "muscle": "Lower Chest",
    "tier": "C Tier"
  },
  {
    "id": "serratus___pec_minor_barbell_pullover",
    "name": "Barbell Pullover",
    "aliases": [],
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier"
  },
  {
    "id": "serratus___pec_minor_dumbbell_pullover",
    "name": "Dumbbell Pullover",
    "aliases": [
      "dumbbell pullovers"
    ],
    "muscle": "Serratus / Pec Minor",
    "tier": "A Tier"
  },
  {
    "id": "serratus___pec_minor_machine_pullover",
    "name": "Machine Pullover",
    "aliases": [],
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier"
  },
  {
    "id": "serratus___pec_minor_svend_press",
    "name": "Svend Press",
    "aliases": [],
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__assisted_chin_ups",
    "name": "Assisted Chin Ups",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__assisted_pull_ups",
    "name": "Assisted Pull Ups",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "A Tier"
  },
  {
    "id": "lat_width__lats__chin_ups",
    "name": "Chin Ups",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__chin_up",
    "name": "Chin-up",
    "aliases": [
      "chin up"
    ],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__close_grip_lat_pulldown",
    "name": "Close Grip Lat Pulldown",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "A Tier"
  },
  {
    "id": "lat_width__lats__kneeling_cable_lat_pulldown",
    "name": "Kneeling Cable Lat Pulldown",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__lat_pulldown",
    "name": "Lat Pulldown",
    "aliases": [
      "lat pulldowns"
    ],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__neutral_grip_lat_pulldowns",
    "name": "Neutral-grip Lat Pulldowns",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "S Tier"
  },
  {
    "id": "lat_width__lats__pull_ups",
    "name": "Pull Ups",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__pull_up",
    "name": "Pull-up",
    "aliases": [
      "pull up"
    ],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__reverse_grip_lat_pulldown",
    "name": "Reverse Grip Lat Pulldown",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__single_arm_lat_pulldown",
    "name": "Single Arm Lat Pulldown",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__straight_arm_lat_pulldown",
    "name": "Straight Arm Lat Pulldown",
    "aliases": [
      "straight-arm lat pulldowns"
    ],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__underhand_lat_pulldown",
    "name": "Underhand Lat Pulldown",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__v_bar_lat_pulldown",
    "name": "V-bar Lat Pulldown",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__weighted_chin_ups",
    "name": "Weighted Chin Ups",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "A+ Tier"
  },
  {
    "id": "lat_width__lats__weighted_pull_ups",
    "name": "Weighted Pull Ups",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "A+ Tier"
  },
  {
    "id": "lat_width__lats__wide_grip_pull_ups",
    "name": "Wide Grip Pull Ups",
    "aliases": [],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width__lats__wide_grip_lat_pulldown",
    "name": "Wide-grip Lat Pulldown",
    "aliases": [
      "wide grip lat pulldown"
    ],
    "muscle": "Lat Width (Lats)",
    "tier": "A+ Tier"
  },
  {
    "id": "mid_back_barbell_bent_over_row",
    "name": "Barbell Bent Over Row",
    "aliases": [
      "barbell bent-over rows"
    ],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_barbell_row",
    "name": "Barbell Row",
    "aliases": [
      "barbell rows"
    ],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_chest_supported_dumbbell_row",
    "name": "Chest Supported Dumbbell Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_chest_supported_t_bar_row",
    "name": "Chest Supported T-bar Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_chest_supported_t_bar",
    "name": "Chest-supported T-bar",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_dumbbell_row",
    "name": "Dumbbell Row",
    "aliases": [
      "dumbbell rows"
    ],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_hammer_strength_row",
    "name": "Hammer Strength Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_incline_dumbbell_row",
    "name": "Incline Dumbbell Row",
    "aliases": [],
    "muscle": "Upper Chest",
    "tier": "A Tier"
  },
  {
    "id": "mid_back_landmine_t_bar_row",
    "name": "Landmine T-bar Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "B Tier"
  },
  {
    "id": "mid_back_machine_seated_row",
    "name": "Machine Seated Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_meadows_row",
    "name": "Meadows Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "A Tier"
  },
  {
    "id": "mid_back_pendlay_row",
    "name": "Pendlay Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_rack_pulls",
    "name": "Rack Pulls",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_seal_row",
    "name": "Seal Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_seated_cable_row",
    "name": "Seated Cable Row",
    "aliases": [
      "seated cable rows"
    ],
    "muscle": "Mid-Back",
    "tier": "A+ Tier"
  },
  {
    "id": "mid_back_single_arm_cable_row",
    "name": "Single Arm Cable Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_single_arm_dumbbell_row",
    "name": "Single Arm Dumbbell Row",
    "aliases": [
      "single-arm dumbbell rows"
    ],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_t_bar_row",
    "name": "T-bar Row",
    "aliases": [
      "t bar row",
      "t-bar rows",
      "t bar rows"
    ],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_tbar_row",
    "name": "Tbar Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_two_arm_dumbbell_row",
    "name": "Two Arm Dumbbell Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_underhand_barbell_row",
    "name": "Underhand Barbell Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_v_bar_seated_row",
    "name": "V-bar Seated Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_wide_grip_seated_row",
    "name": "Wide Grip Seated Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_yates_row",
    "name": "Yates Row",
    "aliases": [],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_arnold_press",
    "name": "Arnold Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "A Tier"
  },
  {
    "id": "front_delts_barbell_front_raise",
    "name": "Barbell Front Raise",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_barbell_overhead_press",
    "name": "Barbell Overhead Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_cable_front_raise",
    "name": "Cable Front Raise",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "A Tier"
  },
  {
    "id": "front_delts_dumbbell_arnold_press",
    "name": "Dumbbell Arnold Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "A Tier"
  },
  {
    "id": "front_delts_dumbbell_front_raise",
    "name": "Dumbbell Front Raise",
    "aliases": [
      "dumbbell front raises"
    ],
    "muscle": "Front Delts",
    "tier": "B Tier"
  },
  {
    "id": "front_delts_dumbbell_press_shoulder",
    "name": "Dumbbell Press Shoulder",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_dumbbell_shoulder_press",
    "name": "Dumbbell Shoulder Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_landmine_shoulder_press",
    "name": "Landmine Shoulder Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "B Tier"
  },
  {
    "id": "front_delts_machine_overhead_press",
    "name": "Machine Overhead Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "A+ Tier"
  },
  {
    "id": "front_delts_machine_shoulder_press",
    "name": "Machine Shoulder Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_military_press",
    "name": "Military Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_overhead_press",
    "name": "Overhead Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_plate_front_raise",
    "name": "Plate Front Raise",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_push_press",
    "name": "Push Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "B Tier"
  },
  {
    "id": "front_delts_seated_barbell_shoulder_press",
    "name": "Seated Barbell Shoulder Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_seated_dumbbell_shoulder_press",
    "name": "Seated Dumbbell Shoulder Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "A+ Tier"
  },
  {
    "id": "front_delts_seated_machine_press",
    "name": "Seated Machine Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_smith_machine_shoulder_press",
    "name": "Smith Machine Shoulder Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "A Tier"
  },
  {
    "id": "front_delts_standing_barbell_overhead_press",
    "name": "Standing Barbell Overhead Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_standing_military_press",
    "name": "Standing Military Press",
    "aliases": [],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "side_delts_barbell_upright_row",
    "name": "Barbell Upright Row",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "C Tier"
  },
  {
    "id": "side_delts_behind_the_back_cable_lateral_raise",
    "name": "Behind The Back Cable Lateral Raise",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "S Tier"
  },
  {
    "id": "side_delts_cable_lateral_raise",
    "name": "Cable Lateral Raise",
    "aliases": [
      "cable lateral raises"
    ],
    "muscle": "Side Delts",
    "tier": "S Tier"
  },
  {
    "id": "side_delts_cable_upright_row",
    "name": "Cable Upright Row",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "C Tier"
  },
  {
    "id": "side_delts_dumbbell_lateral_raise",
    "name": "Dumbbell Lateral Raise",
    "aliases": [
      "dumbbell lateral raises"
    ],
    "muscle": "Side Delts",
    "tier": "A Tier"
  },
  {
    "id": "side_delts_dumbbell_upright_row",
    "name": "Dumbbell Upright Row",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "C Tier"
  },
  {
    "id": "side_delts_lean_away_cable_lateral_raise",
    "name": "Lean-away Cable Lateral Raise",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "S Tier"
  },
  {
    "id": "side_delts_machine_lateral_raise",
    "name": "Machine Lateral Raise",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "S Tier"
  },
  {
    "id": "side_delts_seated_dumbbell_lateral_raise",
    "name": "Seated Dumbbell Lateral Raise",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "A Tier"
  },
  {
    "id": "side_delts_side_lateral_raises",
    "name": "Side Lateral Raises",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "C Tier"
  },
  {
    "id": "side_delts_single_arm_cable_lateral_raise",
    "name": "Single Arm Cable Lateral Raise",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "S Tier"
  },
  {
    "id": "side_delts_upright_rows",
    "name": "Upright Rows",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "C Tier"
  },
  {
    "id": "side_delts_wide_grip_upright_row",
    "name": "Wide Grip Upright Row",
    "aliases": [],
    "muscle": "Side Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_bent_over_rear_delt_fly",
    "name": "Bent Over Rear Delt Fly",
    "aliases": [
      "bent-over rear delt flyes"
    ],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_cable_face_pulls",
    "name": "Cable Face Pulls",
    "aliases": [],
    "muscle": "Rear Delts",
    "tier": "A+ Tier"
  },
  {
    "id": "rear_delts_face_pulls",
    "name": "Face Pulls",
    "aliases": [],
    "muscle": "Rear Delts",
    "tier": "A+ Tier"
  },
  {
    "id": "rear_delts_high_cable_rear_delt_row",
    "name": "High Cable Rear Delt Row",
    "aliases": [],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_incline_rear_delt_dumbbell_fly",
    "name": "Incline Rear Delt Dumbbell Fly",
    "aliases": [],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_rear_delt_cable_fly",
    "name": "Rear Delt Cable Fly",
    "aliases": [],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_rear_delt_dumbbell_fly",
    "name": "Rear Delt Dumbbell Fly",
    "aliases": [],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_rear_delt_fly",
    "name": "Rear Delt Fly",
    "aliases": [],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_rear_delt_machine_fly",
    "name": "Rear Delt Machine Fly",
    "aliases": [],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_reverse_machine_fly",
    "name": "Reverse Machine Fly",
    "aliases": [],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_rope_face_pulls",
    "name": "Rope Face Pulls",
    "aliases": [],
    "muscle": "Rear Delts",
    "tier": "A+ Tier"
  },
  {
    "id": "rear_delts_seated_rear_delt_fly",
    "name": "Seated Rear Delt Fly",
    "aliases": [],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "long_tricep__long_head__barbell_skull_crushers",
    "name": "Barbell Skull Crushers",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier"
  },
  {
    "id": "long_tricep__long_head__cable_french_press",
    "name": "Cable French Press",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A Tier"
  },
  {
    "id": "long_tricep__long_head__dumbbell_french_press",
    "name": "Dumbbell French Press",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A Tier"
  },
  {
    "id": "long_tricep__long_head__dumbbell_skull_crushers",
    "name": "Dumbbell Skull Crushers",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier"
  },
  {
    "id": "long_tricep__long_head__ez_bar_skull_crushers",
    "name": "Ez-bar Skull Crushers",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier"
  },
  {
    "id": "long_tricep__long_head__french_press",
    "name": "French Press",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A Tier"
  },
  {
    "id": "long_tricep__long_head__overhead_cable_extensions",
    "name": "Overhead Cable Extensions",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "C Tier"
  },
  {
    "id": "long_tricep__long_head__overhead_cable_tricep_extension",
    "name": "Overhead Cable Tricep Extension",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "S Tier"
  },
  {
    "id": "long_tricep__long_head__rope_overhead_tricep_extension",
    "name": "Rope Overhead Tricep Extension",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "C Tier"
  },
  {
    "id": "long_tricep__long_head__seated_dumbbell_overhead_tricep_extension",
    "name": "Seated Dumbbell Overhead Tricep Extension",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "C Tier"
  },
  {
    "id": "long_tricep__long_head__single_arm_overhead_cable_extension",
    "name": "Single Arm Overhead Cable Extension",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "C Tier"
  },
  {
    "id": "long_tricep__long_head__skull_crushers",
    "name": "Skull Crushers",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier"
  },
  {
    "id": "long_tricep__long_head__skullcrushers",
    "name": "Skullcrushers",
    "aliases": [],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__assisted_tricep_dips",
    "name": "Assisted Tricep Dips",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__bench_dips",
    "name": "Bench Dips",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "glutes_cable_glute_kickbacks",
    "name": "Cable Glute Kickbacks",
    "aliases": [],
    "muscle": "Glutes",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__cable_kickback",
    "name": "Cable Kickback",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__cable_lat_pushdown",
    "name": "Cable Lat Pushdown",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__cable_tricep_kickbacks",
    "name": "Cable Tricep Kickbacks",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__close_grip_bench_press",
    "name": "Close Grip Bench Press",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__close_grip_press",
    "name": "Close Grip Press",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__dumbbell_tricep_kickbacks",
    "name": "Dumbbell Tricep Kickbacks",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__jm_press",
    "name": "Jm Press",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__reverse_grip_tricep_pushdown",
    "name": "Reverse Grip Tricep Pushdown",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__rope_lat_pushdown",
    "name": "Rope Lat Pushdown",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__rope_pushdowns",
    "name": "Rope Pushdowns",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__rope_tricep_pushdown",
    "name": "Rope Tricep Pushdown",
    "aliases": [
      "rope tricep pushdowns"
    ],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__single_arm_tricep_pushdown",
    "name": "Single Arm Tricep Pushdown",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__straight_bar_tricep_pushdown",
    "name": "Straight Bar Tricep Pushdown",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__tate_press",
    "name": "Tate Press",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__tricep_dips",
    "name": "Tricep Dips",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__tricep_rope_pushdown",
    "name": "Tricep Rope Pushdown",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__v_bar_cable_pushdowns",
    "name": "V-bar Cable Pushdowns",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__v_bar_pushdown",
    "name": "V-bar Pushdown",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep__lateral___medial_head__weighted_tricep_dips",
    "name": "Weighted Tricep Dips",
    "aliases": [],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "short_bicep__inner_head__barbell_curl",
    "name": "Barbell Curl",
    "aliases": [
      "barbell curls"
    ],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "short_bicep__inner_head__cable_bicep_curl",
    "name": "Cable Bicep Curl",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "short_bicep__inner_head__concentration_curl",
    "name": "Concentration Curl",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "B Tier"
  },
  {
    "id": "short_bicep__inner_head__dumbbell_concentration_curls",
    "name": "Dumbbell Concentration Curls",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "B Tier"
  },
  {
    "id": "short_bicep__inner_head__dumbbell_preacher_curl",
    "name": "Dumbbell Preacher Curl",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "S Tier"
  },
  {
    "id": "short_bicep__inner_head__ez_bar_curl",
    "name": "Ez-bar Curl",
    "aliases": [
      "ez bar curl",
      "ez bar curls"
    ],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "short_bicep__inner_head__ez_bar_preacher_curl",
    "name": "Ez-bar Preacher Curl",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "S Tier"
  },
  {
    "id": "short_bicep__inner_head__machine_preacher_curls",
    "name": "Machine Preacher Curls",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "S Tier"
  },
  {
    "id": "short_bicep__inner_head__preacher_curl",
    "name": "Preacher Curl",
    "aliases": [
      "preacher curls"
    ],
    "muscle": "Short Bicep (Inner head)",
    "tier": "S Tier"
  },
  {
    "id": "short_bicep__inner_head__rope_cable_curl",
    "name": "Rope Cable Curl",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "short_bicep__inner_head__single_arm_preacher_curl",
    "name": "Single Arm Preacher Curl",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "S Tier"
  },
  {
    "id": "short_bicep__inner_head__spider_curl",
    "name": "Spider Curl",
    "aliases": [
      "spider curls"
    ],
    "muscle": "Short Bicep (Inner head)",
    "tier": "A Tier"
  },
  {
    "id": "short_bicep__inner_head__standing_barbell_curls",
    "name": "Standing Barbell Curls",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "short_bicep__inner_head__standing_cable_curls",
    "name": "Standing Cable Curls",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "short_bicep__inner_head__standing_ez_bar_curls",
    "name": "Standing Ez-bar Curls",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "A+ Tier"
  },
  {
    "id": "long_bicep__outer_peak__alternating_dumbbell_curls",
    "name": "Alternating Dumbbell Curls",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "A Tier"
  },
  {
    "id": "long_bicep__outer_peak__bayesian_curls",
    "name": "Bayesian Curls",
    "aliases": [],
    "muscle": "Long Bicep (Outer peak)",
    "tier": "C Tier"
  },
  {
    "id": "long_bicep__outer_peak__drag_curls",
    "name": "Drag Curls",
    "aliases": [],
    "muscle": "Long Bicep (Outer peak)",
    "tier": "A Tier"
  },
  {
    "id": "long_bicep__outer_peak__dumbbell_bicep_curls",
    "name": "Dumbbell Bicep Curls",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "long_bicep__outer_peak__dumbbell_curl",
    "name": "Dumbbell Curl",
    "aliases": [
      "dumbbell curls"
    ],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "long_bicep__outer_peak__incline_bicep_curls",
    "name": "Incline Bicep Curls",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "long_bicep__outer_peak__incline_dumbbell_curl",
    "name": "Incline Dumbbell Curl",
    "aliases": [
      "incline dumbbell curls"
    ],
    "muscle": "Long Bicep (Outer peak)",
    "tier": "S Tier"
  },
  {
    "id": "long_bicep__outer_peak__seated_dumbbell_curls",
    "name": "Seated Dumbbell Curls",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "brachialis_cable_hammer_curl",
    "name": "Cable Hammer Curl",
    "aliases": [],
    "muscle": "Brachialis",
    "tier": "C Tier"
  },
  {
    "id": "brachialis_cross_body_hammer_curl",
    "name": "Cross Body Hammer Curl",
    "aliases": [],
    "muscle": "Brachialis",
    "tier": "C Tier"
  },
  {
    "id": "brachialis_dumbbell_hammer_curls",
    "name": "Dumbbell Hammer Curls",
    "aliases": [],
    "muscle": "Brachialis",
    "tier": "A+ Tier"
  },
  {
    "id": "brachialis_hammer_curl",
    "name": "Hammer Curl",
    "aliases": [
      "hammer curls"
    ],
    "muscle": "Brachialis",
    "tier": "C Tier"
  },
  {
    "id": "quad_teardrop__vmo__hack_squat",
    "name": "Hack Squat",
    "aliases": [
      "hack squats"
    ],
    "muscle": "Quad Teardrop (VMO)",
    "tier": "S Tier"
  },
  {
    "id": "quad_teardrop__vmo__leg_extension",
    "name": "Leg Extension",
    "aliases": [
      "leg extensions"
    ],
    "muscle": "Quads",
    "tier": "A Tier"
  },
  {
    "id": "quad_teardrop__vmo__machine_hack_squat",
    "name": "Machine Hack Squat",
    "aliases": [],
    "muscle": "Quad Teardrop (VMO)",
    "tier": "S Tier"
  },
  {
    "id": "quad_teardrop__vmo__pendulum_squat",
    "name": "Pendulum Squat",
    "aliases": [],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "quad_teardrop__vmo__reverse_hack_squat",
    "name": "Reverse Hack Squat",
    "aliases": [],
    "muscle": "Quad Teardrop (VMO)",
    "tier": "S Tier"
  },
  {
    "id": "quad_teardrop__vmo__seated_leg_extensions",
    "name": "Seated Leg Extensions",
    "aliases": [],
    "muscle": "Quads",
    "tier": "A Tier"
  },
  {
    "id": "quad_teardrop__vmo__single_leg_extension",
    "name": "Single Leg Extension",
    "aliases": [],
    "muscle": "Quads",
    "tier": "A Tier"
  },
  {
    "id": "quad_teardrop__vmo__sissy_squat",
    "name": "Sissy Squat",
    "aliases": [],
    "muscle": "Quad Teardrop (VMO)",
    "tier": "A Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__45_degree_leg_press",
    "name": "45 Degree Leg Press",
    "aliases": [],
    "muscle": "Quads",
    "tier": "A+ Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__barbell_back_squat",
    "name": "Barbell Back Squat",
    "aliases": [
      "barbell back squats"
    ],
    "muscle": "Quads",
    "tier": "A+ Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__barbell_front_squat",
    "name": "Barbell Front Squat",
    "aliases": [
      "barbell front squats"
    ],
    "muscle": "Quads",
    "tier": "B Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__barbell_reverse_lunge",
    "name": "Barbell Reverse Lunge",
    "aliases": [],
    "muscle": "Quads",
    "tier": "B Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__barbell_squat",
    "name": "Barbell Squat",
    "aliases": [
      "barbell squats"
    ],
    "muscle": "Quads",
    "tier": "A+ Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__bulgarian_split_squat",
    "name": "Bulgarian Split Squat",
    "aliases": [
      "bulgarian split squats"
    ],
    "muscle": "Quads",
    "tier": "A Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__dumbbell_goblet_squat",
    "name": "Dumbbell Goblet Squat",
    "aliases": [],
    "muscle": "Quads",
    "tier": "B Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__dumbbell_reverse_lunges",
    "name": "Dumbbell Reverse Lunges",
    "aliases": [],
    "muscle": "Quads",
    "tier": "B Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__dumbbell_step_ups",
    "name": "Dumbbell Step Ups",
    "aliases": [],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__dumbbell_walking_lunges",
    "name": "Dumbbell Walking Lunges",
    "aliases": [],
    "muscle": "Quads",
    "tier": "B Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__forward_lunges",
    "name": "Forward Lunges",
    "aliases": [],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__front_squat",
    "name": "Front Squat",
    "aliases": [],
    "muscle": "Quads",
    "tier": "B Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__goblet_squat",
    "name": "Goblet Squat",
    "aliases": [
      "goblet squats"
    ],
    "muscle": "Quads",
    "tier": "B Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__heel_elevated_goblet_squats",
    "name": "Heel-elevated Goblet Squats",
    "aliases": [],
    "muscle": "Quad Teardrop (VMO)",
    "tier": "S Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__horizontal_leg_press",
    "name": "Horizontal Leg Press",
    "aliases": [],
    "muscle": "Quads",
    "tier": "A+ Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__kettlebell_goblet_squat",
    "name": "Kettlebell Goblet Squat",
    "aliases": [],
    "muscle": "Quads",
    "tier": "B Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__leg_press",
    "name": "Leg Press",
    "aliases": [],
    "muscle": "Quads",
    "tier": "A+ Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__leg_press_calf_raise",
    "name": "Leg Press Calf Raise",
    "aliases": [
      "leg press calf raises"
    ],
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "A+ Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__reverse_lunge",
    "name": "Reverse Lunge",
    "aliases": [
      "reverse lunges"
    ],
    "muscle": "Quads",
    "tier": "B Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__single_leg_press",
    "name": "Single Leg Press",
    "aliases": [],
    "muscle": "Quads",
    "tier": "A+ Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__smith_machine_squat",
    "name": "Smith Machine Squat",
    "aliases": [
      "smith machine squats"
    ],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__spanish_squat",
    "name": "Spanish Squat",
    "aliases": [],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__split_squat",
    "name": "Split Squat",
    "aliases": [],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__squat",
    "name": "Squat",
    "aliases": [
      "squats"
    ],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__step_ups",
    "name": "Step Ups",
    "aliases": [],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__walking_lunge",
    "name": "Walking Lunge",
    "aliases": [
      "walking lunges"
    ],
    "muscle": "Quads",
    "tier": "B Tier"
  },
  {
    "id": "quads_glutes__compound_leg_focus__zercher_squat",
    "name": "Zercher Squat",
    "aliases": [],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_45_degree_weighted_back_extensions",
    "name": "45-degree Weighted Back Extensions",
    "aliases": [],
    "muscle": "Lower Back",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_american_kettlebell_swing",
    "name": "American Kettlebell Swing",
    "aliases": [],
    "muscle": "Glutes/Hams",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_back_extensions",
    "name": "Back Extensions",
    "aliases": [],
    "muscle": "Lower Back",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_barbell_deadlift",
    "name": "Barbell Deadlift",
    "aliases": [
      "barbell deadlifts"
    ],
    "muscle": "Lower Back",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_barbell_good_morning",
    "name": "Barbell Good Morning",
    "aliases": [
      "barbell good mornings"
    ],
    "muscle": "Hamstrings",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_barbell_rdl",
    "name": "Barbell Rdl",
    "aliases": [],
    "muscle": "Hamstrings",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_deadlift",
    "name": "Deadlift",
    "aliases": [],
    "muscle": "Lower Back",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_deficit_deadlift",
    "name": "Deficit Deadlift",
    "aliases": [],
    "muscle": "Lower Back",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_dumbbell_rdl",
    "name": "Dumbbell Rdl",
    "aliases": [],
    "muscle": "Hamstrings",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_dumbbell_romanian_deadlift",
    "name": "Dumbbell Romanian Deadlift",
    "aliases": [],
    "muscle": "Hamstrings",
    "tier": "A Tier"
  },
  {
    "id": "glutes_hams_good_morning",
    "name": "Good Morning",
    "aliases": [
      "good mornings"
    ],
    "muscle": "Hamstrings",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_hex_bar_deadlift",
    "name": "Hex Bar Deadlift",
    "aliases": [],
    "muscle": "Lower Back",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_hyperextensions",
    "name": "Hyperextensions",
    "aliases": [],
    "muscle": "Lower Back",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_kb_swing",
    "name": "Kb Swing",
    "aliases": [],
    "muscle": "Glutes/Hams",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_kettlebell_deadlift",
    "name": "Kettlebell Deadlift",
    "aliases": [],
    "muscle": "Lower Back",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_kettlebell_swing",
    "name": "Kettlebell Swing",
    "aliases": [
      "kettlebell swings"
    ],
    "muscle": "Glutes/Hams",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_lying_leg_curl",
    "name": "Lying Leg Curl",
    "aliases": [
      "lying leg curls"
    ],
    "muscle": "Hamstrings",
    "tier": "A+ Tier"
  },
  {
    "id": "glutes_hams_machine_leg_curl",
    "name": "Machine Leg Curl",
    "aliases": [],
    "muscle": "Hamstrings",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_nordic_hamstring_curls",
    "name": "Nordic Hamstring Curls",
    "aliases": [],
    "muscle": "Hamstrings",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_prone_leg_curl",
    "name": "Prone Leg Curl",
    "aliases": [],
    "muscle": "Hamstrings",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_rdl",
    "name": "Rdl",
    "aliases": [],
    "muscle": "Hamstrings",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_romanian_deadlift",
    "name": "Romanian Deadlift",
    "aliases": [
      "romanian deadlifts"
    ],
    "muscle": "Hamstrings",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_russian_kettlebell_swing",
    "name": "Russian Kettlebell Swing",
    "aliases": [],
    "muscle": "Glutes/Hams",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_seated_leg_curl",
    "name": "Seated Leg Curl",
    "aliases": [
      "seated leg curls"
    ],
    "muscle": "Hamstrings",
    "tier": "S Tier"
  },
  {
    "id": "glutes_hams_single_leg_rdl",
    "name": "Single Leg Rdl",
    "aliases": [],
    "muscle": "Hamstrings",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_standard_barbell_deadlifts",
    "name": "Standard Barbell Deadlifts",
    "aliases": [],
    "muscle": "Lower Back",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_standing_leg_curl",
    "name": "Standing Leg Curl",
    "aliases": [],
    "muscle": "Hamstrings",
    "tier": "C Tier"
  },
  {
    "id": "glutes_hams_stiff_leg_deadlift",
    "name": "Stiff Leg Deadlift",
    "aliases": [],
    "muscle": "Hamstrings",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_stiff_leg_barbell_deadlift",
    "name": "Stiff-leg Barbell Deadlift",
    "aliases": [],
    "muscle": "Hamstrings",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_sumo_deadlift",
    "name": "Sumo Deadlift",
    "aliases": [],
    "muscle": "Lower Back",
    "tier": "B Tier"
  },
  {
    "id": "glutes_hams_trap_bar_deadlift",
    "name": "Trap Bar Deadlift",
    "aliases": [],
    "muscle": "Lower Back",
    "tier": "B Tier"
  },
  {
    "id": "glutes_abductors__outer_glutes__barbell_glute_bridge",
    "name": "Barbell Glute Bridge",
    "aliases": [],
    "muscle": "Glutes",
    "tier": "B Tier"
  },
  {
    "id": "glutes_abductors__outer_glutes__barbell_hip_thrusts",
    "name": "Barbell Hip Thrusts",
    "aliases": [],
    "muscle": "Glutes",
    "tier": "S Tier"
  },
  {
    "id": "glutes_abductors__outer_glutes__dumbbell_hip_thrust",
    "name": "Dumbbell Hip Thrust",
    "aliases": [],
    "muscle": "Glutes",
    "tier": "C Tier"
  },
  {
    "id": "glutes_abductors__outer_glutes__glute_bridge",
    "name": "Glute Bridge",
    "aliases": [],
    "muscle": "Glutes",
    "tier": "B Tier"
  },
  {
    "id": "glutes_abductors__outer_glutes__hip_abductions",
    "name": "Hip Abductions",
    "aliases": [],
    "muscle": "Glutes/Abductors (Outer glutes)",
    "tier": "S Tier"
  },
  {
    "id": "glutes_abductors__outer_glutes__hip_thrust",
    "name": "Hip Thrust",
    "aliases": [
      "hip thrusts"
    ],
    "muscle": "Glutes",
    "tier": "C Tier"
  },
  {
    "id": "glutes_abductors__outer_glutes__machine_adductions",
    "name": "Machine Adductions",
    "aliases": [],
    "muscle": "Glutes/Abductors (Outer glutes)",
    "tier": "C Tier"
  },
  {
    "id": "glutes_abductors__outer_glutes__seated_machine_abductions",
    "name": "Seated Machine Abductions",
    "aliases": [],
    "muscle": "Glutes/Abductors",
    "tier": "C Tier"
  },
  {
    "id": "glutes_abductors__outer_glutes__single_leg_hip_thrust",
    "name": "Single Leg Hip Thrust",
    "aliases": [],
    "muscle": "Glutes",
    "tier": "C Tier"
  },
  {
    "id": "gastrocnemius__upper_calf__donkey_calf_raise",
    "name": "Donkey Calf Raise",
    "aliases": [
      "donkey calf raises"
    ],
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "B Tier"
  },
  {
    "id": "gastrocnemius__upper_calf__standing_calf_raise",
    "name": "Standing Calf Raise",
    "aliases": [
      "standing calf raises"
    ],
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "C Tier"
  },
  {
    "id": "gastrocnemius__upper_calf__tibialis_raise",
    "name": "Tibialis Raise",
    "aliases": [
      "tibialis raises"
    ],
    "muscle": "Tibialis Anterior",
    "tier": "B Tier"
  },
  {
    "id": "soleus__lower_calf__barbell_calf_raise",
    "name": "Barbell Calf Raise",
    "aliases": [],
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "C Tier"
  },
  {
    "id": "soleus__lower_calf__dumbbell_calf_raise",
    "name": "Dumbbell Calf Raise",
    "aliases": [],
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "C Tier"
  },
  {
    "id": "soleus__lower_calf__seated_calf_raise",
    "name": "Seated Calf Raise",
    "aliases": [
      "seated calf raises"
    ],
    "muscle": "Soleus (Lower calf)",
    "tier": "A+ Tier"
  },
  {
    "id": "soleus__lower_calf__seated_machine_calf_raise",
    "name": "Seated Machine Calf Raise",
    "aliases": [],
    "muscle": "Soleus (Lower calf)",
    "tier": "C Tier"
  },
  {
    "id": "soleus__lower_calf__single_leg_calf_raise",
    "name": "Single Leg Calf Raise",
    "aliases": [],
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "C Tier"
  },
  {
    "id": "soleus__lower_calf__smith_machine_calf_raise",
    "name": "Smith Machine Calf Raise",
    "aliases": [
      "smith machine calf raises"
    ],
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "A Tier"
  },
  {
    "id": "soleus__lower_calf__standing_machine_calf_raise",
    "name": "Standing Machine Calf Raise",
    "aliases": [
      "standing machine calf raises"
    ],
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "S Tier"
  },
  {
    "id": "upper_abs_ab_crunch_machine",
    "name": "Ab Crunch Machine",
    "aliases": [],
    "muscle": "Upper Abs",
    "tier": "C Tier"
  },
  {
    "id": "upper_abs_bicycle_crunch",
    "name": "Bicycle Crunch",
    "aliases": [],
    "muscle": "Upper Abs",
    "tier": "C Tier"
  },
  {
    "id": "upper_abs_bicycle_crunches",
    "name": "Bicycle Crunches",
    "aliases": [],
    "muscle": "Upper Abs",
    "tier": "C Tier"
  },
  {
    "id": "upper_abs_cable_ab_crunches",
    "name": "Cable Ab Crunches",
    "aliases": [],
    "muscle": "Upper Abs",
    "tier": "C Tier"
  },
  {
    "id": "upper_abs_kneeling_cable_crunch",
    "name": "Kneeling Cable Crunch",
    "aliases": [],
    "muscle": "Upper Abs",
    "tier": "S Tier"
  },
  {
    "id": "upper_abs_machine_ab_crunch",
    "name": "Machine Ab Crunch",
    "aliases": [],
    "muscle": "Upper Abs",
    "tier": "A+ Tier"
  },
  {
    "id": "upper_abs_machine_ab_crunches",
    "name": "Machine Ab Crunches",
    "aliases": [],
    "muscle": "Upper Abs",
    "tier": "A+ Tier"
  },
  {
    "id": "upper_abs_rope_cable_crunch",
    "name": "Rope Cable Crunch",
    "aliases": [],
    "muscle": "Upper Abs",
    "tier": "C Tier"
  },
  {
    "id": "lower_abs_captain_chair_leg_raise",
    "name": "Captain Chair Leg Raise",
    "aliases": [],
    "muscle": "Lower Abs",
    "tier": "C Tier"
  },
  {
    "id": "lower_abs_dragon_flags",
    "name": "Dragon Flags",
    "aliases": [],
    "muscle": "Upper Abs",
    "tier": "C Tier"
  },
  {
    "id": "lower_abs_hanging_knee_raise",
    "name": "Hanging Knee Raise",
    "aliases": [
      "hanging knee raises"
    ],
    "muscle": "Lower Abs",
    "tier": "S Tier"
  },
  {
    "id": "lower_abs_hanging_leg_raise",
    "name": "Hanging Leg Raise",
    "aliases": [
      "hanging leg raises"
    ],
    "muscle": "Lower Abs",
    "tier": "A+ Tier"
  },
  {
    "id": "lower_abs_hanging_oblique_knee_raise",
    "name": "Hanging Oblique Knee Raise",
    "aliases": [
      "hanging oblique knee raises"
    ],
    "muscle": "Obliques",
    "tier": "A Tier"
  },
  {
    "id": "lower_abs_oblique_knee_raise",
    "name": "Oblique Knee Raise",
    "aliases": [],
    "muscle": "Obliques",
    "tier": "C Tier"
  },
  {
    "id": "lower_abs_reverse_crunch",
    "name": "Reverse Crunch",
    "aliases": [],
    "muscle": "Lower Abs",
    "tier": "C Tier"
  },
  {
    "id": "lower_abs_reverse_crunches",
    "name": "Reverse Crunches",
    "aliases": [],
    "muscle": "Lower Abs",
    "tier": "C Tier"
  },
  {
    "id": "transverse_abs__deep_core__ab_roller",
    "name": "Ab Roller",
    "aliases": [],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "C Tier"
  },
  {
    "id": "transverse_abs__deep_core__ab_wheel_rollout",
    "name": "Ab Wheel Rollout",
    "aliases": [
      "ab wheel rollouts"
    ],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "A+ Tier"
  },
  {
    "id": "transverse_abs__deep_core__bodyweight_plank",
    "name": "Bodyweight Plank",
    "aliases": [],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "B Tier"
  },
  {
    "id": "transverse_abs__deep_core__plank",
    "name": "Plank",
    "aliases": [],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "B Tier"
  },
  {
    "id": "transverse_abs__deep_core__side_plank",
    "name": "Side Plank",
    "aliases": [
      "side planks"
    ],
    "muscle": "Obliques",
    "tier": "B Tier"
  },
  {
    "id": "transverse_abs__deep_core__wrist_roller",
    "name": "Wrist Roller",
    "aliases": [],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "C Tier"
  },
  {
    "id": "obliques_cable_woodchopper",
    "name": "Cable Woodchopper",
    "aliases": [
      "cable woodchoppers"
    ],
    "muscle": "Obliques",
    "tier": "A Tier"
  },
  {
    "id": "obliques_dumbbell_side_bend",
    "name": "Dumbbell Side Bend",
    "aliases": [
      "dumbbell side bends"
    ],
    "muscle": "Obliques",
    "tier": "C Tier"
  },
  {
    "id": "obliques_russian_twists",
    "name": "Russian Twists",
    "aliases": [],
    "muscle": "Obliques",
    "tier": "B Tier"
  },
  {
    "id": "obliques_side_bend",
    "name": "Side Bend",
    "aliases": [
      "side bends"
    ],
    "muscle": "Obliques",
    "tier": "C Tier"
  },
  {
    "id": "obliques_weighted_russian_twist",
    "name": "Weighted Russian Twist",
    "aliases": [],
    "muscle": "Obliques",
    "tier": "B Tier"
  },
  {
    "id": "obliques_woodchopper",
    "name": "Woodchopper",
    "aliases": [
      "woodchoppers"
    ],
    "muscle": "Obliques",
    "tier": "C Tier"
  },
  {
    "id": "forearm_flexors__inside__behind_back_wrist_curl",
    "name": "Behind Back Wrist Curl",
    "aliases": [],
    "muscle": "Forearm Flexors (Inside)",
    "tier": "C Tier"
  },
  {
    "id": "forearm_flexors__inside__dumbbell_wrist_curl",
    "name": "Dumbbell Wrist Curl",
    "aliases": [
      "dumbbell wrist curls"
    ],
    "muscle": "Forearm Flexors (Inside)",
    "tier": "A Tier"
  },
  {
    "id": "forearm_flexors__inside__seated_dumbbell_wrist_curls",
    "name": "Seated Dumbbell Wrist Curls",
    "aliases": [],
    "muscle": "Forearm Flexors (Inside)",
    "tier": "A Tier"
  },
  {
    "id": "forearm_flexors__inside__seated_wrist_curl",
    "name": "Seated Wrist Curl",
    "aliases": [],
    "muscle": "Forearm Flexors (Inside)",
    "tier": "C Tier"
  },
  {
    "id": "forearm_flexors__inside__standing_behind_back_wrist_curls",
    "name": "Standing Behind Back Wrist Curls",
    "aliases": [],
    "muscle": "Forearm Flexors (Inside)",
    "tier": "A+ Tier"
  },
  {
    "id": "forearm_flexors__inside__wrist_curl",
    "name": "Wrist Curl",
    "aliases": [
      "wrist curls"
    ],
    "muscle": "Forearm Flexors (Inside)",
    "tier": "C Tier"
  },
  {
    "id": "forearm_extensors__outside__bar_hang",
    "name": "Bar Hang",
    "aliases": [],
    "muscle": "Forearm Extensors (Outside)",
    "tier": "C Tier"
  },
  {
    "id": "forearm_extensors__outside__dead_hang",
    "name": "Dead Hang",
    "aliases": [
      "dead hangs"
    ],
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier"
  },
  {
    "id": "forearm_extensors__outside__dumbbell_farmer_carry",
    "name": "Dumbbell Farmer Carry",
    "aliases": [],
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier"
  },
  {
    "id": "forearm_extensors__outside__farmer_carry",
    "name": "Farmer Carry",
    "aliases": [],
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier"
  },
  {
    "id": "forearm_extensors__outside__farmer_walk",
    "name": "Farmer Walk",
    "aliases": [
      "farmer walks",
      "farmers walk"
    ],
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier"
  },
  {
    "id": "forearm_extensors__outside__machine_reverse_wrist_curls",
    "name": "Machine Reverse Wrist Curls",
    "aliases": [],
    "muscle": "Forearm Extensors (Outside)",
    "tier": "A Tier"
  },
  {
    "id": "forearm_extensors__outside__pinch_hold",
    "name": "Pinch Hold",
    "aliases": [],
    "muscle": "Forearm Extensors (Outside)",
    "tier": "C Tier"
  },
  {
    "id": "forearm_extensors__outside__plate_pinch",
    "name": "Plate Pinch",
    "aliases": [],
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier"
  },
  {
    "id": "forearm_extensors__outside__plate_pinches",
    "name": "Plate Pinches",
    "aliases": [],
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier"
  },
  {
    "id": "forearm_extensors__outside__reverse_wrist_curl",
    "name": "Reverse Wrist Curl",
    "aliases": [
      "reverse wrist curls"
    ],
    "muscle": "Forearm Extensors (Outside)",
    "tier": "C Tier"
  },
  {
    "id": "brachioradialis__upper_forearm__reverse_barbell_curl",
    "name": "Reverse Barbell Curl",
    "aliases": [
      "reverse barbell curls"
    ],
    "muscle": "Brachialis",
    "tier": "A Tier"
  },
  {
    "id": "brachioradialis__upper_forearm__reverse_dumbbell_curl",
    "name": "Reverse Dumbbell Curl",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "brachioradialis__upper_forearm__reverse_ez_bar_curl",
    "name": "Reverse Ez Bar Curl",
    "aliases": [],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "brachioradialis__upper_forearm__zottman_curl",
    "name": "Zottman Curl",
    "aliases": [
      "zottman curls"
    ],
    "muscle": "Brachialis",
    "tier": "B Tier"
  },
  {
    "id": "upper_traps_barbell_shrugs",
    "name": "Barbell Shrugs",
    "aliases": [],
    "muscle": "Upper Traps",
    "tier": "B Tier"
  },
  {
    "id": "upper_traps_cable_shrugs",
    "name": "Cable Shrugs",
    "aliases": [],
    "muscle": "Upper Traps",
    "tier": "A+ Tier"
  },
  {
    "id": "upper_traps_dumbbell_shrugs",
    "name": "Dumbbell Shrugs",
    "aliases": [],
    "muscle": "Upper Traps",
    "tier": "A Tier"
  },
  {
    "id": "upper_traps_smith_machine_shrugs",
    "name": "Smith Machine Shrugs",
    "aliases": [],
    "muscle": "Upper Traps",
    "tier": "C Tier"
  },
  {
    "id": "uncategorized_hammer_strength_chest_press",
    "name": "Hammer Strength Chest Press",
    "aliases": [],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "uncategorized_standing_dumbbell_overhead_extension",
    "name": "Standing Dumbbell Overhead Extension",
    "aliases": [],
    "muscle": "Uncategorized",
    "tier": "C Tier"
  },
  {
    "id": "transverse_abs_deep_core_stomach_vacuum",
    "name": "Stomach Vacuum",
    "aliases": [
      "vacuums",
      "stomach vacuums"
    ],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "B Tier"
  },
  {
    "id": "transverse_abs_deep_core_bird_dog",
    "name": "Bird Dog",
    "aliases": [
      "bird dogs"
    ],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "C Tier"
  },
  {
    "id": "transverse_abs_deep_core_dead_bug",
    "name": "Dead Bug",
    "aliases": [
      "dead bugs"
    ],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "C Tier"
  },
  {
    "id": "transverse_abs_deep_core_hollow_body_hold",
    "name": "Hollow Body Hold",
    "aliases": [
      "hollow hold"
    ],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "C Tier"
  },
  {
    "id": "transverse_abs_deep_core_pallof_press",
    "name": "Pallof Press",
    "aliases": [
      "cable pallof press"
    ],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "A Tier"
  },
  {
    "id": "brachioradialis_upper_forearm_rope_hammer_curl",
    "name": "Rope Hammer Curl",
    "aliases": [
      "cable hammer curl",
      "rope hammer curls"
    ],
    "muscle": "Brachialis",
    "tier": "C Tier"
  },
  {
    "id": "upper_traps_farmers_walk",
    "name": "Farmer's Walk",
    "aliases": [
      "farmers carry",
      "farmer's carry"
    ],
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier"
  },
  {
    "id": "upper_traps_upright_row",
    "name": "Upright Row",
    "aliases": [
      "barbell upright row",
      "cable upright row"
    ],
    "muscle": "Side Delts",
    "tier": "C Tier"
  },
  {
    "id": "upper_traps_rack_pull",
    "name": "Rack Pull",
    "aliases": [
      "rack pulls"
    ],
    "muscle": "Upper Traps",
    "tier": "C Tier"
  },
  {
    "id": "neck_flexors_neck_curl",
    "name": "Neck Curl",
    "aliases": [
      "neck flexion",
      "weight plate neck curl"
    ],
    "muscle": "Upper Traps",
    "tier": "C Tier"
  },
  {
    "id": "neck_extensors_neck_extension",
    "name": "Neck Extension",
    "aliases": [
      "neck harness extension"
    ],
    "muscle": "Upper Traps",
    "tier": "C Tier"
  },
  {
    "id": "tibialis_anterior_tibialis_raise",
    "name": "Tibialis Raise",
    "aliases": [
      "tib raises",
      "tibialis raises"
    ],
    "muscle": "Tibialis Anterior",
    "tier": "B Tier"
  },
  {
    "id": "hip_flexors_cable_hip_flexion",
    "name": "Cable Hip Flexion",
    "aliases": [
      "cable knee raise"
    ],
    "muscle": "Hip Flexors",
    "tier": "C Tier"
  },
  {
    "id": "serratus_anterior_scapular_pushup",
    "name": "Scapular Pushup",
    "aliases": [
      "scap pushups",
      "scap pushup"
    ],
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier"
  },
  {
    "id": "upper_chest_converging_incline_chest_press",
    "name": "Converging Incline Chest Press",
    "aliases": [
      "plate loaded incline press"
    ],
    "muscle": "Upper Chest",
    "tier": "S Tier"
  },
  {
    "id": "mid_chest_plate_loaded_chest_press",
    "name": "Plate-Loaded Chest Press",
    "aliases": [
      "converging chest press"
    ],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_deficit_pushup",
    "name": "Deficit Pushup",
    "aliases": [
      "deficit push-ups"
    ],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "lat_width_single_arm_iliac_lat_pulldown",
    "name": "Single Arm Iliac Lat Pulldown",
    "aliases": [
      "iliac lat pulldown"
    ],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width_lat_prayer_cable_pullover",
    "name": "Lat Prayer (Kneeling Cable Pullover)",
    "aliases": [
      "lat prayer",
      "cable lat pullover"
    ],
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_kelso_shrug",
    "name": "Kelso Shrug",
    "aliases": [
      "scapular retraction row"
    ],
    "muscle": "Upper Traps",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_chest_supported_y_raise",
    "name": "Chest Supported Incline Y-Raise",
    "aliases": [
      "incline y raise",
      "lower trap y raise"
    ],
    "muscle": "Side Delts",
    "tier": "A Tier"
  },
  {
    "id": "side_delts_dual_cable_cross_body_lateral_raise",
    "name": "Dual Cable Cross-Body Lateral Raise",
    "aliases": [
      "cross body cable lateral raise"
    ],
    "muscle": "Side Delts",
    "tier": "C Tier"
  },
  {
    "id": "side_delts_egyptian_cable_lateral_raise",
    "name": "Egyptian Cable Lateral Raise",
    "aliases": [
      "leaning cable lateral raise"
    ],
    "muscle": "Side Delts",
    "tier": "S Tier"
  },
  {
    "id": "side_delts_lu_raise",
    "name": "Lu Raise",
    "aliases": [
      "olympic lateral raise"
    ],
    "muscle": "Side Delts",
    "tier": "A Tier"
  },
  {
    "id": "rear_delts_high_cable_rear_delt_fly",
    "name": "High Cable Rear Delt Fly",
    "aliases": [
      "high cable rear delt crossover"
    ],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "long_bicep_bayesian_cable_curl",
    "name": "Bayesian Cable Curl",
    "aliases": [
      "facing away cable curl"
    ],
    "muscle": "Long Bicep (Outer peak)",
    "tier": "S Tier"
  },
  {
    "id": "brachialis_preacher_hammer_curl",
    "name": "Preacher Hammer Curl",
    "aliases": [
      "dumbbell preacher hammer curl"
    ],
    "muscle": "Brachialis",
    "tier": "B Tier"
  },
  {
    "id": "long_tricep_katana_extension",
    "name": "Katana Extension (Dual Cable Overhead)",
    "aliases": [
      "katana cable extension"
    ],
    "muscle": "Long Tricep (Long Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep_cross_body_cable_tricep_extension",
    "name": "Cross-Body Cable Tricep Extension",
    "aliases": [
      "cuffed cable tricep extension"
    ],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "quads_pendulum_squat",
    "name": "Pendulum Squat",
    "aliases": [
      "pendulum squat machine"
    ],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "quads_belt_squat",
    "name": "Belt Squat",
    "aliases": [
      "pit shark belt squat"
    ],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "quads_heel_elevated_goblet_squat",
    "name": "Heel-Elevated Goblet Squat",
    "aliases": [
      "atg goblet squat"
    ],
    "muscle": "Quad Teardrop (VMO)",
    "tier": "S Tier"
  },
  {
    "id": "hamstrings_nordic_hamstring_curl",
    "name": "Nordic Hamstring Curl",
    "aliases": [
      "nordic curl",
      "natural glute ham raise"
    ],
    "muscle": "Hamstrings",
    "tier": "C Tier"
  },
  {
    "id": "hamstrings_b_stance_romanian_deadlift",
    "name": "B-Stance Romanian Deadlift",
    "aliases": [
      "b-stance rdl"
    ],
    "muscle": "Hamstrings",
    "tier": "B Tier"
  },
  {
    "id": "glutes_kas_glute_bridge",
    "name": "Kas Glute Bridge",
    "aliases": [
      "kas bridge"
    ],
    "muscle": "Glutes",
    "tier": "S Tier"
  },
  {
    "id": "abs_dragon_flag",
    "name": "Dragon Flag",
    "aliases": [
      "bruce lee dragon flag"
    ],
    "muscle": "Upper Abs",
    "tier": "C Tier"
  },
  {
    "id": "abs_cable_pallof_press",
    "name": "Cable Pallof Press",
    "aliases": [
      "pallof press"
    ],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "A Tier"
  },
  {
    "id": "upper_chest_incline_hex_press",
    "name": "Incline Hex Press",
    "aliases": [
      "dumbbell hex press",
      "incline squeeze press"
    ],
    "muscle": "Upper Chest",
    "tier": "C Tier"
  },
  {
    "id": "upper_chest_reverse_grip_incline_barbell_press",
    "name": "Reverse-Grip Incline Barbell Press",
    "aliases": [
      "reverse grip incline bench press"
    ],
    "muscle": "Upper Chest",
    "tier": "A Tier"
  },
  {
    "id": "upper_chest_cable_upper_chest_scoops",
    "name": "Cable Upper Chest Scoops",
    "aliases": [
      "low-to-high cable scoops",
      "cable chest scoops"
    ],
    "muscle": "Upper Chest",
    "tier": "C Tier"
  },
  {
    "id": "upper_chest_smith_machine_guillotine_incline_press",
    "name": "Smith Machine Guillotine Incline Press",
    "aliases": [
      "incline guillotine press"
    ],
    "muscle": "Upper Chest",
    "tier": "C Tier"
  },
  {
    "id": "upper_chest_single_arm_incline_cable_press",
    "name": "Single-Arm Incline Cable Press",
    "aliases": [
      "one arm incline cable press"
    ],
    "muscle": "Upper Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_spoto_press",
    "name": "Spoto Press",
    "aliases": [
      "paused bench press",
      "spoto bench"
    ],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_floor_dumbbell_flyes",
    "name": "Floor Dumbbell Flyes",
    "aliases": [
      "floor db fly",
      "dumbbell floor fly"
    ],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_cable_fly_constant_tension",
    "name": "Cable Fly with Constant Tension",
    "aliases": [
      "standing cable chest fly"
    ],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_resistance_band_pushups",
    "name": "Resistance Band Pushups",
    "aliases": [
      "banded pushups",
      "banded push ups"
    ],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_chest_isometric_squeeze_machine_fly",
    "name": "Isometric Squeeze Machine Fly",
    "aliases": [
      "paused machine chest fly"
    ],
    "muscle": "Mid Chest",
    "tier": "C Tier"
  },
  {
    "id": "lower_chest_gironda_dips",
    "name": "Gironda Dips (Flared Elbows)",
    "aliases": [
      "vince gironda dips",
      "pec dips"
    ],
    "muscle": "Lower Chest",
    "tier": "C Tier"
  },
  {
    "id": "lower_chest_decline_standing_cable_crossover",
    "name": "Decline Standing Cable Crossover",
    "aliases": [
      "high to low standing cable fly"
    ],
    "muscle": "Lower Chest",
    "tier": "A Tier"
  },
  {
    "id": "serratus_incline_dumbbell_pullover",
    "name": "Incline Dumbbell Pullover",
    "aliases": [
      "incline db pullover"
    ],
    "muscle": "Serratus / Pec Minor",
    "tier": "A Tier"
  },
  {
    "id": "serratus_cable_serratus_punch",
    "name": "Cable Serratus Punch",
    "aliases": [
      "cable punch",
      "serratus push"
    ],
    "muscle": "Serratus / Pec Minor",
    "tier": "C Tier"
  },
  {
    "id": "lower_chest_decline_hammer_strength_press",
    "name": "Decline Hammer Strength Press",
    "aliases": [
      "hammer strength decline chest press"
    ],
    "muscle": "Lower Chest",
    "tier": "A+ Tier"
  },
  {
    "id": "lat_width_half_kneeling_single_arm_lat_pulldown",
    "name": "Half-Kneeling Single-Arm Lat Pulldown",
    "aliases": [
      "kneeling single arm pulldown",
      "one arm kneeling pulldown"
    ],
    "muscle": "Lat Width (Lats)",
    "tier": "B Tier"
  },
  {
    "id": "lat_width_meadows_single_arm_lat_pulldown",
    "name": "Meadows Single-Arm Lat Pulldown",
    "aliases": [
      "meadows lat pulldown"
    ],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width_dual_rope_straight_arm_lat_pushdown",
    "name": "Dual-Rope Straight-Arm Lat Pushdown",
    "aliases": [
      "double rope lat pushdown",
      "long rope pullover"
    ],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "A Tier"
  },
  {
    "id": "lat_width_cross_body_cable_lat_extension",
    "name": "Cross-Body Cable Lat Extension",
    "aliases": [
      "cross body lat pullover"
    ],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "lat_width_neutral_underhand_close_grip_pulldown",
    "name": "Neutral Underhand Close-Grip Pulldown",
    "aliases": [
      "close grip reverse pulldown"
    ],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_seal_row",
    "name": "Seal Row (Bench Elevated)",
    "aliases": [
      "bench seal row",
      "elevated prone row"
    ],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_chest_supported_incline_row_45_deg",
    "name": "Chest-Supported Incline Row (45° Elbows)",
    "aliases": [
      "incline db row 45 degrees",
      "flared incline row"
    ],
    "muscle": "Upper Chest",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_fat_gripz_barbell_bent_over_row",
    "name": "Fat Gripz Barbell Bent-Over Row",
    "aliases": [
      "thick bar bent over row"
    ],
    "muscle": "Mid-Back",
    "tier": "A+ Tier"
  },
  {
    "id": "mid_back_wide_grip_seated_cable_row_to_sternum",
    "name": "Wide-Grip Seated Cable Row to Sternum",
    "aliases": [
      "wide cable row",
      "scapular retraction cable row"
    ],
    "muscle": "Mid-Back",
    "tier": "A+ Tier"
  },
  {
    "id": "mid_back_landmine_single_arm_meadows_row",
    "name": "Landmine Single-Arm Meadows Row",
    "aliases": [
      "landmine meadows row",
      "one arm landmine row"
    ],
    "muscle": "Mid-Back",
    "tier": "A Tier"
  },
  {
    "id": "mid_back_batwing_row",
    "name": "Batwing Row (Paused on Bench)",
    "aliases": [
      "batwing db row",
      "paused prone row"
    ],
    "muscle": "Mid-Back",
    "tier": "C Tier"
  },
  {
    "id": "mid_back_incline_prone_dumbbell_shrug",
    "name": "Incline Prone Dumbbell Shrug",
    "aliases": [
      "prone incline shrug",
      "lower trap shrug"
    ],
    "muscle": "Upper Traps",
    "tier": "A Tier"
  },
  {
    "id": "upper_traps_behind_the_back_smith_machine_shrug",
    "name": "Behind-the-Back Smith Machine Shrug",
    "aliases": [
      "smith machine rear shrug",
      "lee haney shrug"
    ],
    "muscle": "Upper Traps",
    "tier": "C Tier"
  },
  {
    "id": "upper_traps_trap_bar_farmers_carry",
    "name": "Trap Bar Farmer's Carry",
    "aliases": [
      "trap bar carry",
      "farmer walk with trap bar"
    ],
    "muscle": "Brachioradialis (Upper forearm)",
    "tier": "B Tier"
  },
  {
    "id": "upper_traps_cable_rope_face_pull_overhead_reach",
    "name": "Cable Rope Face Pull with Overhead Reach",
    "aliases": [
      "face pull overhead press",
      "face pull y press"
    ],
    "muscle": "Rear Delts",
    "tier": "A+ Tier"
  },
  {
    "id": "lower_back_jefferson_curl",
    "name": "Jefferson Curl",
    "aliases": [
      "jefferson curls",
      "spinal flexion deadlift"
    ],
    "muscle": "Lower Back",
    "tier": "C Tier"
  },
  {
    "id": "lower_back_snatch_grip_romanian_deadlift",
    "name": "Snatch-Grip Romanian Deadlift",
    "aliases": [
      "snatch grip rdl"
    ],
    "muscle": "Hamstrings",
    "tier": "B Tier"
  },
  {
    "id": "lower_back_45_degree_barbell_hyperextension",
    "name": "45-Degree Barbell Hyperextension",
    "aliases": [
      "weighted back extension",
      "barbell back extension"
    ],
    "muscle": "Lower Back",
    "tier": "C Tier"
  },
  {
    "id": "lower_back_zercher_good_morning",
    "name": "Zercher Good Morning",
    "aliases": [
      "zercher good mornings"
    ],
    "muscle": "Hamstrings",
    "tier": "B Tier"
  },
  {
    "id": "side_delts_behind_the_back_cable_lateral_raise",
    "name": "Behind-the-Back Cable Lateral Raise",
    "aliases": [
      "rear cable lateral raise"
    ],
    "muscle": "Side Delts",
    "tier": "S Tier"
  },
  {
    "id": "side_delts_dumbbell_lateral_raise_3s_eccentric",
    "name": "Dumbbell Lateral Raise (3s Eccentric)",
    "aliases": [
      "slow eccentric lateral raise",
      "tempo db lateral raise"
    ],
    "muscle": "Side Delts",
    "tier": "A Tier"
  },
  {
    "id": "side_delts_kneeling_cable_lateral_raise",
    "name": "Kneeling Cable Lateral Raise",
    "aliases": [
      "half kneeling lateral raise"
    ],
    "muscle": "Side Delts",
    "tier": "S Tier"
  },
  {
    "id": "side_delts_bottoms_up_kettlebell_lateral_raise",
    "name": "Bottoms-Up Kettlebell Lateral Raise",
    "aliases": [
      "kettlebell lateral raise"
    ],
    "muscle": "Side Delts",
    "tier": "B Tier"
  },
  {
    "id": "side_delts_seated_chest_supported_lateral_raise",
    "name": "Seated Chest-Supported Lateral Raise",
    "aliases": [
      "chest supported lateral raise",
      "strict seated lateral raise"
    ],
    "muscle": "Side Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_prone_incline_rear_delt_w_raise",
    "name": "Prone Incline Rear Delt W-Raise",
    "aliases": [
      "incline w raise",
      "rear delt w raise"
    ],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_cross_cable_rear_delt_fly_no_handles",
    "name": "Cross-Cable Rear Delt Fly (No Handles)",
    "aliases": [
      "cable rear delt crossover",
      "cuff rear delt fly"
    ],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_single_arm_cable_rear_delt_pull",
    "name": "Single-Arm Cable Rear Delt Pull",
    "aliases": [
      "one arm rear delt cable fly"
    ],
    "muscle": "Rear Delts",
    "tier": "B Tier"
  },
  {
    "id": "rear_delts_skiier_rear_delt_swings",
    "name": "Skiier Rear Delt Swings",
    "aliases": [
      "rear delt swings",
      "meadows rear delt swings"
    ],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "rear_delts_incline_bench_rear_delt_row",
    "name": "Incline Bench Rear Delt Row",
    "aliases": [
      "incline flared db row"
    ],
    "muscle": "Rear Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_z_press",
    "name": "Z-Press (Seated on Floor)",
    "aliases": [
      "seated z press",
      "floor overhead press"
    ],
    "muscle": "Front Delts",
    "tier": "C Tier"
  },
  {
    "id": "front_delts_half_kneeling_landmine_shoulder_press",
    "name": "Half-Kneeling Landmine Shoulder Press",
    "aliases": [
      "half kneeling landmine press"
    ],
    "muscle": "Front Delts",
    "tier": "B Tier"
  },
  {
    "id": "front_delts_dumbbell_front_raise_with_pronation",
    "name": "Dumbbell Front Raise with Pronation",
    "aliases": [
      "thumbs down front raise",
      "pronated db front raise"
    ],
    "muscle": "Front Delts",
    "tier": "B Tier"
  },
  {
    "id": "shoulders_kettlebell_halos",
    "name": "Kettlebell Halos",
    "aliases": [
      "kb halos",
      "shoulder halo"
    ],
    "muscle": "Shoulders",
    "tier": "B Tier"
  },
  {
    "id": "shoulders_cable_external_shoulder_rotation",
    "name": "Cable External Shoulder Rotation",
    "aliases": [
      "rotator cuff external rotation"
    ],
    "muscle": "Shoulders",
    "tier": "C Tier"
  },
  {
    "id": "shoulders_cuban_press",
    "name": "Cuban Press",
    "aliases": [
      "cuban rotation press"
    ],
    "muscle": "Shoulders",
    "tier": "C Tier"
  },
  {
    "id": "long_bicep_incline_dumbbell_curl_with_supination",
    "name": "Incline Dumbbell Curl with Supination",
    "aliases": [
      "incline supinating db curl"
    ],
    "muscle": "Long Bicep (Outer peak)",
    "tier": "S Tier"
  },
  {
    "id": "brachialis_cable_rope_hammer_curl",
    "name": "Cable Rope Hammer Curl",
    "aliases": [
      "rope hammer curl"
    ],
    "muscle": "Brachialis",
    "tier": "A Tier"
  },
  {
    "id": "brachialis_zottman_curl",
    "name": "Zottman Curl",
    "aliases": [
      "zottman curls"
    ],
    "muscle": "Brachialis",
    "tier": "B Tier"
  },
  {
    "id": "short_bicep_ez_bar_21s",
    "name": "EZ-Bar 21s (7-7-7)",
    "aliases": [
      "21s bicep curl",
      "bicep 21s"
    ],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "short_bicep_hercules_cable_curl",
    "name": "Hercules Cable Curl (High Pulley)",
    "aliases": [
      "high cable curl",
      "overhead bicep cable curl"
    ],
    "muscle": "Short Bicep (Inner head)",
    "tier": "C Tier"
  },
  {
    "id": "short_bicep_fat_gripz_dumbbell_preacher_curl",
    "name": "Fat Gripz Dumbbell Preacher Curl",
    "aliases": [
      "thick bar preacher curl"
    ],
    "muscle": "Short Bicep (Inner head)",
    "tier": "S Tier"
  },
  {
    "id": "brachialis_cross_body_pinwheel_curl",
    "name": "Cross-Body Pinwheel Curl",
    "aliases": [
      "pinwheel curl",
      "cross body db hammer curl"
    ],
    "muscle": "Brachialis",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep_dual_rope_tricep_pushdown",
    "name": "Dual-Rope Tricep Pushdown",
    "aliases": [
      "double rope pushdown",
      "long rope pushdowns"
    ],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "S Tier"
  },
  {
    "id": "long_tricep_floor_ez_bar_skull_crusher_dead_stop",
    "name": "Floor EZ-Bar Skull Crusher (Dead-Stop)",
    "aliases": [
      "dead stop skull crusher",
      "floor skull crushers"
    ],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier"
  },
  {
    "id": "lat_med_tricep_single_arm_reverse_grip_pushdown",
    "name": "Single-Arm Reverse Grip Pushdown",
    "aliases": [
      "one arm underhand tricep pushdown"
    ],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "long_tricep_two_handed_overhead_db_extension",
    "name": "Two-Handed Overhead DB Extension",
    "aliases": [
      "seated two arm db overhead extension"
    ],
    "muscle": "Long Tricep (Long Head)",
    "tier": "C Tier"
  },
  {
    "id": "long_tricep_incline_cable_skull_crusher_30_deg",
    "name": "Incline Cable Skull Crusher (30° Bench)",
    "aliases": [
      "incline bench cable skull crusher"
    ],
    "muscle": "Long Tricep (Long Head)",
    "tier": "A+ Tier"
  },
  {
    "id": "lat_med_tricep_barbell_bodyweight_tricep_extension",
    "name": "Barbell Bodyweight Tricep Extension",
    "aliases": [
      "bodyweight skull crusher",
      "rack tricep extension"
    ],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "lat_med_tricep_tate_press_on_flat_bench",
    "name": "Tate Press on Flat Bench",
    "aliases": [
      "dumbbell tate press"
    ],
    "muscle": "Lat/Med Tricep (Lateral / Medial Head)",
    "tier": "C Tier"
  },
  {
    "id": "forearms_behind_the_back_barbell_wrist_curl",
    "name": "Behind-the-Back Barbell Wrist Curl",
    "aliases": [
      "standing wrist curl"
    ],
    "muscle": "Forearm Flexors (Inside)",
    "tier": "A+ Tier"
  },
  {
    "id": "forearms_reverse_barbell_wrist_curl",
    "name": "Reverse Barbell Wrist Curl",
    "aliases": [
      "overhand wrist curl"
    ],
    "muscle": "Forearm Flexors (Inside)",
    "tier": "C Tier"
  },
  {
    "id": "forearms_wrist_roller",
    "name": "Wrist Roller (Plate on Rope)",
    "aliases": [
      "wrist roller extension"
    ],
    "muscle": "Forearms",
    "tier": "C Tier"
  },
  {
    "id": "forearms_dumbbell_finger_curls",
    "name": "Dumbbell Finger Curls",
    "aliases": [
      "finger curls"
    ],
    "muscle": "Forearm Flexors (Inside)",
    "tier": "C Tier"
  },
  {
    "id": "forearms_pinch_grip_plate_hold",
    "name": "Pinch-Grip Plate Hold",
    "aliases": [
      "plate pinch hold"
    ],
    "muscle": "Forearms",
    "tier": "C Tier"
  },
  {
    "id": "forearms_towel_grip_pull_ups",
    "name": "Towel Grip Pull-ups",
    "aliases": [
      "towel pullups"
    ],
    "muscle": "Lat Width (Lats)",
    "tier": "C Tier"
  },
  {
    "id": "quads_bulgarian_split_squat_front_foot_elevated",
    "name": "Bulgarian Split Squat (Front Foot Elevated)",
    "aliases": [
      "deficit bulgarian split squat"
    ],
    "muscle": "Quads",
    "tier": "A Tier"
  },
  {
    "id": "quads_cyclist_squat_heels_high_wedge",
    "name": "Cyclist Squat (Heels High Wedge)",
    "aliases": [
      "cyclist squat",
      "vmo squat"
    ],
    "muscle": "Quad Teardrop (VMO)",
    "tier": "C Tier"
  },
  {
    "id": "quads_high_box_step_up",
    "name": "High Box Step-Up",
    "aliases": [
      "deficit step up",
      "weighted high step up"
    ],
    "muscle": "Quads",
    "tier": "B Tier"
  },
  {
    "id": "quads_spanish_squat_band_behind_knees",
    "name": "Spanish Squat (Band Behind Knees)",
    "aliases": [
      "banded spanish squat"
    ],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "quads_zercher_squat",
    "name": "Zercher Squat",
    "aliases": [
      "barbell zercher squat"
    ],
    "muscle": "Quads",
    "tier": "C Tier"
  },
  {
    "id": "hamstrings_seated_leg_curl_torso_lean",
    "name": "Seated Leg Curl with Torso Lean",
    "aliases": [
      "forward lean seated leg curl"
    ],
    "muscle": "Hamstrings",
    "tier": "S Tier"
  },
  {
    "id": "hamstrings_deficit_romanian_deadlift",
    "name": "Deficit Romanian Deadlift (Standing on Plate)",
    "aliases": [
      "deficit rdl"
    ],
    "muscle": "Hamstrings",
    "tier": "B Tier"
  },
  {
    "id": "hamstrings_single_leg_kettlebell_rdl",
    "name": "Single-Leg Kettlebell RDL",
    "aliases": [
      "one leg kb rdl"
    ],
    "muscle": "Hamstrings",
    "tier": "B Tier"
  },
  {
    "id": "hamstrings_copenhagen_plank",
    "name": "Copenhagen Plank",
    "aliases": [
      "copenhagen adductor plank"
    ],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "B Tier"
  },
  {
    "id": "hamstrings_glute_ham_raise_ghr",
    "name": "Glute-Ham Raise (GHR Machine)",
    "aliases": [
      "ghr raise"
    ],
    "muscle": "Hamstrings",
    "tier": "A+ Tier"
  },
  {
    "id": "hamstrings_swiss_ball_leg_curl",
    "name": "Swiss Ball Leg Curl",
    "aliases": [
      "stability ball leg curl",
      "swiss ball hamstring curl"
    ],
    "muscle": "Hamstrings",
    "tier": "C Tier"
  },
  {
    "id": "glutes_single_leg_hip_thrust",
    "name": "Single-Leg Barbell / DB Hip Thrust",
    "aliases": [
      "one leg hip thrust"
    ],
    "muscle": "Glutes",
    "tier": "C Tier"
  },
  {
    "id": "glutes_cable_pull_through",
    "name": "Cable Pull-Through",
    "aliases": [
      "rope pull through"
    ],
    "muscle": "Glutes",
    "tier": "B Tier"
  },
  {
    "id": "glutes_curtsy_lunge",
    "name": "Curtsy Lunge",
    "aliases": [
      "dumbbell curtsy lunge"
    ],
    "muscle": "Glutes/Abductors (Outer glutes)",
    "tier": "C Tier"
  },
  {
    "id": "glutes_frog_pumps",
    "name": "Frog Pumps",
    "aliases": [
      "dumbbell frog pump"
    ],
    "muscle": "Glutes",
    "tier": "C Tier"
  },
  {
    "id": "glutes_eccentric_step_down",
    "name": "Eccentric Step-Down",
    "aliases": [
      "peterson step down"
    ],
    "muscle": "Glutes",
    "tier": "C Tier"
  },
  {
    "id": "calves_single_leg_standing_db_calf_raise",
    "name": "Single-Leg Standing DB Calf Raise",
    "aliases": [
      "one leg standing calf raise"
    ],
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "C Tier"
  },
  {
    "id": "calves_leg_press_calf_extension",
    "name": "Leg Press Calf Extension",
    "aliases": [
      "45 degree leg press calf press"
    ],
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "A+ Tier"
  },
  {
    "id": "calves_seated_tibialis_bar_raise",
    "name": "Seated Tibialis Bar Raise",
    "aliases": [
      "tib bar raise"
    ],
    "muscle": "Tibialis Anterior",
    "tier": "B Tier"
  },
  {
    "id": "calves_deficit_calf_raise_3s_stretch",
    "name": "Deficit Calf Raise with 3-Second Stretch Pause",
    "aliases": [
      "paused deficit calf raise"
    ],
    "muscle": "Gastrocnemius (Upper calf)",
    "tier": "C Tier"
  },
  {
    "id": "lower_abs_garhammer_raise",
    "name": "Garhammer Raise",
    "aliases": [
      "hanging garhammer raise"
    ],
    "muscle": "Lower Abs",
    "tier": "C Tier"
  },
  {
    "id": "abs_decline_bench_dragon_flag",
    "name": "Decline Bench Dragon Flag",
    "aliases": [
      "dragon flag on decline"
    ],
    "muscle": "Upper Abs",
    "tier": "C Tier"
  },
  {
    "id": "upper_abs_swiss_ball_crunch_extended_stretch",
    "name": "Swiss Ball Crunch (Extended Stretch)",
    "aliases": [
      "stability ball crunch"
    ],
    "muscle": "Upper Abs",
    "tier": "C Tier"
  },
  {
    "id": "lower_abs_l_sit_hold_parallettes",
    "name": "L-Sit Hold on Parallettes",
    "aliases": [
      "parallette l sit hold"
    ],
    "muscle": "Lower Abs",
    "tier": "C Tier"
  },
  {
    "id": "abs_ab_wheel_rollout_to_pike",
    "name": "Ab Wheel Rollout to Pike",
    "aliases": [
      "rollout pike"
    ],
    "muscle": "Transverse Abs (Deep core)",
    "tier": "A+ Tier"
  },
  {
    "id": "abs_hollow_body_rock",
    "name": "Hollow Body Rock",
    "aliases": [
      "gymnastic hollow rock"
    ],
    "muscle": "Upper Abs",
    "tier": "C Tier"
  },
  {
    "id": "obliques_landmine_180s",
    "name": "Landmine 180s (Rotations)",
    "aliases": [
      "landmine rotation",
      "landmine twists"
    ],
    "muscle": "Obliques",
    "tier": "B Tier"
  },
  {
    "id": "obliques_standing_low_to_high_cable_woodchopper",
    "name": "Standing Low-to-High Cable Woodchopper",
    "aliases": [
      "diagonal cable woodchopper"
    ],
    "muscle": "Obliques",
    "tier": "S Tier"
  },
  {
    "id": "obliques_side_plank_with_hip_dips",
    "name": "Side Plank with Hip Dips",
    "aliases": [
      "side plank hip drops"
    ],
    "muscle": "Obliques",
    "tier": "B Tier"
  },
  {
    "id": "obliques_heavy_suitcase_carry",
    "name": "Heavy Suitcase Carry",
    "aliases": [
      "single arm farmer walk"
    ],
    "muscle": "Obliques",
    "tier": "C Tier"
  },
  {
    "id": "obliques_kettlebell_windmill",
    "name": "Kettlebell Windmill",
    "aliases": [
      "kb windmill"
    ],
    "muscle": "Obliques",
    "tier": "B Tier"
  },
  {
    "id": "abs_bird_dog_on_bench_band",
    "name": "Bird Dog on Bench with Resistance Band",
    "aliases": [
      "banded bird dog"
    ],
    "muscle": "Transverse Abs",
    "tier": "C Tier"
  }
];

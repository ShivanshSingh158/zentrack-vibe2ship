/**
 * Gym Feature Slice — ZenTrack Mobile
 * Consolidates all Gym screens, workout hooks, biomechanics math, and lock-screen widgets.
 */

// --- Screens ---
export { default as GymHomeScreen } from '../../screens/gym/GymHomeScreen';
export { default as ActiveLoggingScreen } from '../../screens/gym/ActiveLoggingScreen';
export { default as WorkoutSummaryScreen } from '../../screens/gym/WorkoutSummaryScreen';
export { default as GymProgressScreen } from '../../screens/gym/GymProgressScreen';
export { default as GymHistoryScreen } from '../../screens/gym/GymHistoryScreen';
export { default as ExerciseDetailScreen } from '../../screens/gym/ExerciseDetailScreen';
export { default as CardioLogScreen } from '../../screens/gym/CardioLogScreen';
export { default as ExerciseSwapScreen } from '../../screens/gym/ExerciseSwapScreen';

// --- Hooks ---
export { useGymLog } from '../../hooks/useGymLog';
export { useGymPlanPreCache } from '../../hooks/useGymPlanPreCache';

// --- Biomechanics & Math Engines ---
export * from '../../services/oneRepMaxEngine';
export * from '../../utils/warmupGenerator';
export * from '../../utils/gymUtils';

// --- Audio & Rest Timer Synthesis ---
export * from '../../services/gymSoundSynthesizer';

// --- Exercise Media & Lock Screen HUD ---
export * from '../../services/exerciseMediaService';
export * from '../../services/activeWorkoutNotificationService';
export * from '../../services/progressiveOverload';

// --- Components & Skeletons ---
export { default as GymHomeSkeleton } from '../../components/Gym/GymHomeSkeleton';
export { default as AddExerciseModal } from '../../components/Gym/AddExerciseModal';
export { default as ExerciseAnimationCard } from '../../components/Gym/ExerciseAnimationCard';
export { default as BodyMetricsSheet } from '../../components/Gym/BodyMetricsSheet';

// --- Widgets ---
export { LiveWorkoutWidget } from '../../widgets/LiveWorkoutWidget';

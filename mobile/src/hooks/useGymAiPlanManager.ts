import { useCallback } from 'react';
import type { MultiDayPlanEntry } from '../components/Gym/GymAiMultiDayPlanTypes';
import type { GymPlanDay } from '../types/gym.types';
import { resolveExerciseTargetMuscle, getBiomechanicalPrescription } from '../utils/gymUtils';

export interface UseGymAiPlanManagerParams {
  log: any;
  saveLog: (log: any) => void;
  addExercise: (ex: any) => void;
  updateSet: (exIdx: number, setIdx: number, set: any) => void;
  userGymPlan: any;
  updateMasterPlan: (dayIdx: number, day: GymPlanDay) => Promise<void>;
  updateFullMasterPlan: (customDays: Record<number, GymPlanDay>) => Promise<void>;
}

export function useGymAiPlanManager({
  log,
  saveLog,
  addExercise,
  updateSet,
  userGymPlan,
  updateMasterPlan,
  updateFullMasterPlan,
}: UseGymAiPlanManagerParams) {
  const handleAiAddExercise = useCallback((name: string, targetSets: number, targetReps: string) => {
    const resolvedMuscle = resolveExerciseTargetMuscle(name).targetMuscle;
    const prescription = getBiomechanicalPrescription(name, resolvedMuscle);
    const setsCount = targetSets || prescription.targetSets || 3;
    const repsStr = targetReps || prescription.targetReps || '8-12';
    const restSecs = prescription.restTimeSecs || 90;

    addExercise({
      exerciseId: `ai_${Date.now()}`,
      name,
      targetSets: setsCount,
      targetReps: repsStr,
      muscle: resolvedMuscle,
      videoId: '',
      restTimeSecs: restSecs,
      setsLog: Array.from({ length: setsCount }, (_, i) => ({
        setNumber: i + 1,
        reps: null,
        weight: null,
        completed: false,
      })),
    });
  }, [addExercise]);

  const handleAiLogSet = useCallback((exerciseIndex: number, setIndex: number, weightKg: number, reps: number) => {
    updateSet(exerciseIndex, setIndex, {
      setNumber: setIndex + 1,
      weight: weightKg,
      reps,
      completed: true,
    });
  }, [updateSet]);

  const handleAiGenerateWorkoutPlan = useCallback((planName: string, exercises: { name: string; sets: number; reps: string }[]) => {
    if (!log) return;
    const newExercises = exercises.map((e, idx) => {
      const resolvedMuscle = resolveExerciseTargetMuscle(e.name).targetMuscle;
      const prescription = getBiomechanicalPrescription(e.name, resolvedMuscle);
      const setsCount = e.sets || prescription.targetSets || 3;
      const repsStr = e.reps || prescription.targetReps || '8-12';
      const restSecs = prescription.restTimeSecs || 90;

      return {
        exerciseId: `ai_plan_${Date.now()}_${idx}`,
        name: e.name,
        targetSets: setsCount,
        targetReps: repsStr,
        muscle: resolvedMuscle,
        videoId: '',
        restTimeSecs: restSecs,
        setsLog: Array.from({ length: setsCount }, (_, i) => ({
          setNumber: i + 1,
          reps: null,
          weight: null,
          completed: false,
        })),
      };
    });

    const completedExisting = (log.exercises || []).filter((ex: any) =>
      ex.setsLog?.some((s: any) => s.completed)
    );
    const combinedExercises = [...completedExisting, ...newExercises];

    saveLog({
      ...log,
      exercises: combinedExercises,
      updatedAt: Date.now(),
    });
  }, [log, saveLog]);

  const handleAiImportMultiDayPlan = useCallback(async (planName: string, days: MultiDayPlanEntry[]) => {
    const newCustomDays = { ...(userGymPlan?.customDays || {}) };
    for (const d of days) {
      newCustomDays[d.dayIndex] = {
        dayIndex: d.dayIndex,
        name: d.dayName,
        subtitle: d.focus || d.dayName,
        focus: d.focus || d.dayName,
        exercises: d.exercises.map((ex: any, idx: number) => {
          const resolvedMuscle = resolveExerciseTargetMuscle(ex.name, ex.muscle).targetMuscle;
          const prescription = getBiomechanicalPrescription(ex.name, resolvedMuscle);
          return {
            id: `ai_import_${d.dayIndex}_${Date.now()}_${idx}`,
            name: ex.name,
            targetSets: ex.targetSets || prescription.targetSets || 3,
            targetReps: ex.targetReps || prescription.targetReps || '8-12',
            muscle: resolvedMuscle,
            videoId: '',
            restTimeSecs: prescription.restTimeSecs || 90,
            isCompound: false,
          };
        }),
        isRest: false,
      };
    }
    await updateFullMasterPlan(newCustomDays);
  }, [userGymPlan, updateFullMasterPlan]);

  const handleAiAddExerciseToPlanDay = useCallback(async (
    dayIndex: number,
    dayName: string,
    exercise: { name: string; targetSets: number; targetReps: string; muscle?: string }
  ) => {
    const customDays = userGymPlan?.customDays || {};
    const existingDay: GymPlanDay = customDays[dayIndex] || {
      dayIndex,
      name: dayName,
      subtitle: dayName,
      focus: dayName,
      exercises: [],
      isRest: false,
    };

    const resolvedMuscle = resolveExerciseTargetMuscle(exercise.name, exercise.muscle).targetMuscle;
    const prescription = getBiomechanicalPrescription(exercise.name, resolvedMuscle);

    const newExercise = {
      id: `ai_single_${dayIndex}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: exercise.name,
      targetSets: exercise.targetSets || prescription.targetSets || 3,
      targetReps: exercise.targetReps || prescription.targetReps || '8-12',
      muscle: resolvedMuscle,
      videoId: '',
      restTimeSecs: prescription.restTimeSecs || 90,
      isCompound: false,
    };

    const updatedDay: GymPlanDay = {
      ...existingDay,
      exercises: [...(existingDay.exercises || []), newExercise],
    };

    await updateMasterPlan(dayIndex, updatedDay);
  }, [userGymPlan, updateMasterPlan]);

  return {
    handleAiAddExercise,
    handleAiLogSet,
    handleAiGenerateWorkoutPlan,
    handleAiImportMultiDayPlan,
    handleAiAddExerciseToPlanDay,
  };
}

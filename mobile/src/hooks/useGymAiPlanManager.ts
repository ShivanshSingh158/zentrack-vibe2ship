import { useCallback } from 'react';
import type { MultiDayPlanEntry } from '../components/Gym/GymAiMultiDayPlanTypes';
import type { GymPlanDay } from '../types/gym.types';

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
    addExercise({
      exerciseId: `ai_${Date.now()}`,
      name,
      targetSets,
      targetReps,
      muscle: 'Mixed',
      videoId: '',
      restTimeSecs: 90,
      setsLog: Array.from({ length: targetSets }, (_, i) => ({
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
    const newExercises = exercises.map((e, idx) => ({
      exerciseId: `ai_plan_${Date.now()}_${idx}`,
      name: e.name,
      targetSets: e.sets,
      targetReps: e.reps,
      muscle: 'Mixed',
      videoId: '',
      restTimeSecs: 90,
      setsLog: Array.from({ length: e.sets }, (_, i) => ({
        setNumber: i + 1,
        reps: null,
        weight: null,
        completed: false,
      })),
    }));

    saveLog({
      ...log,
      exercises: newExercises,
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
        exercises: d.exercises.map((ex: any, idx: number) => ({
          id: `ai_import_${d.dayIndex}_${Date.now()}_${idx}`,
          name: ex.name,
          targetSets: ex.targetSets,
          targetReps: ex.targetReps,
          muscle: ex.muscle || 'Mixed',
          videoId: '',
          restTimeSecs: 90,
          isCompound: false,
        })),
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

    const newExercise = {
      id: `ai_single_${dayIndex}_${Date.now()}`,
      name: exercise.name,
      targetSets: exercise.targetSets,
      targetReps: exercise.targetReps,
      muscle: exercise.muscle || 'Mixed',
      videoId: '',
      restTimeSecs: 90,
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

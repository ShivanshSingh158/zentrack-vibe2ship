export interface MultiDayPlanEntry {
  dayIndex: number;
  dayName: string;
  focus: string;
  exercises: { name: string; targetSets: number; targetReps: string; muscle?: string }[];
}

export interface CardioLog {
  kilometers: string;
  timeMinutes: string;
  incline: string;
}

export interface DailyLog {
  id?: string;
  userId: string;
  date: string; // YYYY-MM-DD
  wakeUpTime: string;
  sleepTime: string;
  waterIntakeLiters: number;
  productiveHours: string;
  deepWorkRating: 'distracted' | 'normal' | 'deep_focus' | '';
  gymNotes: string;
  cardio: CardioLog;
  extraWorks: string;
  mood?: number;
  sleepHours?: number;
  updatedAt: number;
  /** What subjects were studied today */
  studiedSubjects?: { subject: string; hours: number }[];
  /** Quick mood rating */
  moodRating?: 'tired' | 'okay' | 'focused' | 'stressed';
  /** Energy level 1-5 */
  energyLevel?: number;
}

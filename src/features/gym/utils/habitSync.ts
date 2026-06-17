import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { getLocalDateString } from '../../../utils/dateUtils';
import { toast } from 'sonner';
import { playPopSound } from '../../../utils/sound';

export async function syncGymHabit(userId: string) {
  if (!userId) return;
  const today = getLocalDateString(new Date());

  try {
    // Find all habits for the user
    const habitsQ = query(collection(db, 'habits'), where('userId', '==', userId));
    const snap = await getDocs(habitsQ);
    
    // Find a habit that looks like a gym habit
    let gymHabitId: string | null = null;
    let gymHabitName: string | null = null;

    snap.forEach(doc => {
      const data = doc.data();
      if (data.isArchived) return;
      const name = data.name.toLowerCase();
      if (name.includes('gym') || name.includes('workout') || name.includes('lift') || name.includes('train')) {
        gymHabitId = doc.id;
        gymHabitName = data.name;
      }
    });

    if (!gymHabitId) return; // No gym habit found, fail silently as it's optional

    // Check if a log already exists for today
    const logsQ = query(
      collection(db, 'habit_logs'),
      where('userId', '==', userId),
      where('habitId', '==', gymHabitId),
      where('date', '==', today)
    );
    
    const logsSnap = await getDocs(logsQ);
    if (!logsSnap.empty) return; // Already checked off today

    // Auto-log the habit
    await addDoc(collection(db, 'habit_logs'), {
      userId,
      habitId: gymHabitId,
      date: today,
      completed: true,
    });

    playPopSound();
    toast.success(`🎉 Habit Auto-Synced: "${gymHabitName}"`);
  } catch (error) {
    console.error('Failed to auto-sync gym habit:', error);
  }
}

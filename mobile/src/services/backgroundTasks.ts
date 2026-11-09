import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { collection, query, where, getDocs, doc, getDoc, setDoc, limit } from 'firebase/firestore';
import { auth, db } from './firebase';
import { COLLECTION } from '../config/constants';
import { formatLocalDateStr } from '../utils/dateFormatters';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const WEEKLY_REVIEW_TASK = 'BACKGROUND_WEEKLY_REVIEW';

TaskManager.defineTask(WEEKLY_REVIEW_TASK, async () => {
  try {
    const now = new Date();
    // Check if it's Sunday (0) and past 20:00 (8 PM)
    if (now.getDay() !== 0 || now.getHours() < 20) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    let userId = auth.currentUser?.uid;
    if (!userId) {
      try {
        const rawUser = await AsyncStorage.getItem('@zentrack_optimistic_user');
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          userId = parsed.uid || parsed.id;
        }
      } catch {}
    }
    if (!userId) {
      userId = (await AsyncStorage.getItem('@zentrack_uid')) || (await AsyncStorage.getItem('user_id')) || undefined;
    }
    if (!userId) return BackgroundFetch.BackgroundFetchResult.Failed;

    // Check if we already generated a review for this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = formatLocalDateStr(weekStart);

    const reviewDocId = `${userId}_${weekStartStr}`;
    const reviewDocRef = doc(db, COLLECTION.WEEKLY_REVIEWS, reviewDocId);
    const existingSnap = await getDoc(reviewDocRef);
    if (existingSnap.exists()) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Gather past 7 days data
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = formatLocalDateStr(weekEnd);

    // Query stats for the week
    const weekStartTs = weekStart.getTime();

    // 1. Tasks completed & total within week (bounded queries)
    const [tasksSnap, habitsSnap, assignSnap] = await Promise.all([
      getDocs(query(
        collection(db, COLLECTION.TASKS),
        where('userId', '==', userId),
        where('date', '>=', weekStartStr),
        where('date', '<=', weekEndStr)
      )).catch(() => getDocs(query(collection(db, COLLECTION.TASKS), where('userId', '==', userId), limit(150)))),
      getDocs(query(
        collection(db, COLLECTION.HABIT_LOGS),
        where('userId', '==', userId),
        where('date', '>=', weekStartStr),
        where('date', '<=', weekEndStr)
      )).catch(() => getDocs(query(collection(db, COLLECTION.HABIT_LOGS), where('userId', '==', userId), limit(150)))),
      getDocs(query(
        collection(db, COLLECTION.ASSIGNMENTS),
        where('userId', '==', userId),
        where('dueDate', '>=', weekStartStr),
        where('dueDate', '<=', weekEndStr)
      )).catch(() => getDocs(query(collection(db, COLLECTION.ASSIGNMENTS), where('userId', '==', userId), limit(50)))),
    ]);

    let completedTasks = 0;
    let totalTasks = tasksSnap.docs.length;
    tasksSnap.forEach(d => {
      const data = d.data();
      const isCompleted = data.status === 'completed';
      const completedAtStr = typeof data.completedAt === 'string' ? data.completedAt.slice(0, 10) : '';
      if (isCompleted || (completedAtStr >= weekStartStr && completedAtStr <= weekEndStr)) {
        completedTasks++;
      }
    });

    const habitsLogged = habitsSnap.docs.length;
    let assignmentsSubmitted = 0;
    assignSnap.forEach(d => {
      const ts = d.data().submittedAt || 0;
      if (ts >= weekStartTs) assignmentsSubmitted++;
    });

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;
    const wentWell = `Completed ${completedTasks} of ${totalTasks} tasks (${completionRate}%) and logged ${habitsLogged} habit sessions.`;
    const toImprove = completedTasks < totalTasks ? `Follow through on ${totalTasks - completedTasks} remaining pending tasks.` : 'Maintain current daily execution velocity.';
    const nextWeekPriorities = '1. Complete scheduled tasks\n2. Maintain consistent habit streaks\n3. Review upcoming course milestones';
    const gratitude = 'Consistent daily execution compounds into remarkable progress!';
    await setDoc(reviewDocRef, {
      userId,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      wentWell,
      toImprove,
      nextWeekPriorities,
      gratitude,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, { merge: true });

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export const registerWeeklyReviewTask = async () => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(WEEKLY_REVIEW_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(WEEKLY_REVIEW_TASK, {
        minimumInterval: 60 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch (err) {
    // Silently suppress — BackgroundFetch setup errors should not crash the app
    console.warn('[WeeklyReview] Background task registration failed:', err);
  }
};

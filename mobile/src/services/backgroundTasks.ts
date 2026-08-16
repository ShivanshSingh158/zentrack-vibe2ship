import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { COLLECTION } from '../config/constants';
import { callProxy, parseProxyResponse } from './geminiProxy';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const WEEKLY_REVIEW_TASK = 'BACKGROUND_WEEKLY_REVIEW';

TaskManager.defineTask(WEEKLY_REVIEW_TASK, async () => {
  try {
    const now = new Date();
    // Check if it's Sunday (0) and past 20:00 (8 PM)
    if (now.getDay() !== 0 || now.getHours() < 20) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const userId = (await AsyncStorage.getItem('@zentrack_uid')) || (await AsyncStorage.getItem('user_id'));
    if (!userId) return BackgroundFetch.BackgroundFetchResult.Failed;

    // Check if we already generated a review for this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const existingQuery = query(
      collection(db, COLLECTION.WEEKLY_REVIEWS),
      where('userId', '==', userId),
      where('weekStart', '==', weekStartStr)
    );
    const existingSnap = await getDocs(existingQuery);
    if (!existingSnap.empty) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Gather past 7 days data
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    // Query stats for the week
    const weekStartTs = weekStart.getTime();
    
    // 1. Tasks completed & total within week
    const [tasksSnap, habitsSnap, gymSnap, assignSnap] = await Promise.all([
      getDocs(query(
        collection(db, COLLECTION.TASKS),
        where('userId', '==', userId),
        where('createdAt', '>=', weekStartTs)
      )),
      getDocs(query(
        collection(db, COLLECTION.HABIT_LOGS),
        where('userId', '==', userId),
        where('date', '>=', weekStartStr)
      )),
      getDocs(query(
        collection(db, COLLECTION.GYM_LOGS),
        where('userId', '==', userId),
        where('date', '>=', weekStartStr)
      )),
      getDocs(query(
        collection(db, COLLECTION.ASSIGNMENTS),
        where('userId', '==', userId)
      )),
    ]);

    let completedTasks = 0;
    let totalTasks = tasksSnap.docs.length;
    tasksSnap.forEach(d => {
      if (d.data().status === 'completed') completedTasks++;
    });

    const habitsLogged = habitsSnap.docs.length;
    const gymSessions = gymSnap.docs.length;
    
    let assignmentsSubmitted = 0;
    assignSnap.forEach(d => {
      const ts = d.data().submittedAt || 0;
      if (ts >= weekStartTs) assignmentsSubmitted++;
    });

    const prompt = `
      You are SARA, an AI analyzing a student's week from ${weekStartStr} to ${weekEndStr}.
      User's week:
      Tasks completed: ${completedTasks}/${totalTasks}
      Habits logged: ${habitsLogged} sessions
      Gym sessions: ${gymSessions}
      Assignments submitted: ${assignmentsSubmitted}
      
      Review their activity and generate a JSON weekly review.
      Format:
      {
        "wentWell": "String analyzing what they did well this week.",
        "toImprove": "String analyzing what they struggled with.",
        "nextWeekPriorities": "String listing 3 concrete goals for next week.",
        "gratitude": "String with an encouraging note."
      }
    `;

    const response = await callProxy({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });
    
    // Parse JSON safely using our helper
    let cleanJson = '';
    try {
      const parsed = parseProxyResponse(response);
      cleanJson = parsed.text || '';
    } catch(e) {
      cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    }
    
    let data;
    try {
      data = JSON.parse(cleanJson);
    } catch(e) {
      // simple fallback regex extraction if json fails
      data = {
        wentWell: cleanJson.substring(0, 100),
        toImprove: 'Stay consistent.',
        nextWeekPriorities: 'Keep pushing forward.',
        gratitude: 'You got this!'
      };
    }

    await addDoc(collection(db, COLLECTION.WEEKLY_REVIEWS), {
      userId,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      wentWell: data.wentWell || 'Good job this week!',
      toImprove: data.toImprove || 'Stay consistent.',
      nextWeekPriorities: data.nextWeekPriorities || 'Keep pushing forward.',
      gratitude: data.gratitude || 'You got this!',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

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

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

    const userId = await AsyncStorage.getItem('@zentrack_uid');
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
    
    // 1. Tasks completed
    const tasksQ = query(
      collection(db, COLLECTION.TASKS),
      where('userId', '==', userId),
      where('status', '==', 'completed')
    );
    const tasksSnap = await getDocs(tasksQ);
    let completedTasks = 0;
    tasksSnap.forEach(d => {
      const data = d.data();
      const createdAt = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt || 0);
      if (createdAt >= weekStartTs) completedTasks++;
    });

    const allTasksQ = query(collection(db, COLLECTION.TASKS), where('userId', '==', userId));
    const allTasksSnap = await getDocs(allTasksQ);
    let totalTasks = 0;
    allTasksSnap.forEach(d => {
      const data = d.data();
      const createdAt = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt || 0);
      if (createdAt >= weekStartTs) totalTasks++;
    });

    // 2. Habits logged
    const habitsQ = query(collection(db, COLLECTION.HABIT_LOGS), where('userId', '==', userId));
    const habitsSnap = await getDocs(habitsQ);
    let habitsLogged = 0;
    habitsSnap.forEach(d => {
      const ts = d.data().timestamp;
      if (ts >= weekStartTs) habitsLogged++;
    });

    // 3. Gym sessions
    const gymQ = query(collection(db, COLLECTION.GYM_LOGS), where('userId', '==', userId));
    const gymSnap = await getDocs(gymQ);
    let gymSessions = 0;
    gymSnap.forEach(d => {
      const ts = d.data().timestamp;
      if (ts >= weekStartTs) gymSessions++;
    });

    // 4. Assignments
    const assignQ = query(collection(db, COLLECTION.ASSIGNMENTS), where('userId', '==', userId), where('status', '==', 'submitted'));
    const assignSnap = await getDocs(assignQ);
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
    await BackgroundFetch.registerTaskAsync(WEEKLY_REVIEW_TASK, {
      minimumInterval: 60 * 60, // Check every hour
      stopOnTerminate: false, 
      startOnBoot: true,
    });
  } catch (err) {
    console.error('Failed to register task:', err);
  }
};

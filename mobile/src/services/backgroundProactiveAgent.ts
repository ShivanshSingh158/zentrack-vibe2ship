import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import { db, auth } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { callProxy } from './geminiProxy';
import { COLLECTION } from '../config/constants';

import AsyncStorage from '@react-native-async-storage/async-storage';

export const BACKGROUND_AI_NUDGE = 'BACKGROUND_AI_NUDGE';

TaskManager.defineTask(BACKGROUND_AI_NUDGE, async () => {
  try {
    const userId = auth.currentUser?.uid || (await AsyncStorage.getItem('@zentrack_uid')) || (await AsyncStorage.getItem('user_id'));
    if (!userId) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const todayISO = new Date().toISOString().split('T')[0];

    // Fetch lightweight context
    const tasksSnap = await getDocs(query(collection(db, COLLECTION.TASKS), where('userId', '==', userId), where('status', '==', 'pending')));
    const tasks = tasksSnap.docs.map(d => ({ title: d.data().title, priority: d.data().priority, date: d.data().date, timeSlot: d.data().timeSlot }));
    
    const habitsSnap = await getDocs(query(collection(db, COLLECTION.HABITS), where('userId', '==', userId)));
    const logsSnap = await getDocs(query(collection(db, COLLECTION.HABIT_LOGS), where('userId', '==', userId), where('date', '==', todayISO)));
    const loggedHabitIds = new Set(logsSnap.docs.map(d => d.data().habitId));
    const missedHabits = habitsSnap.docs.map(d => d.data().name).filter((_, i) => !loggedHabitIds.has(habitsSnap.docs[i].id));

    // Construct a lightweight prompt for SARA
    const prompt = `You are Sara, a proactive AI assistant.
Current time: ${new Date().toLocaleTimeString()}
Current Date: ${todayISO}
Pending Tasks: ${JSON.stringify(tasks.slice(0, 10))}
Missed Habits Today: ${JSON.stringify(missedHabits)}

Decide if the user needs a notification nudge right now. 
Guidelines:
- If it's late afternoon/evening and P1 tasks or habits are missed, send a nudge.
- Keep the message witty, warm, and extremely concise (max 1 sentence).
- DO NOT spam the user. If they are doing fine, or it's too early to nag, shouldNotify = false.

Respond ONLY in strict JSON format: 
{"shouldNotify": boolean, "title": "Short title", "body": "Your witty message"}
Do not output markdown code blocks, just raw JSON.`;

    const res = await callProxy({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: 'You are an ultra-concise proactive JSON agent.'
    });

    const parsedText = res.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = parsedText.match(/\{.*\}/s);
    if (match) {
      const decision = JSON.parse(match[0]);
      if (decision.shouldNotify && decision.title && decision.body) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: decision.title,
            body: decision.body,
            sound: true,
          },
          trigger: null, // Send immediately
        });
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
    }

    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.error('[ProactiveAgent] Task failed:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Registers the background fetch task.
 * Called from App.tsx.
 */
export async function registerBackgroundProactiveAgent() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_AI_NUDGE);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_AI_NUDGE, {
        minimumInterval: 60 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log('[ProactiveAgent] Background AI registered successfully.');
    }
  } catch (err) {
    // Silently suppress — BackgroundFetch setup errors should not crash the app
    console.warn('[ProactiveAgent] Background task registration failed:', err);
  }
}

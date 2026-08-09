/**
 * useTimetableScanner.ts — ZenTrack Attendance Module
 *
 * ImagePicker + Gemini OCR timetable scan flow extracted from AttendanceScreen.tsx.
 * Uses a dynamic import pattern — ImagePicker is only resolved when scan is triggered,
 * keeping it off the initial parse path.
 *
 * Extracted from AttendanceScreen.tsx (was handleImportTimetable, lines 321–393).
 */
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { collection, doc, writeBatch } from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { callProxy, parseProxyResponse } from '../../services/geminiProxy';

const SCHEMA_VERSION = 2;

const TIMETABLE_PROMPT = `Extract the class timetable from this image.
Return ONLY a valid JSON array of objects, with NO markdown formatting, NO backticks, NO explanations.
Format:
[
  {
    "name": "Subject Name",
    "targetPercentage": 75,
    "schedule": {
      "1": { "classCount": 1, "labCount": 0, "classes": [{"time": "9:00 AM"}], "labs": [] },
      "2": { "classCount": 0, "labCount": 1, "classes": [], "labs": [{"time": "2:00 PM"}] }
    }
  }
]
Note: schedule keys are 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat.
Guess or summarize subject names logically if they are codes.`;

export function useTimetableScanner(userId: string | undefined) {
  const [isImporting, setIsImporting] = useState(false);

  /**
   * Dynamically imports ImagePicker only when this function is called.
   * This keeps expo-image-picker off the initial parse path.
   */
  const handleImportTimetable = useCallback(async () => {
    if (!userId) return;
    try {
      // Dynamic import — only loads when user actually taps the scan button
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setIsImporting(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const response = await callProxy({
          model: 'gemini-2.5-flash',
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: result.assets[0].base64 } },
              { text: TIMETABLE_PROMPT },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: 'application/json' },
        });

        const { text } = parseProxyResponse(response);
        if (!text) throw new Error('Could not parse schedule JSON.');

        const parsedSubjects = JSON.parse(text);
        if (!Array.isArray(parsedSubjects) || parsedSubjects.length === 0) {
          throw new Error('No subjects found.');
        }

        const batch = writeBatch(db);
        parsedSubjects.forEach((sub: any) => {
          const docRef = doc(collection(db, COLLECTION.ATTENDANCE));
          batch.set(docRef, {
            ...sub,
            userId,
            classesAttended: 0,
            classesTotal: 0,
            labsAttended: 0,
            labsTotal: 0,
            schemaVersion: SCHEMA_VERSION,
          });
        });

        await batch.commit();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', `Imported ${parsedSubjects.length} subjects from timetable.`);
      }
    } catch (e: any) {
      console.warn('Import failed:', e.message);
      Alert.alert('Import Failed', e.message || 'Could not read the timetable.');
    } finally {
      setIsImporting(false);
    }
  }, [userId]);

  return { isImporting, handleImportTimetable };
}

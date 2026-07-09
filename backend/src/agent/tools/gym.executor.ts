import type { ToolResult } from './shared';
import { db, auth } from '../../services/firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc, orderBy, limit } from '../../services/firebase';

export async function executeGymTools(
  toolName: string,
  args: any,
  appContext: any,
  signal?: AbortSignal,
  depth: number = 0
): Promise<ToolResult | null> {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    return { success: false, data: null, message: 'User not authenticated.' };
  }

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  switch (toolName) {
    case 'log_gym_session': {
      const { date = todayStr(), exerciseName, sets } = args;
      console.log(`[GAINS] Logging ${exerciseName} for ${date}`);
      
      try {
        const docId = `${userId}_${date}`;
        const logRef = doc(db, 'gymLogs', docId);
        const logSnap = await getDoc(logRef);
        
        let gymLog: any = logSnap.exists() ? logSnap.data() : {
          userId, date, dayPlanIndex: 1, exercises: [], cardio: [], createdAt: Date.now(), updatedAt: Date.now()
        };

        // Find if exercise already exists in today's log, otherwise create it
        let exIndex = gymLog.exercises.findIndex((e: any) => e.name.toLowerCase() === exerciseName.toLowerCase());
        
        if (exIndex === -1) {
          gymLog.exercises.push({
            id: Math.random().toString(36).substring(2, 10),
            exerciseId: exerciseName.toLowerCase().replace(/\\s+/g, '-'),
            name: exerciseName,
            targetSets: sets.length,
            targetReps: sets[0]?.reps || 10,
            muscle: 'Unknown',
            isCustom: true,
            setsLog: sets.map((s: any, i: number) => ({
              setNumber: i + 1,
              reps: s.reps,
              weight: s.weight,
              completed: true
            }))
          });
        } else {
          // Update existing exercise sets
          gymLog.exercises[exIndex].setsLog = sets.map((s: any, i: number) => ({
            setNumber: i + 1,
            reps: s.reps,
            weight: s.weight,
            completed: true
          }));
        }

        gymLog.updatedAt = Date.now();
        await setDoc(logRef, gymLog);

        return {
          success: true,
          data: { date, exerciseName, setsLogged: sets.length },
          message: `Successfully logged ${sets.length} sets of ${exerciseName} for ${date}.`,
        };
      } catch (error: any) {
        return { success: false, data: null, message: `Failed to log session: ${error.message}` };
      }
    }

    case 'get_progressive_overload_suggestion': {
      const { exerciseName } = args;
      console.log(`[GAINS] Calculating progressive overload for: "${exerciseName}"`);
      
      try {
        // Query the last 30 days of gym logs to find the most recent time they did this exercise
        const q = query(
          collection(db, 'gymLogs'),
          where('userId', '==', userId),
          orderBy('date', 'desc'),
          limit(14)
        );
        
        const snaps = await getDocs(q);
        let lastPerformance = null;
        let lastDate = null;

        for (const docSnap of snaps.docs) {
          const data = docSnap.data();
          const ex = data.exercises?.find((e: any) => e.name.toLowerCase().includes(exerciseName.toLowerCase()));
          
          if (ex) {
            // Found the last time they did it!
            const completedSets = ex.setsLog?.filter((s: any) => s.completed && s.weight > 0);
            if (completedSets && completedSets.length > 0) {
              // Find the max weight used in a completed set
              const maxSet = completedSets.reduce((max: any, set: any) => set.weight > max.weight ? set : max, completedSets[0]);
              lastPerformance = {
                reps: maxSet.reps,
                weight: maxSet.weight,
                targetReps: ex.targetReps || 10
              };
              lastDate = data.date;
              break;
            }
          }
        }

        if (!lastPerformance) {
          return {
            success: true,
            data: { suggestion: `No recent history found for ${exerciseName}. Start with a light warm-up and test your 10-rep max.` },
            message: `No recent history found for ${exerciseName}.`
          };
        }

        // Basic Progressive Overload Formula
        // If they hit the target reps (e.g. 10), add 2.5kg. Otherwise, keep same weight.
        const hitTarget = lastPerformance.reps >= lastPerformance.targetReps;
        const suggestedWeight = hitTarget ? lastPerformance.weight + 2.5 : lastPerformance.weight;
        const reason = hitTarget 
          ? `You hit ${lastPerformance.reps} reps last time (target: ${lastPerformance.targetReps}). Adding 2.5kg.`
          : `You got ${lastPerformance.reps} reps last time (target: ${lastPerformance.targetReps}). Keep the same weight and aim for more reps.`;

        return {
          success: true,
          data: { 
            lastDate,
            lastPerformance,
            suggestedWeight,
            targetReps: lastPerformance.targetReps,
            reason
          },
          message: `Based on your last session on ${lastDate}, you should aim for ${lastPerformance.targetReps} reps at ${suggestedWeight}kg.`
        };
      } catch (error: any) {
        return { success: false, data: null, message: `Failed to calculate overload: ${error.message}` };
      }
    }

    case 'get_gym_weekly_summary': {
      const { targetDate = todayStr() } = args;
      console.log(`[GAINS] Fetching weekly summary ending on ${targetDate}`);
      
      try {
        const d = new Date(targetDate);
        d.setDate(d.getDate() - 7);
        const sevenDaysAgo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const q = query(
          collection(db, 'gymLogs'),
          where('userId', '==', userId),
          where('date', '>=', sevenDaysAgo),
          where('date', '<=', targetDate)
        );
        
        const snaps = await getDocs(q);
        const muscleGroupsHit: Record<string, number> = {};
        let totalSets = 0;
        let daysTrained = 0;

        snaps.forEach(docSnap => {
          const data = docSnap.data();
          let trainedToday = false;
          
          if (data.exercises && data.exercises.length > 0) {
            data.exercises.forEach((ex: any) => {
              const completedSets = ex.setsLog?.filter((s: any) => s.completed).length || 0;
              if (completedSets > 0) {
                trainedToday = true;
                totalSets += completedSets;
                const m = ex.muscle || 'Other';
                muscleGroupsHit[m] = (muscleGroupsHit[m] || 0) + completedSets;
              }
            });
          }
          if (trainedToday) daysTrained++;
        });

        let overtrainingWarning = null;
        if (daysTrained >= 6) overtrainingWarning = 'You have trained 6+ days this week. Consider a rest day for CNS recovery.';

        return {
          success: true,
          data: { 
            daysTrained,
            restDays: 7 - daysTrained,
            totalSets,
            muscleGroupsHit,
            overtrainingWarning
          },
          message: `You trained ${daysTrained} days this week, completing ${totalSets} total sets.`
        };
      } catch (error: any) {
        return { success: false, data: null, message: `Failed to fetch weekly summary: ${error.message}` };
      }
    }

    default:
      return null;
  }
}

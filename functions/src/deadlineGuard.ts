import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize admin app if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

export const deadlineGuard = functions.pubsub.schedule('every 30 minutes').onRun(async (context) => {
  const users = await db.collection('users').get();
  const now = new Date();
  
  // Helper to get YYYY-MM-DD in local time (naive approach for cron job)
  const getLocalDateString = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const todayStr = getLocalDateString(now);

  for (const user of users.docs) {
    // Check for active tasks that are due before today
    const tasks = await db.collection('todos')
      .where('userId', '==', user.id)
      .where('status', '!=', 'completed')
      .where('date', '<', todayStr)
      .get();
      
    // Fetch FCM token for this user
    const fcmDoc = await db.collection('fcm_tokens').doc(user.id).get();
    
    if (!tasks.empty && fcmDoc.exists) {
      const fcmToken = fcmDoc.data()?.token;
      if (fcmToken) {
        try {
          await admin.messaging().send({
            token: fcmToken,
            notification: { 
              title: '🚨 Deadline Alert', 
              body: `You have ${tasks.size} overdue items detected. Open ZenTrack to triage.` 
            }
          });
        } catch (error) {
          console.error(`Failed to send FCM push to user ${user.id}:`, error);
        }
      }
    }
  }
});

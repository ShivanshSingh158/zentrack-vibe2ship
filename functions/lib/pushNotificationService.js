"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processScheduledReminders = exports.processPushNotificationQueue = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
// Make sure admin is initialized (this is usually done in index.ts or other services)
if (!admin.apps.length) {
    admin.initializeApp();
}
/**
 * Listens for new documents in the `pushNotificationQueue` collection.
 * When a request is queued by the frontend, this cloud function picks it up,
 * retrieves the target users' FCM tokens from their user records,
 * and securely sends the push notification via Firebase Admin SDK.
 */
exports.processPushNotificationQueue = functions.firestore
    .document('pushNotificationQueue/{docId}')
    .onCreate(async (snap, context) => {
    const payload = snap.data();
    if (!payload.userIds || !Array.isArray(payload.userIds) || payload.userIds.length === 0) {
        console.log('No userIds provided in notification payload');
        return snap.ref.update({ status: 'error', error: 'No userIds provided' });
    }
    try {
        const tokens = [];
        // Fetch FCM tokens for all target users
        for (const userId of payload.userIds) {
            const tokenDoc = await admin.firestore().collection('fcm_tokens').doc(userId).get();
            if (tokenDoc.exists) {
                const tokenData = tokenDoc.data();
                if (tokenData && tokenData.token) {
                    tokens.push(tokenData.token);
                }
            }
        }
        if (tokens.length === 0) {
            console.log('No valid FCM tokens found for target users');
            return snap.ref.update({ status: 'error', error: 'No valid tokens found' });
        }
        const message = {
            notification: {
                title: payload.title || 'ZenTrack Alert',
                body: payload.body || '',
            },
            data: {
                url: payload.url || '/',
                tag: payload.tag || 'general'
            },
            tokens: tokens,
        };
        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);
        return snap.ref.update({
            status: 'processed',
            successCount: response.successCount,
            failureCount: response.failureCount,
            processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    catch (error) {
        console.error('Error processing push notification queue:', error);
        return snap.ref.update({ status: 'error', error: error.message });
    }
});
/**
 * Runs every minute to process scheduled reminders.
 */
exports.processScheduledReminders = functions.pubsub
    .schedule('every 1 minutes').onRun(async () => {
    const now = new Date().toISOString();
    const due = await admin.firestore().collection('scheduledReminders')
        .where('status', '==', 'pending')
        .where('fireAt', '<=', now).get();
    const promises = due.docs.map(async (rem) => {
        try {
            const d = rem.data();
            const tokenDoc = await admin.firestore().collection('fcm_tokens').doc(d.userId).get();
            if (tokenDoc.exists) {
                const token = tokenDoc.data()?.token;
                if (token) {
                    await admin.messaging().send({
                        token: token,
                        notification: { title: '🧠 Zen AI Reminder', body: d.message }
                    });
                }
            }
            await rem.ref.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        catch (e) {
            console.error(`Failed to process reminder ${rem.id}:`, e);
            // Mark as error so it doesn't poison the queue infinitely
            await rem.ref.update({ status: 'error', error: e.message, failedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(console.error);
        }
    });
    await Promise.allSettled(promises);
});
//# sourceMappingURL=pushNotificationService.js.map
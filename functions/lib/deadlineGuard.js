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
exports.deadlineGuard = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
// Initialize admin app if not already initialized
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
exports.deadlineGuard = functions.pubsub.schedule('every 30 minutes').onRun(async (context) => {
    const users = await db.collection('users').get();
    const now = new Date();
    // Helper to get YYYY-MM-DD in local time (naive approach for cron job)
    const getLocalDateString = (d) => {
        const pad = (n) => n.toString().padStart(2, '0');
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
                }
                catch (error) {
                    console.error(`Failed to send FCM push to user ${user.id}:`, error);
                }
            }
        }
    }
});
//# sourceMappingURL=deadlineGuard.js.map
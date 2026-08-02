import express from 'express';

// Import all refactored routes — .js extension is REQUIRED for Node.js ESM resolution
import cronGuardian from '../server/routes/cron-guardian.js';
import cronWatchdog from '../server/routes/cron-watchdog.js';
import dailyBriefing from '../server/routes/daily-briefing.js';
import forceLogout from '../server/routes/force-logout.js';
import geminiProxyStream from '../server/routes/gemini-proxy-stream.js';
import geminiProxy from '../server/routes/gemini-proxy.js';
import search from '../server/routes/search.js';
import sendNotification from '../server/routes/send-notification.js';
import sendSms from '../server/routes/send-sms.js';
import transcript from '../server/routes/transcript.js';
import youtube from '../server/routes/youtube.js';
import authGoogle from '../server/routes/auth/google.js';
import authRefresh from '../server/routes/auth/refresh.js';

const app = express();

// Parse JSON bodies natively (formerly handled automatically by Vercel for each route)
app.use(express.json({ limit: '50mb' }));

// Mount all routes
app.use('/api/cron-guardian', cronGuardian);
app.use('/api/cron-watchdog', cronWatchdog);
app.use('/api/daily-briefing', dailyBriefing);
app.use('/api/force-logout', forceLogout);
app.use('/api/gemini-proxy-stream', geminiProxyStream);
app.use('/api/gemini-proxy', geminiProxy);
app.use('/api/search', search);
app.use('/api/send-notification', sendNotification);
app.use('/api/send-sms', sendSms);
app.use('/api/transcript', transcript);
app.use('/api/youtube', youtube);
app.use('/api/auth/google', authGoogle);
app.use('/api/auth/refresh', authRefresh);

export default app;

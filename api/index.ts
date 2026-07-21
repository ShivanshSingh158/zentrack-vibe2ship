import express from 'express';

// Import all refactored routes
import cronGuardian from '../server/routes/cron-guardian';
import cronWatchdog from '../server/routes/cron-watchdog';
import dailyBriefing from '../server/routes/daily-briefing';
import forceLogout from '../server/routes/force-logout';
import geminiProxyStream from '../server/routes/gemini-proxy-stream';
import geminiProxy from '../server/routes/gemini-proxy';
import search from '../server/routes/search';
import sendNotification from '../server/routes/send-notification';
import sendSms from '../server/routes/send-sms';
import transcript from '../server/routes/transcript';
import youtube from '../server/routes/youtube';
import authGoogle from '../server/routes/auth/google';
import authRefresh from '../server/routes/auth/refresh';

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

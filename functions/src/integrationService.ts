import * as functions from 'firebase-functions';

export const syncGoogleCalendar = functions.pubsub.schedule('every 15 minutes').onRun(async (context) => {
  // Google API connectors (Calendar, Gmail, etc.)
  console.log("Running integration sync...");
});

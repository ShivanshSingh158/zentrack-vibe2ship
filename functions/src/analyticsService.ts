import * as functions from 'firebase-functions';

export const exportToBigQuery = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
  // BigQuery + Looker Studio export
  console.log("Exporting daily metrics to BigQuery...");
});

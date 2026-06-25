import * as functions from 'firebase-functions';

export const enqueueAgentJob = functions.tasks.taskQueue().onDispatch(async (data) => {
  // Cloud Tasks + Redis queue consumer
  console.log("Processing async agent job:", data);
});

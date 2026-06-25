import * as functions from 'firebase-functions';

export const agentOrchestrator = functions.https.onCall(async (data, context) => {
  // Routes user requests to appropriate agents
  // Expects: { intent: string, payload: any }
  return { status: "success", routedTo: "PlannerAgent" };
});

/**
 * handleSyncError
 * 
 * Production-grade error handler for Firebase/Firestore operations.
 * Logs the error passively without displaying blocking Alert modals,
 * allowing optimistic UI updates and background offline retry / persistence
 * to handle sync seamlessly without interrupting the user.
 */
export function handleSyncError(error: any) {
  console.warn(
    '[Sync Handler] Cloud write encountered network/sync latency (offline queue & optimistic state active):',
    error?.message || error
  );
}

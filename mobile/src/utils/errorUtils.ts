import { Alert } from 'react-native';

/**
 * handleSyncError
 * 
 * Production-grade error handler for Firebase/Firestore operations.
 * Logs the error for debugging, but crucially displays a user-friendly
 * alert so the user knows their data was NOT saved to the cloud.
 */
export function handleSyncError(error: any) {
  console.error('[Sync Error] Database operation failed:', error);
  
  Alert.alert(
    'Sync Failed',
    'We could not save your changes to the cloud. Please check your connection and try again.',
    [{ text: 'OK' }]
  );
}

import { io } from 'socket.io-client';
import { auth } from '../services/firebase';

// In production, this will connect to your deployed Render/Railway backend.
// In development, it defaults to your local machine.
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export const orchestrateAgent = (
  instruction: string,
  appContext: any,
  apiKey: string,
  onStep: (step: any) => void,
  history?: any[],
  signal?: AbortSignal,
  googleAccessToken?: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      console.log('Connected to backend agent engine');
      const user = auth.currentUser;
      
      socket.emit('execute-mission', {
        prompt: instruction,
        history,
        googleAccessToken,
        userId: user?.uid
      });
    });

    socket.on('agent-log', (step) => {
      onStep(step);
      if (step.type === 'answer') {
        socket.disconnect();
        resolve(step.title);
      }
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      reject(new Error('Failed to connect to backend engine: ' + err.message));
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        socket.disconnect();
        reject(new Error('Mission aborted by user'));
      });
    }
  });
};

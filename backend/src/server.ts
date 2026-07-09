import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { orchestrateAgent } from './agent/orchestrator';

dotenv.config();

import { contextStorage } from './services/firebase';

// Mock localStorage for backend compatibility during migration
(global as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

// Mock window for backend compatibility (routes CustomEvents to the user's socket)
(global as any).window = {
  dispatchEvent: (event: any) => {
    const socket = contextStorage.getStore()?.socket;
    if (socket) {
      // Forward the event type and detail directly to the connected frontend client
      socket.emit(event.type, event.detail || {});
    }
  }
};

// Mock CustomEvent
(global as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, options?: { detail?: any }) {
    this.type = type;
    this.detail = options?.detail;
  }
};

// Initialize Firebase Admin (requires service account key in production)
// const serviceAccount = require('./serviceAccountKey.json');
// initializeApp({ credential: cert(serviceAccount) });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Health check endpoint for cron-job.org to keep the server awake
app.get('/health', (req, res) => {
  res.status(200).send('ZenTrack Backend is Awake');
});

// Socket.io connection for real-time agent logs
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('execute-mission', async (data) => {
    const { prompt, history, googleAccessToken, userId } = data;
    
    const onStep = (step: any) => {
      socket.emit('agent-log', step);
    };

    try {
      socket.emit('agent-log', { type: 'thinking', title: 'ATHENA initializing DAG workflow on backend...' });
      
      // Wrap the entire execution in AsyncLocalStorage context so tools can access tokens
      await contextStorage.run({ user: { uid: userId }, googleAccessToken, socket }, async () => {
        const result = await orchestrateAgent(prompt, {}, '', onStep, history, undefined, googleAccessToken);
        socket.emit('agent-log', { type: 'answer', title: result });
      });
    } catch (err: any) {
      console.error('Mission failed:', err);
      socket.emit('agent-log', { type: 'thinking', title: `⚠️ Backend Error: ${err.message}` });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`ZenTrack Backend Agent Engine running on port ${PORT}`);
});

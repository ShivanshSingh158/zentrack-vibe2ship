type LogType = 'API' | 'WEBSOCKET';

export interface NetworkLog {
  id: string;
  type: LogType;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  endpoint?: string;
  event?: string;
  payload: unknown;
  status: 'pending' | 'success' | 'error';
  timestamp: number;
}

export const logApi = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', endpoint: string, payload: unknown = {}, status: 'pending' | 'success' | 'error' = 'success') => {
  const log: NetworkLog = {
    id: Math.random().toString(36).substring(2, 9),
    type: 'API',
    method,
    endpoint,
    payload,
    status,
    timestamp: Date.now()
  };
  window.dispatchEvent(new CustomEvent('network-log', { detail: log }));
};

export const logWebSocket = (event: string, payload: any = {}) => {
  const log: NetworkLog = {
    id: Math.random().toString(36).substring(2, 9),
    type: 'WEBSOCKET',
    event,
    payload,
    status: 'success',
    timestamp: Date.now()
  };
  window.dispatchEvent(new CustomEvent('network-log', { detail: log }));
};

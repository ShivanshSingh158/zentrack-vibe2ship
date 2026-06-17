import { useState, useEffect } from 'react';

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const LiveTimer = ({ startTime }: { startTime: number }) => {
  const [elapsed, setElapsed] = useState(Date.now() - startTime);
  
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(id);
  }, [startTime]);
  
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(elapsed)}</span>;
};

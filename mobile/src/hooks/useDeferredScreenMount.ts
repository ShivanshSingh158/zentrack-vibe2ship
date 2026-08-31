import { useState, useEffect } from 'react';

export function useDeferredScreenMount() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Exactly 1 animation frame (~16ms) to allow the navigator transition to start smoothly
    const frameId = requestAnimationFrame(() => {
      if (!cancelled) setIsReady(true);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, []);

  return isReady;
}

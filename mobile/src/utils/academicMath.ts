/**
 * academicMath.ts - ZenTrack Mobile
 * Helper math for attendance bunk prediction and GPA calculation.
 */

export interface BunkMathResult {
  status: 'safe' | 'warning' | 'critical';
  message: string;
  count: number;
}

export interface RawBunkCountResult {
  status: 'safe' | 'warning' | 'critical';
  count: number;
}

/**
 * Pure numeric calculation: returns status and count with ZERO string allocations.
 * Ideal for notification schedulers, list metrics, and badge checks.
 */
export function getBunkCount(attended: number, total: number, rawTargetPct: number = 75): RawBunkCountResult {
  if (total === 0) {
    return { status: 'safe', count: 0 };
  }
  const targetPct = Math.min(99, Math.max(1, rawTargetPct));
  const currentPct = (attended / total) * 100;

  if (currentPct >= targetPct) {
    const canMiss = Math.floor((100 * attended - targetPct * total) / targetPct);
    return canMiss > 0 ? { status: 'safe', count: canMiss } : { status: 'warning', count: 0 };
  } else {
    const needed = Math.ceil((targetPct * total - 100 * attended) / (100 - targetPct));
    return { status: 'critical', count: needed };
  }
}

export function calculateBunkMath(attended: number, total: number, rawTargetPct: number = 75): BunkMathResult {
  if (total === 0) {
    return { status: 'safe', message: 'No classes yet.', count: 0 };
  }

  const targetPct = Math.min(99, Math.max(1, rawTargetPct));
  const { status, count } = getBunkCount(attended, total, targetPct);

  if (status === 'safe') {
    return {
      status,
      message: `You can safely bunk ${count} class${count === 1 ? '' : 'es'} and stay above ${targetPct}%`,
      count,
    };
  } else if (status === 'warning') {
    return {
      status,
      message: `On the edge! Missing the next class drops you below ${targetPct}%`,
      count: 0,
    };
  } else {
    return {
      status,
      message: `You need to attend ${count} consecutive class${count === 1 ? '' : 'es'} to reach ${targetPct}%`,
      count,
    };
  }
}

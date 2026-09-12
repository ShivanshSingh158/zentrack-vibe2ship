/**
 * academicMath.ts - ZenTrack Mobile
 * Helper math for attendance bunk prediction and GPA calculation.
 */

export interface BunkMathResult {
  status: 'safe' | 'warning' | 'critical';
  message: string;
  count: number;
}

export function calculateBunkMath(attended: number, total: number, targetPct: number = 75): BunkMathResult {
  if (total === 0) {
    return { status: 'safe', message: 'No classes yet.', count: 0 };
  }

  // Fix #7: Guard impossible/degenerate targets
  if (targetPct >= 100) {
    if (attended >= total) {
      return { status: 'warning', message: 'Perfect attendance required — you cannot miss any class.', count: 0 };
    }
    const deficit = total - attended;
    return {
      status: 'critical',
      message: `100% target — you've already missed ${deficit} class${deficit === 1 ? '' : 'es'}. Recovery is impossible.`,
      count: deficit,
    };
  }

  if (targetPct <= 0) {
    return { status: 'safe', message: 'Target is 0% — you can miss any class.', count: total };
  }

  const currentPct = (attended / total) * 100;

  if (currentPct >= targetPct) {
    // How many can we miss and stay >= target?
    // (attended) / (total + y) >= target/100
    // 100 * attended >= targetPct * (total + y)
    // y <= (100 * attended - targetPct * total) / targetPct
    // Fix #8: Use integer-scaled arithmetic to avoid IEEE 754 float errors.
    // e.g. Math.floor((0.75 / 0.75)) = Math.floor(0.9999999999999999) = 0 (wrong!)
    // But Math.floor((100 * 3 - 75 * 4) / 75) = Math.floor(0) = 0 (correct edge)
    const canMiss = Math.floor((100 * attended - targetPct * total) / targetPct);
    
    if (canMiss > 0) {
      return { 
        status: 'safe', 
        message: `You can safely bunk ${canMiss} class${canMiss === 1 ? '' : 'es'} and stay above ${targetPct}%`, 
        count: canMiss 
      };
    } else {
      return { 
        status: 'warning', 
        message: `On the edge! Missing the next class drops you below ${targetPct}%`, 
        count: 0 
      };
    }
  } else {
    // How many do we need to attend consecutively to reach target?
    // (attended + x) / (total + x) >= targetPct/100
    // 100 * (attended + x) >= targetPct * (total + x)
    // x * (100 - targetPct) >= targetPct * total - 100 * attended
    // x >= (targetPct * total - 100 * attended) / (100 - targetPct)
    const needed = Math.ceil((targetPct * total - 100 * attended) / (100 - targetPct));
    
    return { 
      status: 'critical', 
      message: `You need to attend ${needed} consecutive class${needed === 1 ? '' : 'es'} to reach ${targetPct}%`, 
      count: needed 
    };
  }
}

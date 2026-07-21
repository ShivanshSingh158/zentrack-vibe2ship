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

  const currentPct = (attended / total) * 100;
  const target = targetPct / 100;

  if (currentPct >= targetPct) {
    // How many can we miss and stay >= target?
    // (attended) / (total + y) >= target
    // attended >= target * total + target * y
    // y <= (attended - target * total) / target
    const canMiss = Math.floor((attended - target * total) / target);
    
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
    // (attended + x) / (total + x) >= target
    // attended + x >= target * total + target * x
    // x * (1 - target) >= target * total - attended
    // x >= (target * total - attended) / (1 - target)
    const needed = Math.ceil((target * total - attended) / (1 - target));
    
    return { 
      status: 'critical', 
      message: `You need to attend ${needed} consecutive class${needed === 1 ? '' : 'es'} to reach ${targetPct}%`, 
      count: needed 
    };
  }
}

/**
 * mascotConstants.ts — ZenTrack Mobile
 *
 * Mascot image assets and level gradient palettes extracted from UnifiedLifeWidget.
 */

export const MASCOT_IMAGES: Record<string, any> = {
  'Seeker': require('../../../assets/mascots/level0.png'),
  'Warden': require('../../../assets/mascots/level1.png'),
  'Sentinel': require('../../../assets/mascots/level3.png'),
  'Guardian': require('../../../assets/mascots/level2.png'),
  'Vanguard': require('../../../assets/mascots/level4.png'),
  'Luminary': require('../../../assets/mascots/level5.png'),
  'Legend': require('../../../assets/mascots/level6.png'),
  'Mythic': require('../../../assets/mascots/level7.png'),
  'Paragon': require('../../../assets/mascots/level8.png'),
  'Titan': require('../../../assets/mascots/level9.png'),
  'Ascendant': require('../../../assets/mascots/level10.png'),
  'Exalted': require('../../../assets/mascots/level11.png'),
  'Sovereign': require('../../../assets/mascots/level12.png'),
  'Archon': require('../../../assets/mascots/level13.png'),
  'Celestial': require('../../../assets/mascots/level14.png'),
  'Ethereal': require('../../../assets/mascots/level15.png'),
  'Empyrean': require('../../../assets/mascots/level16.png'),
  'Astral': require('../../../assets/mascots/level17.png'),
  'Zenith': require('../../../assets/mascots/level18.png'),
  'Apex': require('../../../assets/mascots/level19.png'),
};

export const getGradientForLevel = (level: string): [string, string] => {
  switch (level) {
    case 'Seeker':    return ['#34d399', '#22d3ee'];
    case 'Warden':    return ['#22d3ee', '#3b82f6'];
    case 'Sentinel':  return ['#14b8a6', '#0ea5e9'];
    case 'Guardian':  return ['#a78bfa', '#ec4899'];
    case 'Vanguard':  return ['#818cf8', '#c084fc'];
    case 'Luminary':  return ['#fbbf24', '#f43f5e'];
    case 'Legend':    return ['#f59e0b', '#d97706'];
    case 'Mythic':    return ['#ec4899', '#8b5cf6'];
    case 'Paragon':   return ['#06b6d4', '#3b82f6'];
    case 'Titan':     return ['#e11d48', '#be123c'];
    case 'Ascendant': return ['#6366f1', '#a855f7'];
    case 'Exalted':   return ['#eab308', '#f97316'];
    case 'Sovereign': return ['#8b5cf6', '#d946ef'];
    case 'Archon':    return ['#3b82f6', '#1d4ed8'];
    case 'Celestial': return ['#0ea5e9', '#6366f1'];
    case 'Ethereal':  return ['#10b981', '#06b6d4'];
    case 'Empyrean':  return ['#f43f5e', '#fb7185'];
    case 'Astral':    return ['#a855f7', '#6366f1'];
    case 'Zenith':    return ['#f97316', '#e11d48'];
    case 'Apex':      return ['#ffd700', '#ff4500'];
    default:          return ['#a599ff', '#6c5ce7'];
  }
};

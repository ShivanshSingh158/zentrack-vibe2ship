export const MUSCLE_COLORS: Record<string, string> = {
  'Chest': '#FF6B6B', 'Back': '#4DABF7', 'Shoulders': '#9775FA',
  'Side Delts': '#B197FC', 'Rear Delts': '#845EF7', 'Triceps': '#38D9A9',
  'Biceps': '#3BC9DB', 'Brachialis': '#22B8CF', 'Forearms': '#15AABF',
  'Quads': '#FF922B', 'Hamstrings': '#FF7849', 'Glutes/Hams': '#FF8787',
  'Quads/Glutes': '#FFA94D', 'Calves': '#A9E34B', 'Soleus': '#8CE99A',
  'Abs': '#FF8787', 'Core': '#FA5252', 'Obliques': '#E64980',
  'Upper Back / Rear Delts': '#AE3EC9', 'Serratus / Pec Minor': '#F08C00',
};

export const resolveMuscleColor = (m: string | undefined | null) => {
  if (!m) return '#a855f7';
  const found = Object.keys(MUSCLE_COLORS).find(k => k.toLowerCase() === m.toLowerCase());
  return found ? MUSCLE_COLORS[found] : '#a855f7';
};

export const hexToRgba = (hex: string, alpha: number = 1): string => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex[1] + hex[2], 16);
    g = parseInt(hex[3] + hex[4], 16);
    b = parseInt(hex[5] + hex[6], 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const calculateGymStreak = (logs: any[] | null | undefined): number => {
  if (!logs || logs.length === 0) return 0;
  
  const loggedDates = new Set(
    logs.filter(l => (l.exercises && l.exercises.length > 0) || (l.cardio && l.cardio.length > 0) || l.workoutDurationMinutes > 0)
        .map(l => l.date)
  );

  let streak = 0;
  let d = new Date();
  
  const toDateStr = (date: Date) => {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  };

  const todayStr = toDateStr(d);
  if (loggedDates.has(todayStr)) {
    streak++;
  }

  d.setDate(d.getDate() - 1);
  while (true) {
    const dStr = toDateStr(d);
    if (loggedDates.has(dStr)) {
      streak++;
    } else if (d.getDay() !== 0) { // If it's not Sunday and not logged, streak breaks
      break;
    }
    d.setDate(d.getDate() - 1);
  }
  
  return streak;
};

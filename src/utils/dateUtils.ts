export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const monthName = MONTHS[parseInt(m, 10) - 1];
    return `${d}-${monthName}-${y}`;
  }
  return dateStr;
}



export function formatHoursDisplay(val: string | number | undefined): string {
  if (val === undefined || val === null || val === '') return '';
  
  // Try parsing as decimal hours
  let numVal = typeof val === 'string' ? parseFloat(val) : val;
  
  if (isNaN(numVal)) {
    // Maybe they typed "50 min" already, just return it
    return String(val);
  }

  // Convert decimal hours to minutes
  const totalMinutes = Math.round(numVal * 60);
  
  if (totalMinutes === 0) return '0 min';
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours > 0 && minutes > 0) {
    return `${hours} hr ${minutes} min`;
  } else if (hours > 0) {
    return `${hours} hr`;
  } else {
    return `${minutes} min`;
  }
}

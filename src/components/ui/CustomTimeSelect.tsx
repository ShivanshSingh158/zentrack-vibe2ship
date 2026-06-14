import React from 'react';

export const CustomTimeSelect = ({ 
  value, 
  onChange, 
  label, 
  defaultPeriod 
}: { 
  value: string, 
  onChange: (v: string) => void, 
  label: string, 
  defaultPeriod: 'AM' | 'PM' 
}) => {
  const [h24Str, mStr] = value ? value.split(':') : ['', ''];
  const h24 = h24Str ? parseInt(h24Str, 10) : -1;
  const period = h24 >= 0 ? (h24 >= 12 ? 'PM' : 'AM') : defaultPeriod;
  let h12 = h24 >= 0 ? h24 % 12 : '';
  if (h12 === 0) h12 = 12;
  const m = mStr || '';

  const updateTime = (newH12: string, newM: string, newP: string) => {
    if (!newH12 && !newM) {
      onChange('');
      return;
    }
    const h = parseInt(newH12 || '12', 10);
    const min = newM || '00';
    let finalH24 = h;
    if (newP === 'PM' && h !== 12) finalH24 += 12;
    if (newP === 'AM' && h === 12) finalH24 = 0;
    onChange(`${finalH24.toString().padStart(2, '0')}:${min}`);
  };

  return (
    <div className="log-form-group">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <select 
          value={h12} 
          onChange={(e) => updateTime(e.target.value, m, period)} 
          className="log-input" 
          style={{ flex: 1, textAlign: 'center', padding: '0.5rem' }}
        >
          <option value="">HH</option>
          {Array.from({length: 12}).map((_, i) => (
            <option key={i+1} value={i+1}>{i+1}</option>
          ))}
        </select>
        <span style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', color: 'var(--text-primary)' }}>:</span>
        <select 
          value={m} 
          onChange={(e) => updateTime(h12.toString(), e.target.value, period)} 
          className="log-input" 
          style={{ flex: 1, textAlign: 'center', padding: '0.5rem' }}
        >
          <option value="">MM</option>
          {Array.from({length: 60}).map((_, i) => (
            <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>
          ))}
        </select>
        <select 
          value={period} 
          onChange={(e) => updateTime(h12.toString(), m, e.target.value)} 
          className="log-input" 
          style={{ flex: 1, textAlign: 'center', padding: '0.5rem' }}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
};

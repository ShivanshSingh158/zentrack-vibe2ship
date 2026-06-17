import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, addDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { Scale, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { BodyweightLog } from '../../../types/gym.types';
import { toast } from 'sonner';

interface BodyweightTrackerProps {
  userId: string | null;
}

const fmtDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const BodyweightTracker = ({ userId }: BodyweightTrackerProps) => {
  const [logs, setLogs] = useState<BodyweightLog[]>([]);
  const [inputKg, setInputKg] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  const fetchLogs = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    try {
      const q = query(
        collection(db, 'bodyweightLogs'),
        where('userId', '==', userId),
        orderBy('date', 'desc'),
        limit(30)
      );
      const snap = await getDocs(q);
      const fetched: BodyweightLog[] = [];
      snap.forEach(d => fetched.push(d.data() as BodyweightLog));
      // Sort ascending for chart
      fetched.sort((a, b) => a.date.localeCompare(b.date));
      setLogs(fetched);
    } catch {
      // Fallback without orderBy if index missing
      try {
        const q2 = query(collection(db, 'bodyweightLogs'), where('userId', '==', userId));
        const snap = await getDocs(q2);
        const fetched: BodyweightLog[] = [];
        snap.forEach(d => fetched.push(d.data() as BodyweightLog));
        fetched.sort((a, b) => a.date.localeCompare(b.date));
        setLogs(fetched.slice(-30));
      } catch (err) {
        console.error('Failed to load bodyweight logs', err);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const logWeight = async () => {
    if (!userId || !inputKg.trim()) return;
    const kg = parseFloat(inputKg);
    if (isNaN(kg) || kg < 20 || kg > 400) { toast.error('Enter a valid weight (20–400 kg)'); return; }
    setSaving(true);
    try {
      const entry: BodyweightLog = { userId, date: today, weightKg: kg, loggedAt: Date.now() };
      await addDoc(collection(db, 'bodyweightLogs'), entry);
      setInputKg('');
      toast.success(`✅ Weight logged: ${kg}kg`);
      fetchLogs();
    } catch (err) {
      toast.error('Failed to save weight');
    } finally {
      setSaving(false);
    }
  };

  const todayLog = logs.find(l => l.date === today);
  const latest = logs[logs.length - 1];
  const previous = logs.length >= 2 ? logs[logs.length - 2] : null;
  const change = latest && previous ? parseFloat((latest.weightKg - previous.weightKg).toFixed(1)) : null;
  const avgWeight = logs.length > 0
    ? parseFloat((logs.reduce((s, l) => s + l.weightKg, 0) / logs.length).toFixed(1))
    : null;

  const chartData = logs.map(l => ({ date: fmtDate(l.date), kg: l.weightKg }));

  return (
    <div style={{ margin: '0.85rem 1rem 0', padding: '1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Scale size={15} color="#a855f7" />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>Body Weight</span>
        </div>
        {latest && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>{latest.weightKg}kg</span>
            {change !== null && change !== 0 && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: change < 0 ? '#1db954' : '#ef4444', display: 'flex', alignItems: 'center', gap: '0.1rem' }}>
                {change > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {change > 0 ? '+' : ''}{change}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Log today */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="number"
            value={inputKg}
            onChange={e => setInputKg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && logWeight()}
            placeholder={todayLog ? `Today: ${todayLog.weightKg}kg (update)` : 'Enter today\'s weight (kg)'}
            style={{
              width: '100%', padding: '0.6rem 0.8rem', borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          onClick={logWeight}
          disabled={saving || !inputKg}
          style={{
            padding: '0 0.85rem', borderRadius: '10px', border: 'none',
            background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff',
            fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0,
            opacity: saving || !inputKg ? 0.5 : 1,
          }}
        >
          <Plus size={14} /> Log
        </button>
      </div>

      {/* Stats row */}
      {logs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '0.85rem' }}>
          {[
            { label: 'Latest', value: `${latest?.weightKg}kg`, color: '#a855f7' },
            { label: '30d Avg', value: avgWeight ? `${avgWeight}kg` : '—', color: '#fff' },
            { label: 'Change', value: change !== null ? `${change > 0 ? '+' : ''}${change}kg` : '—', color: change !== null ? (change <= 0 ? '#1db954' : '#ef4444') : '#fff' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '0.5rem 0.6rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginTop: '0.1rem' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Line chart */}
      {chartData.length >= 2 ? (
        <div style={{ height: '130px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.25)" fontSize={9} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis stroke="rgba(255,255,255,0.25)" fontSize={9} axisLine={false} tickLine={false} domain={['auto', 'auto']} tickFormatter={v => `${v}`} />
              {avgWeight && <ReferenceLine y={avgWeight} stroke="rgba(168,85,247,0.35)" strokeDasharray="4 3" />}
              <Tooltip
                contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                itemStyle={{ color: '#a855f7' }}
                formatter={(val: any) => [`${val}kg`, 'Weight']}
              />
              <Line type="monotone" dataKey="kg" stroke="#a855f7" strokeWidth={2} dot={{ r: 3, fill: '#a855f7' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '1rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem' }}>Loading…</div>
      ) : (
        <div style={{ textAlign: 'center', padding: '1rem 0.5rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem' }}>
          Log at least 2 entries to see your trend graph
        </div>
      )}
    </div>
  );
};

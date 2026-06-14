import { Clock } from 'lucide-react';

interface TimeboxTimelineProps {
  tasks: any[];
}

export const TimeboxTimeline = ({ tasks }: TimeboxTimelineProps) => {
  const scheduledTasks = tasks
    .filter(t => t.timeSlot)
    .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const calculateEndTime = (startStr: string, durationMins: number) => {
    if (!startStr) return '';
    const [h, m] = startStr.split(':').map(Number);
    const totalMins = h * 60 + m + (durationMins || 0);
    const endH = Math.floor(totalMins / 60) % 24;
    const endM = totalMins % 60;
    return formatTime(`${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`);
  };

  return (
    <div style={{
      marginBottom: '2rem',
      background: 'rgba(20, 20, 25, 0.6)',
      backdropFilter: 'blur(12px)',
      borderRadius: '24px',
      border: '1px solid rgba(255,255,255,0.05)',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 0.5rem' }}>
        <Clock size={16} style={{ color: 'var(--accent-primary)' }} />
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Today's Schedule
        </h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{scheduledTasks.length} blocks planned</span>
      </div>

      {scheduledTasks.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          No time blocks scheduled yet. Use Quick Add to plan your day!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {scheduledTasks.map(task => {
            const startStr = formatTime(task.timeSlot);
            const endStr = calculateEndTime(task.timeSlot, task.estimatedMinutes);
            
            return (
              <div key={task.id} style={{
                display: 'flex',
                alignItems: 'stretch',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.05)',
                overflow: 'hidden',
                transition: 'transform 0.2s',
                cursor: 'default'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
              >
                {/* Time Column */}
                <div style={{ 
                  padding: '1rem', 
                  background: 'rgba(168,85,247,0.1)', 
                  borderRight: '1px solid rgba(168,85,247,0.2)',
                  minWidth: '130px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>{startStr}</span>
                  <span style={{ fontSize: '0.7rem', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>to</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{endStr}</span>
                </div>

                {/* Task Details */}
                <div style={{ padding: '1rem 1.25rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 500, color: '#fff', marginBottom: '0.4rem' }}>
                    {task.text}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      ⏱ {task.estimatedMinutes} min
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: task.priority === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', color: task.priority === 'high' ? '#ef4444' : 'var(--text-muted)' }}>
                      {task.priority.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
};

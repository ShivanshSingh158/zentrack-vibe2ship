import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Users, Video, MapPin, AlignLeft, Calendar as CalendarIcon, Check, List, Trash2 } from 'lucide-react';
import { EVENT_COLORS } from './CalendarModule';

interface EventPopoverProps {
  x: number;
  y: number;
  initialDate: string;
  initialStartTime: string;
  initialEndTime: string;
  onClose: () => void;
  onSave: (data: {
    title: string;
    type: string;
    date: string;
    startTime: string;
    endTime: string;
    guests: string[];
    meetLink: string;
    location: string;
    description: string;
  }) => void;
  existingEvent?: any;
  onDelete?: (id: string) => void;
}

export const EventPopover: React.FC<EventPopoverProps> = ({
  x, y, initialDate, initialStartTime, initialEndTime, onClose, onSave, existingEvent, onDelete
}) => {
  const [tab, setTab] = useState<'event' | 'task' | 'appointment'>(existingEvent ? (existingEvent.type === 'todo' ? 'task' : 'event') : 'event');
  const [title, setTitle] = useState(existingEvent?.title || '');
  const [type, setType] = useState(existingEvent?.type || 'todo'); // Default mapped to "task"
  const [date, setDate] = useState(existingEvent?.date || initialDate);
  const [startTime, setStartTime] = useState(existingEvent?.startTime || initialStartTime);
  const [endTime, setEndTime] = useState(existingEvent?.endTime || initialEndTime);
  const [location, setLocation] = useState(existingEvent?.location || '');
  const [description, setDescription] = useState(existingEvent?.description || '');
  const [addMeet, setAddMeet] = useState(!!existingEvent?.meetLink);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverHeight, setPopoverHeight] = useState(500);

  useEffect(() => {
    if (popoverRef.current) {
      setPopoverHeight(popoverRef.current.offsetHeight);
    }
  }, [tab, showColorPicker]);

  // Position adjustment to prevent overflow and stay strictly within the viewport
  const adjustedX = Math.max(16, Math.min(x, window.innerWidth - 420));
  const adjustedY = Math.max(16, Math.min(y, window.innerHeight - popoverHeight - 16));

  const handleSave = () => {
    onSave({
      title: title || '(No title)',
      type: tab === 'task' ? 'todo' : type,
      date,
      startTime,
      endTime,
      guests: [],
      meetLink: addMeet ? 'https://meet.google.com/new' : '',
      location,
      description
    });
  };


  // Convert "HH:MM" to "H:MMam/pm" for display
  const formatTime = (time: string) => {
    if (!time) return '';
    const [hStr, mStr] = time.split(':');
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}:${mStr}${ampm}`;
  };

  // Format date to "Tuesday, June 23"
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  };

  return (
    <motion.div
      ref={popoverRef}
      drag
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'fixed',
        top: adjustedY,
        left: adjustedX,
        width: '400px',
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        background: 'var(--bg-elevated)',
        backdropFilter: 'blur(24px)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-elevated)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)'
      }}
    >
      {/* Header toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f1f3f405', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
        <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/></svg>
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          {existingEvent && onDelete && (
            <button onClick={() => onDelete(existingEvent.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#9AA0A6', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = '#9AA0A6'}>
              <Trash2 size={18} />
            </button>
          )}
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#9AA0A6', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = '#9AA0A6'}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div style={{ padding: '0 24px 24px 24px' }}>
        {/* Title Input */}
        <input
          type="text"
          placeholder="Add title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: '2px solid var(--accent-primary)',
            color: 'var(--text-primary)',
            fontSize: '22px',
            padding: '8px 0',
            marginBottom: '16px',
            outline: 'none',
            fontFamily: 'var(--font-display)',
            fontWeight: 500
          }}
        />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
          {(['event', 'task', 'appointment'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? 'var(--bg-surface-active)' : 'transparent',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: tab === t ? '1px solid var(--border-glow)' : '1px solid transparent',
                borderRadius: 'var(--radius-md)',
                padding: '6px 16px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all 0.2s ease',
                boxShadow: tab === t ? 'var(--shadow-glow)' : 'none'
              }}
            >
              {t} {t === 'appointment' && <span style={{ background: 'var(--accent-gradient)', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '12px', marginLeft: '6px', fontWeight: 600 }}>New</span>}
            </button>
          ))}
        </div>

        {/* Rows */}
        <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Time Row */}
          <motion.div layout style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <Clock size={20} color="var(--text-secondary)" style={{ marginTop: '2px' }} />
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: '4px' }}>
                {formatDate(date)} &nbsp; {formatTime(startTime)} – {formatTime(endTime)}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Time zone • Does not repeat</div>
            </div>
          </motion.div>


          {/* Event Specific Rows */}
          <AnimatePresence initial={false}>
            {tab === 'event' && (
              <motion.div
                key="event-rows"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '16px' }}
              >
                {/* Meet Row */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <Video size={20} color="var(--text-secondary)" />
                  {!addMeet ? (
                    <button 
                      onClick={() => setAddMeet(true)}
                      style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '8px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                      Add Google Meet video conferencing
                    </button>
                  ) : (
                    <div style={{ color: 'var(--accent-primary)', fontSize: '14px', cursor: 'pointer', fontWeight: 500 }}>Join with Google Meet</div>
                  )}
                </div>

                {/* Location Row */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <MapPin size={20} color="var(--text-secondary)" />
                  <input
                    type="text"
                    placeholder="Add location"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '14px', padding: '8px 12px', outline: 'none' }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Description Row */}
          <motion.div layout style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <AlignLeft size={20} color="var(--text-secondary)" style={{ marginTop: '10px' }} />
            <textarea
              placeholder="Add description or a Google Drive attachment"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '14px', padding: '8px 12px', outline: 'none', resize: 'none' }}
            />
          </motion.div>

          {/* Task Specific Rows */}
          <AnimatePresence initial={false}>
            {tab === 'task' && (
              <motion.div
                key="task-rows"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                style={{ overflow: 'hidden', display: 'flex', gap: '16px', alignItems: 'center' }}
              >
                <List size={20} color="var(--text-secondary)" />
                <button
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '6px 12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  My Tasks
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Calendar Select Row */}
          <motion.div layout style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <CalendarIcon size={20} color="var(--text-secondary)" />
            <div style={{ position: 'relative' }}>
              <div 
                onClick={() => setShowColorPicker(!showColorPicker)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--bg-surface)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}
              >
                <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>shivansh Singh</div>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: EVENT_COLORS[type]?.color || 'var(--accent-primary)', boxShadow: '0 0 8px ' + (EVENT_COLORS[type]?.color || 'var(--accent-primary)') }} />
              </div>
              
              {showColorPicker && tab === 'event' && (
                <div style={{ position: 'absolute', top: '100%', left: '0', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginTop: '8px', zIndex: 10, boxShadow: 'var(--shadow-elevated)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(16px)' }}>
                  {Object.entries(EVENT_COLORS).filter(([k]) => k !== 'gcal').map(([key, cfg]) => (
                    <div 
                      key={key} 
                      onClick={() => { setType(key); setShowColorPicker(false); }}
                      style={{ width: '24px', height: '24px', borderRadius: '50%', background: cfg.color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: type === key ? `0 0 12px ${cfg.color}` : 'none', border: type === key ? '2px solid #fff' : '2px solid transparent' }}
                    >
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginLeft: 'auto', textAlign: 'right' }}>
              Busy • Default visibility<br/>Notify 30 mins before
            </div>
          </motion.div>

        </motion.div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '32px', gap: '16px' }}>
          <button 
            onClick={handleSave}
            style={{ background: 'var(--accent-gradient)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 28px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--shadow-glow)', transition: 'transform 0.1s' }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            Save
          </button>
        </div>

      </div>
    </motion.div>
  );
};

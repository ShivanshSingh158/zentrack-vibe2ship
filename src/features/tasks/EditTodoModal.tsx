import React, { useState, useEffect } from 'react';
import { X, Save, Calendar as CalendarIcon, Timer, Repeat, Tag, AlertCircle } from 'lucide-react';
import type { TodoItem } from '../../types/index';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { toast } from 'sonner';

interface EditTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: TodoItem | null;
}

export const EditTodoModal: React.FC<EditTodoModalProps> = ({ isOpen, onClose, todo }) => {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<TodoItem['priority']>('medium');
  const [isRecurring, setIsRecurring] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState('');
  const [commitmentTo, setCommitmentTo] = useState('');
  const [energyRequirement, setEnergyRequirement] = useState<TodoItem['energyRequirement']>('medium');

  useEffect(() => {
    if (todo && isOpen) {
      setText(todo.title || '');
      setPriority(todo.priority || 'medium');
      setIsRecurring(todo.isRecurring || false);
      setEstimatedMinutes(todo.estimatedMinutes ? todo.estimatedMinutes.toString() : '');
      setSubject(todo.subject || '');
      setDate(todo.date || '');
      setCommitmentTo(todo.commitmentTo || '');
      setEnergyRequirement(todo.energyRequirement || 'medium');
    }
  }, [todo, isOpen]);

  if (!isOpen || !todo) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      const updates: Partial<TodoItem> = {
        title: text.trim(),
        priority,
        isRecurring,
        date: date || '',
        subject: subject.trim() || '',
        estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : 0,
        commitmentTo: commitmentTo.trim() || '',
        energyRequirement,
      };

      await updateDoc(doc(db, 'todos', todo.id!), updates);
      toast.success('Task updated!');
      onClose();
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(9, 9, 11, 0.85)',
      backdropFilter: 'blur(8px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      animation: 'fadeIn 0.2s ease'
    }}>
      <div className="bottom-sheet-mobile" style={{
        backgroundColor: 'var(--bg-panel)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        width: '100%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>Edit Task</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSave} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Task Description</label>
            <input 
              type="text" 
              value={text}
              onChange={e => setText(e.target.value)}
              autoFocus
              className="todo-input"
              style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}><AlertCircle size={14}/> Priority</label>
              <select 
                value={priority}
                onChange={e => setPriority(e.target.value as TodoItem['priority'])}
                className="priority-select"
                style={{ width: '100%', padding: '0.6rem', fontSize: '0.9rem' }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}><CalendarIcon size={14}/> Date</label>
              <input 
                type="date" 
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}><Tag size={14}/> Subject</label>
              <input 
                type="text" 
                placeholder="e.g. Math, Coding"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}><Timer size={14}/> Est. Minutes</label>
              <input 
                type="number" 
                placeholder="25"
                min="1"
                value={estimatedMinutes}
                onChange={e => setEstimatedMinutes(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🤝 Promised To</label>
              <input 
                type="text" 
                placeholder="e.g. Professor Smith, Mom"
                value={commitmentTo}
                onChange={e => setCommitmentTo(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>⚡ Energy Reqd.</label>
              <select 
                value={energyRequirement}
                onChange={e => setEnergyRequirement(e.target.value as TodoItem['energyRequirement'])}
                style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
              >
                <option value="low">Low (Mechanical)</option>
                <option value="medium">Medium</option>
                <option value="high">High (Deep Focus)</option>
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '1rem', background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <input 
              type="checkbox" 
              checked={isRecurring}
              onChange={e => setIsRecurring(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Repeat size={14} /> Make this a daily recurring habit</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>It will automatically respawn tomorrow if completed today.</span>
            </div>
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '0.6rem 1.25rem' }}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Save size={16} /> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

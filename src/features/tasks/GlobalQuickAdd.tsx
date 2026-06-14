import { useState, useEffect, useRef } from 'react';
import { Plus, ListTodo, Briefcase, BookOpen } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { getLocalDateString } from '../../utils/dateUtils';
import { toast } from 'sonner';

export const GlobalQuickAdd = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'task' | 'job' | 'note'>('task');
  const inputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');

  // Global Cmd+I / Ctrl+I handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setTitle('');
      setSubtitle('');
      setType('task');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
      if (type === 'task') {
        await addDoc(collection(db, 'todos'), {
          userId: user.uid,
          text: title.trim(),
          priority: 'medium',
          isCompleted: false,
          date: getLocalDateString(new Date()),
          createdAt: Date.now(),
          subTasks: []
        });
        toast.success('Task instantly added');
      } else if (type === 'job') {
        await addDoc(collection(db, 'job_applications'), {
          userId: user.uid,
          company: title.trim(),
          role: subtitle.trim() || 'Software Engineer',
          status: 'applied',
          dateApplied: getLocalDateString(new Date()),
          notes: '',
          salary: '',
          url: '',
          timeline: [{
            id: Date.now().toString(),
            status: 'applied',
            date: getLocalDateString(new Date()),
            note: 'Quick added'
          }],
          createdAt: Date.now()
        });
        toast.success('Job instantly added');
      } else if (type === 'note') {
        await addDoc(collection(db, 'notes'), {
          userId: user.uid,
          title: title.trim(),
          content: '',
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        toast.success('Note instantly added');
      }

      setIsOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to add item');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay" 
      onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
      style={{ alignItems: 'flex-start', paddingTop: '15vh', zIndex: 1100 }}
    >
      <div style={{
        width: '100%',
        maxWidth: '500px',
        background: 'var(--bg-base)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 40px 80px -20px rgba(0, 0, 0, 0.8)',
        animation: 'slideUp 0.3s var(--spring-bouncy)',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <Plus size={18} style={{ color: 'var(--accent-primary)' }} />
            Quick Add
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-surface)', padding: '0.25rem', borderRadius: 'var(--radius-sm)' }}>
            <button
              type="button"
              onClick={() => setType('task')}
              style={{
                background: type === 'task' ? 'var(--bg-surface-active)' : 'transparent',
                color: type === 'task' ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none', padding: '0.25rem 0.75rem', borderRadius: '4px',
                fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem'
              }}
            >
              <ListTodo size={14} /> Task
            </button>
            <button
              type="button"
              onClick={() => setType('job')}
              style={{
                background: type === 'job' ? 'var(--bg-surface-active)' : 'transparent',
                color: type === 'job' ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none', padding: '0.25rem 0.75rem', borderRadius: '4px',
                fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem'
              }}
            >
              <Briefcase size={14} /> Job
            </button>
            <button
              type="button"
              onClick={() => setType('note')}
              style={{
                background: type === 'note' ? 'var(--bg-surface-active)' : 'transparent',
                color: type === 'note' ? 'var(--text-primary)' : 'var(--text-muted)',
                border: 'none', padding: '0.25rem 0.75rem', borderRadius: '4px',
                fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem'
              }}
            >
              <BookOpen size={14} /> Note
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {type === 'task' ? 'Task Name' : type === 'job' ? 'Company Name' : 'Note Title'}
            </label>
            <input
              ref={inputRef}
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={type === 'task' ? "What needs to be done?" : type === 'job' ? "e.g., Google, Stripe" : "New thought or idea..."}
              style={{
                width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                fontSize: '1rem'
              }}
            />
          </div>

          {type === 'job' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Role (Optional)</label>
              <input
                type="text"
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                placeholder="e.g., Frontend Engineer"
                style={{
                  width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                  fontSize: '1rem'
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={() => setIsOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">
              {type === 'task' ? 'Add Task' : type === 'job' ? 'Add Job' : 'Add Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

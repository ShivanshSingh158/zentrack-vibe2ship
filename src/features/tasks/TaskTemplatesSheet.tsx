import React, { useState, useEffect } from 'react';
import { Copy, Plus, Trash2, X, Check, Clock, ListChecks, Repeat } from 'lucide-react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { TaskTemplate } from '../../types';

interface TaskTemplatesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTemplate: (template: TaskTemplate) => void;
}

export const TaskTemplatesSheet: React.FC<TaskTemplatesSheetProps> = ({
  isOpen,
  onClose,
  onApplyTemplate,
}) => {
  const user = auth.currentUser;
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [newSubtasks, setNewSubtasks] = useState<{ id: string; title: string; completed: boolean }[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);

  useEffect(() => {
    if (isOpen && user) {
      loadTemplates();
    }
  }, [isOpen, user]);

  const loadTemplates = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'task_templates'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskTemplate));

      if (fetched.length === 0) {
        // Seed default templates
        const defaultTemplate: Omit<TaskTemplate, 'id'> = {
          userId: user.uid,
          title: 'Morning Routine',
          priority: 'medium',
          timeSlot: '08:00 AM - 09:00 AM',
          subtasks: [
            { id: 'st1', title: 'Make bed & hydrate', completed: false },
            { id: 'st2', title: 'Review today\'s top 3 goals', completed: false },
            { id: 'st3', title: '15-min light stretching/meditation', completed: false },
          ],
        };
        const ref = await addDoc(collection(db, 'task_templates'), {
          ...defaultTemplate,
          createdAt: serverTimestamp(),
        });
        setTemplates([{ id: ref.id, ...defaultTemplate }]);
      } else {
        setTemplates(fetched);
      }
    } catch (e) {
      console.error('Failed to load task templates:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!user || !newTitle.trim()) return;
    const timeSlot = newStartTime ? (newEndTime ? `${newStartTime} - ${newEndTime}` : newStartTime) : undefined;
    const newTemplate: Omit<TaskTemplate, 'id'> = {
      userId: user.uid,
      title: newTitle.trim(),
      priority: newPriority,
      timeSlot,
      subtasks: newSubtasks.filter(s => s.title.trim()),
      isRecurring,
      recurringDays: isRecurring ? recurringDays : undefined,
    };

    try {
      const ref = await addDoc(collection(db, 'task_templates'), {
        ...newTemplate,
        createdAt: serverTimestamp(),
      });
      setTemplates(prev => [...prev, { id: ref.id, ...newTemplate }]);
      setIsCreating(false);
      resetForm();
    } catch (e) {
      console.error('Failed to create template:', e);
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewPriority('medium');
    setNewStartTime('');
    setNewEndTime('');
    setNewSubtasks([]);
    setIsRecurring(false);
    setRecurringDays([]);
  };

  const addSubtaskInput = () => {
    setNewSubtasks(prev => [...prev, { id: Date.now().toString(), title: '', completed: false }]);
  };

  if (!isOpen) return null;

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="task-modal-card templates-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="templates-header">
          <div className="templates-header-left">
            <Copy size={22} color="#a599ff" />
            <div>
              <h3>Task Templates</h3>
              <p className="templates-sub">Quickly create routine tasks with pre-configured subtasks.</p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="templates-loading">Loading templates...</div>
        ) : isCreating ? (
          <div className="templates-form-container">
            <div className="templates-form-group">
              <label>Template Name</label>
              <input
                type="text"
                placeholder="e.g. Deep Work Session"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="templates-input"
              />
            </div>

            <div className="templates-form-group">
              <label>Priority</label>
              <div className="templates-priority-row">
                {(['low', 'medium', 'high'] as const).map(p => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setNewPriority(p)}
                    className={`templates-priority-btn ${newPriority === p ? 'active' : ''} ${p}`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="templates-form-group">
              <label>Time Slot (Optional)</label>
              <div className="templates-times-row">
                <input
                  type="text"
                  placeholder="Start (e.g. 09:00 AM)"
                  value={newStartTime}
                  onChange={e => setNewStartTime(e.target.value)}
                  className="templates-input"
                />
                <input
                  type="text"
                  placeholder="End (e.g. 11:00 AM)"
                  value={newEndTime}
                  onChange={e => setNewEndTime(e.target.value)}
                  className="templates-input"
                />
              </div>
            </div>

            <div className="templates-form-group">
              <div className="subtask-header-row">
                <label>Subtasks</label>
                <button type="button" className="add-subtask-text-btn" onClick={addSubtaskInput}>
                  <Plus size={14} /> Add Subtask
                </button>
              </div>
              {newSubtasks.map((st, i) => (
                <div key={st.id} className="templates-subtask-row">
                  <span className="bullet-dot" />
                  <input
                    type="text"
                    placeholder="Subtask name"
                    value={st.title}
                    onChange={e => setNewSubtasks(prev => prev.map((item, idx) => idx === i ? { ...item, title: e.target.value } : item))}
                    className="templates-input"
                  />
                  <button
                    type="button"
                    className="remove-subtask-btn"
                    onClick={() => setNewSubtasks(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="templates-actions-row">
              <button
                type="button"
                className="templates-cancel-btn"
                onClick={() => { setIsCreating(false); resetForm(); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="templates-save-btn"
                onClick={handleSaveTemplate}
              >
                Save Template
              </button>
            </div>
          </div>
        ) : (
          <div className="templates-list-container">
            {templates.map(t => (
              <div
                key={t.id}
                className="template-card"
                onClick={() => {
                  onApplyTemplate(t);
                  onClose();
                }}
              >
                <div className="template-card-title">{t.title}</div>
                <div className="template-card-meta">
                  {t.isRecurring && (
                    <span className="meta-pill"><Repeat size={12} /> Recurring</span>
                  )}
                  {t.timeSlot && (
                    <span className="meta-pill"><Clock size={12} /> {t.timeSlot}</span>
                  )}
                  <span className="meta-pill"><ListChecks size={12} /> {t.subtasks?.length || 0} subtasks</span>
                  <span className={`priority-tag ${t.priority || 'medium'}`}>{(t.priority || 'medium').toUpperCase()}</span>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="create-template-btn"
              onClick={() => setIsCreating(true)}
            >
              <Plus size={16} />
              <span>Create New Template</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

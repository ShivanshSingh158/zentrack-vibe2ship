import { useState, useEffect, useRef } from 'react';
import { Search, ListTodo, BookOpen, Activity, Briefcase, Plus, Droplets, Timer, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { usePomodoroContext } from '../contexts/PomodoroContext';
import { getLocalDateString, formatDisplayDate, formatHoursDisplay } from '../utils/dateUtils';
import { toast } from 'sonner';

interface SearchResult {
  type: 'todo' | 'learning' | 'log' | 'action' | 'note' | 'calendar';
  title: string;
  subtitle: string;
  route?: string;
  action?: () => void | Promise<void>;
  icon?: any;
}

export const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [allData, setAllData] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { startTimer } = usePomodoroContext();

  // Global Ctrl+Shift+Z handler and Custom Event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    const handleOpenEvent = () => setIsOpen(true);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleOpenEvent);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleOpenEvent);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      if (!isLoaded) loadAllData();
    } else {
      setSearchQuery('');
      setResults([]);
    }
  }, [isOpen]);

  const handleAction = async (actionFn: () => void | Promise<void>) => {
    try {
      await actionFn();
      setIsOpen(false);
      setSearchQuery('');
    } catch (err) {
      console.error(err);
      toast.error('Action failed');
    }
  };

  // Filter on query change
  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    
    const q = searchQuery.toLowerCase();
    
    // Check for actions
    const actionResults: SearchResult[] = [];
    if (q.startsWith('/task ') && q.length > 6) {
      const taskText = searchQuery.substring(6).trim();
      actionResults.push({
        type: 'action',
        title: `Create task: "${taskText}"`,
        subtitle: 'Press Enter to create',
        icon: <Plus size={16} />,
        action: async () => {
          const user = auth.currentUser;
          if (!user) return;
          await addDoc(collection(db, 'todos'), {
            userId: user.uid,
            title: taskText,
            priority: 'medium',
            status: 'pending',
            date: getLocalDateString(new Date()),
            createdAt: Date.now(),
            subTasks: []
          });
          toast.success('Task created');
        }
      });
    } else if (q.startsWith('/water')) {
      actionResults.push({
        type: 'action',
        title: `Log +0.5L Water`,
        subtitle: 'Press Enter to log',
        icon: <Droplets size={16} />,
        action: async () => {
          const user = auth.currentUser;
          if (!user) return;
          const todayStr = getLocalDateString(new Date());
          const qLog = query(collection(db, 'daily_logs'), where('userId', '==', user.uid), where('date', '==', todayStr));
          const snap = await getDocs(qLog);
          if (!snap.empty) {
            const d = snap.docs[0];
            const current = d.data().waterIntakeLiters || 0;
            await updateDoc(doc(db, 'daily_logs', d.id), { waterIntakeLiters: current + 0.5 });
          } else {
            await addDoc(collection(db, 'daily_logs'), { userId: user.uid, date: todayStr, waterIntakeLiters: 0.5, updatedAt: Date.now() });
          }
          toast.success('+0.5L water logged');
        }
      });
    } else if (q.startsWith('/focus')) {
      actionResults.push({
        type: 'action',
        title: `Start Pomodoro Timer`,
        subtitle: 'Press Enter to focus',
        icon: <Timer size={16} />,
        action: async () => {
          startTimer('focus', 'Deep Focus Session');
          toast.success('Timer started');
        }
      });
    }

    const filtered = allData.filter(item => 
      item.title.toLowerCase().includes(q) || 
      item.subtitle.toLowerCase().includes(q)
    ).slice(0, 12 - actionResults.length);
    
    setResults([...actionResults, ...filtered]);
    setSelectedIndex(0);
  }, [searchQuery, allData, startTimer]);

  const loadAllData = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const items: SearchResult[] = [];

    try {
      // Load todos
      const todosSnap = await getDocs(query(collection(db, 'todos'), where('userId', '==', user.uid)));
      todosSnap.forEach(doc => {
        const d = doc.data();
        items.push({
          type: 'todo',
          title: d.text,
          subtitle: `Task • ${d.date} • ${d.priority} priority`,
          route: '/todo'
        });
      });

      // Load learning topics + subtasks
      const learningSnap = await getDocs(query(collection(db, 'learning_topics'), where('userId', '==', user.uid)));
      learningSnap.forEach(doc => {
        const d = doc.data();
        items.push({
          type: 'learning',
          title: d.title,
          subtitle: `Topic • ${d.subTasks?.length || 0} subtasks`,
          route: '/learning'
        });
        d.subTasks?.forEach((st: any) => {
          items.push({
            type: 'learning',
            title: st.text,
            subtitle: `${d.title} • ${st.category || 'General'}`,
            route: '/learning'
          });
        });
      });

      // Load daily logs
      const logsSnap = await getDocs(query(collection(db, 'daily_logs'), where('userId', '==', user.uid)));
      logsSnap.forEach(doc => {
        const d = doc.data();
        const parts = [];
        if (d.productiveHours) parts.push(`${formatHoursDisplay(d.productiveHours)} focus`);
        if (d.gymNotes) parts.push('Gym');
        if (d.extraWorks) parts.push('Extra notes');
        items.push({
          type: 'log',
          title: `Daily Log — ${formatDisplayDate(d.date)}`,
          subtitle: parts.join(' • ') || 'No data logged',
          route: '/log'
        });
      });

      // Load notes
      const notesSnap = await getDocs(query(collection(db, 'notes'), where('userId', '==', user.uid)));
      notesSnap.forEach(doc => {
        const d = doc.data();
        items.push({
          type: 'note',
          title: d.title || 'Untitled Note',
          subtitle: `Note • Updated ${new Date(d.updatedAt).toLocaleDateString()}`,
          route: '/notes'
        });
      });

      // Load calendar events
      const calendarSnap = await getDocs(query(collection(db, 'calendar_events'), where('userId', '==', user.uid)));
      calendarSnap.forEach(doc => {
        const d = doc.data();
        items.push({
          type: 'calendar',
          title: d.title || 'Event',
          subtitle: `Event • ${d.start} - ${d.end}`,
          route: '/calendar'
        });
      });

    } catch (err) {
      console.error('Command palette load error:', err);
    }

    setAllData(items);
    setIsLoaded(true);
  };

  const getIcon = (item: SearchResult) => {
    if (item.type === 'action' && item.icon) return item.icon;
    switch (item.type) {
      case 'todo': return <ListTodo size={16} />;
      case 'learning': return <BookOpen size={16} />;
      case 'note': return <BookOpen size={16} />;
      case 'calendar': return <Activity size={16} />;
      case 'log': return <Activity size={16} />;
      case 'action': return <Plus size={16} />;
      default: return <Briefcase size={16} />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'todo': return '#7c3aed';
      case 'learning': return '#a855f7';
      case 'note': return '#a855f7';
      case 'calendar': return '#3b82f6';
      case 'log': return '#10b981';
      case 'action': return '#ec4899';
      default: return '#f59e0b';
    }
  };

  const executeFirstResult = async () => {
    if (results.length > 0 && results[selectedIndex]) {
      const selected = results[selectedIndex];
      if (selected.action) {
        await handleAction(selected.action);
      } else if (selected.route) {
        navigate(selected.route);
        setIsOpen(false);
      }
    }
  };

  return (
    <div className="command-palette-container" ref={containerRef} style={{ position: 'relative' }}>
      <div 
        className={`expandable-search ${isOpen ? 'expanded' : ''}`}
        onClick={() => setIsOpen(true)}
      >
        <div className="search-icon-wrapper">
          <Search size={20} />
        </div>
        
        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            placeholder="Type /task, /water, /focus, or search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                executeFirstResult();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
              }
            }}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: '0.95rem', fontFamily: 'var(--font-sans)',
              width: '100%'
            }}
          />
        ) : (
          <span className="search-placeholder">Search...</span>
        )}
        
        {isOpen && (
          <button 
            className="clear-btn" 
            onClick={(e) => { 
              e.stopPropagation(); 
              setIsOpen(false);
              setSearchQuery('');
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 0.25rem)',
          right: 0,
          width: '100%',
          background: 'rgba(18, 18, 20, 0.95)',
          backdropFilter: 'blur(40px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          animation: 'slideUp 0.2s var(--spring-bouncy)',
          overflow: 'hidden'
        }}>
          {/* Results */}
        <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '0.5rem' }}>
          {searchQuery.trim() === '' ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <p style={{marginBottom: '0.5rem'}}>Search across all your data, or use actions:</p>
              <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem', opacity: 0.8, fontSize: '0.85rem'}}>
                <span><code>/task [name]</code> - Create a task instantly</span>
                <span><code>/water</code> - Log 0.5L water</span>
                <span><code>/focus</code> - Start 25m Pomodoro</span>
              </div>
              
              <div style={{ marginTop: '2rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => { setIsOpen(false); window.dispatchEvent(new CustomEvent('guardian-triage-alert')); }} 
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '0.5rem 1rem', borderRadius: '100px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                >
                  <Activity size={16} /> Crisis Mode
                </button>
                <button 
                  onClick={() => { setIsOpen(false); navigate('/calendar'); }} 
                  style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', padding: '0.5rem 1rem', borderRadius: '100px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                >
                  🗓 Auto-Schedule
                </button>
                <button 
                  onClick={() => { setIsOpen(false); const btn = document.querySelector('button[title="Zen Agent"]') as HTMLButtonElement || document.querySelector('.zen-agent-btn') as HTMLButtonElement; if(btn) btn.click(); }} 
                  style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', padding: '0.5rem 1rem', borderRadius: '100px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                >
                  🤖 Zen Agent
                </button>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No results found for "{searchQuery}"
            </div>
          ) : (
            results.map((result, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (result.action) handleAction(result.action);
                  else if (result.route) { navigate(result.route); setIsOpen(false); }
                }}
                style={{
                  position: 'relative',
                  width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem', background: idx === selectedIndex ? 'rgba(255, 255, 255, 0.05)' : 'transparent', border: 'none',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                  color: 'var(--text-primary)', transition: 'all 0.15s',
                  boxShadow: idx === selectedIndex ? 'inset 0 0 15px rgba(168,85,247,0.1)' : 'none'
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                {idx === selectedIndex && (
                  <div style={{ position: 'absolute', left: 0, top: '20%', height: '60%', width: '3px', background: 'var(--accent-primary)', borderRadius: '0 2px 2px 0', boxShadow: '0 0 8px var(--accent-primary)' }} />
                )}
                <div style={{ 
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: `${getColor(result.type)}15`,
                  color: getColor(result.type),
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {getIcon(result)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {result.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {result.subtitle}
                  </div>
                </div>
                {idx === selectedIndex && (
                  <kbd style={{
                    background: 'var(--bg-surface-active)', border: '1px solid var(--border-subtle)',
                    borderRadius: '4px', padding: '0.1rem 0.4rem', fontSize: '0.65rem',
                    color: 'var(--text-muted)', fontFamily: 'var(--font-sans)'
                  }}>ENTER</kbd>
                )}
              </button>
            ))
          )}
        </div>
        </div>
      )}
    </div>
  );
};

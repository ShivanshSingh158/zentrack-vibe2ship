import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { startWeeklyReviewChat, parseAIJson, sleep } from '../../services/gemini';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { db, auth } from '../../services/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';


interface AIWeeklyReviewWizardProps {
  userData: any;
  onSave: (reviewData: { wentWell: string; toImprove: string; nextWeekPriorities: string; gratitude: string; aiChatHistory: any[] }) => void;
  savedChatHistory?: any[];
  weekStart?: string; // Used as the Firestore doc key for autosave
}



export const AIWeeklyReviewWizard: React.FC<AIWeeklyReviewWizardProps> = ({
  userData, onSave, savedChatHistory = [], weekStart
}) => {

  const [chatSession, setChatSession] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track Firestore review doc id so we can autosave chat progressively
  const reviewDocIdRef = useRef<string | null>(null);
  // Prevent setState after unmount
  const isMountedRef = useRef(true);


  const initChat = async () => {
    setIsInitializing(true);
    setInitError(null);
    try {
      const session = startWeeklyReviewChat(userData, savedChatHistory);
      setChatSession(session);
      const history = await session.getHistory();
      // Filter out the seeded first user message from display
      const display = history.filter((m: any, idx: number) => !(m.role === 'user' && idx === 0));
      setMessages(display);
    } catch (e: any) {
      console.error('[WeeklyReview] Init error:', e);
      setInitError(e.message || 'Failed to start AI Chat. Please try again.');
      toast.error('Could not start AI Coach. Check your connection.');
    }
    setIsInitializing(false);
  };

  useEffect(() => {
    isMountedRef.current = true;
    initChat();
    return () => { isMountedRef.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-clear stuck loading state after 45 seconds
  useEffect(() => {
    if (loading) {
      loadingTimerRef.current = setTimeout(() => {
        setLoading(false);
        setLoadingTimeout(true);
        toast.error('AI took too long to respond. Please try sending your message again.');
      }, 45_000);
    } else {
      setLoadingTimeout(false);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    }
    return () => { if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current); };
  }, [loading]);

  // Auto-persist chat history after every AI response so refreshing doesn't lose progress
  const autosaveChatHistory = async (history: any[]) => {
    const user = auth.currentUser;
    if (!user || !weekStart || history.length < 2) return;
    try {
      if (reviewDocIdRef.current) {
        await updateDoc(doc(db, 'weekly_reviews', reviewDocIdRef.current), {
          aiChatHistory: history,
          updatedAt: Date.now(),
        });
      } else {
        // Find or create the weekly_reviews doc for this week
        const q = query(
          collection(db, 'weekly_reviews'),
          where('userId', '==', user.uid),
          where('weekStart', '==', weekStart)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          reviewDocIdRef.current = snap.docs[0].id;
          await updateDoc(doc(db, 'weekly_reviews', reviewDocIdRef.current), {
            aiChatHistory: history,
            updatedAt: Date.now(),
          });
        } else {
          const ref = await addDoc(collection(db, 'weekly_reviews'), {
            userId: user.uid,
            weekStart,
            aiChatHistory: history,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          reviewDocIdRef.current = ref.id;
        }
      }
    } catch (e) {
      console.warn('[WeeklyReview] autosave error:', e);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !chatSession || loading) return;

    const userText = input.trim();
    setInput('');
    setLoadingTimeout(false);
    if (isMountedRef.current) setMessages(prev => [...prev, { role: 'user', parts: [{ text: userText }] }]);
    if (isMountedRef.current) setLoading(true);

    let lastErr: any;
    // Retry up to 3 times with exponential backoff for transient errors
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await chatSession.sendMessage(userText);
        const text = result.response.text();
        // ── Fixed: removed dead `newMessages` variable; update state directly ──
        if (isMountedRef.current) {
          setMessages(prev => {
            const updated = [...prev, { role: 'model', parts: [{ text }] }];
            // Autosave in background — don't block UI
            autosaveChatHistory(updated).catch(() => {});
            return updated;
          });
          setLoading(false);
        }
        return; // Success — exit
      } catch (err: any) {
        lastErr = err;
        const msg = (err?.message || '').toLowerCase();
        const isRetryable =
          msg.includes('503') || msg.includes('overload') || msg.includes('high demand') ||
          msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') ||
          msg.includes('500') || msg.includes('internal');

        if (isRetryable && attempt < 2) {
          const delay = 2000 * Math.pow(2, attempt); // 2s, 4s
          console.warn(`[WeeklyReview] Retrying sendMessage (attempt ${attempt + 1}) in ${delay}ms`);
          await sleep(delay);
          continue;
        }
        break;
      }
    }

    if (isMountedRef.current) {
      setLoading(false);
      console.error('[WeeklyReview] sendMessage failed:', lastErr);
      toast.error(lastErr?.message?.includes('quota')
        ? 'AI quota reached. Please try again in a few minutes.'
        : 'Failed to get a response. Please try again.'
      );
    }
  };


  const finishReview = async () => {
    if (!chatSession || loading) return;
    setLoading(true);

    try {
      const summaryPrompt = `Based on our entire conversation, provide a JSON summary with these exact keys:
{ "wentWell": "what went well this week", "toImprove": "what to improve", "nextWeekPriorities": "top priorities for next week", "gratitude": "something to be grateful for" }
Return ONLY raw JSON, no markdown.`;

      let result: any;
      let lastErr: any;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await chatSession.sendMessage(summaryPrompt);
          break;
        } catch (err: any) {
          lastErr = err;
          const msg = (err?.message || '').toLowerCase();
          if ((msg.includes('503') || msg.includes('429') || msg.includes('overload')) && attempt < 2) {
            await sleep(3000 * (attempt + 1));
            continue;
          }
          throw err;
        }
      }
      if (!result) throw lastErr;

      const summary = parseAIJson(result.response.text());
      const history = await chatSession.getHistory();

      onSave({
        wentWell:            summary.wentWell || '',
        toImprove:           summary.toImprove || '',
        nextWeekPriorities:  summary.nextWeekPriorities || '',
        gratitude:           summary.gratitude || '',
        aiChatHistory:       history,
      });
    } catch (err: any) {
      console.error('[WeeklyReview] finishReview error:', err);
      toast.error('Could not generate summary. Please try again.');
    }
    setLoading(false);
  };

  if (isInitializing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1rem', color: 'var(--text-muted)' }}>
        <Loader2 className="animate-spin" style={{ color: '#a855f7' }} size={32} />
        <span style={{ fontSize: '0.9rem' }}>Starting Zen AI Coach...</span>
      </div>
    );
  }

  if (initError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1rem', textAlign: 'center' }}>
        <p style={{ color: '#ef4444', fontSize: '0.9rem', maxWidth: '300px' }}>{initError}</p>
        <button className="btn-primary" onClick={initChat} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <RefreshCw size={16} /> Try Again
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', height: '400px', overflow: 'hidden', position: 'relative' }}>

      {/* Header */}
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(168,85,247,0.05)', flexShrink: 0 }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
          <Sparkles size={20} style={{ color: '#a855f7' }} /> Zen AI Review Coach
        </h3>
        <button
          className="btn-primary"
          onClick={finishReview}
          disabled={loading || messages.length < 2}
          style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          Finish &amp; Save Review
        </button>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={{
              background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-base)',
              color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
              padding: '1rem',
              borderRadius: 'var(--radius-lg)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
              borderBottomRightRadius: msg.role === 'user' ? 0 : 'var(--radius-lg)',
              borderBottomLeftRadius: msg.role === 'user' ? 'var(--radius-lg)' : 0,
              fontSize: '0.95rem',
              lineHeight: 1.6
            }}>
              <ReactMarkdown>{msg.parts[0]?.text || ''}</ReactMarkdown>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
              {msg.role === 'user' ? 'You' : 'Zen AI'}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
            <div style={{ background: 'var(--bg-base)', padding: '1rem 1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <Loader2 size={16} className="animate-spin" style={{ color: '#a855f7' }} />
              Zen AI is thinking...
            </div>
          </div>
        )}

        {loadingTimeout && !loading && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
            <div style={{ background: 'rgba(239,68,68,0.08)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', fontSize: '0.85rem' }}>
              <AlertTriangle size={14} />
              AI took too long. Please try sending your message again.
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form onSubmit={handleSend} style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '0.75rem', background: 'var(--bg-base)', flexShrink: 0 }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={loading ? 'Zen AI is thinking...' : 'Reflect on your week...'}
          disabled={loading}
          style={{ flex: 1, padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="btn-primary"
          style={{ padding: '0 1.25rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

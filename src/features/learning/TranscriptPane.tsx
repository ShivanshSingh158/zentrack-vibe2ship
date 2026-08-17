import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Copy, Check, Volume2, RefreshCw } from 'lucide-react';
import type { TranscriptCue } from '../../services/youtubeTranscriptService';
import { toast } from 'sonner';

interface TranscriptPaneProps {
  cues: TranscriptCue[];
  loading: boolean;
  activeCueIndex: number;
  onSeek: (seconds: number) => void;
  onRetry: () => void;
}

export const TranscriptPane: React.FC<TranscriptPaneProps> = ({
  cues,
  loading,
  activeCueIndex,
  onSeek,
  onRetry,
}) => {
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const activeCueRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active cue
  useEffect(() => {
    if (autoScroll && activeCueRef.current && listContainerRef.current) {
      activeCueRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeCueIndex, autoScroll]);

  // Native non-passive wheel isolation — detaches transcript list from outer scroll
  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp = scrollTop > 0;
      if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
        e.preventDefault();
        el.scrollTop += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const filteredCues = useMemo(() => {
    if (!search.trim()) return cues;
    const q = search.toLowerCase();
    return cues.filter(c => c.text.toLowerCase().includes(q));
  }, [cues, search]);

  const handleCopy = () => {
    const fullText = cues.map(c => `[${c.formattedTime}] ${c.text}`).join('\n');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    toast.success('Transcript copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="lp-transcript-pane">
      {/* Search & Actions Bar */}
      <div className="lp-transcript-top-bar">
        <div className="lp-transcript-search-wrap">
          <Search size={14} className="lp-search-icon" />
          <input
            type="text"
            className="lp-transcript-search-input"
            placeholder="Search transcript..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="lp-search-clear-btn" onClick={() => setSearch('')}>
              ×
            </button>
          )}
        </div>

        <div className="lp-transcript-actions">
          <button
            type="button"
            className={`lp-transcript-chip-btn ${autoScroll ? 'active' : ''}`}
            onClick={() => setAutoScroll(prev => !prev)}
            title="Auto-scroll to current speaking point"
          >
            <Volume2 size={13} />
            <span>{autoScroll ? 'Auto-sync On' : 'Auto-sync Off'}</span>
          </button>

          <button
            type="button"
            className="lp-transcript-icon-btn"
            onClick={handleCopy}
            title="Copy entire transcript"
          >
            {copied ? <Check size={14} color="#5eda9e" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* Cues List */}
      <div className="lp-transcript-list" ref={listContainerRef}>
        {loading ? (
          <div className="lp-transcript-loading">
            <RefreshCw size={24} className="lp-spin" color="#a599ff" />
            <p>Fetching and syncing video transcript...</p>
          </div>
        ) : cues.length === 0 ? (
          <div className="lp-transcript-empty">
            <p>No captions available for this lecture.</p>
            <button type="button" className="lp-btn-secondary-sm" onClick={onRetry}>
              <RefreshCw size={13} /> Retry with AI
            </button>
          </div>
        ) : filteredCues.length === 0 ? (
          <div className="lp-transcript-empty">
            <p>No cues found matching "{search}"</p>
          </div>
        ) : (
          filteredCues.map((cue) => {
            const isOriginalIndex = cues.indexOf(cue);
            const isActive = isOriginalIndex === activeCueIndex;

            return (
              <div
                key={`${cue.start}-${cue.text.slice(0, 10)}`}
                ref={isActive ? activeCueRef : null}
                className={`lp-transcript-cue-row ${isActive ? 'active-cue' : ''}`}
                onClick={() => onSeek(cue.start)}
                title={`Jump to ${cue.formattedTime}`}
              >
                <span className="lp-cue-timestamp">{cue.formattedTime}</span>
                <p className="lp-cue-text">{cue.text}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

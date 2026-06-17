import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Link as LinkIcon, Plus, Trash2, GripVertical, CheckCircle2, Play, BookOpen, Loader, Sparkles, ChevronDown, ChevronRight, Save, Clock } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { fetchYouTubePlaylist, extractPlaylistId } from '../../services/youtube';

interface SourceVideo {
  id: string; // unique for this list
  videoId: string;
  title: string;
  url: string;
  durationStr?: string; // e.g. "14:20"
}

interface StagedSource {
  id: string;
  title: string;
  type: 'playlist' | 'bulk';
  videos: SourceVideo[];
  isExpanded: boolean;
  searchQuery: string;
  rangeInput: string;
}

interface DraftTopic {
  id: string;
  title: string;
  videos: SourceVideo[];
}

const STORAGE_KEY = 'zentrack_curriculum_draft';

// Helper to parse duration string "1:15:20" into seconds
const parseDuration = (dur: string) => {
  if (!dur) return 0;
  const parts = dur.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
};

// Helper to format seconds into "1h 15m" or "15m"
const formatTotalDuration = (seconds: number) => {
  if (seconds === 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const CurriculumBuilderModal = ({ onClose, onPublish }: {
  onClose: () => void;
  onPublish: (topics: DraftTopic[]) => void;
}) => {
  // ─── STATE INITIALIZATION (AUTO-SAVE) ──────────────────────────────────────
  const [stagedSources, setStagedSources] = useState<StagedSource[]>(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY + '_sources'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [draftTopics, setDraftTopics] = useState<DraftTopic[]>(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY + '_topics'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const [playlistUrl, setPlaylistUrl] = useState('');
  const [fetchingPlaylist, setFetchingPlaylist] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [fetchingBulk, setFetchingBulk] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);

  // Sync to local storage
  useEffect(() => { localStorage.setItem(STORAGE_KEY + '_sources', JSON.stringify(stagedSources)); }, [stagedSources]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY + '_topics', JSON.stringify(draftTopics)); }, [draftTopics]);

  const clearWorkspace = () => {
    if (!window.confirm("Are you sure you want to clear your entire workspace? This cannot be undone.")) return;
    setStagedSources([]);
    setDraftTopics([]);
    setSelectedVideoIds(new Set());
    localStorage.removeItem(STORAGE_KEY + '_sources');
    localStorage.removeItem(STORAGE_KEY + '_topics');
  };

  const handlePublishClick = () => {
    onPublish(draftTopics);
    localStorage.removeItem(STORAGE_KEY + '_sources');
    localStorage.removeItem(STORAGE_KEY + '_topics');
  };

  // ─── SOURCE FETCHING LOGIC ───────────────────────────────────────────────
  
  const handleFetchPlaylist = async () => {
    if (!playlistUrl.trim()) return;
    const pid = extractPlaylistId(playlistUrl);
    if (!pid) { alert('Invalid Playlist URL'); return; }
    
    setFetchingPlaylist(true);
    try {
      const data = await fetchYouTubePlaylist(pid);
      const videos: SourceVideo[] = data.videos.map((v: any) => ({
        id: crypto.randomUUID(),
        videoId: v.videoId,
        title: v.title,
        url: v.link,
        durationStr: v.durationStr
      }));
      
      const newSource: StagedSource = {
        id: crypto.randomUUID(),
        title: data.title,
        type: 'playlist',
        videos,
        isExpanded: true,
        searchQuery: '',
        rangeInput: ''
      };
      
      setStagedSources(prev => [newSource, ...prev]);
      setPlaylistUrl('');
      
      // Auto-select the newly added videos
      const newSelected = new Set(selectedVideoIds);
      videos.forEach(v => newSelected.add(v.id));
      setSelectedVideoIds(newSelected);
      
    } catch (err: any) { alert(err.message || 'Failed to fetch playlist'); } 
    finally { setFetchingPlaylist(false); }
  };

  const extractYoutubeIdBulk = (url: string) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
    return match ? match[1] : null;
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setFetchingBulk(true);
    
    // Basic regex to find anything that looks like a URL
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const rawTokens = bulkText.match(urlRegex) || [];
    const validUrls: string[] = [];
    
    for (const token of rawTokens) {
      if (!validUrls.includes(token)) validUrls.push(token);
    }
    
    if (validUrls.length === 0) {
      alert("No valid URLs found.");
      setFetchingBulk(false);
      return;
    }
    
    const fetchedVideos: SourceVideo[] = [];
    
    await Promise.all(validUrls.map(async (url) => {
      try {
        const vid = extractYoutubeIdBulk(url);
        if (vid) {
          const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
          if (res.ok) {
            const data = await res.json();
            fetchedVideos.push({ id: crypto.randomUUID(), videoId: vid, title: data.title || 'YouTube Video', url: url });
          }
        } else {
          // It's a non-YouTube link (Article/Blog)
          // We can't fetch OG easily on client side due to CORS, so we extract hostname as a fallback
          let domain = 'Article / Link';
          try { domain = new URL(url).hostname; } catch {}
          fetchedVideos.push({ id: crypto.randomUUID(), videoId: '', title: `Reading: ${domain}`, url: url });
        }
      } catch (e) {}
    }));
    
    if (fetchedVideos.length > 0) {
      const newSource: StagedSource = {
        id: crypto.randomUUID(),
        title: 'Bulk Imported Links',
        type: 'bulk',
        videos: fetchedVideos,
        isExpanded: true,
        searchQuery: '',
        rangeInput: ''
      };
      setStagedSources(prev => [newSource, ...prev]);
      setBulkText('');
      
      const newSelected = new Set(selectedVideoIds);
      fetchedVideos.forEach(v => newSelected.add(v.id));
      setSelectedVideoIds(newSelected);
    } else { alert("Failed to process URLs."); }
    
    setFetchingBulk(false);
  };

  // ─── SOURCE SELECTION & FILTER LOGIC ──────────────────────────────────────
  
  const updateSourceState = (sourceId: string, updates: Partial<StagedSource>) => {
    setStagedSources(prev => prev.map(s => s.id === sourceId ? { ...s, ...updates } : s));
  };

  const handleRangeChange = (sourceId: string, val: string) => {
    updateSourceState(sourceId, { rangeInput: val });
    const source = stagedSources.find(s => s.id === sourceId);
    if (!source || !val.trim()) return;

    const newSelected = new Set(selectedVideoIds);
    // First, clear all existing selections for this source
    source.videos.forEach(v => newSelected.delete(v.id));

    const max = source.videos.length;
    const parts = val.split(',');
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= max) newSelected.add(source.videos[i - 1].id);
          }
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= max) newSelected.add(source.videos[num - 1].id);
      }
    }
    
    setSelectedVideoIds(newSelected);
  };

  const toggleVideoSelection = (id: string) => {
    const next = new Set(selectedVideoIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedVideoIds(next);
  };

  const toggleAllInSource = (sourceId: string, forceStatus?: boolean) => {
    const source = stagedSources.find(s => s.id === sourceId);
    if (!source) return;
    const next = new Set(selectedVideoIds);
    const filtered = getFilteredVideos(source);
    
    const shouldAdd = forceStatus !== undefined ? forceStatus : !filtered.every(v => next.has(v.id));
    
    filtered.forEach(v => {
      if (shouldAdd) next.add(v.id);
      else next.delete(v.id);
    });
    setSelectedVideoIds(next);
  };

  const removeSource = (id: string) => {
    setStagedSources(prev => prev.filter(s => s.id !== id));
  };

  const getFilteredVideos = (source: StagedSource) => {
    return source.videos.filter(v => !source.searchQuery.trim() || v.title.toLowerCase().includes(source.searchQuery.toLowerCase()));
  };

  // ─── ADD TO CANVAS LOGIC ────────────────────────────────────────────────
  
  const getGlobalSelectedVideos = () => {
    return stagedSources.flatMap(s => s.videos).filter(v => selectedVideoIds.has(v.id));
  };

  const createTopicFromSelected = () => {
    const vids = getGlobalSelectedVideos();
    if (vids.length === 0) return;
    
    const newTopic: DraftTopic = {
      id: crypto.randomUUID(),
      title: `Custom Topic (${vids.length} items)`,
      videos: vids.map(v => ({ ...v, id: crypto.randomUUID() })) // clone for canvas
    };
    
    setDraftTopics(prev => [...prev, newTopic]);
    setSelectedVideoIds(new Set()); // Clear selection after use
  };

  const addSelectedToTopic = (targetTopicId: string) => {
    const vids = getGlobalSelectedVideos();
    if (vids.length === 0) return;
    
    setDraftTopics(prev => prev.map(t => {
      if (t.id === targetTopicId) {
        const cloned = vids.map(v => ({ ...v, id: crypto.randomUUID() }));
        return { ...t, videos: [...t.videos, ...cloned] };
      }
      return t;
    }));
    setSelectedVideoIds(new Set());
  };

  // ✨ AI Auto-Structuring Logic (Heuristic Regex Based)
  const autoGroupTopics = () => {
    const vids = getGlobalSelectedVideos();
    if (vids.length === 0) { alert("Please select some videos first!"); return; }
    
    const chunks: DraftTopic[] = [];
    const regex = /^(?:chapter|week|lec(?:ture)?|part|module)\s*\d+[:\-]?\s*(.*)/i;
    
    let currentTopicTitle = "Group 1";
    let currentVideos: SourceVideo[] = [];
    let groupCount = 1;
    
    for (const v of vids) {
      const match = v.title.match(regex);
      if (match) {
        if (currentVideos.length > 0) {
          chunks.push({ id: crypto.randomUUID(), title: currentTopicTitle, videos: currentVideos });
          currentVideos = [];
        }
        groupCount++;
        currentTopicTitle = `Group ${groupCount}: ${match[1].trim()}`;
      }
      currentVideos.push({ ...v, id: crypto.randomUUID() });
    }
    
    if (currentVideos.length > 0) {
      chunks.push({ id: crypto.randomUUID(), title: currentTopicTitle, videos: currentVideos });
    }
    
    // Fallback if regex failed (i.e. we only have 1 chunk and it has too many videos)
    if (chunks.length === 1 && chunks[0].videos.length > 15) {
      const fallback: DraftTopic[] = [];
      const flat = chunks[0].videos;
      for (let i = 0; i < flat.length; i += 15) {
        fallback.push({
          id: crypto.randomUUID(),
          title: `Section ${Math.floor(i / 15) + 1}`,
          videos: flat.slice(i, i + 15)
        });
      }
      setDraftTopics(prev => [...prev, ...fallback]);
    } else {
      setDraftTopics(prev => [...prev, ...chunks]);
    }
    
    setSelectedVideoIds(new Set());
  };

  // ─── CANVAS LOGIC ────────────────────────────────────────────────────────
  
  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    const { source, destination } = result;

    if (source.droppableId === destination.droppableId) {
      setDraftTopics(prev => prev.map(t => {
        if (t.id === source.droppableId) {
          const items = Array.from(t.videos);
          const [reorderedItem] = items.splice(source.index, 1);
          items.splice(destination.index, 0, reorderedItem);
          return { ...t, videos: items };
        }
        return t;
      }));
    } else {
      setDraftTopics(prev => {
        const newDrafts = [...prev];
        const sTopicIdx = newDrafts.findIndex(t => t.id === source.droppableId);
        const dTopicIdx = newDrafts.findIndex(t => t.id === destination.droppableId);
        if (sTopicIdx > -1 && dTopicIdx > -1) {
          const sItems = Array.from(newDrafts[sTopicIdx].videos);
          const dItems = Array.from(newDrafts[dTopicIdx].videos);
          const [removed] = sItems.splice(source.index, 1);
          dItems.splice(destination.index, 0, removed);
          newDrafts[sTopicIdx] = { ...newDrafts[sTopicIdx], videos: sItems };
          newDrafts[dTopicIdx] = { ...newDrafts[dTopicIdx], videos: dItems };
        }
        return newDrafts;
      });
    }
  };

  const createEmptyTopic = () => {
    if (!newTopicTitle.trim()) return;
    setDraftTopics(prev => [...prev, { id: crypto.randomUUID(), title: newTopicTitle, videos: [] }]);
    setNewTopicTitle('');
  };

  const removeTopic = (id: string) => setDraftTopics(prev => prev.filter(t => t.id !== id));
  const removeVideoFromTopic = (topicId: string, videoId: string) => {
    setDraftTopics(prev => prev.map(t => t.id === topicId ? { ...t, videos: t.videos.filter(v => v.id !== videoId) } : t));
  };

  // Total Duration Calculation
  const getTotalCurriculumDuration = () => {
    const totalSec = draftTopics.flatMap(t => t.videos).reduce((acc, v) => acc + parseDuration(v.durationStr || ''), 0);
    return formatTotalDuration(totalSec);
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────
  
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(9,9,11,0.98)', backdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column' }}>
      
      {/* Mini Video Preview Overlay */}
      {previewVideoId && (
        <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', width: '380px', aspectRatio: '16/9', background: '#000', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', zIndex: 100001, border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 10 }}>
            <button onClick={() => setPreviewVideoId(null)} style={{ background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', padding: '0.4rem', cursor: 'pointer' }}><X size={14} /></button>
          </div>
          <iframe src={`https://www.youtube.com/embed/${previewVideoId}?autoplay=1`} frameBorder="0" allow="autoplay; encrypted-media" allowFullScreen style={{ width: '100%', height: '100%' }} />
        </div>
      )}

      {/* Header */}
      <div style={{ height: '64px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', background: '#09090b', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <BookOpen size={20} color="#818cf8" /> Curriculum Builder <span style={{ fontSize: '0.7rem', background: 'rgba(129,140,248,0.2)', color: '#818cf8', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>V2</span>
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {draftTopics.length > 0 && <span style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Save size={14} /> Auto-Saved</span>}
          <button onClick={clearWorkspace} style={{ background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--text-muted)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>Clear Workspace</button>
          <button 
            onClick={handlePublishClick} disabled={draftTopics.length === 0}
            style={{ padding: '0.55rem 1.5rem', background: draftTopics.length > 0 ? 'linear-gradient(135deg,#10b981,#059669)' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: draftTopics.length > 0 ? 'pointer' : 'not-allowed', boxShadow: draftTopics.length > 0 ? '0 4px 15px rgba(16,185,129,0.3)' : 'none' }}
          >
            Publish to Tracker
          </button>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', padding: '0.55rem', borderRadius: '50%', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
        </div>
      </div>

      {/* Main Workspace */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* LEFT PANEL: The Multi-Source Library */}
        <div style={{ width: '450px', background: 'rgba(255,255,255,0.015)', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Add New Source Section */}
          <div style={{ padding: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#09090b' }}>
            <h3 style={{ fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Plus size={15} /> Add Source</h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <input type="url" placeholder="https://youtube.com/playlist?list=..." value={playlistUrl} onChange={e => setPlaylistUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFetchPlaylist()} style={{ flex: 1, padding: '0.7rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', outline: 'none', fontSize: '0.85rem' }} />
              <button onClick={handleFetchPlaylist} disabled={fetchingPlaylist || !playlistUrl} style={{ padding: '0 1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: playlistUrl ? 'pointer' : 'not-allowed' }}>
                {fetchingPlaylist ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Import'}
              </button>
            </div>
            
            {/* Universal Link Bulker Collapsible */}
            <details style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '0.75rem' }}>
              <summary style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 600, cursor: 'pointer', outline: 'none' }}>+ Bulk Universal Links (Articles, Videos)</summary>
              <div style={{ marginTop: '0.75rem' }}>
                <textarea placeholder="Paste links here..." value={bulkText} onChange={e => setBulkText(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', minHeight: '80px', outline: 'none', fontSize: '0.8rem', resize: 'vertical' }} />
                <button onClick={handleBulkImport} disabled={fetchingBulk || !bulkText} style={{ width: '100%', padding: '0.6rem', marginTop: '0.5rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: bulkText ? 'pointer' : 'not-allowed' }}>
                  {fetchingBulk ? 'Processing...' : 'Add Links'}
                </button>
              </div>
            </details>
          </div>

          {/* Sources List Accordion */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {stagedSources.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255,255,255,0.3)' }}>
                <BookOpen size={32} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                <p style={{ fontSize: '0.85rem' }}>Import playlists or links above to start building your library.</p>
              </div>
            ) : (
              stagedSources.map(source => (
                <div key={source.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
                  
                  {/* Source Header (Accordion Toggle) */}
                  <div onClick={() => updateSourceState(source.id, { isExpanded: !source.isExpanded })} style={{ padding: '0.85rem 1rem', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: source.isExpanded ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      {source.isExpanded ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>{source.videos.length} items</span>
                      <button onClick={(e) => { e.stopPropagation(); removeSource(source.id); }} style={{ background: 'none', border: 'none', color: '#ef4444', padding: '0.2rem', cursor: 'pointer' }}><Trash2 size={14} /></button>
                    </div>
                  </div>

                  {/* Source Body */}
                  {source.isExpanded && (
                    <div style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                          <input type="text" placeholder="e.g. 1-10, 15 (Range Check)" value={source.rangeInput} onChange={e => handleRangeChange(source.id, e.target.value)} style={{ width: '100%', padding: '0.5rem 0.6rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', fontSize: '0.75rem', outline: 'none' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <input type="text" placeholder="Search title..." value={source.searchQuery} onChange={e => updateSourceState(source.id, { searchQuery: e.target.value })} style={{ width: '100%', padding: '0.5rem 0.6rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', fontSize: '0.75rem', outline: 'none' }} />
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>Select to add to Canvas</span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button onClick={() => toggleAllInSource(source.id, true)} style={{ fontSize: '0.7rem', color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer' }}>All</button>
                          <button onClick={() => toggleAllInSource(source.id, false)} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>None</button>
                        </div>
                      </div>

                      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.4rem' }}>
                        {getFilteredVideos(source).map((v, i) => {
                          const actualIdx = source.videos.findIndex(sv => sv.id === v.id);
                          return (
                            <div key={v.id} onClick={() => toggleVideoSelection(v.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem', borderRadius: '6px', background: selectedVideoIds.has(v.id) ? 'rgba(99,102,241,0.15)' : 'transparent', border: `1px solid ${selectedVideoIds.has(v.id) ? 'rgba(99,102,241,0.3)' : 'transparent'}`, cursor: 'pointer', marginBottom: '0.2rem', transition: 'all 0.1s' }}>
                              <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `1px solid ${selectedVideoIds.has(v.id) ? '#818cf8' : 'rgba(255,255,255,0.3)'}`, background: selectedVideoIds.has(v.id) ? '#818cf8' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {selectedVideoIds.has(v.id) && <CheckCircle2 size={10} color="#fff" />}
                              </div>
                              <span style={{ fontSize: '0.65rem', color: '#71717a', width: '18px', textAlign: 'right', flexShrink: 0 }}>{actualIdx + 1}.</span>
                              <span style={{ fontSize: '0.75rem', color: selectedVideoIds.has(v.id) ? '#fff' : '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{v.title}</span>
                              
                              {/* Duration Badge */}
                              {v.durationStr && <span style={{ fontSize: '0.65rem', color: '#71717a', flexShrink: 0 }}>{v.durationStr}</span>}
                              
                              {/* Inline Preview Play Button */}
                              {v.videoId && (
                                <button onClick={(e) => { e.stopPropagation(); setPreviewVideoId(v.videoId); }} style={{ background: 'none', border: 'none', color: '#3b82f6', padding: '0.1rem', cursor: 'pointer', opacity: 0.8, flexShrink: 0 }} title="Preview Video">
                                  <Play size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* MIDDLE PANEL: Actions (Auto-Group, Add to Topic) */}
        <div style={{ width: '220px', background: 'rgba(0,0,0,0.4)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontSize: '0.85rem', color: '#a1a1aa', fontWeight: 600, margin: 0 }}>Action Center</h3>
          
          <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', padding: '1rem', borderRadius: '12px' }}>
            <p style={{ fontSize: '0.75rem', color: '#818cf8', marginBottom: '0.75rem', textAlign: 'center' }}>{selectedVideoIds.size} items selected</p>
            
            <button onClick={createTopicFromSelected} disabled={selectedVideoIds.size === 0} style={{ width: '100%', padding: '0.65rem', background: selectedVideoIds.size > 0 ? '#3b82f6' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: selectedVideoIds.size > 0 ? 'pointer' : 'not-allowed', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
              Create New Topic
            </button>
            
            <button onClick={autoGroupTopics} disabled={selectedVideoIds.size === 0} style={{ width: '100%', padding: '0.65rem', background: selectedVideoIds.size > 0 ? 'linear-gradient(135deg,#8b5cf6,#d946ef)' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: selectedVideoIds.size > 0 ? 'pointer' : 'not-allowed', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
              <Sparkles size={14} /> AI Auto-Group
            </button>
          </div>

          {draftTopics.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', flex: 1 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Append to existing...</span>
              {draftTopics.map(t => (
                <button key={t.id} onClick={() => addSelectedToTopic(t.id)} disabled={selectedVideoIds.size === 0} style={{ padding: '0.6rem', background: 'rgba(255,255,255,0.05)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '0.75rem', textAlign: 'left', cursor: selectedVideoIds.size > 0 ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  + {t.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Canvas */}
        <div style={{ flex: 1, background: '#121214', padding: '2rem', overflowY: 'auto' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
              <div>
                <h1 style={{ fontSize: '1.5rem', color: '#fff', fontWeight: 600, margin: '0 0 0.4rem 0' }}>Draft Curriculum</h1>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Drag videos here to organize your custom roadmap.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '99px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Clock size={14} color="#a1a1aa" />
                <span style={{ fontSize: '0.85rem', color: '#e4e4e7', fontWeight: 600 }}>Total: {getTotalCurriculumDuration() || '0m'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
              <input type="text" placeholder="New Topic Title (e.g. Week 1: Basics)" value={newTopicTitle} onChange={e => setNewTopicTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && createEmptyTopic()} style={{ flex: 1, padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '10px', fontSize: '0.95rem', outline: 'none' }} />
              <button onClick={createEmptyTopic} disabled={!newTopicTitle.trim()} style={{ padding: '0 1.25rem', background: newTopicTitle.trim() ? '#818cf8' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: newTopicTitle.trim() ? 'pointer' : 'not-allowed' }}>Add Empty Topic</button>
            </div>

            {draftTopics.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '16px' }}>
                <BookOpen size={48} color="rgba(255,255,255,0.2)" style={{ marginBottom: '1rem' }} />
                <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: '0 0 0.5rem 0' }}>Your canvas is empty</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>Select videos from the left panels and click "Create New Topic" or "AI Auto-Group" to build.</p>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {draftTopics.map(topic => {
                    const topicSecs = topic.videos.reduce((acc, v) => acc + parseDuration(v.durationStr || ''), 0);
                    return (
                      <div key={topic.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: 0, fontWeight: 600 }}>{topic.title}</h3>
                            {topicSecs > 0 && <span style={{ fontSize: '0.75rem', color: '#818cf8', background: 'rgba(129,140,248,0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{formatTotalDuration(topicSecs)}</span>}
                          </div>
                          <button onClick={() => removeTopic(topic.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem', opacity: 0.6 }} title="Delete Topic"><Trash2 size={16} /></button>
                        </div>

                        <Droppable droppableId={topic.id}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} style={{ minHeight: '60px', background: snapshot.isDraggingOver ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '0.5rem', transition: 'background 0.2s' }}>
                              {topic.videos.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>Drag videos here...</div>
                              ) : (
                                topic.videos.map((v, idx) => (
                                  <Draggable key={v.id} draggableId={v.id} index={idx}>
                                    {(provided, snapshot) => (
                                      <div ref={provided.innerRef} {...provided.draggableProps} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.06)', padding: '0.65rem', borderRadius: '8px', marginBottom: '0.4rem', border: snapshot.isDragging ? '1px solid #818cf8' : '1px solid rgba(255,255,255,0.03)', boxShadow: snapshot.isDragging ? '0 10px 30px rgba(0,0,0,0.5)' : 'none', ...provided.draggableProps.style }}>
                                        <div {...provided.dragHandleProps} style={{ color: 'rgba(255,255,255,0.3)', cursor: 'grab', padding: '0.2rem' }}>
                                          <GripVertical size={14} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: '0.85rem', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                                        </div>
                                        {v.durationStr && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{v.durationStr}</div>}
                                        <button onClick={() => removeVideoFromTopic(topic.id, v.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}><X size={14} /></button>
                                      </div>
                                    )}
                                  </Draggable>
                                ))
                              )}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    );
                  })}
                </div>
              </DragDropContext>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

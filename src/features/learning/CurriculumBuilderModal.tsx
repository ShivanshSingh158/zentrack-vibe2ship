import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Link as LinkIcon, Plus, Trash2, GripVertical, CheckCircle2, Play, BookOpen, Loader } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { fetchYouTubePlaylist, extractPlaylistId } from '../../services/youtube';
import { uniqueId } from '../../utils/uniqueId'; // We will create a small utils file if it doesn't exist, or just use crypto.randomUUID

interface SourceVideo {
  id: string; // unique for this list
  videoId: string;
  title: string;
  url: string;
}

interface DraftTopic {
  id: string;
  title: string;
  videos: SourceVideo[];
}

export const CurriculumBuilderModal = ({ onClose, onPublish }: {
  onClose: () => void;
  onPublish: (topics: DraftTopic[]) => void;
}) => {
  // Phase 1: Playlist Import State
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [fetchingPlaylist, setFetchingPlaylist] = useState(false);
  const [stagedPlaylist, setStagedPlaylist] = useState<{ title: string; videos: SourceVideo[] } | null>(null);
  
  // Phase 1: Cherry-Pick State
  const [searchQuery, setSearchQuery] = useState('');
  const [rangeInput, setRangeInput] = useState('');
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());

  // Phase 2: Bulk Import State
  const [activeTab, setActiveTab] = useState<'playlist' | 'bulk'>('playlist');
  const [bulkText, setBulkText] = useState('');
  const [fetchingBulk, setFetchingBulk] = useState(false);

  // Phase 3: Curriculum Canvas State
  const [draftTopics, setDraftTopics] = useState<DraftTopic[]>([]);
  const [newTopicTitle, setNewTopicTitle] = useState('');

  // ─── PHASE 1: PLAYLIST FETCHING & RANGE LOGIC ─────────────────────────────
  
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
        url: v.link
      }));
      setStagedPlaylist({ title: data.title, videos });
      setSelectedVideoIds(new Set(videos.map(v => v.id))); // select all by default
      setRangeInput('');
      setPlaylistUrl('');
    } catch (err: any) {
      alert(err.message || 'Failed to fetch playlist');
    } finally {
      setFetchingPlaylist(false);
    }
  };

  const handleRangeChange = (val: string) => {
    setRangeInput(val);
    if (!stagedPlaylist) return;
    
    if (!val.trim()) {
      // If empty, don't clear selection automatically as they might have checked manually
      return;
    }

    const newSelected = new Set<string>();
    const max = stagedPlaylist.videos.length;
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
            if (i >= 1 && i <= max) newSelected.add(stagedPlaylist.videos[i - 1].id);
          }
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= max) newSelected.add(stagedPlaylist.videos[num - 1].id);
      }
    }
    
    setSelectedVideoIds(newSelected);
  };

  const toggleVideoSelection = (id: string) => {
    const next = new Set(selectedVideoIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedVideoIds(next);
  };

  const filteredStagedVideos = useMemo(() => {
    if (!stagedPlaylist) return [];
    return stagedPlaylist.videos.filter(v => 
      !searchQuery.trim() || v.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [stagedPlaylist, searchQuery]);

  const addSelectedToTopic = (targetTopicId: string) => {
    if (!stagedPlaylist) return;
    const videosToAdd = stagedPlaylist.videos.filter(v => selectedVideoIds.has(v.id));
    if (videosToAdd.length === 0) return;
    
    setDraftTopics(prev => prev.map(t => {
      if (t.id === targetTopicId) {
        // Clone videos to ensure unique IDs within the topic
        const cloned = videosToAdd.map(v => ({ ...v, id: crypto.randomUUID() }));
        return { ...t, videos: [...t.videos, ...cloned] };
      }
      return t;
    }));
    
    // Clear staged so user can grab more
    setStagedPlaylist(null);
    setSelectedVideoIds(new Set());
    setSearchQuery('');
    setRangeInput('');
  };

  const createTopicFromSelected = () => {
    if (!stagedPlaylist) return;
    const videosToAdd = stagedPlaylist.videos.filter(v => selectedVideoIds.has(v.id));
    if (videosToAdd.length === 0) return;
    
    const newTopic: DraftTopic = {
      id: crypto.randomUUID(),
      title: stagedPlaylist.title,
      videos: videosToAdd.map(v => ({ ...v, id: crypto.randomUUID() }))
    };
    
    setDraftTopics(prev => [...prev, newTopic]);
    setStagedPlaylist(null);
    setSelectedVideoIds(new Set());
    setRangeInput('');
  };

  // ─── PHASE 2: BULK IMPORT ──────────────────────────────────────────────────
  
  const extractYoutubeIdBulk = (url: string) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
    return match ? match[1] : null;
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setFetchingBulk(true);
    
    // Split by newlines or commas or spaces
    const rawTokens = bulkText.split(/[\s,]+/);
    const validIds = new Set<string>();
    const validUrls: string[] = [];
    
    for (const token of rawTokens) {
      const vid = extractYoutubeIdBulk(token);
      if (vid && !validIds.has(vid)) {
        validIds.add(vid);
        validUrls.push(token);
      }
    }
    
    if (validUrls.length === 0) {
      alert("No valid YouTube URLs found.");
      setFetchingBulk(false);
      return;
    }
    
    const fetchedVideos: SourceVideo[] = [];
    
    // Process in batches or concurrently
    await Promise.all(validUrls.map(async (url) => {
      try {
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (res.ok) {
          const data = await res.json();
          fetchedVideos.push({
            id: crypto.randomUUID(),
            videoId: extractYoutubeIdBulk(url)!,
            title: data.title || 'Unknown Video',
            url: url
          });
        }
      } catch (e) {
        // Skip failures silently for bulk
      }
    }));
    
    if (fetchedVideos.length > 0) {
      setStagedPlaylist({ title: 'Bulk Imported Links', videos: fetchedVideos });
      setSelectedVideoIds(new Set(fetchedVideos.map(v => v.id)));
      setBulkText('');
      setActiveTab('playlist'); // Switch back to see them
    } else {
      alert("Failed to fetch video titles. Make sure they are public YouTube videos.");
    }
    
    setFetchingBulk(false);
  };

  // ─── PHASE 3: CANVAS LOGIC ───────────────────────────────────────────────
  
  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    const { source, destination } = result;

    if (source.droppableId === destination.droppableId) {
      // Reorder within same topic
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
      // Move across topics
      let movedItem: SourceVideo | null = null;
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

  const removeTopic = (id: string) => {
    setDraftTopics(prev => prev.filter(t => t.id !== id));
  };
  
  const removeVideoFromTopic = (topicId: string, videoId: string) => {
    setDraftTopics(prev => prev.map(t => {
      if (t.id === topicId) {
        return { ...t, videos: t.videos.filter(v => v.id !== videoId) };
      }
      return t;
    }));
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────
  
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(9,9,11,0.95)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ height: '60px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', background: '#09090b', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={18} color="#818cf8" /> Curriculum Builder
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={() => onPublish(draftTopics)}
            disabled={draftTopics.length === 0}
            style={{ padding: '0.5rem 1.25rem', background: draftTopics.length > 0 ? '#10b981' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: draftTopics.length > 0 ? 'pointer' : 'not-allowed' }}
          >
            Publish to Tracker
          </button>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* LEFT PANEL: Sources */}
        <div style={{ width: '420px', background: 'rgba(255,255,255,0.02)', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0.5rem' }}>
            <button onClick={() => setActiveTab('playlist')} style={{ flex: 1, padding: '0.5rem', background: activeTab === 'playlist' ? 'rgba(255,255,255,0.06)' : 'transparent', color: activeTab === 'playlist' ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>YouTube Playlist</button>
            <button onClick={() => setActiveTab('bulk')} style={{ flex: 1, padding: '0.5rem', background: activeTab === 'bulk' ? 'rgba(255,255,255,0.06)' : 'transparent', color: activeTab === 'bulk' ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Bulk Links</button>
          </div>

          <div style={{ padding: '1.25rem', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!stagedPlaylist ? (
              // Input State
              <>
                {activeTab === 'playlist' ? (
                  <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', padding: '1.25rem', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '0.9rem', color: '#ef4444', marginBottom: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Play size={15} /> Import Playlist</h3>
                    <input type="url" placeholder="https://youtube.com/playlist?list=..." value={playlistUrl} onChange={e => setPlaylistUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFetchPlaylist()} style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', marginBottom: '0.75rem', outline: 'none' }} />
                    <button onClick={handleFetchPlaylist} disabled={fetchingPlaylist || !playlistUrl} style={{ width: '100%', padding: '0.75rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: playlistUrl ? 'pointer' : 'not-allowed', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                      {fetchingPlaylist ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Fetch Videos'}
                    </button>
                  </div>
                ) : (
                  <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', padding: '1.25rem', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '0.9rem', color: '#3b82f6', marginBottom: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LinkIcon size={15} /> Bulk Add URLs</h3>
                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.75rem' }}>Paste multiple YouTube links separated by spaces or newlines.</p>
                    <textarea placeholder="https://youtube.com/watch?v=..." value={bulkText} onChange={e => setBulkText(e.target.value)} style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', marginBottom: '0.75rem', outline: 'none', minHeight: '150px', resize: 'vertical' }} />
                    <button onClick={handleBulkImport} disabled={fetchingBulk || !bulkText} style={{ width: '100%', padding: '0.75rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: bulkText ? 'pointer' : 'not-allowed', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                      {fetchingBulk ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Process URLs'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              // Cherry-Picker State
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', color: '#fff', margin: '0 0 0.25rem 0' }}>{stagedPlaylist.title}</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{stagedPlaylist.videos.length} videos fetched</p>
                  </div>
                  <button onClick={() => { setStagedPlaylist(null); setSelectedVideoIds(new Set()); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '5px', padding: '0.25rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer' }}>Cancel</button>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <label style={{ fontSize: '0.75rem', color: '#a1a1aa', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Cherry-Pick Range</label>
                  <input type="text" placeholder="e.g. 1-10, 15, 20-25" value={rangeInput} onChange={e => handleRangeChange(e.target.value)} style={{ width: '100%', padding: '0.6rem 0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '6px', fontSize: '0.85rem', outline: 'none' }} />
                  <p style={{ fontSize: '0.65rem', color: '#71717a', marginTop: '0.4rem', marginBottom: 0 }}>Automatically checks specific video numbers in this playlist.</p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" placeholder="Search videos..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ flex: 1, padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', outline: 'none', fontSize: '0.8rem' }} />
                  <button onClick={() => setSelectedVideoIds(new Set(filteredStagedVideos.map(v => v.id)))} style={{ padding: '0 0.75rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}>All</button>
                  <button onClick={() => setSelectedVideoIds(new Set())} style={{ padding: '0 0.75rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}>None</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', padding: '0.5rem' }}>
                  {filteredStagedVideos.map((v, i) => {
                    // Find actual index in original playlist for numbering
                    const actualIdx = stagedPlaylist.videos.findIndex(sv => sv.id === v.id);
                    return (
                      <div key={v.id} onClick={() => toggleVideoSelection(v.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', borderRadius: '6px', background: selectedVideoIds.has(v.id) ? 'rgba(99,102,241,0.15)' : 'transparent', border: `1px solid ${selectedVideoIds.has(v.id) ? 'rgba(99,102,241,0.3)' : 'transparent'}`, cursor: 'pointer', marginBottom: '0.2rem', transition: 'all 0.1s' }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `1px solid ${selectedVideoIds.has(v.id) ? '#818cf8' : 'rgba(255,255,255,0.3)'}`, background: selectedVideoIds.has(v.id) ? '#818cf8' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {selectedVideoIds.has(v.id) && <CheckCircle2 size={12} color="#fff" />}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#71717a', width: '20px', textAlign: 'right' }}>{actualIdx + 1}.</span>
                        <span style={{ fontSize: '0.8rem', color: selectedVideoIds.has(v.id) ? '#fff' : '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{v.title}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button onClick={createTopicFromSelected} disabled={selectedVideoIds.size === 0} style={{ padding: '0.75rem', background: selectedVideoIds.size > 0 ? '#3b82f6' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: selectedVideoIds.size > 0 ? 'pointer' : 'not-allowed' }}>
                    Create New Topic ({selectedVideoIds.size})
                  </button>
                  {draftTopics.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                      {draftTopics.map(t => (
                        <button key={t.id} onClick={() => addSelectedToTopic(t.id)} disabled={selectedVideoIds.size === 0} style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', fontSize: '0.75rem', whiteSpace: 'nowrap', cursor: selectedVideoIds.size > 0 ? 'pointer' : 'not-allowed' }}>
                          + Add to {t.title.slice(0, 15)}...
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Canvas */}
        <div style={{ flex: 1, background: '#121214', padding: '2rem', overflowY: 'auto' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '1.5rem', color: '#fff', fontWeight: 600, margin: 0 }}>Draft Curriculum</h1>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
              <input type="text" placeholder="New Topic Title (e.g. Week 1: Basics)" value={newTopicTitle} onChange={e => setNewTopicTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && createEmptyTopic()} style={{ flex: 1, padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '10px', fontSize: '0.95rem', outline: 'none' }} />
              <button onClick={createEmptyTopic} disabled={!newTopicTitle.trim()} style={{ padding: '0 1.25rem', background: newTopicTitle.trim() ? '#818cf8' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: newTopicTitle.trim() ? 'pointer' : 'not-allowed' }}>Add Topic</button>
            </div>

            {draftTopics.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '16px' }}>
                <BookOpen size={48} color="rgba(255,255,255,0.2)" style={{ marginBottom: '1rem' }} />
                <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: '0 0 0.5rem 0' }}>Your canvas is empty</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>Fetch a playlist from the left panel and cherry-pick videos to create your custom roadmap.</p>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {draftTopics.map(topic => (
                    <div key={topic.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: 0, fontWeight: 600 }}>{topic.title}</h3>
                        <button onClick={() => removeTopic(topic.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem', opacity: 0.6 }} title="Delete Topic"><Trash2 size={16} /></button>
                      </div>

                      <Droppable droppableId={topic.id}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} style={{ minHeight: '60px', background: snapshot.isDraggingOver ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.5rem', transition: 'background 0.2s' }}>
                            {topic.videos.length === 0 ? (
                              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>Drag videos here or use "+ Add to" from the left panel</div>
                            ) : (
                              topic.videos.map((v, idx) => (
                                <Draggable key={v.id} draggableId={v.id} index={idx}>
                                  {(provided, snapshot) => (
                                    <div ref={provided.innerRef} {...provided.draggableProps} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.08)', padding: '0.65rem', borderRadius: '8px', marginBottom: '0.4rem', border: snapshot.isDragging ? '1px solid #818cf8' : '1px solid rgba(255,255,255,0.05)', boxShadow: snapshot.isDragging ? '0 10px 30px rgba(0,0,0,0.5)' : 'none', ...provided.draggableProps.style }}>
                                      <div {...provided.dragHandleProps} style={{ color: 'rgba(255,255,255,0.3)', cursor: 'grab', padding: '0.2rem' }}>
                                        <GripVertical size={14} />
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.85rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                                      </div>
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
                  ))}
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

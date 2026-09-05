import React, { useState } from 'react';
import { X, Link as LinkIcon, Loader2, PlaySquare, BookOpen } from 'lucide-react';
import { fetchYouTubePlaylist, extractPlaylistId } from './learningHelpers';
import { toast } from 'sonner';

interface PlaylistImportModalProps {
  onImport: (title: string, lectures: { title: string; url: string }[]) => Promise<void>;
  onClose: () => void;
}

export const PlaylistImportModal: React.FC<PlaylistImportModalProps> = ({ onImport, onClose }) => {
  const [url, setUrl] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    const playlistId = extractPlaylistId(url);
    if (!playlistId) {
      toast.error('Invalid YouTube Playlist URL. Please check the link.');
      return;
    }

    setLoading(true);
    try {
      const result: any = await fetchYouTubePlaylist(playlistId);
      const videoList: any[] = Array.isArray(result) ? result : (result?.videos || []);
      if (!videoList || videoList.length === 0) {
        toast.error('No videos found in this playlist. Ensure it is public or unlisted.');
        setLoading(false);
        return;
      }

      const playlistTitle = (!Array.isArray(result) && result?.title) ? result.title : '';
      const defaultTitle = topicTitle.trim() || playlistTitle || `YouTube Course: ${playlistId.slice(0, 8)}`;
      const lectures = videoList.map((it: any) => ({
        title: it.title || 'Untitled Lecture',
        url: it.link || it.url || (it.videoId ? `https://www.youtube.com/watch?v=${it.videoId}` : ''),
      })).filter((l: any) => Boolean(l.url));

      if (lectures.length === 0) {
        toast.error('Could not extract video links from playlist.');
        setLoading(false);
        return;
      }

      await onImport(defaultTitle, lectures);
      toast.success(`🎉 Imported ${lectures.length} lectures successfully!`);
      onClose();
    } catch (err: any) {
      toast.error('Failed to import playlist: ' + (err?.message || 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal-content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="lp-modal-header">
          <div className="lp-modal-header-left">
            <div className="lp-modal-icon-badge">
              <PlaySquare size={18} color="#a599ff" />
            </div>
            <div>
              <h3 className="lp-modal-title">Import YouTube Playlist</h3>
              <p className="lp-modal-subtitle">Paste any YouTube playlist to import all lectures</p>
            </div>
          </div>
          <button type="button" className="lp-modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="lp-input-group">
            <label className="lp-input-label">Topic / Course Title (Optional)</label>
            <input
              type="text"
              className="lp-text-input"
              placeholder="e.g. Complete Rust Programming 2026"
              value={topicTitle}
              onChange={e => setTopicTitle(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="lp-input-group">
            <label className="lp-input-label">YouTube Playlist URL *</label>
            <div className="lp-input-with-icon">
              <LinkIcon size={16} className="lp-field-icon" />
              <input
                type="url"
                className="lp-text-input has-icon"
                placeholder="https://www.youtube.com/playlist?list=PL..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <p className="lp-field-hint">Supports full playlists, mix links, and series links.</p>
          </div>

          <div className="lp-modal-footer">
            <button type="button" className="lp-btn-cancel" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="lp-btn-primary" disabled={!url.trim() || loading}>
              {loading ? (
                <>
                  <Loader2 size={15} className="lp-spin" /> Fetching Playlist...
                </>
              ) : (
                'Import All Lectures'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

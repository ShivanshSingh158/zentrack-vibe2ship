import React, { useState } from 'react';
import { X, BookOpen, Check, Sparkles, ArrowRight, Layers } from 'lucide-react';
import { PREDEFINED_ROADMAPS } from '../../data/roadmaps';
import { toast } from 'sonner';

interface PredefinedRoadmapsModalProps {
  onImportRoadmap: (title: string, lectures: { title: string; url: string; category?: string }[]) => Promise<void>;
  onClose: () => void;
}

export const PredefinedRoadmapsModal: React.FC<PredefinedRoadmapsModalProps> = ({
  onImportRoadmap,
  onClose,
}) => {
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const selectedRoadmap = PREDEFINED_ROADMAPS.find(r => r.id === selectedRoadmapId);

  const handleConfirmImport = async () => {
    if (!selectedRoadmap) return;
    setImporting(true);
    try {
      const allItems: { title: string; url: string; category?: string }[] = [];
      selectedRoadmap.modules.forEach(mod => {
        mod.items.forEach(item => {
          allItems.push({
            title: item.title,
            url: item.url,
            category: mod.category,
          });
        });
      });

      await onImportRoadmap(selectedRoadmap.title, allItems);
      toast.success(`🎉 Imported roadmap "${selectedRoadmap.title}" with ${allItems.length} topics!`);
      onClose();
    } catch (err: any) {
      toast.error('Failed to import roadmap: ' + (err?.message || 'Error'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal-content lp-roadmaps-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="lp-modal-header">
          <div className="lp-modal-header-left">
            <div className="lp-modal-icon-badge">
              <BookOpen size={18} color="#a599ff" />
            </div>
            <div>
              <h3 className="lp-modal-title">Predefined Learning Roadmaps</h3>
              <p className="lp-modal-subtitle">Pick an industry-standard engineering curriculum</p>
            </div>
          </div>
          <button type="button" className="lp-modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Roadmaps Grid */}
        <div className="lp-roadmaps-grid">
          {PREDEFINED_ROADMAPS.map(r => {
            const isSelected = r.id === selectedRoadmapId;
            const totalItems = r.modules.reduce((acc, m) => acc + m.items.length, 0);

            return (
              <div
                key={r.id}
                className={`lp-roadmap-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedRoadmapId(r.id)}
              >
                <div className="lp-roadmap-card-header">
                  <span className="lp-roadmap-tag">{r.modules.length} Modules</span>
                  <span className="lp-roadmap-items-count">{totalItems} Lectures/Topics</span>
                </div>
                <h4 className="lp-roadmap-card-title">{r.title}</h4>
                <p className="lp-roadmap-card-desc">{r.description}</p>
                <div className="lp-roadmap-modules-preview">
                  {r.modules.slice(0, 3).map((m, idx) => (
                    <span key={idx} className="lp-mod-pill">
                      {m.category}
                    </span>
                  ))}
                  {r.modules.length > 3 && (
                    <span className="lp-mod-pill more">+{r.modules.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="lp-modal-footer">
          <button type="button" className="lp-btn-cancel" onClick={onClose} disabled={importing}>
            Cancel
          </button>
          <button
            type="button"
            className="lp-btn-primary"
            onClick={handleConfirmImport}
            disabled={!selectedRoadmapId || importing}
          >
            {importing ? 'Importing Path...' : 'Import Selected Roadmap'}
          </button>
        </div>
      </div>
    </div>
  );
};

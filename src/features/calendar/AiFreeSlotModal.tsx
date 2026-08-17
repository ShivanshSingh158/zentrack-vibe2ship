import React from 'react';
import { X, Sparkles, Clock, Check, Zap } from 'lucide-react';

interface AiFreeSlotModalProps {
  isOpen: boolean;
  isLoading: boolean;
  result: string | null;
  onClose: () => void;
}

export const AiFreeSlotModal: React.FC<AiFreeSlotModalProps> = ({
  isOpen,
  isLoading,
  result,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="calendar-modal-overlay" onClick={onClose}>
      <div className="calendar-modal-card ai-slot-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="calendar-modal-header">
          <div className="ai-modal-header-left">
            <div className="ai-sparkle-badge">
              <Sparkles size={18} color="#a599ff" />
            </div>
            <div>
              <h3>AI Smart Free Slot</h3>
              <p className="ai-modal-subtitle">Continuous focus window analysis</p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="ai-modal-body">
          {isLoading ? (
            <div className="ai-loading-state">
              <div className="ai-pulsing-orb" />
              <span>Analyzing your day's schedule & free windows...</span>
            </div>
          ) : (
            <div className="ai-result-content">
              <div className="ai-result-callout">
                <p className="ai-result-text">{result}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="calendar-modal-footer">
          <button type="button" className="calendar-save-btn ai-got-it-btn" onClick={onClose}>
            <Check size={16} />
            <span>Got It</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, AlertCircle, Info } from 'lucide-react';

interface ConfirmDialogProps {
  open?: boolean;
  isOpen?: boolean;
  title: string;
  message?: string;
  description?: string;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  cancelText?: string;
  danger?: boolean;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  isOpen,
  title,
  message,
  description,
  confirmLabel,
  confirmText,
  cancelLabel,
  cancelText,
  danger = false,
  variant,
  onConfirm,
  onCancel,
}) => {
  const isVisible = open !== undefined ? open : (isOpen !== undefined ? isOpen : false);

  const finalMessage = message || description || '';
  const finalConfirmText = confirmText || confirmLabel || 'Confirm';
  const finalCancelText = cancelText || cancelLabel || 'Cancel';
  const isDanger = danger || variant === 'danger';
  const isWarning = variant === 'warning';
  const isInfo = variant === 'info';

  const toneClass = isDanger ? 'danger' : isWarning ? 'warning' : isInfo ? 'info' : 'danger';

  // Handle Escape key
  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onCancel]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="confirm-dialog-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <motion.div
            className="confirm-dialog-card"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-dialog-header-row">
              <div className={`confirm-dialog-icon-wrap ${toneClass}`}>
                {isDanger ? (
                  <AlertTriangle size={18} strokeWidth={2.2} />
                ) : isWarning ? (
                  <AlertCircle size={18} strokeWidth={2.2} />
                ) : (
                  <Info size={18} strokeWidth={2.2} />
                )}
              </div>
              <div className="confirm-dialog-content">
                <div className="confirm-dialog-title-bar">
                  <h3 id="confirm-dialog-title" className="confirm-dialog-title">
                    {title}
                  </h3>
                  <button
                    type="button"
                    className="confirm-dialog-close-btn"
                    onClick={onCancel}
                    aria-label="Close dialog"
                  >
                    <X size={16} />
                  </button>
                </div>
                {finalMessage && (
                  <p className="confirm-dialog-desc">
                    {finalMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="confirm-dialog-btn-cancel"
                onClick={onCancel}
              >
                {finalCancelText}
              </button>
              <button
                type="button"
                className={`confirm-dialog-btn-confirm ${isDanger ? 'danger' : isWarning ? 'warning' : 'primary'}`}
                onClick={onConfirm}
              >
                {finalConfirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};


/**
 * PdfCompressorModal.tsx — ZenTrack Web
 *
 * Professional In-App PDF Compression Studio:
 * - Strategy A: Scan Crunch (Maximum size reduction, 75-90%)
 * - Strategy B: Crisp Text & Vector (Selectable text preservation)
 * - Strategy C: Auto-Adaptive / iLovePDF API
 * - Cloudinary 10MB Gate Compliance Verifier
 * - Target Folder Destination Selector (asks where to upload in the vault)
 * - 1-Click Upload to Cloudinary & Firestore + Local Download Option
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, CheckCircle2, AlertTriangle, ArrowRight, Folder,
  Upload, Download, RefreshCw, X, Zap, Sparkles, Sliders, ChevronDown,
  HardDrive, Layers, Check
} from 'lucide-react';
import { toast } from 'sonner';
import {
  compressPdf,
  formatBytes,
  type CompressionStrategy,
  type CompressionPreset,
  type CompressionResult,
} from '../../services/pdfCompressor';
import { uploadFileToCloudinary } from '../../services/cloudinary';
import { addDoc, collection } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { StorageNode } from '../../types/index';

interface PdfCompressorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFile: File | null;
  folders: StorageNode[];
  currentFolderId: string | null;
  onUploadSuccess: (newNode: any) => void;
}

const CLOUDINARY_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB

export const PdfCompressorModal: React.FC<PdfCompressorModalProps> = ({
  isOpen,
  onClose,
  initialFile,
  folders,
  currentFolderId,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState<File | null>(initialFile);
  const [strategy, setStrategy] = useState<CompressionStrategy>('strategy-a');
  const [preset, setPreset] = useState<CompressionPreset>('recommended');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId);

  // Compression state
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [compressionProgress, setCompressionProgress] = useState<{ stage: string; percent: number }>({
    stage: '',
    percent: 0,
  });
  const [result, setResult] = useState<CompressionResult | null>(null);

  // Uploading state
  const [isUploadingToCloud, setIsUploadingToCloud] = useState<boolean>(false);
  const [uploadPercent, setUploadPercent] = useState<number>(0);

  useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
      setResult(null);
      // Auto-pick Strategy A for files over 10MB because size is the critical barrier
      if (initialFile.size > CLOUDINARY_LIMIT_BYTES) {
        setStrategy('strategy-a');
      }
    }
  }, [initialFile]);

  useEffect(() => {
    setSelectedFolderId(currentFolderId);
  }, [currentFolderId]);

  const originalSizeFormatted = useMemo(() => {
    return file ? formatBytes(file.size) : '0 MB';
  }, [file]);

  const isOriginalOver10MB = useMemo(() => {
    return file ? file.size > CLOUDINARY_LIMIT_BYTES : false;
  }, [file]);

  // Target folder display label
  const targetFolderLabel = useMemo(() => {
    if (!selectedFolderId) return 'Root / Home Vault';
    const found = folders.find(f => f.id === selectedFolderId);
    return found ? found.name : 'Root / Home Vault';
  }, [selectedFolderId, folders]);

  // Execute Compression
  const handleStartCompression = useCallback(async () => {
    if (!file) return;
    setIsCompressing(true);
    setResult(null);
    setCompressionProgress({ stage: 'Starting compression engine...', percent: 5 });

    try {
      const res = await compressPdf(file, {
        strategy,
        preset,
        onProgress: (p) => {
          setCompressionProgress({ stage: p.stage, percent: p.percent });
        },
      });

      setResult(res);
      toast.success(`PDF compressed! Reduced by ${res.savingsPct}% (${formatBytes(res.originalSize - res.compressedSize)} saved)`);
    } catch (err: any) {
      console.error('[PdfCompressorModal] Compression failed:', err);
      toast.error(`Compression failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsCompressing(false);
    }
  }, [file, strategy, preset]);

  // Download compressed copy locally
  const handleDownloadCopy = useCallback(() => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compressed_${file?.name || 'document.pdf'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Downloaded compressed PDF to your device');
  }, [result, file]);

  // Upload compressed file to Cloudinary & Firestore in chosen folder
  const handleUploadToVault = useCallback(async () => {
    const fileToUpload = result?.file || file;
    if (!fileToUpload) return;

    if (fileToUpload.size > CLOUDINARY_LIMIT_BYTES) {
      toast.error(`Cannot upload: File is ${formatBytes(fileToUpload.size)}, which exceeds Cloudinary's 10 MB limit. Please compress further.`);
      return;
    }

    setIsUploadingToCloud(true);
    setUploadPercent(10);

    try {
      setUploadPercent(40);
      const uploadRes = await uploadFileToCloudinary(fileToUpload);
      setUploadPercent(85);

      const resolvedUrl = typeof uploadRes === 'object' && uploadRes !== null && 'url' in uploadRes ? (uploadRes as any).url : String(uploadRes || '');
      const resolvedSize = typeof uploadRes === 'object' && uploadRes !== null && 'size' in uploadRes ? (uploadRes as any).size : fileToUpload.size;

      const docRef = await addDoc(collection(db, 'storage_nodes'), {
        userId: auth.currentUser!.uid,
        type: 'file',
        fileType: 'pdf',
        name: fileToUpload.name,
        url: resolvedUrl,
        size: resolvedSize,
        mimeType: 'application/pdf',
        parentId: selectedFolderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      setUploadPercent(100);
      toast.success(`Uploaded "${fileToUpload.name}" into "${targetFolderLabel}"!`);
      onUploadSuccess({
        id: docRef.id,
        name: fileToUpload.name,
        url: resolvedUrl,
        size: resolvedSize,
        parentId: selectedFolderId,
      });
      onClose();
    } catch (err: any) {
      console.error('[PdfCompressorModal] Upload error:', err);
      toast.error(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUploadingToCloud(false);
      setUploadPercent(0);
    }
  }, [result, file, selectedFolderId, targetFolderLabel, onUploadSuccess, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        padding: '1rem',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 14 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--notes-bg-surface)',
          borderRadius: '24px',
          border: '1px solid var(--notes-border-subtle)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(124, 58, 237, 0.12)',
          overflow: 'hidden',
          color: 'var(--notes-text-primary)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--notes-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(124, 58, 237, 0.08) 0%, transparent 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
              }}
            >
              <Zap size={20} color="#FFFFFF" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                PDF Compressor Studio
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--notes-text-tertiary)', margin: '2px 0 0 0' }}>
                iLovePDF-Grade Optimization • 10 MB Cloudinary Gate Compliance
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isCompressing || isUploadingToCloud}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--notes-border-subtle)',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isCompressing || isUploadingToCloud ? 'not-allowed' : 'pointer',
              color: 'var(--notes-text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* File Overview Card */}
          <div
            style={{
              padding: '1rem',
              borderRadius: '16px',
              background: 'var(--notes-bg-surface-elevated)',
              border: isOriginalOver10MB ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--notes-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FileText size={22} color="#EF4444" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: '0.92rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {file?.name || 'Selected Document.pdf'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '3px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--notes-text-tertiary)' }}>
                    Original: <strong style={{ color: 'var(--notes-text-primary)' }}>{originalSizeFormatted}</strong>
                  </span>
                  {isOriginalOver10MB && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#EF4444',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <AlertTriangle size={11} /> Over 10 MB limit
                    </span>
                  )}
                </div>
              </div>
            </div>

            <label
              style={{
                cursor: 'pointer',
                fontSize: '0.78rem',
                color: 'var(--notes-accent-purple-light)',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(124, 58, 237, 0.3)',
                background: 'rgba(124, 58, 237, 0.08)',
                whiteSpace: 'nowrap',
              }}
            >
              Change PDF
              <input
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setFile(e.target.files[0]);
                    setResult(null);
                  }
                }}
              />
            </label>
          </div>

          {/* Strategy Selection */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--notes-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Select Compression Engine
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
              {/* Strategy A */}
              <button
                type="button"
                onClick={() => setStrategy('strategy-a')}
                style={{
                  padding: '0.85rem',
                  borderRadius: '14px',
                  textAlign: 'left',
                  background: strategy === 'strategy-a' ? 'rgba(124, 58, 237, 0.12)' : 'var(--notes-bg-surface-elevated)',
                  border: strategy === 'strategy-a' ? '1.5px solid var(--notes-accent-purple)' : '1px solid var(--notes-border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={15} color="#A78BFA" />
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: strategy === 'strategy-a' ? '#A78BFA' : 'var(--notes-text-primary)' }}>
                      Strategy A
                    </span>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, background: '#10B981', color: '#FFFFFF', padding: '1px 6px', borderRadius: '4px' }}>
                    -85% Size
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--notes-text-tertiary)', margin: 0, lineHeight: 1.35 }}>
                  <strong>Scan Crunch:</strong> Best for scanned notes & homework. Maximizes shrinkage to under 10MB.
                </p>
              </button>

              {/* Strategy B */}
              <button
                type="button"
                onClick={() => setStrategy('strategy-b')}
                style={{
                  padding: '0.85rem',
                  borderRadius: '14px',
                  textAlign: 'left',
                  background: strategy === 'strategy-b' ? 'rgba(56, 189, 248, 0.12)' : 'var(--notes-bg-surface-elevated)',
                  border: strategy === 'strategy-b' ? '1.5px solid #38BDF8' : '1px solid var(--notes-border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={15} color="#38BDF8" />
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: strategy === 'strategy-b' ? '#38BDF8' : 'var(--notes-text-primary)' }}>
                      Strategy B
                    </span>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, background: 'rgba(56, 189, 248, 0.2)', color: '#38BDF8', padding: '1px 6px', borderRadius: '4px' }}>
                    Lossless Text
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--notes-text-tertiary)', margin: 0, lineHeight: 1.35 }}>
                  <strong>Crisp Text:</strong> Keeps vector text selectable while optimizing image streams.
                </p>
              </button>

              {/* Strategy C */}
              <button
                type="button"
                onClick={() => setStrategy('strategy-c')}
                style={{
                  padding: '0.85rem',
                  borderRadius: '14px',
                  textAlign: 'left',
                  background: strategy === 'strategy-c' ? 'rgba(250, 215, 161, 0.12)' : 'var(--notes-bg-surface-elevated)',
                  border: strategy === 'strategy-c' ? '1.5px solid #FAD7A1' : '1px solid var(--notes-border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sliders size={15} color="#FAD7A1" />
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: strategy === 'strategy-c' ? '#FAD7A1' : 'var(--notes-text-primary)' }}>
                      Strategy C
                    </span>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, background: 'rgba(250, 215, 161, 0.2)', color: '#FAD7A1', padding: '1px 6px', borderRadius: '4px' }}>
                    Cloud API
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--notes-text-tertiary)', margin: 0, lineHeight: 1.35 }}>
                  <strong>iLovePDF Cloud:</strong> REST API pipeline with smart fallback to Strategy A.
                </p>
              </button>
            </div>
          </div>

          {/* Quality Presets */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: 'var(--notes-bg-surface-elevated)', padding: '0.75rem 1rem', borderRadius: '14px', border: '1px solid var(--notes-border-subtle)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--notes-text-secondary)' }}>
              Preset Level:
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['extreme', 'recommended', 'low'] as CompressionPreset[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: preset === p ? 700 : 500,
                    cursor: 'pointer',
                    background: preset === p ? 'var(--notes-accent-purple)' : 'transparent',
                    color: preset === p ? '#FFFFFF' : 'var(--notes-text-tertiary)',
                    border: 'none',
                    textTransform: 'capitalize',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {p === 'extreme' ? '🔥 Extreme' : p === 'recommended' ? '✨ Recommended' : '🛡️ Less'}
                </button>
              ))}
            </div>
          </div>

          {/* Target Folder Selector */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--notes-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Destination Folder in Vault
            </label>
            <div style={{ marginTop: '0.4rem', position: 'relative' }}>
              <select
                value={selectedFolderId || ''}
                onChange={(e) => setSelectedFolderId(e.target.value ? e.target.value : null)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  backgroundColor: 'var(--notes-bg-surface-elevated)',
                  border: '1px solid var(--notes-border-subtle)',
                  color: 'var(--notes-text-primary)',
                  fontSize: '0.88rem',
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none',
                }}
              >
                <option value="">📁 Root / Home Vault</option>
                {folders.filter(f => f.type === 'folder').map(f => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
              <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--notes-text-muted)' }}>
                <ChevronDown size={16} />
              </div>
            </div>
          </div>

          {/* Progress Indicator */}
          {isCompressing && (
            <div
              style={{
                padding: '1rem',
                borderRadius: '16px',
                background: 'rgba(124, 58, 237, 0.08)',
                border: '1px solid rgba(124, 58, 237, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--notes-accent-purple-light)' }}>
                  {compressionProgress.stage || 'Compressing document...'}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--notes-accent-purple-light)' }}>
                  {compressionProgress.percent}%
                </span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${compressionProgress.percent}%`,
                    height: '100%',
                    backgroundColor: 'var(--notes-accent-purple)',
                    borderRadius: '3px',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Compression Results Card */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding: '1rem 1.25rem',
                borderRadius: '16px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={18} color="#10B981" />
                  <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#10B981' }}>
                    Compression Complete!
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, backgroundColor: '#10B981', color: '#FFFFFF', padding: '3px 8px', borderRadius: '6px' }}>
                  -{result.savingsPct}% Reduced
                </span>
              </div>

              {/* Metrics */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '10px' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--notes-text-muted)', textTransform: 'uppercase' }}>Before</div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--notes-text-secondary)', textDecoration: 'line-through' }}>
                    {formatBytes(result.originalSize)}
                  </div>
                </div>

                <ArrowRight size={18} color="var(--notes-text-muted)" />

                <div>
                  <div style={{ fontSize: '0.72rem', color: '#10B981', textTransform: 'uppercase' }}>After</div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#10B981' }}>
                    {formatBytes(result.compressedSize)}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--notes-text-muted)', textTransform: 'uppercase' }}>Cloudinary Gate</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: result.isUnder10MB ? '#10B981' : '#EF4444' }}>
                    {result.isUnder10MB ? '✓ Under 10 MB' : '⚠️ Over 10 MB'}
                  </div>
                </div>
              </div>

              {/* Download local copy button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleDownloadCopy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: 'transparent',
                    border: '1px solid var(--notes-border-subtle)',
                    color: 'var(--notes-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <Download size={13} />
                  Download Local Copy
                </button>
              </div>
            </motion.div>
          )}

          {/* Upload Progress */}
          {isUploadingToCloud && (
            <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38BDF8' }}>
                  Uploading to Cloudinary & Vault...
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38BDF8' }}>
                  {uploadPercent}%
                </span>
              </div>
              <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${uploadPercent}%`, height: '100%', backgroundColor: '#38BDF8', transition: 'width 0.2s ease' }} />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderTop: '1px solid var(--notes-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            backgroundColor: 'var(--notes-bg-surface-elevated)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isCompressing || isUploadingToCloud}
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '12px',
              border: '1px solid var(--notes-border-subtle)',
              background: 'transparent',
              color: 'var(--notes-text-secondary)',
              fontSize: '0.88rem',
              fontWeight: 500,
              cursor: isCompressing || isUploadingToCloud ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {!result ? (
              <button
                type="button"
                onClick={handleStartCompression}
                disabled={isCompressing || !file}
                style={{
                  padding: '0.65rem 1.5rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                  color: '#FFFFFF',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: isCompressing || !file ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 15px rgba(124, 58, 237, 0.35)',
                }}
              >
                {isCompressing ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    Compressing...
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    Compress PDF
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleStartCompression}
                  disabled={isCompressing || isUploadingToCloud}
                  style={{
                    padding: '0.65rem 1rem',
                    borderRadius: '12px',
                    border: '1px solid var(--notes-border-subtle)',
                    background: 'transparent',
                    color: 'var(--notes-text-secondary)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <RefreshCw size={14} />
                  Re-Compress
                </button>

                <button
                  type="button"
                  onClick={handleUploadToVault}
                  disabled={isUploadingToCloud || !result.isUnder10MB}
                  style={{
                    padding: '0.65rem 1.5rem',
                    borderRadius: '12px',
                    border: 'none',
                    background: result.isUnder10MB ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : '#EF4444',
                    color: '#FFFFFF',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: isUploadingToCloud || !result.isUnder10MB ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.35)',
                  }}
                >
                  {isUploadingToCloud ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      Uploading ({uploadPercent}%)...
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      Upload to {targetFolderLabel}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

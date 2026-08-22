/**
 * VaultDocumentViewer.tsx — ZenTrack Mobile
 *
 * High-performance, direct in-app document viewer for Notes Vault.
 * Strictly complies with React Rules of Hooks (zero conditional hook calls).
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { feedback } from '../../utils/haptics';

import type { StorageNode } from '../../contexts/MobileDataContext';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { getCachedFilePath, downloadAndCacheFile } from '../../services/vaultCacheService';

interface VaultDocumentViewerProps {
  node: StorageNode | null;
  onClose: () => void;
}

export default function VaultDocumentViewer({ node, onClose }: VaultDocumentViewerProps) {
  const { colors, isDark } = useTheme();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);

  const isImage = node?.fileType === 'image' || (!!node?.name && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(node.name));
  const isPdf = node?.fileType === 'pdf' || (!!node?.name && /\.pdf$/i.test(node.name));
  const remoteUrl = node?.url || '';

  // Load / Check Cache safely in background
  const resolveFile = useCallback(async (targetNode: StorageNode) => {
    const url = targetNode.url || '';
    if (!url) {
      setErrorMsg('No URL available for this file.');
      return;
    }

    setErrorMsg(null);
    setDownloadProgress(0);

    try {
      // 1. Fast Cache Check (0ms)
      const cached = await getCachedFilePath(url, targetNode.name);
      if (cached) {
        setLocalUri(cached);
        setIsCached(true);
        setDownloading(false);
        return;
      }

      // 2. Download and persist to local vault cache
      setDownloading(true);
      const result = await downloadAndCacheFile(url, targetNode.name, (p) => {
        setDownloadProgress(p);
      });

      setLocalUri(result.localUri);
      setIsCached(true);
      setDownloading(false);
      feedback.success();
    } catch (err: any) {
      console.warn('[VaultDocumentViewer] Resolution warning:', err);
      setLocalUri(null);
      setIsCached(false);
      setDownloading(false);
      setErrorMsg(null);
    }
  }, []);

  useEffect(() => {
    if (node) {
      resolveFile(node);
      setWebViewKey(k => k + 1);
    } else {
      setLocalUri(null);
      setIsCached(false);
      setDownloading(false);
      setErrorMsg(null);
    }
  }, [node, resolveFile]);

  const googleDocsViewerUrl = useMemo(() => {
    return remoteUrl
      ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(remoteUrl)}`
      : '';
  }, [remoteUrl]);

  // Direct viewer URI resolution — ALWAYS called before any return
  const directViewerUri = useMemo(() => {
    if (!node) return '';
    if (isPdf && localUri && Platform.OS === 'ios') {
      return localUri;
    }
    if (googleDocsViewerUrl) {
      return googleDocsViewerUrl;
    }
    return remoteUrl;
  }, [node, isPdf, localUri, googleDocsViewerUrl, remoteUrl]);

  // Share / Open in External App
  const handleShare = async () => {
    const uriToShare = localUri || remoteUrl;
    if (!uriToShare) return;

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing not available', 'Native sharing is not supported on this device.');
        return;
      }

      await Sharing.shareAsync(uriToShare, {
        dialogTitle: `Share ${node?.name || 'File'}`,
        mimeType: isPdf ? 'application/pdf' : isImage ? 'image/*' : undefined,
      });
    } catch (err: any) {
      console.warn('[VaultDocumentViewer] Sharing warning:', err);
    }
  };

  // Safe early return ONLY AFTER all hooks have executed
  if (!node) return null;

  return (
    <Modal visible={!!node} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: isDark ? '#0A0A0C' : '#F4F3F8' }]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: isDark ? '#141416' : '#FFFFFF' }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.headerBtn, { backgroundColor: isDark ? '#1c1c1e' : '#F0EFF7' }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerTitleWrap}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {node.name}
              </Text>
              <View style={styles.statusRow}>
                {isCached ? (
                  <View style={[styles.badge, { backgroundColor: 'rgba(94, 218, 158, 0.15)' }]}>
                    <Ionicons name="flash" size={11} color="#5eda9e" />
                    <Text style={[styles.badgeText, { color: '#5eda9e' }]}>Cached Offline</Text>
                  </View>
                ) : downloading ? (
                  <View style={[styles.badge, { backgroundColor: 'rgba(165, 153, 255, 0.15)' }]}>
                    <ActivityIndicator size="small" color={colors.accentPrimary} style={{ transform: [{ scale: 0.6 }] }} />
                    <Text style={[styles.badgeText, { color: colors.accentPrimary }]}>Downloading...</Text>
                  </View>
                ) : (
                  <Text style={[styles.fileSizeText, { color: colors.textMuted }]}>
                    {node.size ? (node.size / (1024 * 1024)).toFixed(1) + ' MB' : 'Cloud File'}
                  </Text>
                )}
              </View>
            </View>

            {/* Actions */}
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setWebViewKey(k => k + 1)}
                style={[styles.headerBtn, { backgroundColor: isDark ? '#1c1c1e' : '#F0EFF7' }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleShare}
                style={[styles.headerBtn, { backgroundColor: isDark ? '#1c1c1e' : '#F0EFF7' }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="share-outline" size={18} color={colors.accentPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Direct Content Area */}
          <View style={styles.content}>
            {errorMsg ? (
              <View style={styles.centerContainer}>
                <View style={[styles.errorCard, { backgroundColor: isDark ? '#1c1c1e' : '#FFFFFF', borderColor: colors.border }]}>
                  <Ionicons name="alert-circle" size={48} color={colors.error || '#ff6961'} />
                  <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Could not open file</Text>
                  <Text style={[styles.errorSubtitle, { color: colors.textMuted }]}>{errorMsg}</Text>
                  <TouchableOpacity
                    style={[styles.retryBtn, { backgroundColor: colors.accentPrimary }]}
                    onPress={() => resolveFile(node)}
                  >
                    <Ionicons name="refresh" size={18} color="#FFFFFF" />
                    <Text style={styles.retryBtnText}>Retry Download</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : isImage ? (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: localUri || remoteUrl }}
                  style={styles.imageViewer}
                  resizeMode="contain"
                />
              </View>
            ) : directViewerUri ? (
              <View style={{ flex: 1, backgroundColor: isDark ? '#000000' : '#FFFFFF' }}>
                <WebView
                  key={`doc-view-${webViewKey}`}
                  source={{ uri: directViewerUri }}
                  style={{ flex: 1, backgroundColor: isDark ? '#000000' : '#FFFFFF' }}
                  startInLoadingState
                  scalesPageToFit={true}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  renderLoading={() => (
                    <View style={[styles.centerContainer, StyleSheet.absoluteFillObject, { backgroundColor: isDark ? '#0A0A0C' : '#FFFFFF' }]}>
                      <ActivityIndicator size="large" color={colors.accentPrimary} />
                      <Text style={{ marginTop: 14, fontFamily: FONT_FAMILY.medium, fontSize: 13, color: colors.textPrimary }}>
                        Loading Document...
                      </Text>
                      <Text style={{ marginTop: 4, fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted }}>
                        Rendering full preview
                      </Text>
                    </View>
                  )}
                  renderError={() => (
                    <View style={styles.centerContainer}>
                      <Ionicons name="document-outline" size={48} color={colors.textMuted} />
                      <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Preview Unavailable</Text>
                      <Text style={[styles.errorSubtitle, { color: colors.textMuted }]}>
                        Tap share to open directly in your PDF reader.
                      </Text>
                      <TouchableOpacity
                        style={[styles.retryBtn, { backgroundColor: colors.accentPrimary }]}
                        onPress={handleShare}
                      >
                        <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.retryBtnText}>Open with External App</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                />
              </View>
            ) : (
              <View style={styles.centerContainer}>
                <Text style={{ color: colors.textMuted, fontFamily: FONT_FAMILY.body }}>No document URL available</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: SPACE.sm,
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    gap: 4,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
  },
  fileSizeText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  content: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACE.xl,
  },
  errorCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: RADIUS.lg,
    padding: SPACE.xl,
    alignItems: 'center',
    borderWidth: 1,
  },
  errorTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    marginTop: SPACE.sm,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: SPACE.md,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  retryBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: '#FFFFFF',
  },
  imageContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewer: {
    width: '100%',
    height: '100%',
  },
});

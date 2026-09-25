/**
 * VaultDocumentViewer.tsx — ZenTrack Mobile
 *
 * High-performance, direct in-app document viewer for Notes Vault.
 * Strictly complies with React Rules of Hooks (zero conditional hook calls).
 *
 * Design: iOS-premium compact header — single row, translucent bg,
 * chevron-down close, inline type + truthful status micro-pills, max content area.
 *
 * Bulletproof Offline Support:
 * - Checks local disk cache before attempting any remote network fetch.
 * - Uses expo-image with disk cache policy for instant, flicker-free image viewing.
 * - iOS renders local PDFs directly in WKWebView (100% offline).
 * - Android provides instant 1-tap "Open in System PDF Reader" for zero-data local viewing.
 * - Truthful status pills: green "Offline" ONLY appears when genuinely loaded from device storage.
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import NetInfo from '@react-native-community/netinfo';
import { feedback } from '../../utils/haptics';

import type { StorageNode } from '../../contexts/MobileDataContext';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS } from '../../theme/tokens';
import { getCachedFilePath, downloadAndCacheFile } from '../../services/vaultCacheService';

interface VaultDocumentViewerProps {
  node: StorageNode | null;
  onClose: () => void;
}

export default function VaultDocumentViewer({ node, onClose }: VaultDocumentViewerProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [isCheckingCache, setIsCheckingCache] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDeviceOnline, setIsDeviceOnline] = useState(true);
  const [webViewKey, setWebViewKey] = useState(0);

  const isImage = node?.fileType === 'image' || (!!node?.name && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(node.name));
  const isPdf   = node?.fileType === 'pdf'   || (!!node?.name && /\.pdf$/i.test(node.name));
  const remoteUrl = node?.url || '';

  // ── Network listener for truthful online/offline state ────────────────────
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsDeviceOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
    NetInfo.fetch().then((state) => {
      setIsDeviceOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
    return () => unsubscribe();
  }, []);

  // ── File resolution: checks disk cache FIRST before touching network ──────
  const resolveFile = useCallback(async (targetNode: StorageNode) => {
    const url = targetNode.url || '';
    if (!url) {
      setErrorMsg('No URL available for this file.');
      setIsCheckingCache(false);
      return;
    }

    setErrorMsg(null);
    setDownloadProgress(0);
    setIsCheckingCache(true);

    try {
      // 1. Immediate local disk cache lookup (<15ms)
      const cached = await getCachedFilePath(url, targetNode.name);
      if (cached) {
        setLocalUri(cached);
        setIsCached(true);
        setIsCheckingCache(false);
        setDownloading(false);
        return;
      }

      // 2. Not cached locally yet
      setIsCached(false);
      setIsCheckingCache(false);

      // Check network connectivity before initiating download
      const net = await NetInfo.fetch();
      const online = !!net.isConnected && net.isInternetReachable !== false;
      if (!online) {
        setErrorMsg('Device is offline and this file is not cached locally yet.');
        return;
      }

      // 3. Download and cache permanently to local disk in background
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
      setIsCheckingCache(false);
      setDownloading(false);
    }
  }, []);

  useEffect(() => {
    if (node) {
      resolveFile(node);
      setWebViewKey((k) => k + 1);
    } else {
      setLocalUri(null);
      setIsCached(false);
      setIsCheckingCache(true);
      setDownloading(false);
      setErrorMsg(null);
    }
  }, [node, resolveFile]);

  // Google Docs viewer URL for online preview
  const googleDocsViewerUrl = useMemo(() => {
    return remoteUrl
      ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(remoteUrl)}`
      : '';
  }, [remoteUrl]);

  // Direct viewer URI for in-app WebView
  const directViewerUri = useMemo(() => {
    if (!node) return '';
    // iOS WKWebView natively renders local file:// PDFs directly from disk — 100% offline
    if (isPdf && localUri && Platform.OS === 'ios') return localUri;
    // Android or online preview
    if (googleDocsViewerUrl) return googleDocsViewerUrl;
    return remoteUrl;
  }, [node, isPdf, localUri, googleDocsViewerUrl, remoteUrl]);

  // Open file in device native reader (Google Drive, Adobe, Samsung Notes, Apple Books)
  const handleOpenInSystemReader = async () => {
    const uriToOpen = localUri || remoteUrl;
    if (!uriToOpen) return;

    try {
      feedback.tap();
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Not Supported', 'Opening files externally is not supported on this device.');
        return;
      }
      await Sharing.shareAsync(uriToOpen, {
        dialogTitle: `Open ${node?.name || 'Document'}`,
        mimeType: isPdf ? 'application/pdf' : isImage ? 'image/*' : undefined,
        UTI: isPdf ? 'com.adobe.pdf' : undefined,
      });
    } catch (err: any) {
      console.warn('[VaultDocumentViewer] External open warning:', err);
      Alert.alert('Could Not Open', 'Unable to open file in external reader: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleShare = async () => {
    const uriToShare = localUri || remoteUrl;
    if (!uriToShare) return;
    try {
      feedback.tap();
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing not available', 'Native sharing is not supported on this device.');
        return;
      }
      await Sharing.shareAsync(uriToShare, {
        dialogTitle: `Share ${node?.name || 'File'}`,
        mimeType: isPdf ? 'application/pdf' : isImage ? 'image/*' : undefined,
        UTI: isPdf ? 'com.adobe.pdf' : undefined,
      });
    } catch (err: any) {
      console.warn('[VaultDocumentViewer] Sharing warning:', err);
    }
  };

  // Safe early-return — all hooks have executed above this line
  if (!node) return null;

  // ── Derived display values ──────────────────────────────────────────────
  const fileLabel = (node.name?.length ?? 0) > 30
    ? node.name!.slice(0, 28) + '…'
    : (node.name || 'Document');

  const fileSizeLabel = node.size
    ? node.size >= 1024 * 1024
      ? `${(node.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(node.size / 1024)} KB`
    : null;

  // Whether content is genuinely served from local disk with 0 network usage
  const isGenuinelyLocal = (isImage && !!localUri) || (isPdf && !!localUri && Platform.OS === 'ios');

  // ── Theme shortcuts ─────────────────────────────────────────────────────
  const BG           = isDark ? '#000000'                : '#F4F3F8';
  const HDR_BG       = isDark ? 'rgba(12,12,14,0.96)'    : 'rgba(255,255,255,0.96)';
  const HDR_BORDER   = isDark ? 'rgba(255,255,255,0.08)'  : 'rgba(0,0,0,0.08)';
  const BTN_BG       = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const BTN_BORDER   = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const BADGE_BG     = isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)';
  const BADGE_BORDER = isDark ? 'rgba(165,153,255,0.22)' : 'rgba(108,92,231,0.16)';

  return (
    <Modal visible={!!node} animationType="slide" statusBarTranslucent transparent onRequestClose={onClose}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <View style={[s.root, { backgroundColor: BG }]}>

        {/* ─────────────── iOS-Premium Compact Header ─────────────────── */}
        <View
          style={[
            s.header,
            {
              paddingTop: insets.top + 8,
              backgroundColor: HDR_BG,
              borderBottomColor: HDR_BORDER,
            },
          ]}
        >
          {/* Chevron-down close — smooth iOS squircle */}
          <TouchableOpacity
            onPress={() => {
              feedback.tap();
              onClose();
            }}
            style={[s.iconBtn, { backgroundColor: BTN_BG, borderColor: BTN_BORDER }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.65}
            accessibilityLabel="Close viewer"
          >
            <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* File name + meta info — flex-fills the center */}
          <View style={s.titleBlock}>
            <Text
              style={[s.title, { color: colors.textPrimary }]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {fileLabel}
            </Text>

            <View style={s.metaRow}>
              {/* File-type micro-badge */}
              {(isPdf || isImage) && (
                <View style={[s.badge, { backgroundColor: BADGE_BG, borderColor: BADGE_BORDER }]}>
                  <Ionicons
                    name={isPdf ? 'document-text' : 'image'}
                    size={9.5}
                    color={colors.accentPrimary}
                  />
                  <Text style={[s.badgeText, { color: colors.accentPrimary }]}>
                    {isPdf ? 'PDF' : 'IMAGE'}
                  </Text>
                </View>
              )}

              {/* Status or File Size — clean iOS metadata without "Saved on Device" */}
              {downloading ? (
                <View style={[s.badge, { backgroundColor: BADGE_BG, borderColor: BADGE_BORDER }]}>
                  <ActivityIndicator size="small" color={colors.accentPrimary} style={s.tinySpinner} />
                  <Text style={[s.badgeText, { color: colors.accentPrimary }]}>
                    {downloadProgress > 0 ? `${downloadProgress}%` : 'Loading…'}
                  </Text>
                </View>
              ) : isCheckingCache ? (
                <View style={s.metaSubWrap}>
                  <Text style={[s.dotSeparator, { color: colors.textMuted }]}>•</Text>
                  <Text style={[s.sizeText, { color: colors.textMuted }]}>Checking…</Text>
                </View>
              ) : fileSizeLabel ? (
                <View style={s.metaSubWrap}>
                  <Text style={[s.dotSeparator, { color: colors.textMuted }]}>•</Text>
                  <Text style={[s.sizeText, { color: colors.textMuted }]}>
                    {fileSizeLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Right-side options: open external + reload + share */}
          <View style={s.actions}>
            {/* Open in external PDF / System Reader */}
            {isPdf && (
              <TouchableOpacity
                onPress={() => {
                  feedback.tap();
                  handleOpenInSystemReader();
                }}
                style={[s.iconBtn, { backgroundColor: BTN_BG, borderColor: BTN_BORDER }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.65}
                accessibilityLabel="Open in external reader"
              >
                <Ionicons name="open-outline" size={17} color={colors.textPrimary} />
              </TouchableOpacity>
            )}

            {/* Reload Preview */}
            <TouchableOpacity
              onPress={() => {
                feedback.tap();
                setWebViewKey((k) => k + 1);
                if (errorMsg && node) {
                  resolveFile(node);
                }
              }}
              style={[s.iconBtn, { backgroundColor: BTN_BG, borderColor: BTN_BORDER }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.65}
              accessibilityLabel="Reload document"
            >
              <Ionicons name="reload-outline" size={17} color={colors.textPrimary} />
            </TouchableOpacity>

            {/* Share Sheet */}
            <TouchableOpacity
              onPress={() => {
                feedback.tap();
                handleShare();
              }}
              style={[s.iconBtn, { backgroundColor: BTN_BG, borderColor: BTN_BORDER }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.65}
              accessibilityLabel="Share document"
            >
              <Ionicons name="share-outline" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ─────────────── Content — maximum screen real-estate ───────── */}
        <View style={s.content}>
          {errorMsg ? (
            // Error state
            <View style={s.center}>
              <View style={[s.errorCard, {
                backgroundColor: isDark ? '#111113' : '#FFFFFF',
                borderColor: isDark ? '#1c1c20' : '#e5e5ea',
              }]}>
                <Ionicons name="alert-circle" size={44} color={colors.error || '#ff6961'} />
                <Text style={[s.errorTitle, { color: colors.textPrimary }]}>Could not open file</Text>
                <Text style={[s.errorSub, { color: colors.textMuted }]}>{errorMsg}</Text>
                <TouchableOpacity
                  style={[s.retryBtn, { backgroundColor: colors.accentPrimary }]}
                  onPress={() => resolveFile(node)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={16} color="#FFFFFF" />
                  <Text style={s.retryText}>Retry Download</Text>
                </TouchableOpacity>
              </View>
            </View>

          ) : isImage ? (
            // Image viewer — true full-bleed black canvas with expo-image disk cache
            <View style={s.imageWrap}>
              {isCheckingCache ? (
                <View style={s.center}>
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
                </View>
              ) : (
                <ExpoImage
                  source={{ uri: localUri || remoteUrl }}
                  style={s.imageViewer}
                  contentFit="contain"
                  transition={150}
                  cachePolicy="memory-disk"
                />
              )}
            </View>

          ) : (isPdf && Platform.OS === 'android' && !isDeviceOnline && localUri) ? (
            // Android Offline PDF Card — 100% offline, zero internet dependency
            <View style={s.center}>
              <View style={[s.offlineCard, {
                backgroundColor: isDark ? '#111113' : '#FFFFFF',
                borderColor: isDark ? '#1c1c20' : '#e5e5ea',
              }]}>
                <View style={[s.offlineIconWrap, { backgroundColor: 'rgba(94,218,158,0.12)' }]}>
                  <Ionicons name="document-text" size={36} color="#5eda9e" />
                </View>
                <Text style={[s.offlineTitle, { color: colors.textPrimary }]}>Saved on Device</Text>
                <Text style={[s.offlineSub, { color: colors.textMuted }]}>
                  This PDF is stored locally in device storage. Open it with zero data in your system PDF reader.
                </Text>
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: colors.accentPrimary }]}
                  onPress={handleOpenInSystemReader}
                  activeOpacity={0.8}
                >
                  <Ionicons name="open-outline" size={17} color="#FFFFFF" />
                  <Text style={s.primaryBtnText}>Open in PDF Reader</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.secondaryBtn, { borderColor: isDark ? '#2c2c2e' : '#e5e5ea' }]}
                  onPress={handleShare}
                  activeOpacity={0.8}
                >
                  <Ionicons name="share-outline" size={16} color={colors.textSecondary} />
                  <Text style={[s.secondaryBtnText, { color: colors.textSecondary }]}>Share File</Text>
                </TouchableOpacity>
              </View>
            </View>

          ) : directViewerUri ? (
            // PDF / document WebView viewer (iOS local WKWebView or Android online preview)
            <View style={[s.webWrap, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
              <WebView
                key={`doc-${webViewKey}`}
                source={{ uri: directViewerUri }}
                style={{ flex: 1, backgroundColor: isDark ? '#000000' : '#FFFFFF' }}
                startInLoadingState
                scalesPageToFit
                javaScriptEnabled
                domStorageEnabled
                renderLoading={() => (
                  <View style={[s.center, StyleSheet.absoluteFillObject, {
                    backgroundColor: isDark ? '#000000' : '#FFFFFF',
                  }]}>
                    <ActivityIndicator size="large" color={colors.accentPrimary} />
                    <Text style={[s.loadTitle, { color: colors.textPrimary }]}>Loading Document…</Text>
                    <Text style={[s.loadSub, { color: colors.textMuted }]}>
                      {Platform.OS === 'ios' && localUri ? 'Reading from local storage' : 'Rendering preview'}
                    </Text>
                  </View>
                )}
                renderError={() => (
                  <View style={s.center}>
                    <Ionicons name="document-outline" size={44} color={colors.textMuted} />
                    <Text style={[s.errorTitle, { color: colors.textPrimary }]}>Preview Unavailable</Text>
                    <Text style={[s.errorSub, { color: colors.textMuted }]}>
                      {localUri
                        ? 'The document is saved locally on your phone. Tap below to open directly in your PDF reader.'
                        : 'Tap below to open or share in an external viewer.'}
                    </Text>
                    <TouchableOpacity
                      style={[s.retryBtn, { backgroundColor: colors.accentPrimary, marginTop: 20 }]}
                      onPress={handleOpenInSystemReader}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                      <Text style={s.retryText}>Open in System PDF Reader</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            </View>

          ) : (
            <View style={s.center}>
              <Text style={{ color: colors.textMuted, fontFamily: FONT_FAMILY.body }}>
                No document URL available
              </Text>
            </View>
          )}
        </View>

        {/* Home-indicator spacer */}
        <View style={{ height: insets.bottom, backgroundColor: BG }} />
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // ── Header — single compact iOS bar ──────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },

  titleBlock: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 2,
  },

  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    letterSpacing: -0.3,
    lineHeight: 19,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2.5,
    gap: 5,
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6.5,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3.5,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    letterSpacing: 0.3,
  },

  metaSubWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dotSeparator: {
    fontSize: 10,
    lineHeight: 12,
    opacity: 0.5,
  },

  tinySpinner: {
    transform: [{ scale: 0.55 }],
    width: 12,
    height: 12,
  },

  sizeText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    letterSpacing: -0.1,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 0,
  },

  // ── Content ──────────────────────────────────────────────────────────────
  content: { flex: 1 },
  webWrap:  { flex: 1 },

  imageWrap: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewer: {
    width: '100%',
    height: '100%',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },

  // ── Loading ───────────────────────────────────────────────────────────
  loadTitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 14,
    marginTop: 14,
    letterSpacing: -0.15,
  },
  loadSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    marginTop: 4,
  },

  // ── Error card ────────────────────────────────────────────────────────
  errorCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 26,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  errorTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  errorSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    gap: 6,
  },
  retryText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: '#FFFFFF',
  },

  // ── Offline card (Android offline PDF) ──────────────────────────────────
  offlineCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 26,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  offlineIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  offlineTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    letterSpacing: -0.2,
    marginBottom: 6,
    textAlign: 'center',
  },
  offlineSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 13,
    gap: 8,
    marginBottom: 8,
  },
  primaryBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: '#FFFFFF',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 11,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  secondaryBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
  },
});

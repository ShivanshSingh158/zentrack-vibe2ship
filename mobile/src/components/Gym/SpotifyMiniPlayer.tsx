import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import Animated, { LinearTransition, FadeIn, FadeOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSpotify } from '../../hooks/useSpotify';
import { COLORS, FONT_FAMILY, RADIUS, SHADOW } from '../../theme/tokens';
import { hapticLight } from '../../utils/haptics';

export default function SpotifyMiniPlayer() {
  const { accessToken, currentTrack, playlists, login, playPause, nextTrack, previousTrack, toggleShuffle, playContext } = useSpotify();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);

  const toggleExpand = () => {
    hapticLight();
    setIsExpanded(!isExpanded);
  };

  const togglePlaylists = () => {
    hapticLight();
    setShowPlaylists(!showPlaylists);
  };

  if (!accessToken) {
    return (
      <Animated.View style={[styles.container, styles.collapsedContainer]} layout={LinearTransition.springify().damping(20).stiffness(200)}>
        <BlurView experimentalBlurMethod="dimezisBlurView" intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={styles.pill} onPress={() => { hapticLight(); login(); }}>
          <Ionicons name="musical-notes" size={16} color="#1DB954" style={{ marginRight: 6 }} />
          <Text style={styles.pillText}>Connect Spotify</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // Determine width based on whether we have a track playing to adjust the pill size slightly
  const pillWidth = currentTrack ? 200 : 120;

  return (
    <Animated.View 
      layout={LinearTransition.springify().damping(20).stiffness(200)} 
      style={[styles.container, isExpanded ? styles.expandedContainer : [styles.collapsedContainer, { width: pillWidth }]]}
    >
      <BlurView experimentalBlurMethod="dimezisBlurView" intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      
      {!isExpanded ? (
        <View style={{ width: '100%', height: '100%' }}>
          <TouchableOpacity style={styles.pill} onPress={toggleExpand}>
            <Ionicons name="musical-notes" size={16} color="#1DB954" style={{ marginRight: 6 }} />
            <Text style={styles.pillText} numberOfLines={1}>{currentTrack ? currentTrack.name : 'Spotify'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.View entering={FadeIn.duration(200).delay(100)} exiting={FadeOut.duration(100)} style={styles.expandedContent}>
          <View style={styles.headerRow}>
            <Ionicons name="musical-notes" size={18} color="#1DB954" style={{ marginRight: 8 }} />
            <Text style={styles.title}>{currentTrack ? 'Now Playing' : 'Your Playlists'}</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={toggleExpand} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
               <Ionicons name="chevron-up" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          
          {currentTrack && (
            <View style={[styles.playerRow, { marginBottom: showPlaylists ? 16 : 0 }]}>
              {currentTrack.albumArt ? (
                <Image source={{ uri: currentTrack.albumArt }} style={styles.albumArt} />
              ) : (
                <View style={[styles.albumArt, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="musical-notes" size={16} color="#aaa" />
                </View>
              )}
              
              <View style={styles.trackInfo}>
                <Text style={styles.title} numberOfLines={1}>{currentTrack.name}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>{currentTrack.artist}</Text>
              </View>

              <View style={styles.controls}>
                <TouchableOpacity onPress={() => { hapticLight(); previousTrack(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="play-skip-back" size={20} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { hapticLight(); playPause(); }} style={styles.playBtn}>
                  <Ionicons name={currentTrack.isPlaying ? "pause" : "play"} size={22} color="#000" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { hapticLight(); nextTrack(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="play-skip-forward" size={20} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { hapticLight(); toggleShuffle(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 4 }}>
                  <Ionicons name="shuffle" size={18} color={currentTrack.shuffleState ? '#1DB954' : COLORS.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={togglePlaylists} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 4 }}>
                  <Ionicons name="list" size={18} color={showPlaylists ? '#1DB954' : COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View>
            {currentTrack && showPlaylists && playlists && playlists.length > 0 && (
              <Text style={[styles.subtitle, { marginBottom: 8, fontSize: 11 }]}>Change Playlist</Text>
            )}
            {(!currentTrack || showPlaylists) && playlists && playlists.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playlistScroll}>
                {playlists.slice(0, 10).map(pl => (
                  <TouchableOpacity key={pl.id} style={styles.playlistCard} onPress={() => { 
                    hapticLight(); 
                    playContext(pl.uri); 
                    setShowPlaylists(false); 
                  }}>
                    {pl.imageUrl ? (
                      <Image source={{ uri: pl.imageUrl }} style={styles.playlistImg} />
                    ) : (
                      <View style={[styles.playlistImg, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="musical-notes" size={16} color="#aaa" />
                      </View>
                    )}
                    <Text style={styles.playlistName} numberOfLines={1}>{pl.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              !currentTrack && <Text style={styles.subtitle}>No active playback</Text>
            )}
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(15, 15, 15, 0.4)',
    alignSelf: 'center',
    ...SHADOW.lg,
  },
  collapsedContainer: {
    borderRadius: 30,
    width: 140, // overridden by inline styles if playing
    height: 40,
  },
  expandedContainer: {
    borderRadius: 24,
    width: '92%',
    alignSelf: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingHorizontal: 16,
  },
  pillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  expandedContent: {
    padding: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  playlistScroll: {
    gap: 12,
  },
  playlistCard: {
    width: 70,
    alignItems: 'center',
  },
  playlistImg: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginBottom: 6,
  },
  playlistName: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  albumArt: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginRight: 12,
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

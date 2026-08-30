import React, { useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import YoutubeIframe from 'react-native-youtube-iframe';
import { FONT_FAMILY, SPACE } from '../../theme/tokens';
import ExerciseAnimationCard from './ExerciseAnimationCard';

export interface ActiveExerciseVideoProps {
  exercise: any;
  appState: string;
  isRefreshingVideo?: boolean;
  colors: any;
  styles: any;
  onRefreshVideo?: () => void;
  onCloseVideo?: () => void;
  onError: (err: any) => void;
}

export const ActiveExerciseVideo: React.FC<ActiveExerciseVideoProps> = React.memo(({
  exercise,
  appState,
  colors,
  styles,
  onError,
}) => {
  const [viewMode, setViewMode] = useState<'anim' | 'youtube'>('anim');
  const { width: windowWidth } = useWindowDimensions();
  
  // Exact 16:9 responsive YouTube player dimensions with 5px framing
  const videoWidth = Math.max(windowWidth - 34, 280);
  const videoHeight = Math.round((videoWidth * 9) / 16);

  return (
    <View
      style={[
        styles.videoContainer,
        {
          backgroundColor: '#111016',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.08)',
          padding: 5,
          paddingBottom: 6,
          borderRadius: 14,
          overflow: 'hidden',
          marginTop: 4,
          marginBottom: 10,
        },
      ]}
    >
      {/* Sleek Segmented Mode Switcher */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: 9,
          padding: 2,
          marginBottom: 5,
        }}
      >
        <Pressable
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 5,
            borderRadius: 7,
            backgroundColor: viewMode === 'anim' ? '#a599ff25' : 'transparent',
            borderWidth: viewMode === 'anim' ? 1 : 0,
            borderColor: viewMode === 'anim' ? 'rgba(165, 153, 255, 0.3)' : 'transparent',
          }}
          onPress={() => setViewMode('anim')}
        >
          <Ionicons
            name="barbell-outline"
            size={13}
            color={viewMode === 'anim' ? '#a599ff' : colors.textMuted}
          />
          <Text
            style={{
              fontSize: 11.5,
              fontFamily: FONT_FAMILY.bold,
              color: viewMode === 'anim' ? '#a599ff' : colors.textMuted,
            }}
          >
            Animation
          </Text>
        </Pressable>

        <Pressable
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 5,
            borderRadius: 7,
            backgroundColor: viewMode === 'youtube' ? '#ff453a25' : 'transparent',
            borderWidth: viewMode === 'youtube' ? 1 : 0,
            borderColor: viewMode === 'youtube' ? 'rgba(255, 69, 58, 0.3)' : 'transparent',
          }}
          onPress={() => setViewMode('youtube')}
        >
          <Ionicons
            name="logo-youtube"
            size={13}
            color={viewMode === 'youtube' ? '#ff453a' : colors.textMuted}
          />
          <Text
            style={{
              fontSize: 11.5,
              fontFamily: FONT_FAMILY.bold,
              color: viewMode === 'youtube' ? '#ff453a' : colors.textMuted,
            }}
          >
            Video Guide
          </Text>
        </Pressable>
      </View>

      {/* Content Area */}
      {viewMode === 'anim' ? (
        <ExerciseAnimationCard
          exerciseName={exercise.name}
          onOpenYoutube={() => setViewMode('youtube')}
          showInstructions={true}
          isEmbedded={true}
        />
      ) : exercise.videoId ? (
        <View style={{ borderRadius: 10, overflow: 'hidden', height: videoHeight, backgroundColor: '#000' }}>
          <YoutubeIframe
            height={videoHeight}
            width={videoWidth}
            play={true}
            videoId={exercise.videoId}
            onError={onError}
            initialPlayerParams={{ modestbranding: true, rel: false }}
            webViewProps={{
              androidLayerType: appState === 'active' ? 'hardware' : 'software',
              domStorageEnabled: true,
              javaScriptEnabled: true,
            }}
          />
        </View>
      ) : (
        <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={colors.accentPrimary} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, fontFamily: FONT_FAMILY.medium }}>Finding form video for {exercise.name}...</Text>
        </View>
      )}
    </View>
  );
});

export default ActiveExerciseVideo;

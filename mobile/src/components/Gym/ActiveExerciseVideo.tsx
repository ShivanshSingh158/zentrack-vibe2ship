import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import YoutubeIframe from 'react-native-youtube-iframe';
import { FONT_FAMILY, SPACE } from '../../theme/tokens';

export interface ActiveExerciseVideoProps {
  exercise: any;
  appState: string;
  isRefreshingVideo: boolean;
  colors: any;
  styles: any;
  onRefreshVideo: () => void;
  onCloseVideo: () => void;
  onError: (err: any) => void;
}

export const ActiveExerciseVideo: React.FC<ActiveExerciseVideoProps> = React.memo(({
  exercise,
  appState,
  isRefreshingVideo,
  colors,
  styles,
  onRefreshVideo,
  onCloseVideo,
  onError,
}) => {
  return (
    <View style={[styles.videoContainer, { backgroundColor: '#161618', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 8, marginBottom: SPACE.xl }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="logo-youtube" size={16} color="#ff453a" />
          <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary }}>Form Guide Demonstration</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={onRefreshVideo}
            disabled={isRefreshingVideo}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}
          >
            {isRefreshingVideo ? (
              <ActivityIndicator size="small" color="#a599ff" />
            ) : (
              <Ionicons name="refresh" size={13} color="#a599ff" />
            )}
            <Text style={{ fontSize: 11, fontFamily: FONT_FAMILY.bold, color: '#a599ff' }}>
              {isRefreshingVideo ? 'Refreshing...' : 'Refresh'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onCloseVideo}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {exercise.videoId ? (
        <YoutubeIframe
          height={210}
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
      ) : (
        <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={colors.accentPrimary} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, fontFamily: FONT_FAMILY.medium }}>Finding form video for {exercise.name}...</Text>
        </View>
      )}
    </View>
  );
});

export default ActiveExerciseVideo;

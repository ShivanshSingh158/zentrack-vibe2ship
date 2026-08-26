import React, { useState, useEffect } from 'react';
import { formatDateShort } from '../../utils/dateUtils';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAcademicData } from '../../contexts/domains/AcademicContext';
import { callProxy, parseProxyResponse } from '../../services/geminiProxy';
import { FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';
import GlassCard from '../ui/GlassCard';

const PREDICTOR_CACHE_KEY = '@zentrack_academic_predictor';

export default function AcademicPredictorCard() {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const { attendance, assignments } = useAcademicData();

  const [prediction, setPrediction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    loadCachedPrediction();
  }, []);

  const loadCachedPrediction = async () => {
    try {
      const cached = await AsyncStorage.getItem(PREDICTOR_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setPrediction(parsed.text);
        setLastUpdated(parsed.timestamp);
      }
    } catch (e) {
      console.warn('Failed to load cached prediction', e);
    }
  };

  const generatePrediction = async () => {
    if (!attendance || attendance.length === 0) return;
    setLoading(true);

    try {
      const prompt = `You are an Academic Predictor AI. Analyze this student's data and write a short 2-sentence prediction of their overall grade/risk, specifically mentioning one subject by name. Be encouraging but realistic.

Attendance:
${attendance.map(a => `- ${a.name}: ${a.classesAttended}/${a.classesTotal} (${Math.round((a.classesAttended/Math.max(1, a.classesTotal))*100)}%)`).join('\n')}

Assignments:
${assignments?.map(a => `- ${a.title}: ${a.status} (Weight: ${a.weightage || '?'})`).join('\n') || 'None'}

Output just the 2 sentences. No bold formatting, no markdown.`;

      const response = await callProxy({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      if (response && response.text) {
        const text = response.text.replace(/\*\*/g, '').trim();
        setPrediction(text);
        setLastUpdated(Date.now());
        AsyncStorage.setItem(PREDICTOR_CACHE_KEY, JSON.stringify({ text, timestamp: Date.now() }));
      }
    } catch (e) {
      console.error('Failed to generate prediction', e);
    } finally {
      setLoading(false);
    }
  };

  const isDataAvailable = attendance && attendance.length > 0;

  return (
    <GlassCard style={s.card}>
      <View style={s.header}>
        <View style={s.titleRow}>
          <Ionicons name="school" size={20} color={colors.accentSecondary} />
          <Text style={s.title}>AI Performance Predictor</Text>
        </View>
        {lastUpdated && (
          <Text style={s.timestamp}>
            Updated {formatDateShort(new Date(lastUpdated).toISOString().slice(0,10))}
          </Text>
        )}
      </View>

      {!isDataAvailable ? (
        <Text style={s.body}>Add subjects and log attendance to get AI grade predictions.</Text>
      ) : loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator color={colors.accentSecondary} />
          <Text style={s.loadingText}>SARA is analyzing your performance...</Text>
        </View>
      ) : prediction ? (
        <View>
          <Text style={s.body}>{prediction}</Text>
          <TouchableOpacity style={s.refreshBtn} onPress={generatePrediction}>
            <Ionicons name="refresh" size={14} color={colors.accentSecondary} />
            <Text style={s.refreshText}>Recalculate</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.ctaBox}>
          <Text style={s.body}>Generate an AI prediction based on your current attendance and assignments.</Text>
          <TouchableOpacity style={s.generateBtn} onPress={generatePrediction}>
            <Text style={s.generateBtnText}>Generate Prediction</Text>
          </TouchableOpacity>
        </View>
      )}
    </GlassCard>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  card: {
    padding: SPACE.md,
    marginBottom: SPACE.lg,
    borderColor: 'rgba(165,153,255,0.3)',
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  timestamp: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: 10,
    color: colors.textMuted,
  },
  body: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: SPACE.md,
  },
  loadingText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 14,
    color: colors.accentPurple,
  },
  ctaBox: {
    marginTop: SPACE.sm,
  },
  generateBtn: {
    backgroundColor: 'rgba(165,153,255,0.2)',
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
    alignSelf: 'flex-start',
    marginTop: SPACE.md,
  },
  generateBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: colors.accentPurple,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: SPACE.sm,
  },
  refreshText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.accentPurple,
  },
});

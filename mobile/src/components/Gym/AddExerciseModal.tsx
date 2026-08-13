/**


 * AddExerciseModal • ZenTrack Mobile (v2)


 *


 * UX: Type to search • compact inline dropdown (max 5 rows) • tap to auto-fill


 * all fields (sets, reps, rest, muscle, videoId) + last-session weight/reps.


 */





import React, { useState, useMemo, useRef, useEffect } from 'react';

import AsyncStorage from '@react-native-async-storage/async-storage';


import {


  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,


  ScrollView, KeyboardAvoidingView, Platform, Switch, FlatList,


} from 'react-native';


import { Ionicons } from '@expo/vector-icons';


import { FONT_FAMILY, SPACE, RADIUS, FONT_SIZE } from '../../theme/tokens';


import { GymExerciseLog, GymPlanDay, GymPlanExercise } from '../../types/gym.types';


import { useMobileData } from '../../contexts/MobileDataContext';


import { MUSCLE_COLORS, resolveMuscleColor, hexToRgba } from '../../utils/gymUtils';


import { useTheme } from '../../contexts/ThemeContext';


import { getCustomPlanDay } from '../../hooks/useGymLog';


import { autoResolveExerciseVideoId } from '../../services/exerciseVideoResolver';


import { aiResolveExercise, AIExerciseInfo } from '../../services/geminiProxy';


import { GYM_PLAN } from '../../data/gymPlan';
import { EXERCISE_DATABASE } from '../../data/exerciseDatabase';


import { handleSyncError } from '../../utils/errorUtils';








// •• All exercises: flatten GYM_PLAN + EXERCISE_ALTERNATIVES into a deduplicated catalogue ••





interface ExerciseCatalogEntry {


  id: string;


  name: string;


  muscle: string;


  targetSets: number;


  targetReps: string;


  aliases?: string[];


  restTimeSecs: number;


  videoId: string;


}





/** Build a full deduplicated exercise catalogue from our plan + alternatives. */


function buildCatalogue(): ExerciseCatalogEntry[] {


  const seen = new Set<string>();


  const result: ExerciseCatalogEntry[] = [];





  const add = (e: ExerciseCatalogEntry) => {


    const key = e.name.toLowerCase().trim();


    if (seen.has(key)) return;


    seen.add(key);


    result.push(e);


  };





  // GYM_PLAN exercises (highest priority • have full metadata)


  for (const day of GYM_PLAN) {


    for (const ex of day.exercises) {


      add({


        id: ex.id,


        name: ex.name,


        muscle: ex.muscle ?? 'Mixed',


        targetSets: ex.targetSets ?? 3,


        targetReps: ex.targetReps ?? '8-12',


        restTimeSecs: (ex as any).restTimeSecs ?? 60,


        videoId: ex.videoId ?? '',


      });


    }


  }





  // EXERCISE_ALTERNATIVES (may not have full metadata • fill defaults)


  const MUSCLE_DEFAULTS: Record<string, { sets: number; reps: string; rest: number }> = {


    Chest: { sets: 3, reps: '8-12', rest: 90 },


    Back: { sets: 3, reps: '8-12', rest: 90 },


    Shoulders: { sets: 3, reps: '10-15', rest: 75 },


    'Side Delts': { sets: 3, reps: '12-15', rest: 60 },


    'Rear Delts': { sets: 3, reps: '12-15', rest: 60 },


    Triceps: { sets: 3, reps: '10-12', rest: 60 },


    Biceps: { sets: 3, reps: '10-12', rest: 60 },


    Brachialis: { sets: 3, reps: '10-12', rest: 60 },


    Quads: { sets: 3, reps: '8-12', rest: 90 },


    'Quads/Glutes': { sets: 3, reps: '8-12', rest: 90 },


    Hamstrings: { sets: 3, reps: '8-12', rest: 90 },


    'Glutes/Hams': { sets: 3, reps: '10-15', rest: 75 },


    Calves: { sets: 4, reps: '12-15', rest: 45 },


    Soleus: { sets: 4, reps: '12-15', rest: 45 },


    Abs: { sets: 3, reps: '12-15', rest: 45 },


    Obliques: { sets: 3, reps: '12-15', rest: 45 },


    Forearms: { sets: 3, reps: '15-20', rest: 45 },


    Mixed: { sets: 3, reps: '8-12', rest: 60 },


  };





  // EXERCISE_DATABASE integration


  for (const dbEntry of EXERCISE_DATABASE) {


    // Determine canonical muscle logic for defaults if the sub-group isn't mapped


    let defaults = MUSCLE_DEFAULTS[dbEntry.muscle];


    if (!defaults) {


      if (dbEntry.muscle.includes('Chest')) defaults = MUSCLE_DEFAULTS['Chest'];


      else if (dbEntry.muscle.includes('Back') || dbEntry.muscle.includes('Lats')) defaults = MUSCLE_DEFAULTS['Back'];


      else if (dbEntry.muscle.includes('Delt')) defaults = MUSCLE_DEFAULTS['Shoulders'];


      else if (dbEntry.muscle.includes('Tricep')) defaults = MUSCLE_DEFAULTS['Triceps'];


      else if (dbEntry.muscle.includes('Bicep')) defaults = MUSCLE_DEFAULTS['Biceps'];


      else if (dbEntry.muscle.includes('Quad')) defaults = MUSCLE_DEFAULTS['Quads'];


      else if (dbEntry.muscle.includes('Glute') || dbEntry.muscle.includes('Ham')) defaults = MUSCLE_DEFAULTS['Hamstrings'];


      else if (dbEntry.muscle.includes('Calf')) defaults = MUSCLE_DEFAULTS['Calves'];


      else if (dbEntry.muscle.includes('Abs') || dbEntry.muscle.includes('Oblique')) defaults = MUSCLE_DEFAULTS['Abs'];


      else if (dbEntry.muscle.includes('Forearm')) defaults = MUSCLE_DEFAULTS['Forearms'];


      else defaults = MUSCLE_DEFAULTS['Mixed'];


    }



    add({


      id: dbEntry.id,


      name: dbEntry.name,


      muscle: dbEntry.muscle, // Use the highly specific sub-group


      targetSets: defaults.sets,


      targetReps: defaults.reps,


      restTimeSecs: defaults.rest,


      videoId: dbEntry.videoId || '',


      // Pass aliases directly onto the catalogue entry to improve searching


      aliases: dbEntry.aliases,


    } as any);


  }



  return result;


}




const EXERCISE_CATALOGUE = buildCatalogue();



// -- Custom AI-resolved exercises persisted to AsyncStorage --



const CUSTOM_EXERCISES_KEY = '@zentrack_custom_exercises';



/** Load all user-saved custom exercises from AsyncStorage and merge into the runtime catalogue. */



async function loadCustomExercisesToCatalogue(): Promise<void> {



  try {



    const raw = await AsyncStorage.getItem(CUSTOM_EXERCISES_KEY);



    if (!raw) return;



    const customs: ExerciseCatalogEntry[] = JSON.parse(raw);



    for (const ex of customs) {



      const key = ex.name.toLowerCase().trim();



      if (!EXERCISE_CATALOGUE.some(e => e.name.toLowerCase().trim() === key)) {



        EXERCISE_CATALOGUE.push(ex);



      }



    }



  } catch (_) {}



}



/** Persist a new custom exercise entry (from AI) to AsyncStorage for future sessions. */



async function persistCustomExercise(entry: ExerciseCatalogEntry): Promise<void> {



  try {



    const raw = await AsyncStorage.getItem(CUSTOM_EXERCISES_KEY);



    const existing: ExerciseCatalogEntry[] = raw ? JSON.parse(raw) : [];



    const key = entry.name.toLowerCase().trim();



    if (!existing.some(e => e.name.toLowerCase().trim() === key)) {



      existing.push(entry);



      await AsyncStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(existing));



    }



  } catch (_) {}



}



// Load custom exercises into the catalogue on module load



loadCustomExercisesToCatalogue();





const MUSCLES_LIST = ['None', ...Object.keys(MUSCLE_COLORS)];





const extractVideoId = (urlOrId: string) => {


  if (!urlOrId) return '';


  const m = urlOrId.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);


  return (m && m[2].length === 11) ? m[2] : urlOrId;


};





interface Props {


  visible: boolean;


  onClose: () => void;


  onAdd: (ex: GymExerciseLog) => void;


  planDay?: GymPlanDay;


  existingExerciseIds?: string[];


}





export function AddExerciseModal({ visible, onClose, onAdd, planDay, existingExerciseIds = [] }: Props) {


  const { colors } = useTheme();


  const styles = makeStyles(colors);





  const { userGymPlan, updateMasterPlan, gymLogs } = useMobileData();





  // •• Form state ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••


  const [name, setName] = useState('');


  const [sets, setSets] = useState('3');


  const [reps, setReps] = useState('8-12');


  const [restTime, setRestTime] = useState('60');


  const [muscle, setMuscle] = useState('None');


  const [videoLink, setVideoLink] = useState('');


  const [savePermanently, setSavePermanently] = useState(false);


  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);


  const [showDropdown, setShowDropdown] = useState(false);


  // G3: muscle search filter chips


  const [muscleSearchFilter, setMuscleSearchFilter] = useState<string | null>(null);





  // •• AI resolver state •••••••••••••••••••••••••••••••••••••••••••••••••••••••


  const [aiSuggestion, setAiSuggestion] = useState<AIExerciseInfo | null>(null);


  const [aiLoading, setAiLoading] = useState(false);


  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);





  // •• Search & filter •••••••••••••••••••••••••••••••••••••••••••••••••••••••••


  const suggestions = useMemo(() => {


    const q = name.trim().toLowerCase();



    const checkMuscleMatch = (exerciseMuscle: string, filterName: string | null) => {


      if (!filterName) return true;


      const t = exerciseMuscle.toLowerCase();


      const f = filterName.toLowerCase();


      if (f === 'legs') return t.includes('quad') || t.includes('glute') || t.includes('ham') || t.includes('calf') || t.includes('soleus');
      if (f === 'arms') return t.includes('bicep') || t.includes('tricep') || t.includes('brach') || t.includes('forearm');
      if (f === 'abs') return t.includes('abs') || t.includes('oblique') || t.includes('core');
      if (f === 'back') return t.includes('back') || t.includes('lat');
      if (f === 'shoulders') return t.includes('shoulder') || t.includes('delt');


      return t.includes(f);


    };



    // G3: If muscle filter active, show all exercises for that muscle (up to 30)


    if (muscleSearchFilter && !q) {


      return EXERCISE_CATALOGUE


        .filter(e => checkMuscleMatch(e.muscle, muscleSearchFilter))


        .slice(0, 30);


    }


    if (!q || q.length < 1) return [];


    return EXERCISE_CATALOGUE


      .filter(e => {


        const nameMatch = e.name.toLowerCase().includes(q) || (e.aliases && e.aliases.some(alias => alias.toLowerCase().includes(q)));


        const muscleMatch = checkMuscleMatch(e.muscle, muscleSearchFilter);


        return nameMatch && muscleMatch;


      })


      .slice(0, 30);


  }, [name, muscleSearchFilter]);





  // •• Last-session lookup •••••••••••••••••••••••••••••••••••••••••••••••••••••


  const getLastSessionSets = (exerciseId: string, exerciseName: string) => {


    if (!gymLogs) return null;


    // Find all logs that have this exercise, sorted newest first


    const logsWithEx = [...gymLogs]


      .sort((a, b) => b.date.localeCompare(a.date))


      .filter(log => log.exercises?.some((ex: any) =>


        ex.exerciseId === exerciseId || ex.name?.toLowerCase() === exerciseName.toLowerCase()


      ));


    if (logsWithEx.length === 0) return null;


    const latestLog = logsWithEx[0];


    const ex = latestLog.exercises!.find((ex: any) =>


      ex.exerciseId === exerciseId || ex.name?.toLowerCase() === exerciseName.toLowerCase()


    );


    return ex?.setsLog ?? null;


  };





  // •• Select from catalogue dropdown • auto-fill ••••••••••••••••••••••••••••••


  const handleSelectSuggestion = (entry: ExerciseCatalogEntry) => {


    setName(entry.name);


    setSets(String(entry.targetSets));


    setReps(entry.targetReps);


    setRestTime(String(entry.restTimeSecs));


    setMuscle(entry.muscle || 'None');


    setVideoLink(entry.videoId || '');


    setSelectedExerciseId(entry.id);


    setShowDropdown(false);


    setAiSuggestion(null);


  };





  // •• Select from AI suggestion • auto-fill + video lookup ••••••••••••••••••••


  const handleSelectAiSuggestion = async (ai: AIExerciseInfo) => {
    // Generate a stable ID from the canonical name so last-session lookup works next time
    const stableId = `ai_${ai.canonicalName.replace(/\s+/g, '_').toLowerCase()}`;
    setName(ai.canonicalName);
    setSets(String(ai.targetSets));
    setReps(ai.targetReps);
    setRestTime(String(ai.restTimeSecs));
    setMuscle(ai.muscle || 'None');
    setSelectedExerciseId(stableId); // Use stable ID so future sessions pre-load data
    setShowDropdown(false);
    setAiSuggestion(null);

    // Persist to AsyncStorage so next time the exercise appears in the search dropdown
    const catalogueEntry: ExerciseCatalogEntry = {
      id: stableId,
      name: ai.canonicalName,
      muscle: ai.muscle || 'Mixed',
      targetSets: ai.targetSets,
      targetReps: ai.targetReps,
      restTimeSecs: ai.restTimeSecs,
      videoId: '',
    };
    persistCustomExercise(catalogueEntry);
    // Also add to the runtime catalogue immediately for this session
    const nameKey = ai.canonicalName.toLowerCase().trim();
    if (!EXERCISE_CATALOGUE.some(e => e.name.toLowerCase().trim() === nameKey)) {
      EXERCISE_CATALOGUE.push(catalogueEntry);
    }

    // Resolve YouTube video in background
    const videoId = await autoResolveExerciseVideoId(ai.youtubeSearchQuery || ai.canonicalName);
    if (videoId) {
      setVideoLink(videoId);
      // Update persisted entry with resolved videoId
      persistCustomExercise({ ...catalogueEntry, videoId });
    }
  };






  const handleNameChange = (text: string) => {


    setName(text);


    setSelectedExerciseId(null);


    setShowDropdown(true);


    setAiSuggestion(null);





    // Cancel any pending AI call


    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);





    // Only trigger AI when there's text and no catalogue match


    if (text.trim().length >= 3) {


      aiDebounceRef.current = setTimeout(async () => {


        // Check if catalogue already has matches • if yes, no need for AI


        const q = text.trim().toLowerCase();


        const hasMatches = EXERCISE_CATALOGUE.some(e => 
          e.name.toLowerCase().includes(q) || 
          (e.aliases && e.aliases.some(a => a.toLowerCase().includes(q)))
        );


        if (!hasMatches) {


          setAiLoading(true);


          try {


            const result = await aiResolveExercise(text.trim());


            if (result) {
              setAiSuggestion(result);
            } else {
              setAiSuggestion({
                canonicalName: `Failed to analyze: ${text.trim()}`,
                muscle: 'Mixed',
                targetSets: 3,
                targetReps: '8-12',
                restTimeSecs: 60,
                youtubeSearchQuery: text.trim()
              });
            }
          } catch (_) {
            setAiSuggestion({
              canonicalName: `Error analyzing: ${text.trim()}`,
              muscle: 'Mixed',
              targetSets: 3,
              targetReps: '8-12',
              restTimeSecs: 60,
              youtubeSearchQuery: text.trim()
            });
          } finally {


            setAiLoading(false);


          }


        }


      }, 900); // 900ms debounce


    }


  };





  // •• Add exercise ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••


  const handleAddExercise = async () => {


    if (!name.trim()) return;





    const parsedSets = parseInt(sets, 10) || 3;


    const parsedRest = parseInt(restTime, 10) || 60;





    let userVideoId = extractVideoId(videoLink.trim());


    if (!userVideoId) {


      userVideoId = (await autoResolveExerciseVideoId(name.trim())) || '';


    }





    const exId = selectedExerciseId ?? `custom_${Date.now()}`;


    const lastSets = getLastSessionSets(exId, name.trim());





    const newEx: GymExerciseLog = {


      exerciseId: exId,


      name: name.trim(),


      muscle: muscle === 'None' ? '' : muscle.trim(),


      targetSets: parsedSets,


      targetReps: reps.trim(),


      videoId: userVideoId,


      restTimeSecs: parsedRest,


      lastSessionSets: lastSets ?? undefined,


      setsLog: Array.from({ length: parsedSets }, (_, i) => {


        const prev = lastSets?.[i];


        return {


          setNumber: i + 1,


          reps: prev?.reps ?? null,


          weight: prev?.weight ?? null,


          completed: false,


        };


      }),


      isCustom: !selectedExerciseId || exId.startsWith('custom_'),


    };





    onAdd(newEx);





    if (savePermanently && planDay) {


      const currentMasterDay = getCustomPlanDay(userGymPlan?.customDays, planDay.dayIndex) || planDay;


      const updatedExercises = [...currentMasterDay.exercises];


      if (!updatedExercises.some((e: any) => e.id === newEx.exerciseId)) {


        updatedExercises.push({


          id: newEx.exerciseId,


          name: newEx.name,


          muscle: newEx.muscle,


          targetSets: newEx.targetSets,


          targetReps: newEx.targetReps,


          videoId: newEx.videoId,


          restTimeSecs: newEx.restTimeSecs,


        });


        updateMasterPlan(planDay.dayIndex, { ...currentMasterDay, exercises: updatedExercises }).catch(handleSyncError);


      }


    }





    resetAndClose();


  };





  const resetAndClose = () => {


    setName('');


    setSets('3');


    setReps('8-12');


    setRestTime('60');


    setMuscle('None');


    setVideoLink('');


    setSavePermanently(false);


    setSelectedExerciseId(null);


    setShowDropdown(false);


    setAiSuggestion(null);


    setAiLoading(false);


    setMuscleSearchFilter(null); // G3


    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);


    onClose();


  };





  const hasLastSession = selectedExerciseId ? !!getLastSessionSets(selectedExerciseId, name) : false;





  return (


    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>


      <View style={styles.modalBg}>


        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={resetAndClose} />


        <KeyboardAvoidingView


          behavior={Platform.OS === 'ios' ? 'padding' : undefined}


          style={styles.modalContent}


        >


          {/* •• Header •• */}


          <View style={styles.header}>


            <Text style={styles.title}>Add Exercise</Text>


            <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>


              <Ionicons name="close" size={20} color={colors.textMuted} />


            </TouchableOpacity>


          </View>





          <ScrollView


            style={styles.scrollArea}


            showsVerticalScrollIndicator={false}


            keyboardShouldPersistTaps="handled"


          >


            {/* G3: Filter by Muscle chips */}


            <ScrollView


              horizontal showsHorizontalScrollIndicator={false}


              contentContainerStyle={{ gap: 6, paddingBottom: 8 }}


              style={{ marginBottom: 8 }}


            >


              {['Chest','Back','Legs','Shoulders','Arms','Abs'].map(m => {


                const isActive = muscleSearchFilter === m;


                return (


                  <TouchableOpacity


                    key={m}


                    style={{


                      paddingHorizontal: 12, paddingVertical: 6,


                      borderRadius: 14, borderWidth: 1,


                      backgroundColor: isActive ? 'rgba(165,153,255,0.18)' : 'rgba(255,255,255,0.05)',


                      borderColor: isActive ? 'rgba(165,153,255,0.6)' : 'rgba(255,255,255,0.1)',


                    }}


                    onPress={() => {


                      const next = muscleSearchFilter === m ? null : m;


                      setMuscleSearchFilter(next);


                      setShowDropdown(true);


                    }}


                  >


                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: isActive ? '#a599ff' : colors.textMuted }}>{m}</Text>


                  </TouchableOpacity>


                );


              })}


            </ScrollView>





            {/* •• Exercise Name with Inline Search Dropdown •• */}


            <View style={styles.inputGroup}>


              <Text style={styles.inputLabel}>EXERCISE NAME *</Text>


              <View style={{ position: 'relative' }}>


                <View style={styles.searchRow}>


                  <Ionicons name="search-outline" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />


                  <TextInput


                    style={styles.searchInput}


                    placeholder="Search exercises..."


                    placeholderTextColor={colors.textTertiary}


                    value={name}


                    onChangeText={handleNameChange}


                    onFocus={() => setShowDropdown(true)}


                    autoCorrect={false}


                    autoCapitalize="words"


                    returnKeyType="done"


                  />


                  {name.length > 0 && (


                    <TouchableOpacity


                      onPress={() => { setName(''); setSelectedExerciseId(null); setShowDropdown(false); }}


                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}


                    >


                      <Ionicons name="close-circle" size={16} color={colors.textTertiary} />


                    </TouchableOpacity>


                  )}


                </View>





                {/* •• Dropdown •• */}


                {showDropdown && (suggestions.length > 0 || aiLoading || aiSuggestion) && (


                  <View style={styles.dropdown}>


                    {/* Catalogue suggestions */}


                    {suggestions.length > 0 && (


                      <FlatList


                        data={suggestions}


                        keyExtractor={item => item.id}


                        keyboardShouldPersistTaps="handled"


                        showsVerticalScrollIndicator={false}


                        nestedScrollEnabled


                        style={{ maxHeight: 220 }}


                        renderItem={({ item, index }) => {


                          const muscleColor = item.muscle && item.muscle !== 'None'


                            ? resolveMuscleColor(item.muscle)


                            : colors.textTertiary;


                          return (


                            <TouchableOpacity


                              style={[


                                styles.suggestionRow,


                                index !== 0 && styles.suggestionBorder,


                              ]}


                              onPress={() => handleSelectSuggestion(item)}


                              activeOpacity={0.7}


                            >


                              <View style={{ flex: 1 }}>


                                <Text style={styles.suggestionName} numberOfLines={1}>{item.name}</Text>


                                <Text style={[styles.suggestionMeta, { color: muscleColor }]}>


                                  {item.muscle}


                                </Text>


                              </View>


                              <View style={styles.suggestionRight}>


                                <Text style={styles.suggestionSets}>


                                  {item.targetSets}x {item.targetReps}


                                </Text>


                                <Ionicons name="return-down-back-outline" size={14} color={colors.textTertiary} />


                              </View>


                            </TouchableOpacity>


                          );


                        }}


                      />


                    )}





                    {/* AI loading shimmer */}


                    {aiLoading && suggestions.length === 0 && (


                      <View style={styles.aiLoadingRow}>


                        <Ionicons name="sparkles-outline" size={16} color={colors.accentPrimary} />


                        <Text style={styles.aiLoadingText}>AI is identifying exercise...</Text>


                      </View>


                    )}





                    {/* AI suggestion */}


                    {!aiLoading && aiSuggestion && suggestions.length === 0 && (


                      <TouchableOpacity


                        style={styles.aiSuggestionRow}


                        onPress={() => handleSelectAiSuggestion(aiSuggestion)}


                        activeOpacity={0.7}


                      >


                        <View style={styles.aiSuggestionLeft}>


                          <Ionicons name="sparkles-outline" size={18} color={colors.accentPrimary} />


                          <View style={{ flex: 1 }}>


                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>


                              <Text style={styles.aiSuggestionName} numberOfLines={1}>


                                {aiSuggestion.canonicalName}


                              </Text>


                              <View style={styles.aiBadge}>


                                <Text style={styles.aiBadgeText}>AI</Text>


                              </View>


                            </View>


                            <Text style={[styles.suggestionMeta, { color: resolveMuscleColor(aiSuggestion.muscle) }]}>


                              {aiSuggestion.muscle} · {aiSuggestion.targetSets}x {aiSuggestion.targetReps} · {aiSuggestion.restTimeSecs}s rest


                            </Text>


                          </View>


                        </View>


                        <Ionicons name="return-down-back-outline" size={14} color={colors.accentPrimary} />


                      </TouchableOpacity>


                    )}


                  </View>


                )}


              </View>





              {/* Last session badge */}


              {hasLastSession && (


                <View style={styles.lastSessionBadge}>


                  <Ionicons name="time-outline" size={11} color={colors.accentPrimary} />


                  <Text style={styles.lastSessionText}>Last session data pre-loaded</Text>


                </View>


              )}


            </View>





            {/* •• Sets / Reps / Rest • 3-column row •• */}


            <View style={styles.metaRow}>


              <View style={[styles.inputGroup, { flex: 1 }]}>


                <Text style={styles.inputLabel}>SETS</Text>


                <TextInput


                  style={styles.inputCompact}


                  keyboardType="numeric"


                  value={sets}


                  onChangeText={setSets}


                  textAlign="center"


                />


              </View>


              <View style={[styles.inputGroup, { flex: 1.6 }]}>


                <Text style={styles.inputLabel}>REPS</Text>


                <TextInput


                  style={styles.inputCompact}


                  value={reps}


                  onChangeText={setReps}


                  textAlign="center"


                />


              </View>


              <View style={[styles.inputGroup, { flex: 1.5 }]}>


                <Text style={styles.inputLabel}>REST (SEC)</Text>


                <TextInput


                  style={styles.inputCompact}


                  keyboardType="numeric"


                  value={restTime}


                  onChangeText={setRestTime}


                  textAlign="center"


                />


              </View>


            </View>





            {/* •• Muscle Group pills •• */}


            <View style={styles.inputGroup}>


              <Text style={styles.inputLabel}>MUSCLE GROUP</Text>


              <ScrollView


                horizontal


                showsHorizontalScrollIndicator={false}


                contentContainerStyle={{ gap: SPACE.sm, paddingVertical: 4 }}


              >


                {MUSCLES_LIST.map((m) => {


                  const isSelected = muscle === m;


                  const baseColor = m === 'None' ? colors.textSecondary : resolveMuscleColor(m);


                  return (


                    <TouchableOpacity


                      key={m}


                      style={[


                        styles.musclePill,


                        isSelected && { backgroundColor: hexToRgba(baseColor, 0.15), borderColor: baseColor },


                      ]}


                      onPress={() => setMuscle(m)}


                    >


                      <View style={[styles.muscleDot, { backgroundColor: baseColor }]} />


                      <Text style={[styles.muscleText, isSelected && { color: baseColor }]}>{m}</Text>


                    </TouchableOpacity>


                  );


                })}


              </ScrollView>


            </View>





            {/* •• YouTube Link •• */}


            <View style={styles.inputGroup}>


              <Text style={styles.inputLabel}>YOUTUBE LINK (OPTIONAL)</Text>


              <TextInput


                style={styles.input}


                placeholder="e.g. https://youtu.be/..."


                placeholderTextColor={colors.textTertiary}


                value={videoLink}


                onChangeText={setVideoLink}


                autoCapitalize="none"


              />


            </View>





            {/* •• Save to Master Split •• */}


            {planDay && (


              <View style={styles.masterSplitContainer}>


                <View style={{ flex: 1 }}>


                  <Text style={styles.masterSplitTitle}>Save to Master Split</Text>


                  <Text style={styles.masterSplitDesc}>Add to all future {planDay.name} days.</Text>


                </View>


                <Switch


                  value={savePermanently}


                  onValueChange={setSavePermanently}


                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: colors.accentPrimary }}


                  thumbColor={Platform.OS === 'ios' ? '#fff' : savePermanently ? '#fff' : '#f4f3f4'}


                />


              </View>


            )}





            {/* •• Submit •• */}


            <TouchableOpacity


              style={[styles.submitBtn, !name.trim() && styles.submitBtnDisabled]}


              disabled={!name.trim()}


              onPress={handleAddExercise}


            >


              <Ionicons name="add" size={18} color="#000" style={{ marginRight: 6 }} />


              <Text style={styles.submitBtnText}>Add Exercise</Text>


            </TouchableOpacity>


          </ScrollView>


        </KeyboardAvoidingView>


      </View>


    </Modal>


  );


}





// •• Styles ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••





const makeStyles = (colors: any) => StyleSheet.create({


  modalBg: {


    flex: 1,


    backgroundColor: 'rgba(0,0,0,0.65)',


    justifyContent: 'flex-end',


  },


  modalContent: {


    backgroundColor: '#000000',


    borderTopLeftRadius: RADIUS.xxl,


    borderTopRightRadius: RADIUS.xxl,


    padding: SPACE.xl,


    paddingBottom: Platform.OS === 'ios' ? 40 : SPACE.xl,


    maxHeight: '90%',


    borderWidth: 1,


    borderColor: '#27272A',


  },


  header: {


    flexDirection: 'row',


    alignItems: 'center',


    justifyContent: 'space-between',


    marginBottom: SPACE.lg,


  },


  title: {


    fontFamily: FONT_FAMILY.bold,


    fontSize: 20,


    color: colors.textPrimary,


  },


  closeBtn: {


    width: 32,


    height: 32,


    borderRadius: 16,


    backgroundColor: '#2C2C2E',


    alignItems: 'center',


    justifyContent: 'center',


  },


  scrollArea: {


    flexGrow: 0,


  },





  // •• Search Input •••••••••••••••••••••••••••••••••••••••••••••••••••••••••••


  inputGroup: {


    gap: 6,


    marginBottom: SPACE.md,


  },


  inputLabel: {


    fontFamily: FONT_FAMILY.bold,


    fontSize: 10,


    color: colors.textTertiary,


    letterSpacing: 0.8,


  },


  searchRow: {


    flexDirection: 'row',


    alignItems: 'center',


    backgroundColor: '#1C1C1E',


    borderRadius: RADIUS.md,


    paddingHorizontal: SPACE.md,


    height: 48,


    borderWidth: 1,


    borderColor: 'rgba(165,153,255,0.2)',


  },


  searchInput: {


    flex: 1,


    fontFamily: FONT_FAMILY.body,


    fontSize: 14,


    color: colors.textPrimary,


    height: '100%',


  },





  // •• Dropdown •••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••


  dropdown: {


    marginTop: 4,


    backgroundColor: '#1C1C1E',


    borderRadius: RADIUS.md,


    borderWidth: 1,


    borderColor: 'rgba(165,153,255,0.15)',


    overflow: 'hidden',


  },


  suggestionRow: {


    flexDirection: 'row',


    alignItems: 'center',


    paddingHorizontal: 14,


    paddingVertical: 11,


    gap: 10,


  },


  suggestionBorder: {


    borderTopWidth: StyleSheet.hairlineWidth,


    borderTopColor: 'rgba(255,255,255,0.06)',


  },


  suggestionName: {


    fontFamily: FONT_FAMILY.body,


    fontSize: 13,


    color: colors.textPrimary,


    marginBottom: 2,


  },


  suggestionMeta: {


    fontFamily: FONT_FAMILY.body,


    fontSize: 11,


  },


  suggestionRight: {


    flexDirection: 'row',


    alignItems: 'center',


    gap: 6,


  },


  suggestionSets: {


    fontFamily: FONT_FAMILY.body,


    fontSize: 11,


    color: colors.textMuted,


  },





  // Last session badge


  lastSessionBadge: {


    flexDirection: 'row',


    alignItems: 'center',


    gap: 5,


    marginTop: 4,


  },


  lastSessionText: {


    fontSize: 11,


    color: colors.accentPrimary,


    fontFamily: FONT_FAMILY.body,


  },





  // Sets / Reps / Rest row


  metaRow: {


    flexDirection: 'row',


    gap: 8,


    marginBottom: SPACE.md,


  },


  inputCompact: {


    backgroundColor: '#1C1C1E',


    borderRadius: RADIUS.md,


    height: 48,


    fontFamily: FONT_FAMILY.body,


    fontSize: 15,


    fontWeight: '600',


    color: colors.textPrimary,


    borderWidth: 1,


    borderColor: 'rgba(255,255,255,0.07)',


  },





  // AI loading row


  aiLoadingRow: {


    flexDirection: 'row',


    alignItems: 'center',


    paddingHorizontal: 14,


    paddingVertical: 14,


    gap: 10,


  },


  aiLoadingIcon: {


    fontSize: 16,


  },


  aiLoadingText: {


    fontFamily: FONT_FAMILY.body,


    fontSize: 13,


    color: colors.textTertiary,


    fontStyle: 'italic',


  },





  // AI suggestion row


  aiSuggestionRow: {


    flexDirection: 'row',


    alignItems: 'center',


    paddingHorizontal: 14,


    paddingVertical: 13,


    gap: 10,


    backgroundColor: 'rgba(165,153,255,0.06)',


  },


  aiSuggestionLeft: {


    flex: 1,


    flexDirection: 'row',


    alignItems: 'center',


    gap: 8,


  },


  aiSparkle: {


    fontSize: 18,


  },


  aiSuggestionName: {


    fontFamily: FONT_FAMILY.bold,


    fontSize: 13,


    color: colors.textPrimary,


    marginBottom: 2,


    flex: 1,


  },


  aiBadge: {


    backgroundColor: 'rgba(165,153,255,0.2)',


    borderRadius: 4,


    paddingHorizontal: 5,


    paddingVertical: 1,


    borderWidth: 1,


    borderColor: 'rgba(165,153,255,0.4)',


  },


  aiBadgeText: {


    fontSize: 9,


    fontWeight: '700',


    color: colors.accentPrimary,


    letterSpacing: 0.5,


  },





  // Regular input


  input: {


    backgroundColor: '#1C1C1E',


    borderRadius: RADIUS.md,


    paddingHorizontal: SPACE.md,


    height: 48,


    fontFamily: FONT_FAMILY.body,


    fontSize: 14,


    color: colors.textPrimary,


    borderWidth: 1,


    borderColor: 'rgba(255,255,255,0.07)',


  },





  // Muscle pills


  musclePill: {


    flexDirection: 'row',


    alignItems: 'center',


    backgroundColor: '#1C1C1E',


    borderWidth: 1,


    borderColor: 'rgba(255,255,255,0.08)',


    paddingHorizontal: SPACE.md,


    height: 34,


    borderRadius: 17,


    gap: SPACE.xs,


  },


  muscleDot: {


    width: 7,


    height: 7,


    borderRadius: 3.5,


  },


  muscleText: {


    fontFamily: FONT_FAMILY.body,


    fontSize: 12,


    color: colors.textMuted,


  },





  // Master split


  masterSplitContainer: {


    flexDirection: 'row',


    alignItems: 'center',


    justifyContent: 'space-between',


    paddingVertical: SPACE.md,


    marginBottom: SPACE.md,


    borderTopWidth: StyleSheet.hairlineWidth,


    borderTopColor: 'rgba(255,255,255,0.06)',


  },


  masterSplitTitle: {


    fontFamily: FONT_FAMILY.bold,


    fontSize: 14,


    color: colors.textPrimary,


    marginBottom: 2,


  },


  masterSplitDesc: {


    fontFamily: FONT_FAMILY.body,


    fontSize: 12,


    color: colors.textMuted,


  },





  // Submit


  submitBtn: {


    backgroundColor: '#a599ff',


    borderRadius: RADIUS.md,


    height: 50,


    flexDirection: 'row',


    alignItems: 'center',


    justifyContent: 'center',


    marginBottom: SPACE.sm,


  },


  submitBtnDisabled: {


    opacity: 0.4,


  },


  submitBtnText: {


    fontFamily: FONT_FAMILY.bold,


    fontSize: 15,


    color: '#000',


  },


});



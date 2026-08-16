import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import GymHomeScreen from '../screens/gym/GymHomeScreen';
import { cacheAwareLazy } from '../utils/ModulePrefetcher';
import { useTheme } from "../contexts/ThemeContext";

const ActiveLoggingScreen  = cacheAwareLazy('ActiveLoggingScreen',  () => import('../screens/gym/ActiveLoggingScreen'));
const WorkoutSummaryScreen = cacheAwareLazy('WorkoutSummaryScreen', () => import('../screens/gym/WorkoutSummaryScreen'));
const ExerciseDetailScreen = cacheAwareLazy('ExerciseDetailScreen', () => import('../screens/gym/ExerciseDetailScreen'));
const CardioLogScreen      = cacheAwareLazy('CardioLogScreen',      () => import('../screens/gym/CardioLogScreen'));
const ExerciseSwapScreen   = cacheAwareLazy('ExerciseSwapScreen',   () => import('../screens/gym/ExerciseSwapScreen'));
const GymProgressScreen    = cacheAwareLazy('GymProgressScreen',    () => import('../screens/gym/GymProgressScreen'));
const GymHistoryScreen     = cacheAwareLazy('GymHistoryScreen',     () => import('../screens/gym/GymHistoryScreen'));

const Stack = createNativeStackNavigator();

export default function GymStack() {
    const { colors, isDark } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="GymHome" component={GymHomeScreen} />
      <Stack.Screen 
        name="ActiveLogging" 
        component={ActiveLoggingScreen} 
        options={{ animation: 'fade' }} 
      />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} />
      <Stack.Screen name="GymProgress" component={GymProgressScreen} />
      <Stack.Screen name="GymHistory" component={GymHistoryScreen} />

      <Stack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen
        name="CardioLog"
        component={CardioLogScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="ExerciseSwap"
        component={ExerciseSwapScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

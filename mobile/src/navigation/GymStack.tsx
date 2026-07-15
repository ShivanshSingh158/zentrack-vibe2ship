import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import GymHomeScreen from '../screens/gym/GymHomeScreen';
import ActiveLoggingScreen from '../screens/gym/ActiveLoggingScreen';
import WorkoutSummaryScreen from '../screens/gym/WorkoutSummaryScreen';
import ExerciseDetailScreen from '../screens/gym/ExerciseDetailScreen';
import CardioLogScreen from '../screens/gym/CardioLogScreen';
import ExerciseSwapScreen from '../screens/gym/ExerciseSwapScreen';
import GymProgressScreen from '../screens/gym/GymProgressScreen';
import GymHistoryScreen from '../screens/gym/GymHistoryScreen';
import { COLORS } from '../theme/tokens';

const Stack = createNativeStackNavigator();

export default function GymStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
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

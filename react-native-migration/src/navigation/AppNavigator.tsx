import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';

import { theme } from '../theme';
import { useAuth } from '../context/AuthContext';

// Screens
import AuthScreen from '../screens/auth/AuthScreen';
import DashboardScreen from '../screens/dashboard/DashboardScreen';

// Import additional screens as needed
// Example: These would be implemented in separate files
const CreateWorkoutScreen = () => <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
const WorkoutsScreen = () => <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
const WeeklyPlanScreen = () => <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
const ActiveWorkoutScreen = () => <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
const NutritionScreen = () => <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
const HealthScreen = () => <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
const ProfileScreen = () => <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;

// Navigation Types
type AuthStackParamList = {
  Auth: undefined;
};

type MainStackParamList = {
  MainTabs: undefined;
  CreateWorkout: undefined;
  WeeklyPlan: undefined;
  ActiveWorkout: { workoutId: number };
};

type TabParamList = {
  Dashboard: undefined;
  Workouts: undefined;
  Nutrition: undefined;
  Health: undefined;
  Profile: undefined;
};

// Create navigators
const AuthStack = createStackNavigator<AuthStackParamList>();
const MainStack = createStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Auth navigator
const AuthNavigator = () => {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Auth" component={AuthScreen} />
    </AuthStack.Navigator>
  );
};

// Tab navigator
const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Workouts') {
            iconName = focused ? 'barbell' : 'barbell-outline';
          } else if (route.name === 'Nutrition') {
            iconName = focused ? 'restaurant' : 'restaurant-outline';
          } else if (route.name === 'Health') {
            iconName = focused ? 'heart' : 'heart-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          // @ts-ignore
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
          paddingBottom: Platform.OS === 'ios' ? 20 : 10,
          height: Platform.OS === 'ios' ? 80 : 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerStyle: {
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: 1,
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTitleStyle: {
          color: theme.colors.text,
          fontWeight: '600',
        },
        headerTintColor: theme.colors.primary,
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen} 
        options={{ headerShown: false }}
      />
      <Tab.Screen 
        name="Workouts" 
        component={WorkoutsScreen} 
        options={{ title: 'Workouts' }}
      />
      <Tab.Screen 
        name="Nutrition" 
        component={NutritionScreen} 
        options={{ title: 'Nutrition' }}
      />
      <Tab.Screen 
        name="Health" 
        component={HealthScreen} 
        options={{ title: 'Health' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen} 
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

// Main navigator
const MainNavigator = () => {
  return (
    <MainStack.Navigator 
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: 1,
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTitleStyle: {
          color: theme.colors.text,
          fontWeight: '600',
        },
        headerTintColor: theme.colors.primary,
        cardStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <MainStack.Screen 
        name="MainTabs" 
        component={TabNavigator} 
        options={{ headerShown: false }}
      />
      <MainStack.Screen 
        name="CreateWorkout" 
        component={CreateWorkoutScreen} 
        options={{ title: 'Create Workout' }}
      />
      <MainStack.Screen 
        name="WeeklyPlan" 
        component={WeeklyPlanScreen} 
        options={{ title: 'Weekly Plan' }}
      />
      <MainStack.Screen 
        name="ActiveWorkout" 
        component={ActiveWorkoutScreen} 
        options={{ title: 'Workout', headerShown: false }}
      />
    </MainStack.Navigator>
  );
};

// Root navigator
export const AppNavigator = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.card,
          text: theme.colors.text,
          border: theme.colors.border,
          notification: theme.colors.notification,
        },
      }}
    >
      {user ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
});
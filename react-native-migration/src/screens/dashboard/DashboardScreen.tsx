import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, startOfWeek } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../theme';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import WeeklyWorkoutPlan from '../../components/dashboard/WeeklyWorkoutPlan';

// Types for widgets will be imported from schema

const DashboardScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  // Queries
  const {
    data: userStats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['/api/users/1/daily-stats'],
    queryFn: () => api.getHealthMetrics(),
  });

  const {
    data: workouts,
    isLoading: workoutsLoading,
    refetch: refetchWorkouts,
  } = useQuery({
    queryKey: ['/api/users/1/workout-templates'],
    queryFn: () => api.getWorkoutTemplates(),
  });

  const {
    data: widgets,
    isLoading: widgetsLoading,
    refetch: refetchWidgets,
  } = useQuery({
    queryKey: ['/api/users/1/widgets'],
    queryFn: async () => {
      // This would fetch the user's dashboard widget layout
      // For now, we'll return a hardcoded widget layout
      return [
        { id: 'widget1', type: 'weeklyPlan', title: 'Weekly Plan', order: 1 },
        { id: 'widget2', type: 'stats', title: 'Today\'s Stats', order: 2 },
        { id: 'widget3', type: 'nutrition', title: 'Nutrition', order: 3 },
        { id: 'widget4', type: 'waterIntake', title: 'Water Intake', order: 4 },
        { id: 'widget5', type: 'recentWorkouts', title: 'Recent Workouts', order: 5 },
      ];
    },
  });

  // Generate weekly workout plan data
  const generateWeekPlan = () => {
    const days = [];
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 });

    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      const dayName = format(date, 'EEE');
      const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');

      // Find workout scheduled for this day
      const dayWorkout = workouts?.find(
        (w: any) => w.scheduledDay === format(date, 'EEEE')
      );

      days.push({
        date,
        day: dayName,
        workout: dayWorkout ? dayWorkout.name : null,
        workoutId: dayWorkout ? dayWorkout.id : undefined,
        workoutColor: dayWorkout ? dayWorkout.color : undefined,
        isToday,
      });
    }

    return days;
  };

  // Handle pull-to-refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchWorkouts(), refetchWidgets()]);
    setRefreshing(false);
  };

  // Handle date selection in the weekly plan
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  // Navigate to weekly plan screen
  const navigateToWeeklyPlan = () => {
    navigation.navigate('WeeklyPlan' as never);
  };

  if (statsLoading || workoutsLoading || widgetsLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Hello, {user?.displayName || 'there'}
          </Text>
          <Text style={styles.date}>{format(new Date(), 'EEEE, MMMM d')}</Text>
        </View>
        <TouchableOpacity style={styles.profileButton}>
          <Ionicons name="person-circle-outline" size={32} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Widgets */}
        {widgets
          ?.sort((a: any, b: any) => a.order - b.order)
          .map((widget: any) => {
            switch (widget.type) {
              case 'weeklyPlan':
                return (
                  <WeeklyWorkoutPlan
                    key={widget.id}
                    workoutPlan={generateWeekPlan()}
                    onViewAll={navigateToWeeklyPlan}
                    onDateSelect={handleDateSelect}
                    selectedDate={selectedDate}
                  />
                );
              case 'stats':
                return (
                  <View key={widget.id} style={styles.widget}>
                    <View style={styles.widgetHeader}>
                      <Text style={styles.widgetTitle}>{widget.title}</Text>
                      <TouchableOpacity>
                        <Text style={styles.widgetAction}>Details</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.statsGrid}>
                      <View style={styles.statItem}>
                        <Ionicons name="flame-outline" size={24} color={theme.colors.primary} />
                        <Text style={styles.statValue}>{userStats?.calories || 0}</Text>
                        <Text style={styles.statLabel}>Calories</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Ionicons name="footsteps-outline" size={24} color={theme.colors.primary} />
                        <Text style={styles.statValue}>{userStats?.steps || 0}</Text>
                        <Text style={styles.statLabel}>Steps</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Ionicons name="fitness-outline" size={24} color={theme.colors.primary} />
                        <Text style={styles.statValue}>{userStats?.activeMinutes || 0}</Text>
                        <Text style={styles.statLabel}>Active Min</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Ionicons name="water-outline" size={24} color={theme.colors.primary} />
                        <Text style={styles.statValue}>{userStats?.waterIntake || 0}</Text>
                        <Text style={styles.statLabel}>Water (ml)</Text>
                      </View>
                    </View>
                  </View>
                );
              // Other widget types would be implemented here
              default:
                return (
                  <View key={widget.id} style={styles.widget}>
                    <Text style={styles.widgetTitle}>{widget.title}</Text>
                    <Text style={styles.placeholderText}>Widget content here</Text>
                  </View>
                );
            }
          })}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => navigation.navigate('CreateWorkout' as never)}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${theme.colors.primary}20` }]}>
                <Ionicons name="add-outline" size={24} color={theme.colors.primary} />
              </View>
              <Text style={styles.actionText}>New Workout</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => navigation.navigate('Nutrition' as never)}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${theme.colors.success}20` }]}>
                <Ionicons name="restaurant-outline" size={24} color={theme.colors.success} />
              </View>
              <Text style={styles.actionText}>Log Meal</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => navigation.navigate('Health' as never)}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${theme.colors.error}20` }]}>
                <Ionicons name="heart-outline" size={24} color={theme.colors.error} />
              </View>
              <Text style={styles.actionText}>Add Health Data</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  greeting: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
  },
  date: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  profileButton: {
    padding: theme.spacing.xs,
  },
  content: {
    padding: theme.spacing.md,
  },
  widget: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  widgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  widgetTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
  },
  widgetAction: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
  },
  placeholderText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  statItem: {
    width: '48%',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  statLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  quickActions: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    paddingLeft: theme.spacing.xs,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    alignItems: 'center',
    width: '30%',
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  actionText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    textAlign: 'center',
  },
});

export default DashboardScreen;
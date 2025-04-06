import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { useQuery } from '@tanstack/react-query';

import { theme, commonStyles } from '../../theme';
import { api } from '../../api/client';

// Define workout template interface
interface WorkoutTemplate {
  id: number;
  name: string;
  description: string;
  scheduledDay: string | null;
  estimatedDuration: number;
  exerciseCount: number;
  workoutType: 'strength' | 'cardio' | 'flexibility' | 'hiit';
  userId: number;
  color: string;
}

const WeeklyPlanScreen = () => {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekDays, setWeekDays] = useState<Date[]>([]);

  // Fetch workout templates
  const { data: workoutTemplates, isLoading, error } = useQuery({
    queryKey: ['/api/users/1/workout-templates'],
    queryFn: () => api.getWorkoutTemplates(),
  });

  // Generate the days of the week
  useEffect(() => {
    const startDay = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday as first day
    const days = [];
    
    for (let i = 0; i < 7; i++) {
      days.push(addDays(startDay, i));
    }
    
    setWeekDays(days);
  }, []);

  // Helper function to get day name
  const getDayName = (date: Date) => format(date, 'EEEE');

  // Get workouts scheduled for a specific day
  const getWorkoutsForDay = (dayName: string): WorkoutTemplate[] => {
    if (!workoutTemplates) return [];
    return workoutTemplates.filter(
      (workout: WorkoutTemplate) => workout.scheduledDay === dayName
    );
  };

  // Handle workout selection
  const handleWorkoutPress = (workoutId: number) => {
    navigation.navigate('WorkoutDetail', { id: workoutId });
  };

  if (isLoading) {
    return (
      <View style={[commonStyles.center, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading workout plan...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[commonStyles.center, styles.errorContainer]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.error} />
        <Text style={styles.errorText}>Failed to load workouts</Text>
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Week selector */}
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Workout Plan</Text>
        <TouchableOpacity style={styles.todayButton}>
          <Text style={styles.todayButtonText}>Today</Text>
        </TouchableOpacity>
      </View>

      {/* Days of the week */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.daysContainer}
      >
        {weekDays.map((day, index) => {
          const isToday = isSameDay(day, new Date());
          const isSelected = isSameDay(day, selectedDate);
          
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.dayButton,
                isToday && styles.todayDayButton,
                isSelected && styles.selectedDayButton,
              ]}
              onPress={() => setSelectedDate(day)}
            >
              <Text style={[styles.dayName, isSelected && styles.selectedDayText]}>
                {format(day, 'EEE')}
              </Text>
              <Text style={[styles.dayNumber, isSelected && styles.selectedDayText]}>
                {format(day, 'd')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Workouts for selected day */}
      <ScrollView contentContainerStyle={styles.workoutsContainer}>
        <Text style={styles.selectedDayTitle}>
          {format(selectedDate, 'EEEE, MMMM d')}
        </Text>
        
        {getWorkoutsForDay(getDayName(selectedDate)).length > 0 ? (
          getWorkoutsForDay(getDayName(selectedDate)).map((workout) => (
            <TouchableOpacity
              key={workout.id}
              style={[
                styles.workoutCard,
                { borderLeftColor: workout.color || theme.colors.primary },
              ]}
              onPress={() => handleWorkoutPress(workout.id)}
            >
              <View style={styles.workoutHeader}>
                <Text style={styles.workoutName}>{workout.name}</Text>
                <View style={[styles.workoutTypeBadge, { backgroundColor: workout.color }]}>
                  <Text style={styles.workoutTypeText}>{workout.workoutType}</Text>
                </View>
              </View>
              
              {workout.description && (
                <Text style={styles.workoutDescription} numberOfLines={2}>
                  {workout.description}
                </Text>
              )}
              
              <View style={styles.workoutMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.metaText}>{workout.estimatedDuration} min</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="barbell-outline" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.metaText}>{workout.exerciseCount} exercises</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.noWorkoutsContainer}>
            <Ionicons name="fitness-outline" size={48} color={theme.colors.textSecondary} />
            <Text style={styles.noWorkoutsText}>No workouts scheduled</Text>
            <TouchableOpacity style={styles.addWorkoutButton}>
              <Text style={styles.addWorkoutButtonText}>Add Workout</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fontSize.lg,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    color: 'white',
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
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
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
  },
  todayButton: {
    backgroundColor: theme.colors.card,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  todayButtonText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  daysContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dayButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: theme.spacing.sm,
    width: 60,
    height: 70,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  todayDayButton: {
    borderColor: theme.colors.primary,
  },
  selectedDayButton: {
    backgroundColor: theme.colors.primary,
  },
  dayName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  dayNumber: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
  },
  selectedDayText: {
    color: 'white',
  },
  workoutsContainer: {
    padding: theme.spacing.lg,
  },
  selectedDayTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  workoutCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    ...StyleSheet.create({
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
    }),
  },
  workoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  workoutName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    flex: 1,
  },
  workoutTypeBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  workoutTypeText: {
    color: 'white',
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    textTransform: 'uppercase',
  },
  workoutDescription: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  workoutMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.lg,
  },
  metaText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  noWorkoutsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    marginTop: theme.spacing.xl,
  },
  noWorkoutsText: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  addWorkoutButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  addWorkoutButtonText: {
    color: 'white',
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
});

export default WeeklyPlanScreen;
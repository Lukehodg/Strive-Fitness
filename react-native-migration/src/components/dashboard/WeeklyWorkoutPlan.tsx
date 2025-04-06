import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { format, isSameDay } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../theme';

// Types
interface WorkoutDay {
  date: Date;
  day: string;
  workout: string | null;
  isToday: boolean;
  workoutId?: number;
  workoutColor?: string;
}

interface WeeklyWorkoutPlanProps {
  workoutPlan: WorkoutDay[];
  onViewAll: () => void;
  onDateSelect: (date: Date) => void;
  selectedDate: Date;
}

const WeeklyWorkoutPlan: React.FC<WeeklyWorkoutPlanProps> = ({
  workoutPlan,
  onViewAll,
  onDateSelect,
  selectedDate,
}) => {
  const navigation = useNavigation();
  const { width } = Dimensions.get('window');

  const handleCalendarView = () => {
    navigation.navigate('WeeklyPlan' as never);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly Workout Plan</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={handleCalendarView}
            style={styles.calendarButton}
          >
            <Ionicons name="calendar-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.calendarButtonText}>Calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onViewAll} style={styles.viewAllButton}>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.daysContainer}
      >
        {workoutPlan.map((day, index) => {
          const isSelected = format(day.date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
          
          return (
            <TouchableOpacity
              key={index}
              style={styles.dayItem}
              onPress={() => onDateSelect(day.date)}
            >
              <Text style={styles.dayName}>{day.day}</Text>
              <View
                style={[
                  styles.dayCircle,
                  isSelected && styles.selectedDayCircle,
                  day.isToday && styles.todayCircle,
                ]}
              >
                <Text
                  style={[
                    styles.dayDate,
                    isSelected && styles.selectedDayText,
                    day.isToday && styles.todayText,
                  ]}
                >
                  {format(day.date, 'd')}
                </Text>
              </View>
              <Text 
                style={styles.workoutName}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {day.workout || 'Rest'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.md,
    padding: theme.spacing.xs,
  },
  calendarButtonText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    marginLeft: 4,
  },
  viewAllButton: {
    padding: theme.spacing.xs,
  },
  viewAllText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
  },
  daysContainer: {
    paddingVertical: theme.spacing.sm,
  },
  dayItem: {
    alignItems: 'center',
    width: 65,
    marginRight: theme.spacing.sm,
  },
  dayName: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectedDayCircle: {
    backgroundColor: theme.colors.primary,
  },
  todayCircle: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  dayDate: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
  },
  selectedDayText: {
    color: 'white',
  },
  todayText: {
    color: theme.colors.primary,
  },
  workoutName: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.text,
    width: '100%',
    textAlign: 'center',
  },
});

export default WeeklyWorkoutPlan;
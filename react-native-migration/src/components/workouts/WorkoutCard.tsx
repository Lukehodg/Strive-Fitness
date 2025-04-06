import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';

// Define workout template interface
export interface WorkoutCardProps {
  id: number;
  name: string;
  description?: string;
  workoutType: 'strength' | 'cardio' | 'flexibility' | 'hiit';
  duration: number;
  exerciseCount: number;
  color?: string;
  onPress: (id: number) => void;
  style?: ViewStyle;
}

const WorkoutCard: React.FC<WorkoutCardProps> = ({
  id,
  name,
  description,
  workoutType,
  duration,
  exerciseCount,
  color = theme.colors.primary,
  onPress,
  style,
}) => {
  // Workout type icon mapping
  const getWorkoutTypeIcon = () => {
    switch (workoutType) {
      case 'strength':
        return 'barbell-outline';
      case 'cardio':
        return 'heart-outline';
      case 'flexibility':
        return 'body-outline';
      case 'hiit':
        return 'flame-outline';
      default:
        return 'fitness-outline';
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { borderLeftColor: color },
        style,
      ]}
      onPress={() => onPress(id)}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <Text style={styles.name}>{name}</Text>
        <View style={[styles.typeBadge, { backgroundColor: color }]}>
          <Ionicons name={getWorkoutTypeIcon()} size={12} color="white" />
          <Text style={styles.typeText}>{workoutType}</Text>
        </View>
      </View>

      {description && (
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>
      )}

      <View style={styles.metaContainer}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.metaText}>{duration} min</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="list-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.metaText}>{exerciseCount} exercises</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    // Elevation for Android
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  name: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    flex: 1,
  },
  typeBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeText: {
    color: 'white',
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  description: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  metaContainer: {
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
});

export default WorkoutCard;
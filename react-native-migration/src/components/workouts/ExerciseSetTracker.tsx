import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';

interface SetData {
  id: number;
  setNumber: number;
  weight?: number;
  reps?: number;
  isWarmup: boolean;
  completed: boolean;
  // For endurance workouts
  duration?: number;
  distance?: number;
  resistance?: number;
  incline?: number;
  cadence?: number;
}

interface Exercise {
  id: number;
  name: string;
  category: string;
  muscleGroup: string;
  recommendedSets: number;
  recommendedReps?: number;
  recommendedTime?: number;
  recommendedDistance?: number;
  isEndurance: boolean;
  requiresEquipment: boolean;
}

interface ExerciseSetTrackerProps {
  exercise: Exercise;
  sets: SetData[];
  onSetUpdate: (updatedSet: SetData) => void;
  onAddSet: () => void;
  onDeleteSet: (setId: number) => void;
}

const ExerciseSetTracker: React.FC<ExerciseSetTrackerProps> = ({
  exercise,
  sets,
  onSetUpdate,
  onAddSet,
  onDeleteSet,
}) => {
  const isEnduranceExercise = exercise.isEndurance;

  const handleSetUpdate = (set: SetData, field: string, value: string | boolean) => {
    // Convert string values to appropriate types
    let updatedValue: any = value;
    if (typeof value === 'string' && ['weight', 'reps', 'duration', 'distance', 'resistance', 'incline', 'cadence'].includes(field)) {
      const numValue = parseFloat(value);
      updatedValue = isNaN(numValue) ? undefined : numValue;
    }

    const updatedSet = {
      ...set,
      [field]: updatedValue,
    };

    onSetUpdate(updatedSet);
  };

  const confirmDeleteSet = (setId: number) => {
    Alert.alert(
      'Delete Set',
      'Are you sure you want to delete this set?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeleteSet(setId) },
      ],
      { cancelable: true }
    );
  };

  const renderStrengthSetRow = (set: SetData) => (
    <View key={set.id} style={[styles.setRow, set.completed && styles.completedRow]}>
      <View style={styles.setNumberContainer}>
        <Text style={styles.setNumber}>{set.setNumber}</Text>
        {set.isWarmup && (
          <View style={styles.warmupBadge}>
            <Text style={styles.warmupText}>W</Text>
          </View>
        )}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Weight</Text>
        <TextInput
          style={styles.input}
          value={set.weight?.toString() || ''}
          onChangeText={(text) => handleSetUpdate(set, 'weight', text)}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={theme.colors.textSecondary}
        />
        <Text style={styles.inputUnit}>kg</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Reps</Text>
        <TextInput
          style={styles.input}
          value={set.reps?.toString() || ''}
          onChangeText={(text) => handleSetUpdate(set, 'reps', text)}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={theme.colors.textSecondary}
        />
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, set.completed && styles.completedButton]}
          onPress={() => handleSetUpdate(set, 'completed', !set.completed)}
        >
          {set.completed ? (
            <Ionicons name="checkmark" size={20} color="white" />
          ) : (
            <Ionicons name="checkmark-outline" size={20} color={theme.colors.primary} />
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => confirmDeleteSet(set.id)}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEnduranceSetRow = (set: SetData) => (
    <View key={set.id} style={[styles.setRow, set.completed && styles.completedRow]}>
      <View style={styles.setNumberContainer}>
        <Text style={styles.setNumber}>{set.setNumber}</Text>
      </View>

      {/* Duration */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Time</Text>
        <TextInput
          style={styles.input}
          value={set.duration?.toString() || ''}
          onChangeText={(text) => handleSetUpdate(set, 'duration', text)}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={theme.colors.textSecondary}
        />
        <Text style={styles.inputUnit}>min</Text>
      </View>

      {/* Distance */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Dist</Text>
        <TextInput
          style={styles.input}
          value={set.distance?.toString() || ''}
          onChangeText={(text) => handleSetUpdate(set, 'distance', text)}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={theme.colors.textSecondary}
        />
        <Text style={styles.inputUnit}>km</Text>
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, set.completed && styles.completedButton]}
          onPress={() => handleSetUpdate(set, 'completed', !set.completed)}
        >
          {set.completed ? (
            <Ionicons name="checkmark" size={20} color="white" />
          ) : (
            <Ionicons name="checkmark-outline" size={20} color={theme.colors.primary} />
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => confirmDeleteSet(set.id)}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.exerciseHeader}>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        <TouchableOpacity onPress={onAddSet} style={styles.addSetButton}>
          <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.addSetText}>Add Set</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.setList}>
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>Set</Text>
          {isEnduranceExercise ? (
            <>
              <Text style={styles.headerText}>Time</Text>
              <Text style={styles.headerText}>Distance</Text>
            </>
          ) : (
            <>
              <Text style={styles.headerText}>Weight</Text>
              <Text style={styles.headerText}>Reps</Text>
            </>
          )}
          <Text style={styles.headerText}>Done</Text>
        </View>

        <ScrollView>
          {sets.map((set) =>
            isEnduranceExercise
              ? renderEnduranceSetRow(set)
              : renderStrengthSetRow(set)
          )}
        </ScrollView>
      </View>

      {/* Additional options for endurance exercises */}
      {isEnduranceExercise && (
        <View style={styles.additionalControls}>
          <Text style={styles.sectionTitle}>Additional Metrics</Text>
          <View style={styles.metricsContainer}>
            <View style={styles.metricInput}>
              <Text style={styles.metricLabel}>Resistance</Text>
              <TextInput
                style={styles.metricTextInput}
                keyboardType="numeric"
                placeholder="Level"
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>
            
            <View style={styles.metricInput}>
              <Text style={styles.metricLabel}>Incline</Text>
              <TextInput
                style={styles.metricTextInput}
                keyboardType="numeric"
                placeholder="%"
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>
            
            <View style={styles.metricInput}>
              <Text style={styles.metricLabel}>Cadence</Text>
              <TextInput
                style={styles.metricTextInput}
                keyboardType="numeric"
                placeholder="RPM"
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  exerciseName: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
  },
  addSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  addSetText: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    marginLeft: 4,
  },
  setList: {
    marginBottom: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  headerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeight.medium,
    textAlign: 'center',
    flex: 1,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  completedRow: {
    backgroundColor: `${theme.colors.success}10`,
  },
  setNumberContainer: {
    width: 40,
    alignItems: 'center',
    position: 'relative',
  },
  setNumber: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
  },
  warmupBadge: {
    position: 'absolute',
    top: -8,
    right: 0,
    backgroundColor: theme.colors.warning,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warmupText: {
    color: 'white',
    fontSize: 8,
    fontWeight: theme.fontWeight.bold,
  },
  inputGroup: {
    flex: 1,
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    height: 32,
    width: 60,
    color: theme.colors.text,
    textAlign: 'center',
    paddingHorizontal: 2,
    fontWeight: theme.fontWeight.medium,
  },
  inputUnit: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
  },
  actionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    marginRight: theme.spacing.xs,
  },
  completedButton: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  deleteButton: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  additionalControls: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricInput: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  metricTextInput: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    height: 32,
    width: 70,
    color: theme.colors.text,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
});

export default ExerciseSetTracker;
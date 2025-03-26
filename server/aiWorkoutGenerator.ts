import { storage } from "./storage";
import { WorkoutTemplateExercise, InsertWorkoutTemplateExercise } from "@shared/schema";

// Map of exercises by focus area and difficulty
interface ExerciseMapping {
  name: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  requiresEquipment: boolean;
  muscleGroup: string;
  recommendedSets: number;
  recommendedRepsMin: number;
  recommendedRepsMax: number;
}

// Exercise database for workout generation
const exerciseDatabase: ExerciseMapping[] = [
  // Upper Body exercises
  { name: "Push-up", category: "Strength", difficulty: "beginner", requiresEquipment: false, muscleGroup: "Chest", recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
  { name: "Pull-up", category: "Strength", difficulty: "intermediate", requiresEquipment: true, muscleGroup: "Back", recommendedSets: 3, recommendedRepsMin: 6, recommendedRepsMax: 10 },
  { name: "Bench Press", category: "Strength", difficulty: "intermediate", requiresEquipment: true, muscleGroup: "Chest", recommendedSets: 4, recommendedRepsMin: 6, recommendedRepsMax: 10 },
  { name: "Dumbbell Shoulder Press", category: "Strength", difficulty: "intermediate", requiresEquipment: true, muscleGroup: "Shoulders", recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
  { name: "Dumbbell Row", category: "Strength", difficulty: "beginner", requiresEquipment: true, muscleGroup: "Back", recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
  { name: "Tricep Dips", category: "Strength", difficulty: "beginner", requiresEquipment: false, muscleGroup: "Arms", recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 15 },
  { name: "Bicep Curl", category: "Strength", difficulty: "beginner", requiresEquipment: true, muscleGroup: "Arms", recommendedSets: 3, recommendedRepsMin: 10, recommendedRepsMax: 15 },
  { name: "Lateral Raise", category: "Strength", difficulty: "beginner", requiresEquipment: true, muscleGroup: "Shoulders", recommendedSets: 3, recommendedRepsMin: 10, recommendedRepsMax: 15 },
  { name: "Cable Fly", category: "Strength", difficulty: "intermediate", requiresEquipment: true, muscleGroup: "Chest", recommendedSets: 3, recommendedRepsMin: 10, recommendedRepsMax: 15 },
  { name: "Lat Pulldown", category: "Strength", difficulty: "beginner", requiresEquipment: true, muscleGroup: "Back", recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
  
  // Lower Body exercises
  { name: "Squat", category: "Strength", difficulty: "beginner", requiresEquipment: false, muscleGroup: "Legs", recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
  { name: "Deadlift", category: "Strength", difficulty: "intermediate", requiresEquipment: true, muscleGroup: "Legs", recommendedSets: 4, recommendedRepsMin: 5, recommendedRepsMax: 8 },
  { name: "Lunges", category: "Strength", difficulty: "beginner", requiresEquipment: false, muscleGroup: "Legs", recommendedSets: 3, recommendedRepsMin: 10, recommendedRepsMax: 12 },
  { name: "Leg Press", category: "Strength", difficulty: "intermediate", requiresEquipment: true, muscleGroup: "Legs", recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
  { name: "Leg Extension", category: "Strength", difficulty: "beginner", requiresEquipment: true, muscleGroup: "Legs", recommendedSets: 3, recommendedRepsMin: 10, recommendedRepsMax: 15 },
  { name: "Leg Curl", category: "Strength", difficulty: "beginner", requiresEquipment: true, muscleGroup: "Legs", recommendedSets: 3, recommendedRepsMin: 10, recommendedRepsMax: 15 },
  { name: "Calf Raise", category: "Strength", difficulty: "beginner", requiresEquipment: false, muscleGroup: "Legs", recommendedSets: 3, recommendedRepsMin: 12, recommendedRepsMax: 20 },
  { name: "Hip Thrust", category: "Strength", difficulty: "intermediate", requiresEquipment: true, muscleGroup: "Legs", recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
  { name: "Box Jump", category: "Plyometrics", difficulty: "intermediate", requiresEquipment: true, muscleGroup: "Legs", recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
  
  // Core exercises
  { name: "Plank", category: "Core", difficulty: "beginner", requiresEquipment: false, muscleGroup: "Core", recommendedSets: 3, recommendedRepsMin: 30, recommendedRepsMax: 60 },
  { name: "Crunches", category: "Core", difficulty: "beginner", requiresEquipment: false, muscleGroup: "Core", recommendedSets: 3, recommendedRepsMin: 15, recommendedRepsMax: 25 },
  { name: "Russian Twist", category: "Core", difficulty: "beginner", requiresEquipment: false, muscleGroup: "Core", recommendedSets: 3, recommendedRepsMin: 12, recommendedRepsMax: 20 },
  { name: "Leg Raise", category: "Core", difficulty: "beginner", requiresEquipment: false, muscleGroup: "Core", recommendedSets: 3, recommendedRepsMin: 10, recommendedRepsMax: 15 },
  { name: "Ab Wheel Rollout", category: "Core", difficulty: "advanced", requiresEquipment: true, muscleGroup: "Core", recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
  
  // Cardio exercises
  { name: "Running", category: "Cardio", difficulty: "beginner", requiresEquipment: false, muscleGroup: "Full Body", recommendedSets: 1, recommendedRepsMin: 15, recommendedRepsMax: 30 },
  { name: "Cycling", category: "Cardio", difficulty: "beginner", requiresEquipment: true, muscleGroup: "Full Body", recommendedSets: 1, recommendedRepsMin: 15, recommendedRepsMax: 45 },
  { name: "Jump Rope", category: "Cardio", difficulty: "beginner", requiresEquipment: true, muscleGroup: "Full Body", recommendedSets: 3, recommendedRepsMin: 1, recommendedRepsMax: 3 },
  { name: "Rowing", category: "Cardio", difficulty: "intermediate", requiresEquipment: true, muscleGroup: "Full Body", recommendedSets: 1, recommendedRepsMin: 10, recommendedRepsMax: 20 },
  { name: "Elliptical", category: "Cardio", difficulty: "beginner", requiresEquipment: true, muscleGroup: "Full Body", recommendedSets: 1, recommendedRepsMin: 15, recommendedRepsMax: 30 },
  
  // Full Body exercises
  { name: "Burpee", category: "HIIT", difficulty: "intermediate", requiresEquipment: false, muscleGroup: "Full Body", recommendedSets: 3, recommendedRepsMin: 10, recommendedRepsMax: 15 },
  { name: "Mountain Climber", category: "HIIT", difficulty: "beginner", requiresEquipment: false, muscleGroup: "Full Body", recommendedSets: 3, recommendedRepsMin: 20, recommendedRepsMax: 30 },
  { name: "Turkish Get-Up", category: "Functional", difficulty: "advanced", requiresEquipment: true, muscleGroup: "Full Body", recommendedSets: 3, recommendedRepsMin: 5, recommendedRepsMax: 8 },
  { name: "Kettlebell Swing", category: "Functional", difficulty: "intermediate", requiresEquipment: true, muscleGroup: "Full Body", recommendedSets: 3, recommendedRepsMin: 12, recommendedRepsMax: 20 },
  { name: "Battle Ropes", category: "HIIT", difficulty: "intermediate", requiresEquipment: true, muscleGroup: "Full Body", recommendedSets: 3, recommendedRepsMin: 30, recommendedRepsMax: 45 }
];

/**
 * Filter exercises based on user preferences
 */
function filterExercisesByPreference(
  focus: string, 
  difficultyLevel: string, 
  equipment: string
): ExerciseMapping[] {
  // Convert user input to comparable values
  const userDifficulty = difficultyLevel.toLowerCase();
  const difficulty: Record<string, "beginner" | "intermediate" | "advanced"> = {
    "beginner": "beginner",
    "easy": "beginner",
    "intermediate": "intermediate",
    "moderate": "intermediate",
    "medium": "intermediate",
    "advanced": "advanced",
    "hard": "advanced",
    "expert": "advanced"
  };

  // Map user focus to body parts
  const focusMap: Record<string, string[]> = {
    "upper body": ["Chest", "Back", "Shoulders", "Arms"],
    "lower body": ["Legs"],
    "core": ["Core"],
    "cardio": ["Full Body"],
    "full body": ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core"],
    "strength": ["Chest", "Back", "Shoulders", "Arms", "Legs"],
    "hypertrophy": ["Chest", "Back", "Shoulders", "Arms", "Legs"],
    "endurance": ["Full Body"]
  };

  // Determine if equipment is available
  const hasEquipment = equipment.toLowerCase() !== "none" && 
                      equipment.toLowerCase() !== "bodyweight" && 
                      equipment.toLowerCase() !== "no equipment";

  // Filter the exercises
  const targetMuscleGroups = focusMap[focus.toLowerCase()] || ["Full Body"];
  const targetDifficulty = difficulty[userDifficulty] || "intermediate";
  
  return exerciseDatabase.filter(exercise => {
    // Check if muscle group matches focus
    const matchesFocus = targetMuscleGroups.includes(exercise.muscleGroup);
    
    // Check if difficulty matches or is less than target
    const matchesDifficulty = exercise.difficulty === targetDifficulty || 
                          (userDifficulty === "intermediate" && exercise.difficulty === "beginner") ||
                          (userDifficulty === "advanced" && 
                            (exercise.difficulty === "beginner" || exercise.difficulty === "intermediate"));
    
    // Check if equipment requirement matches availability
    const matchesEquipment = !exercise.requiresEquipment || hasEquipment;
    
    return matchesFocus && matchesDifficulty && matchesEquipment;
  });
}

/**
 * Generate a workout based on user preferences
 */
export async function generateWorkoutExercises(
  focus: string,
  difficultyLevel: string,
  equipment: string,
  workoutTemplateId: number
): Promise<WorkoutTemplateExercise[]> {
  // Get filtered exercises based on preferences
  const filteredExercises = filterExercisesByPreference(focus, difficultyLevel, equipment);
  
  // Determine number of exercises based on focus
  let targetExerciseCount = 5; // Default
  if (focus.toLowerCase() === "full body") {
    targetExerciseCount = 8;
  } else if (focus.toLowerCase() === "cardio") {
    targetExerciseCount = 3;
  }
  
  // If we don't have enough exercises, use what we have
  const exerciseCount = Math.min(targetExerciseCount, filteredExercises.length);
  
  // Shuffle array to randomize exercise selection
  const shuffled = [...filteredExercises].sort(() => 0.5 - Math.random());
  
  // Take the first N exercises
  const selectedExercises = shuffled.slice(0, exerciseCount);
  
  const workoutExercises: WorkoutTemplateExercise[] = [];
  
  // For each selected exercise, look it up in our database or create it
  for (let i = 0; i < selectedExercises.length; i++) {
    const exerciseMapping = selectedExercises[i];
    
    // Try to find the exercise in our database
    let exerciseId = 0;
    const existingExercises = await storage.getExercises();
    const existingExercise = existingExercises.find(e => 
      e.name.toLowerCase() === exerciseMapping.name.toLowerCase()
    );
    
    if (existingExercise) {
      exerciseId = existingExercise.id;
    } else {
      // Create the exercise if it doesn't exist
      const newExercise = await storage.createExercise({
        name: exerciseMapping.name,
        category: exerciseMapping.category,
        muscleGroup: exerciseMapping.muscleGroup,
        description: `${exerciseMapping.muscleGroup} exercise (${exerciseMapping.difficulty} level)`
      });
      
      exerciseId = newExercise.id;
    }
    
    // Create the workout template exercise
    const templateExercise: InsertWorkoutTemplateExercise = {
      workoutTemplateId,
      exerciseId,
      sets: exerciseMapping.recommendedSets,
      repsMin: exerciseMapping.recommendedRepsMin,
      repsMax: exerciseMapping.recommendedRepsMax,
      restSeconds: 60,
      order: i + 1
    };
    
    const createdExercise = await storage.createWorkoutTemplateExercise(templateExercise);
    workoutExercises.push(createdExercise);
  }
  
  return workoutExercises;
}
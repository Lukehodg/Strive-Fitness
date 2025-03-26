import {
  users, User, InsertUser,
  exercises, Exercise, InsertExercise,
  workoutTemplates, WorkoutTemplate, InsertWorkoutTemplate,
  workoutTemplateExercises, WorkoutTemplateExercise, InsertWorkoutTemplateExercise,
  completedWorkouts, CompletedWorkout, InsertCompletedWorkout,
  workoutSets, WorkoutSet, InsertWorkoutSet,
  activities, Activity, InsertActivity,
  meals, Meal, InsertMeal,
  dailyStats, DailyStats, InsertDailyStats,
  healthMetrics, HealthMetric, InsertHealthMetric, HealthMetricType
} from "@shared/schema";

// Storage interface with CRUD methods
export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<User>): Promise<User | undefined>;
  
  // Dashboard widgets
  getUserWidgets(userId: number): Promise<any[] | undefined>;
  updateUserWidgets(userId: number, widgets: any[]): Promise<any[] | undefined>;

  // Exercises
  getExercises(): Promise<Exercise[]>;
  getExercise(id: number): Promise<Exercise | undefined>;
  getExercisesByCategory(category: string): Promise<Exercise[]>;
  createExercise(exercise: InsertExercise): Promise<Exercise>;

  // Workout templates
  getWorkoutTemplates(userId: number): Promise<WorkoutTemplate[]>;
  getWorkoutTemplate(id: number): Promise<WorkoutTemplate | undefined>;
  createWorkoutTemplate(template: InsertWorkoutTemplate): Promise<WorkoutTemplate>;

  // Workout template exercises
  getWorkoutTemplateExercises(workoutTemplateId: number): Promise<WorkoutTemplateExercise[]>;
  createWorkoutTemplateExercise(templateExercise: InsertWorkoutTemplateExercise): Promise<WorkoutTemplateExercise>;

  // Completed workouts
  getCompletedWorkouts(userId: number): Promise<CompletedWorkout[]>;
  getCompletedWorkoutsByWeek(userId: number, startDate: Date, endDate: Date): Promise<CompletedWorkout[]>;
  getCompletedWorkout(id: number): Promise<CompletedWorkout | undefined>;
  createCompletedWorkout(workout: InsertCompletedWorkout): Promise<CompletedWorkout>;
  updateCompletedWorkout(id: number, data: Partial<CompletedWorkout>): Promise<CompletedWorkout | undefined>;

  // Workout sets
  getWorkoutSets(completedWorkoutId: number): Promise<WorkoutSet[]>;
  getWorkoutSetsByExercise(exerciseId: number): Promise<WorkoutSet[]>;
  createWorkoutSet(set: InsertWorkoutSet): Promise<WorkoutSet>;
  updateWorkoutSet(id: number, data: Partial<WorkoutSet>): Promise<WorkoutSet | undefined>;

  // Activities
  getActivities(userId: number, date: Date): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  updateActivity(id: number, data: Partial<Activity>): Promise<Activity | undefined>;

  // Meals
  getMeals(userId: number, date: Date): Promise<Meal[]>;
  getMeal(id: number): Promise<Meal | undefined>;
  createMeal(meal: InsertMeal): Promise<Meal>;
  updateMeal(id: number, data: Partial<Meal>): Promise<Meal | undefined>;
  deleteMeal(id: number): Promise<boolean>;

  // Daily stats
  getDailyStats(userId: number, date: Date): Promise<DailyStats | undefined>;
  updateDailyStats(id: number, data: Partial<DailyStats>): Promise<DailyStats | undefined>;
  createDailyStats(stats: InsertDailyStats): Promise<DailyStats>;
  
  // Health metrics
  getHealthMetrics(userId: number, startDate: Date, endDate: Date): Promise<HealthMetric[]>;
  getHealthMetricsByType(userId: number, metricType: HealthMetricType, startDate: Date, endDate: Date): Promise<HealthMetric[]>;
  getHealthMetric(id: number): Promise<HealthMetric | undefined>;
  createHealthMetric(metric: InsertHealthMetric): Promise<HealthMetric>;
  updateHealthMetric(id: number, data: Partial<HealthMetric>): Promise<HealthMetric | undefined>;
  deleteHealthMetric(id: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private exercises: Map<number, Exercise>;
  private workoutTemplates: Map<number, WorkoutTemplate>;
  private workoutTemplateExercises: Map<number, WorkoutTemplateExercise>;
  private completedWorkouts: Map<number, CompletedWorkout>;
  private workoutSets: Map<number, WorkoutSet>;
  private activities: Map<number, Activity>;
  private meals: Map<number, Meal>;
  private dailyStats: Map<number, DailyStats>;

  private currentUserId: number;
  private currentExerciseId: number;
  private currentWorkoutTemplateId: number;
  private currentWorkoutTemplateExerciseId: number;
  private currentCompletedWorkoutId: number;
  private currentWorkoutSetId: number;
  private currentActivityId: number;
  private currentMealId: number;
  private currentDailyStatsId: number;

  constructor() {
    this.users = new Map();
    this.exercises = new Map();
    this.workoutTemplates = new Map();
    this.workoutTemplateExercises = new Map();
    this.completedWorkouts = new Map();
    this.workoutSets = new Map();
    this.activities = new Map();
    this.meals = new Map();
    this.dailyStats = new Map();

    this.currentUserId = 1;
    this.currentExerciseId = 1;
    this.currentWorkoutTemplateId = 1;
    this.currentWorkoutTemplateExerciseId = 1;
    this.currentCompletedWorkoutId = 1;
    this.currentWorkoutSetId = 1;
    this.currentActivityId = 1;
    this.currentMealId = 1;
    this.currentDailyStatsId = 1;

    // Initialize with some sample data
    this.initializeData();
  }

  private initializeData() {
    // Create sample user
    const sampleUser: InsertUser = {
      username: "james",
      password: "password123",
      displayName: "James Wilson",
      height: 185,
      weight: 82,
      bodyFat: 15,
      dailyCalorieTarget: 2500,
      dailyStepTarget: 10000,
      dailyProteinTarget: 180,
      dailyCarbsTarget: 250,
      dailyFatTarget: 65,
      profileType: "premium",
      dashboardWidgets: [
        {
          id: "widget1",
          type: "progress",
          title: "Calories",
          data: {
            percentage: 65,
            color: "#FF5722",
            label: "Calories",
            value: "1625",
            total: "2500"
          }
        },
        {
          id: "widget2",
          type: "progress",
          title: "Steps",
          data: {
            percentage: 43,
            color: "#3F51B5",
            label: "Steps",
            value: "4286",
            total: "10000"
          }
        },
        {
          id: "widget3",
          type: "progress",
          title: "Water",
          data: {
            percentage: 80,
            color: "#03A9F4",
            label: "Water",
            value: "2.4",
            total: "3L"
          }
        }
      ]
    };
    this.createUser(sampleUser);

    // Create sample exercises
    const exercises = [
      // Chest
      { name: "Bench Press", category: "Strength", muscleGroup: "Chest", description: "Flat barbell bench press" },
      { name: "Incline DB Press", category: "Strength", muscleGroup: "Chest", description: "Incline dumbbell press" },
      { name: "Chest Fly", category: "Strength", muscleGroup: "Chest", description: "Dumbbell chest fly" },
      { name: "Cable Crossover", category: "Strength", muscleGroup: "Chest", description: "Cable crossover fly" },
      { name: "Push-Up", category: "Bodyweight", muscleGroup: "Chest", description: "Standard push-up" },
      { name: "Decline Press", category: "Strength", muscleGroup: "Chest", description: "Decline barbell press" },
      
      // Back
      { name: "Deadlift", category: "Strength", muscleGroup: "Back", description: "Conventional deadlift" },
      { name: "Pull-up", category: "Bodyweight", muscleGroup: "Back", description: "Standard pull-up" },
      { name: "Lat Pulldown", category: "Strength", muscleGroup: "Back", description: "Wide-grip lat pulldown" },
      { name: "Barbell Row", category: "Strength", muscleGroup: "Back", description: "Bent over barbell row" },
      { name: "T-Bar Row", category: "Strength", muscleGroup: "Back", description: "T-bar row machine" },
      { name: "Seated Cable Row", category: "Strength", muscleGroup: "Back", description: "Seated cable row" },
      
      // Legs
      { name: "Squat", category: "Strength", muscleGroup: "Legs", description: "Barbell back squat" },
      { name: "Leg Press", category: "Strength", muscleGroup: "Legs", description: "Machine leg press" },
      { name: "Romanian Deadlift", category: "Strength", muscleGroup: "Legs", description: "Romanian deadlift" },
      { name: "Leg Extension", category: "Strength", muscleGroup: "Legs", description: "Machine leg extension" },
      { name: "Leg Curl", category: "Strength", muscleGroup: "Legs", description: "Lying leg curl" },
      { name: "Calf Raise", category: "Strength", muscleGroup: "Legs", description: "Standing calf raise" },
      
      // Shoulders
      { name: "Overhead Press", category: "Strength", muscleGroup: "Shoulders", description: "Barbell overhead press" },
      { name: "Lateral Raise", category: "Strength", muscleGroup: "Shoulders", description: "Dumbbell lateral raise" },
      { name: "Front Raise", category: "Strength", muscleGroup: "Shoulders", description: "Dumbbell front raise" },
      { name: "Face Pull", category: "Strength", muscleGroup: "Shoulders", description: "Cable face pull" },
      { name: "Reverse Fly", category: "Strength", muscleGroup: "Shoulders", description: "Bent over dumbbell reverse fly" },
      
      // Arms
      { name: "Bicep Curl", category: "Strength", muscleGroup: "Arms", description: "Dumbbell bicep curl" },
      { name: "Hammer Curl", category: "Strength", muscleGroup: "Arms", description: "Dumbbell hammer curl" },
      { name: "Tricep Extension", category: "Strength", muscleGroup: "Arms", description: "Overhead tricep extension" },
      { name: "Tricep Pushdown", category: "Strength", muscleGroup: "Arms", description: "Cable tricep pushdown" },
      { name: "Skull Crusher", category: "Strength", muscleGroup: "Arms", description: "Lying tricep extension" },
      
      // Core
      { name: "Plank", category: "Bodyweight", muscleGroup: "Core", description: "Standard plank position" },
      { name: "Crunch", category: "Bodyweight", muscleGroup: "Core", description: "Standard crunch" },
      { name: "Russian Twist", category: "Bodyweight", muscleGroup: "Core", description: "Seated russian twist" },
      { name: "Leg Raise", category: "Bodyweight", muscleGroup: "Core", description: "Lying leg raise" },
      { name: "Ab Wheel", category: "Strength", muscleGroup: "Core", description: "Ab wheel rollout" }
    ];

    exercises.forEach(exercise => this.createExercise(exercise));

    // Create workout templates
    const templates = [
      { userId: 1, name: "Upper Body", exerciseCount: 6, duration: 45, color: "#3F51B5" },
      { userId: 1, name: "Lower Body", exerciseCount: 5, duration: 50, color: "#FF5722" },
      { userId: 1, name: "Push Day", exerciseCount: 7, duration: 60, color: "#4CAF50" },
      { userId: 1, name: "Pull Day", exerciseCount: 6, duration: 55, color: "#9C27B0" }
    ];

    templates.forEach(template => this.createWorkoutTemplate(template));

    // Create template exercises
    const templateExercises = [
      { workoutTemplateId: 1, exerciseId: 1, sets: 3, repsMin: 8, repsMax: 10, restSeconds: 90, order: 1 },
      { workoutTemplateId: 1, exerciseId: 5, sets: 3, repsMin: 10, repsMax: 12, restSeconds: 60, order: 2 },
      { workoutTemplateId: 1, exerciseId: 6, sets: 3, repsMin: 10, repsMax: 12, restSeconds: 60, order: 3 }
    ];

    templateExercises.forEach(te => this.createWorkoutTemplateExercise(te));

    // Create sample activities
    const today = new Date();
    const activities = [
      {
        userId: 1,
        type: "workout",
        title: "Upper Body Workout",
        description: "8:00 AM - 9:15 AM",
        date: today,
        startTime: new Date(today.setHours(8, 0, 0, 0)),
        endTime: new Date(today.setHours(9, 15, 0, 0)),
        isCompleted: false,
        metadata: {}
      },
      {
        userId: 1,
        type: "nutrition",
        title: "Protein Shake",
        description: "9:30 AM",
        date: today,
        startTime: new Date(today.setHours(9, 30, 0, 0)),
        isCompleted: false,
        metadata: {}
      },
      {
        userId: 1,
        type: "medication",
        title: "Fish Oil",
        description: "2 capsules with lunch",
        date: today,
        isCompleted: false,
        metadata: {}
      }
    ];

    activities.forEach(activity => this.createActivity(activity));

    // Create daily stats
    this.createDailyStats({
      userId: 1,
      date: today,
      caloriesConsumed: 1625,
      caloriesBurned: 500,
      proteinConsumed: 125,
      carbsConsumed: 195,
      fatConsumed: 48,
      stepsCount: 4286,
      waterIntake: 2.4,
      weightMeasurement: 82
    });

    // Create sample meals
    const breakfast = {
      userId: 1,
      name: "Breakfast",
      timestamp: new Date(today.setHours(7, 30, 0, 0)),
      calories: 520,
      protein: 35,
      carbs: 65,
      fat: 10,
      foods: ["Oatmeal", "Banana", "Protein Shake"]
    };

    const lunch = {
      userId: 1,
      name: "Lunch",
      timestamp: new Date(today.setHours(12, 15, 0, 0)),
      calories: 780,
      protein: 60,
      carbs: 80,
      fat: 25,
      foods: ["Chicken Breast", "Brown Rice", "Broccoli"]
    };

    const snack = {
      userId: 1,
      name: "Snack",
      timestamp: new Date(today.setHours(15, 0, 0, 0)),
      calories: 325,
      protein: 30,
      carbs: 50,
      fat: 13,
      foods: ["Greek Yogurt", "Almonds", "Blueberries"]
    };

    this.createMeal(breakfast);
    this.createMeal(lunch);
    this.createMeal(snack);

    // Create a workout in progress
    const workout = {
      userId: 1,
      workoutTemplateId: 1,
      startTime: new Date(today.setHours(8, 0, 0, 0)),
      isCompleted: false
    };

    // For initialization, we'll create the workout directly instead of using the async method
    const id = this.currentCompletedWorkoutId++;
    const completedWorkout: CompletedWorkout = { 
      ...workout, 
      id, 
      endTime: null, 
      isCompleted: false 
    };
    this.completedWorkouts.set(id, completedWorkout);

    // Add some sets - create them directly for initialization
    const setId1 = this.currentWorkoutSetId++;
    const set1: WorkoutSet = {
      id: setId1,
      completedWorkoutId: completedWorkout.id,
      exerciseId: 1,
      weight: 60,
      reps: 10,
      rpe: 7,
      setNumber: 1,
      setType: "working",
      isCompleted: true,
      timestamp: new Date()
    };
    this.workoutSets.set(setId1, set1);

    const setId2 = this.currentWorkoutSetId++;
    const set2: WorkoutSet = {
      id: setId2,
      completedWorkoutId: completedWorkout.id,
      exerciseId: 1,
      weight: 65,
      reps: 8,
      rpe: 8,
      setNumber: 2,
      setType: "working",
      isCompleted: true,
      timestamp: new Date()
    };
    this.workoutSets.set(setId2, set2);

    const setId3 = this.currentWorkoutSetId++;
    const set3: WorkoutSet = {
      id: setId3,
      completedWorkoutId: completedWorkout.id,
      exerciseId: 1,
      weight: 70,
      reps: 6,
      rpe: 9,
      setNumber: 3,
      setType: "working",
      isCompleted: true,
      timestamp: new Date()
    };
    this.workoutSets.set(setId3, set3);
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const newUser: User = { ...user, id };
    this.users.set(id, newUser);
    return newUser;
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...userData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Dashboard widget methods
  async getUserWidgets(userId: number): Promise<any[] | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    return user.dashboardWidgets as any[] || [];
  }

  async updateUserWidgets(userId: number, widgets: any[]): Promise<any[] | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    const updatedUser = { ...user, dashboardWidgets: widgets };
    this.users.set(userId, updatedUser);
    return widgets;
  }

  // Exercise methods
  async getExercises(): Promise<Exercise[]> {
    return Array.from(this.exercises.values());
  }

  async getExercise(id: number): Promise<Exercise | undefined> {
    return this.exercises.get(id);
  }

  async getExercisesByCategory(category: string): Promise<Exercise[]> {
    return Array.from(this.exercises.values()).filter(
      exercise => exercise.category === category
    );
  }

  async createExercise(exercise: InsertExercise): Promise<Exercise> {
    const id = this.currentExerciseId++;
    const newExercise: Exercise = { ...exercise, id };
    this.exercises.set(id, newExercise);
    return newExercise;
  }

  // Workout template methods
  async getWorkoutTemplates(userId: number): Promise<WorkoutTemplate[]> {
    return Array.from(this.workoutTemplates.values()).filter(
      template => template.userId === userId
    );
  }

  async getWorkoutTemplate(id: number): Promise<WorkoutTemplate | undefined> {
    return this.workoutTemplates.get(id);
  }

  async createWorkoutTemplate(template: InsertWorkoutTemplate): Promise<WorkoutTemplate> {
    const id = this.currentWorkoutTemplateId++;
    const newTemplate: WorkoutTemplate = { ...template, id };
    this.workoutTemplates.set(id, newTemplate);
    return newTemplate;
  }

  // Workout template exercises methods
  async getWorkoutTemplateExercises(workoutTemplateId: number): Promise<WorkoutTemplateExercise[]> {
    return Array.from(this.workoutTemplateExercises.values()).filter(
      te => te.workoutTemplateId === workoutTemplateId
    ).sort((a, b) => a.order - b.order);
  }

  async createWorkoutTemplateExercise(templateExercise: InsertWorkoutTemplateExercise): Promise<WorkoutTemplateExercise> {
    const id = this.currentWorkoutTemplateExerciseId++;
    const newTemplateExercise: WorkoutTemplateExercise = { ...templateExercise, id };
    this.workoutTemplateExercises.set(id, newTemplateExercise);
    return newTemplateExercise;
  }

  // Completed workouts methods
  async getCompletedWorkouts(userId: number): Promise<CompletedWorkout[]> {
    return Array.from(this.completedWorkouts.values()).filter(
      workout => workout.userId === userId
    );
  }

  async getCompletedWorkoutsByWeek(userId: number, startDate: Date, endDate: Date): Promise<CompletedWorkout[]> {
    return Array.from(this.completedWorkouts.values()).filter(
      workout => 
        workout.userId === userId && 
        workout.startTime >= startDate && 
        workout.startTime <= endDate
    );
  }

  async getCompletedWorkout(id: number): Promise<CompletedWorkout | undefined> {
    return this.completedWorkouts.get(id);
  }

  async createCompletedWorkout(workout: InsertCompletedWorkout): Promise<CompletedWorkout> {
    const id = this.currentCompletedWorkoutId++;
    
    // Make sure we convert string dates to Date objects if needed
    let startTime = workout.startTime;
    if (typeof startTime === 'string') {
      startTime = new Date(startTime);
    }
    
    const newWorkout: CompletedWorkout = { 
      ...workout, 
      id, 
      startTime, // Use the properly typed startTime
      endTime: null, 
      isCompleted: false 
    };
    
    this.completedWorkouts.set(id, newWorkout);
    console.log("Storage: Created completed workout with ID:", id);
    return newWorkout;
  }

  async updateCompletedWorkout(id: number, data: Partial<CompletedWorkout>): Promise<CompletedWorkout | undefined> {
    const workout = this.completedWorkouts.get(id);
    if (!workout) return undefined;
    
    const updatedWorkout = { ...workout, ...data };
    this.completedWorkouts.set(id, updatedWorkout);
    return updatedWorkout;
  }

  // Workout sets methods
  async getWorkoutSets(completedWorkoutId: number): Promise<WorkoutSet[]> {
    return Array.from(this.workoutSets.values()).filter(
      set => set.completedWorkoutId === completedWorkoutId
    ).sort((a, b) => a.setNumber - b.setNumber);
  }

  async getWorkoutSetsByExercise(exerciseId: number): Promise<WorkoutSet[]> {
    return Array.from(this.workoutSets.values()).filter(
      set => set.exerciseId === exerciseId
    ).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async createWorkoutSet(set: InsertWorkoutSet): Promise<WorkoutSet> {
    const id = this.currentWorkoutSetId++;
    
    // Create a properly typed WorkoutSet object with all required fields
    const newSet: WorkoutSet = { 
      id,
      completedWorkoutId: set.completedWorkoutId,
      exerciseId: set.exerciseId,
      weight: set.weight,
      reps: set.reps,
      rpe: set.rpe !== undefined ? set.rpe : null,
      setNumber: set.setNumber,
      setType: set.setType || "working",
      isCompleted: set.isCompleted !== undefined ? set.isCompleted : false,
      timestamp: set.timestamp
    };
    
    console.log("Storage: Creating workout set:", newSet);
    this.workoutSets.set(id, newSet);
    return newSet;
  }

  async updateWorkoutSet(id: number, data: Partial<WorkoutSet>): Promise<WorkoutSet | undefined> {
    const set = this.workoutSets.get(id);
    if (!set) return undefined;
    
    const updatedSet = { ...set, ...data };
    this.workoutSets.set(id, updatedSet);
    return updatedSet;
  }

  // Activities methods
  async getActivities(userId: number, date: Date): Promise<Activity[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return Array.from(this.activities.values()).filter(
      activity => 
        activity.userId === userId && 
        activity.date >= startOfDay && 
        activity.date <= endOfDay
    );
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const id = this.currentActivityId++;
    const newActivity: Activity = { ...activity, id };
    this.activities.set(id, newActivity);
    return newActivity;
  }

  async updateActivity(id: number, data: Partial<Activity>): Promise<Activity | undefined> {
    const activity = this.activities.get(id);
    if (!activity) return undefined;
    
    const updatedActivity = { ...activity, ...data };
    this.activities.set(id, updatedActivity);
    return updatedActivity;
  }

  // Meals methods
  async getMeals(userId: number, date: Date): Promise<Meal[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return Array.from(this.meals.values()).filter(
      meal => 
        meal.userId === userId && 
        meal.timestamp >= startOfDay && 
        meal.timestamp <= endOfDay
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async getMeal(id: number): Promise<Meal | undefined> {
    return this.meals.get(id);
  }

  async createMeal(meal: InsertMeal): Promise<Meal> {
    const id = this.currentMealId++;
    const newMeal: Meal = { ...meal, id };
    this.meals.set(id, newMeal);
    return newMeal;
  }
  
  async updateMeal(id: number, data: Partial<Meal>): Promise<Meal | undefined> {
    const meal = this.meals.get(id);
    if (!meal) return undefined;
    
    const updatedMeal = { ...meal, ...data };
    this.meals.set(id, updatedMeal);
    return updatedMeal;
  }
  
  async deleteMeal(id: number): Promise<boolean> {
    const meal = this.meals.get(id);
    if (!meal) return false;
    
    this.meals.delete(id);
    return true;
  }

  // Daily stats methods
  async getDailyStats(userId: number, date: Date): Promise<DailyStats | undefined> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return Array.from(this.dailyStats.values()).find(
      stats => 
        stats.userId === userId && 
        stats.date >= startOfDay && 
        stats.date <= endOfDay
    );
  }

  async updateDailyStats(id: number, data: Partial<DailyStats>): Promise<DailyStats | undefined> {
    const stats = this.dailyStats.get(id);
    if (!stats) return undefined;
    
    const updatedStats = { ...stats, ...data };
    this.dailyStats.set(id, updatedStats);
    return updatedStats;
  }

  async createDailyStats(stats: InsertDailyStats): Promise<DailyStats> {
    const id = this.currentDailyStatsId++;
    const newStats: DailyStats = { ...stats, id };
    this.dailyStats.set(id, newStats);
    return newStats;
  }
}

export const storage = new MemStorage();

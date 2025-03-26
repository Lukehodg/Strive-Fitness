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
  healthMetrics, HealthMetric, InsertHealthMetric, HealthMetricType,
  medications, Medication, InsertMedication, MedicationType,
  medicationSchedule, MedicationSchedule, InsertMedicationSchedule, InjectionSite,
  subscriptionPlans, SubscriptionPlan, InsertSubscriptionPlan,
  subscriptionTransactions, SubscriptionTransaction, InsertSubscriptionTransaction,
  SubscriptionPlanType
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
  
  // Medications
  getMedications(userId: number): Promise<Medication[]>;
  getActiveMedications(userId: number): Promise<Medication[]>;
  getMedication(id: number): Promise<Medication | undefined>;
  createMedication(medication: InsertMedication): Promise<Medication>;
  updateMedication(id: number, data: Partial<Medication>): Promise<Medication | undefined>;
  deleteMedication(id: number): Promise<boolean>;
  
  // Medication schedules
  getMedicationSchedules(medicationId: number): Promise<MedicationSchedule[]>;
  getMedicationSchedulesByDateRange(userId: number, startDate: Date, endDate: Date): Promise<MedicationSchedule[]>;
  getMedicationSchedule(id: number): Promise<MedicationSchedule | undefined>;
  createMedicationSchedule(schedule: InsertMedicationSchedule): Promise<MedicationSchedule>;
  updateMedicationSchedule(id: number, data: Partial<MedicationSchedule>): Promise<MedicationSchedule | undefined>;
  deleteMedicationSchedule(id: number): Promise<boolean>;
  
  // Subscription plans
  getSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  getSubscriptionPlan(id: number): Promise<SubscriptionPlan | undefined>;
  getSubscriptionPlanByName(planType: SubscriptionPlanType): Promise<SubscriptionPlan | undefined>;
  createSubscriptionPlan(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan>;
  updateSubscriptionPlan(id: number, data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan | undefined>;
  
  // Subscription transactions
  getUserSubscriptionTransactions(userId: number): Promise<SubscriptionTransaction[]>;
  getSubscriptionTransaction(id: number): Promise<SubscriptionTransaction | undefined>;
  createSubscriptionTransaction(transaction: InsertSubscriptionTransaction): Promise<SubscriptionTransaction>;
  
  // User subscription management
  updateUserSubscription(userId: number, planType: SubscriptionPlanType, expiryDate: Date): Promise<User | undefined>;
  getUserSubscriptionDetails(userId: number): Promise<{plan: SubscriptionPlan, expiryDate: Date | null} | undefined>;
  checkUserSubscriptionAccess(userId: number, featureName: string): Promise<boolean>;
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
  private healthMetrics: Map<number, HealthMetric>;
  private medications: Map<number, Medication>;
  private medicationSchedules: Map<number, MedicationSchedule>;
  private subscriptionPlans: Map<number, SubscriptionPlan>;
  private subscriptionTransactions: Map<number, SubscriptionTransaction>;

  private currentUserId: number;
  private currentExerciseId: number;
  private currentWorkoutTemplateId: number;
  private currentWorkoutTemplateExerciseId: number;
  private currentCompletedWorkoutId: number;
  private currentWorkoutSetId: number;
  private currentActivityId: number;
  private currentMealId: number;
  private currentDailyStatsId: number;
  private currentHealthMetricId: number;
  private currentMedicationId: number;
  private currentMedicationScheduleId: number;
  private currentSubscriptionPlanId: number;
  private currentSubscriptionTransactionId: number;

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
    this.healthMetrics = new Map();
    this.medications = new Map();
    this.medicationSchedules = new Map();
    this.subscriptionPlans = new Map();
    this.subscriptionTransactions = new Map();

    this.currentUserId = 1;
    this.currentExerciseId = 1;
    this.currentWorkoutTemplateId = 1;
    this.currentWorkoutTemplateExerciseId = 1;
    this.currentCompletedWorkoutId = 1;
    this.currentWorkoutSetId = 1;
    this.currentActivityId = 1;
    this.currentMealId = 1;
    this.currentDailyStatsId = 1;
    this.currentHealthMetricId = 1;
    this.currentMedicationId = 1;
    this.currentMedicationScheduleId = 1;
    this.currentSubscriptionPlanId = 1;
    this.currentSubscriptionTransactionId = 1;

    // Initialize with some sample data
    this.initializeData();
  }

  private initializeData() {
    // Create subscription plans
    const subscriptionPlans = [
      {
        name: "Free",
        description: "Basic fitness tracking with limited features",
        price: 0,
        billingCycle: "monthly",
        features: ["Basic workout tracking", "Food logging", "Step counter"],
        isActive: true,
        maxWorkoutTemplates: 2,
        maxHealthMetrics: 3,
        maxMedications: 2,
        allowsAnalytics: false,
        allowsHealthIntegrations: false,
        allowsCustomWorkouts: false,
        allowsPdfUpload: false
      },
      {
        name: "Basic",
        description: "Essential fitness tracking and planning",
        price: 4.99,
        billingCycle: "monthly",
        features: [
          "Advanced workout tracking",
          "Detailed nutrition analysis",
          "Health metrics tracking",
          "Workout plans",
          "Goal setting"
        ],
        stripePriceId: "price_basic_monthly",
        isActive: true,
        maxWorkoutTemplates: 5,
        maxHealthMetrics: 8,
        maxMedications: 5,
        allowsAnalytics: true,
        allowsHealthIntegrations: false,
        allowsCustomWorkouts: true,
        allowsPdfUpload: false
      },
      {
        name: "Premium",
        description: "Complete fitness and health tracking solution",
        price: 9.99,
        billingCycle: "monthly",
        features: [
          "Advanced workout tracking",
          "Detailed nutrition analysis",
          "Comprehensive health metrics",
          "Unlimited workout plans",
          "Advanced analytics",
          "Health platform integrations",
          "Medication tracking",
          "PDF health report upload"
        ],
        stripePriceId: "price_premium_monthly",
        isActive: true,
        maxWorkoutTemplates: 20,
        maxHealthMetrics: 20,
        maxMedications: 20,
        allowsAnalytics: true,
        allowsHealthIntegrations: true,
        allowsCustomWorkouts: true,
        allowsPdfUpload: true
      },
      {
        name: "Elite",
        description: "Ultimate fitness tracking suite with premium features",
        price: 19.99,
        billingCycle: "monthly",
        features: [
          "All Premium features",
          "Priority support",
          "Unlimited everything",
          "AI workout recommendations",
          "Advanced health insights",
          "Personalized meal plans"
        ],
        stripePriceId: "price_elite_monthly",
        isActive: true,
        maxWorkoutTemplates: null,
        maxHealthMetrics: null,
        maxMedications: null,
        allowsAnalytics: true,
        allowsHealthIntegrations: true,
        allowsCustomWorkouts: true,
        allowsPdfUpload: true
      }
    ];

    // Add subscription plans to storage
    subscriptionPlans.forEach(plan => {
      const id = this.currentSubscriptionPlanId++;
      this.subscriptionPlans.set(id, { 
        ...plan, 
        id 
      });
    });
    
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
    
    // Create sample health metrics
    const todayDate = new Date();
    const yesterday = new Date(todayDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(todayDate);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    // Blood pressure readings
    const bloodPressureMetrics = [
      {
        userId: 1,
        timestamp: todayDate,
        metricType: 'blood_pressure' as HealthMetricType,
        systolic: 122,
        diastolic: 78,
        notes: "Morning reading, after breakfast",
      },
      {
        userId: 1,
        timestamp: yesterday,
        metricType: 'blood_pressure' as HealthMetricType,
        systolic: 125,
        diastolic: 80,
        notes: "Evening reading, before bed",
      },
      {
        userId: 1,
        timestamp: twoDaysAgo,
        metricType: 'blood_pressure' as HealthMetricType,
        systolic: 120,
        diastolic: 75,
        notes: "Afternoon reading",
      }
    ];
    
    // Heart rate readings
    const heartRateMetrics = [
      {
        userId: 1,
        timestamp: todayDate,
        metricType: 'heart_rate' as HealthMetricType,
        value: 68,
        notes: "Resting heart rate, morning",
      },
      {
        userId: 1,
        timestamp: yesterday,
        metricType: 'heart_rate' as HealthMetricType,
        value: 72,
        notes: "Evening reading",
      },
      {
        userId: 1,
        timestamp: twoDaysAgo,
        metricType: 'heart_rate' as HealthMetricType,
        value: 65,
        notes: "Resting heart rate after good sleep",
      }
    ];
    
    // Weight measurements
    const weightMetrics = [
      {
        userId: 1,
        timestamp: todayDate,
        metricType: 'weight' as HealthMetricType,
        value: 82.1,
        notes: "Morning weight",
      },
      {
        userId: 1,
        timestamp: yesterday,
        metricType: 'weight' as HealthMetricType,
        value: 82.4,
        notes: "Morning weight",
      },
      {
        userId: 1,
        timestamp: twoDaysAgo,
        metricType: 'weight' as HealthMetricType,
        value: 82.7,
        notes: "Morning weight",
      }
    ];
    
    // Add all the metrics to the storage
    [...bloodPressureMetrics, ...heartRateMetrics, ...weightMetrics].forEach(metric => {
      const id = this.currentHealthMetricId++;
      
      // Add missing required fields based on the type of metric
      if ('systolic' in metric) {
        // Blood pressure metric
        this.healthMetrics.set(id, { 
          ...metric, 
          id,
          value: null,
          tags: null
        });
      } else {
        // Heart rate or weight metric
        this.healthMetrics.set(id, { 
          ...metric, 
          id,
          systolic: null,
          diastolic: null,
          tags: null
        });
      }
    });
    
    // Create sample medications
    const sampleMedications = [
      {
        userId: 1,
        name: "Fish Oil",
        type: "capsule" as MedicationType,
        dosage: "1000mg",
        frequency: "twice daily",
        startDate: new Date(todayDate.setMonth(todayDate.getMonth() - 1)),
        notes: "Take with meals for better absorption",
        isActive: true
      },
      {
        userId: 1,
        name: "Vitamin D3",
        type: "tablet" as MedicationType,
        dosage: "5000IU",
        frequency: "once daily",
        startDate: new Date(todayDate.setMonth(todayDate.getMonth() - 2)),
        notes: "Take in the morning",
        isActive: true
      },
      {
        userId: 1,
        name: "Protein Supplement",
        type: "powder" as MedicationType,
        dosage: "25g",
        frequency: "post-workout",
        startDate: new Date(todayDate.setMonth(todayDate.getMonth() - 3)),
        endDate: new Date(todayDate.setMonth(todayDate.getMonth() + 3)),
        notes: "Mix with water or milk",
        isActive: true
      },
      {
        userId: 1,
        name: "Testosterone Enanthate",
        type: "injection" as MedicationType,
        dosage: "150mg",
        frequency: "weekly",
        startDate: new Date(todayDate.setMonth(todayDate.getMonth() - 1)),
        endDate: new Date(todayDate.setMonth(todayDate.getMonth() + 5)),
        notes: "IM injection, rotate sites",
        isActive: true
      }
    ];
    
    // Add medications to storage
    for (const med of sampleMedications) {
      const id = this.currentMedicationId++;
      const medication: Medication = {
        ...med,
        id,
        notes: med.notes || null,
        endDate: med.endDate || null
      };
      this.medications.set(id, medication);
      
      // Create schedules for the medications
      if (med.name === "Fish Oil") {
        // Create twice daily schedule for the next 7 days
        for (let i = 0; i < 7; i++) {
          const morningDate = new Date(todayDate);
          morningDate.setDate(morningDate.getDate() + i);
          morningDate.setHours(8, 0, 0, 0);
          
          const eveningDate = new Date(todayDate);
          eveningDate.setDate(eveningDate.getDate() + i);
          eveningDate.setHours(20, 0, 0, 0);
          
          const morningId = this.currentMedicationScheduleId++;
          const eveningId = this.currentMedicationScheduleId++;
          
          this.medicationSchedules.set(morningId, {
            id: morningId,
            medicationId: id,
            scheduledTime: morningDate,
            takenTime: i === 0 ? new Date(morningDate.getTime() + 15 * 60000) : null,
            isTaken: i === 0,
            skipped: false,
            notes: "With breakfast",
            injectionSite: null
          });
          
          this.medicationSchedules.set(eveningId, {
            id: eveningId,
            medicationId: id,
            scheduledTime: eveningDate,
            takenTime: null,
            isTaken: false,
            skipped: false,
            notes: "With dinner",
            injectionSite: null
          });
        }
      } else if (med.name === "Vitamin D3") {
        // Create once daily schedule for the next 7 days
        for (let i = 0; i < 7; i++) {
          const scheduleDate = new Date(todayDate);
          scheduleDate.setDate(scheduleDate.getDate() + i);
          scheduleDate.setHours(8, 0, 0, 0);
          
          const scheduleId = this.currentMedicationScheduleId++;
          
          this.medicationSchedules.set(scheduleId, {
            id: scheduleId,
            medicationId: id,
            scheduledTime: scheduleDate,
            takenTime: i === 0 ? new Date(scheduleDate.getTime() + 10 * 60000) : null,
            isTaken: i === 0,
            skipped: false,
            notes: "With breakfast",
            injectionSite: null
          });
        }
      } else if (med.name === "Testosterone Enanthate") {
        // Create weekly injection schedule
        for (let i = 0; i < 4; i++) {
          const scheduleDate = new Date(todayDate);
          scheduleDate.setDate(scheduleDate.getDate() + (i * 7));
          scheduleDate.setHours(18, 0, 0, 0);
          
          const scheduleId = this.currentMedicationScheduleId++;
          
          this.medicationSchedules.set(scheduleId, {
            id: scheduleId,
            medicationId: id,
            scheduledTime: scheduleDate,
            takenTime: i === 0 ? new Date(scheduleDate.getTime() - 7 * 24 * 60 * 60000) : null,
            isTaken: i === 0,
            skipped: false,
            notes: i % 2 === 0 ? "Right glute" : "Left glute",
            injectionSite: i % 2 === 0 ? "buttocks" as InjectionSite : "buttocks" as InjectionSite
          });
        }
      }
    }

    // Create a workout in progress
    const workout = {
      userId: 1,
      workoutTemplateId: 1,
      startTime: new Date(todayDate.setHours(8, 0, 0, 0)),
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
    // Ensure all nullable fields have proper null values rather than undefined
    const newUser: User = { 
      id,
      username: user.username,
      password: user.password,
      displayName: user.displayName,
      height: user.height !== undefined ? user.height : null,
      weight: user.weight !== undefined ? user.weight : null,
      bodyFat: user.bodyFat !== undefined ? user.bodyFat : null,
      dailyCalorieTarget: user.dailyCalorieTarget !== undefined ? user.dailyCalorieTarget : null,
      dailyStepTarget: user.dailyStepTarget !== undefined ? user.dailyStepTarget : null,
      dailyProteinTarget: user.dailyProteinTarget !== undefined ? user.dailyProteinTarget : null,
      dailyCarbsTarget: user.dailyCarbsTarget !== undefined ? user.dailyCarbsTarget : null,
      dailyFatTarget: user.dailyFatTarget !== undefined ? user.dailyFatTarget : null,
      profileType: user.profileType || 'standard',
      dashboardWidgets: user.dashboardWidgets || null
    };
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
    const newExercise: Exercise = { 
      id,
      name: exercise.name,
      category: exercise.category,
      muscleGroup: exercise.muscleGroup,
      description: exercise.description !== undefined ? exercise.description : null
    };
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
    const newTemplate: WorkoutTemplate = { 
      id,
      name: template.name,
      userId: template.userId,
      exerciseCount: template.exerciseCount,
      duration: template.duration,
      color: template.color !== undefined ? template.color : null
    };
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
    const newTemplateExercise: WorkoutTemplateExercise = { 
      id,
      workoutTemplateId: templateExercise.workoutTemplateId,
      exerciseId: templateExercise.exerciseId,
      sets: templateExercise.sets,
      repsMin: templateExercise.repsMin,
      repsMax: templateExercise.repsMax,
      order: templateExercise.order,
      restSeconds: templateExercise.restSeconds !== undefined ? templateExercise.restSeconds : null
    };
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
    const newActivity: Activity = { 
      id,
      userId: activity.userId,
      date: activity.date,
      type: activity.type,
      title: activity.title,
      description: activity.description !== undefined ? activity.description : null,
      startTime: activity.startTime !== undefined ? activity.startTime : null,
      endTime: activity.endTime !== undefined ? activity.endTime : null,
      isCompleted: activity.isCompleted !== undefined ? activity.isCompleted : null,
      metadata: activity.metadata !== undefined ? activity.metadata : null
    };
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
    const newStats: DailyStats = { 
      id,
      userId: stats.userId,
      date: stats.date,
      caloriesConsumed: stats.caloriesConsumed !== undefined ? stats.caloriesConsumed : 0,
      caloriesBurned: stats.caloriesBurned !== undefined ? stats.caloriesBurned : 0,
      proteinConsumed: stats.proteinConsumed !== undefined ? stats.proteinConsumed : 0,
      carbsConsumed: stats.carbsConsumed !== undefined ? stats.carbsConsumed : 0,
      fatConsumed: stats.fatConsumed !== undefined ? stats.fatConsumed : 0,
      stepsCount: stats.stepsCount !== undefined ? stats.stepsCount : 0,
      waterIntake: stats.waterIntake !== undefined ? stats.waterIntake : 0,
      weightMeasurement: stats.weightMeasurement !== undefined ? stats.weightMeasurement : null
    };
    this.dailyStats.set(id, newStats);
    return newStats;
  }

  // Health metrics methods
  async getHealthMetrics(userId: number, startDate: Date, endDate: Date): Promise<HealthMetric[]> {
    return Array.from(this.healthMetrics.values()).filter(
      metric => 
        metric.userId === userId && 
        metric.timestamp >= startDate && 
        metric.timestamp <= endDate
    );
  }

  async getHealthMetricsByType(userId: number, metricType: HealthMetricType, startDate: Date, endDate: Date): Promise<HealthMetric[]> {
    return Array.from(this.healthMetrics.values()).filter(
      metric => 
        metric.userId === userId && 
        metric.metricType === metricType &&
        metric.timestamp >= startDate && 
        metric.timestamp <= endDate
    );
  }

  async getHealthMetric(id: number): Promise<HealthMetric | undefined> {
    return this.healthMetrics.get(id);
  }

  async createHealthMetric(metric: InsertHealthMetric): Promise<HealthMetric> {
    const id = this.currentHealthMetricId++;
    
    // Make sure we convert string date to Date object if needed
    let timestamp = metric.timestamp;
    if (typeof timestamp === 'string') {
      timestamp = new Date(timestamp);
    }
    
    // Ensure all required fields have values (null if not provided)
    const newMetric: HealthMetric = {
      id,
      userId: metric.userId,
      timestamp,
      metricType: metric.metricType,
      value: metric.value !== undefined ? metric.value : null,
      systolic: metric.systolic !== undefined ? metric.systolic : null,
      diastolic: metric.diastolic !== undefined ? metric.diastolic : null,
      notes: metric.notes !== undefined ? metric.notes : null,
      tags: metric.tags !== undefined ? metric.tags : null
    };
    
    this.healthMetrics.set(id, newMetric);
    return newMetric;
  }

  async updateHealthMetric(id: number, data: Partial<HealthMetric>): Promise<HealthMetric | undefined> {
    const metric = this.healthMetrics.get(id);
    if (!metric) return undefined;
    
    const updatedMetric = { ...metric, ...data };
    this.healthMetrics.set(id, updatedMetric);
    return updatedMetric;
  }

  async deleteHealthMetric(id: number): Promise<boolean> {
    if (!this.healthMetrics.has(id)) return false;
    
    return this.healthMetrics.delete(id);
  }

  // Medication methods
  async getMedications(userId: number): Promise<Medication[]> {
    return Array.from(this.medications.values()).filter(
      (medication) => medication.userId === userId
    );
  }

  async getActiveMedications(userId: number): Promise<Medication[]> {
    return Array.from(this.medications.values()).filter(
      (medication) => medication.userId === userId && medication.isActive
    );
  }

  async getMedication(id: number): Promise<Medication | undefined> {
    return this.medications.get(id);
  }

  async createMedication(medication: InsertMedication): Promise<Medication> {
    const id = this.currentMedicationId++;
    const newMedication: Medication = {
      ...medication,
      id,
      notes: medication.notes || null,
      endDate: medication.endDate || null,
      isActive: medication.isActive !== undefined ? medication.isActive : null,
    };
    this.medications.set(id, newMedication);
    return newMedication;
  }

  async updateMedication(id: number, data: Partial<Medication>): Promise<Medication | undefined> {
    const medication = this.medications.get(id);
    if (!medication) return undefined;
    
    const updatedMedication = { ...medication, ...data };
    this.medications.set(id, updatedMedication);
    return updatedMedication;
  }

  async deleteMedication(id: number): Promise<boolean> {
    if (!this.medications.has(id)) return false;
    
    return this.medications.delete(id);
  }

  // Medication schedule methods
  async getMedicationSchedules(medicationId: number): Promise<MedicationSchedule[]> {
    return Array.from(this.medicationSchedules.values()).filter(
      (schedule) => schedule.medicationId === medicationId
    );
  }

  async getMedicationSchedulesByDateRange(userId: number, startDate: Date, endDate: Date): Promise<MedicationSchedule[]> {
    // First get all medications for the user
    const userMedications = await this.getMedications(userId);
    const medicationIds = userMedications.map(med => med.id);
    
    // Then get all schedules for those medications within the date range
    return Array.from(this.medicationSchedules.values()).filter(
      (schedule) => 
        medicationIds.includes(schedule.medicationId) && 
        schedule.scheduledTime >= startDate && 
        schedule.scheduledTime <= endDate
    );
  }

  async getMedicationSchedule(id: number): Promise<MedicationSchedule | undefined> {
    return this.medicationSchedules.get(id);
  }

  async createMedicationSchedule(schedule: InsertMedicationSchedule): Promise<MedicationSchedule> {
    const id = this.currentMedicationScheduleId++;
    const newSchedule: MedicationSchedule = {
      ...schedule,
      id,
      notes: schedule.notes || null,
      injectionSite: schedule.injectionSite || null,
      takenTime: null,
      isTaken: null,
      skipped: null
    };
    this.medicationSchedules.set(id, newSchedule);
    return newSchedule;
  }

  async updateMedicationSchedule(id: number, data: Partial<MedicationSchedule>): Promise<MedicationSchedule | undefined> {
    const schedule = this.medicationSchedules.get(id);
    if (!schedule) return undefined;
    
    const updatedSchedule = { ...schedule, ...data };
    this.medicationSchedules.set(id, updatedSchedule);
    return updatedSchedule;
  }

  async deleteMedicationSchedule(id: number): Promise<boolean> {
    if (!this.medicationSchedules.has(id)) return false;
    
    return this.medicationSchedules.delete(id);
  }

  // Subscription plan methods
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return Array.from(this.subscriptionPlans.values()).filter(
      (plan) => plan.isActive
    );
  }

  async getSubscriptionPlan(id: number): Promise<SubscriptionPlan | undefined> {
    return this.subscriptionPlans.get(id);
  }

  async getSubscriptionPlanByName(planType: SubscriptionPlanType): Promise<SubscriptionPlan | undefined> {
    return Array.from(this.subscriptionPlans.values()).find(
      (plan) => plan.name.toLowerCase() === planType.toLowerCase()
    );
  }

  async createSubscriptionPlan(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    const id = this.currentSubscriptionPlanId++;
    const newPlan: SubscriptionPlan = { 
      ...plan, 
      id 
    };
    this.subscriptionPlans.set(id, newPlan);
    return newPlan;
  }

  async updateSubscriptionPlan(id: number, data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan | undefined> {
    const plan = this.subscriptionPlans.get(id);
    if (!plan) return undefined;

    const updatedPlan = { ...plan, ...data };
    this.subscriptionPlans.set(id, updatedPlan);
    return updatedPlan;
  }

  // Subscription transactions methods
  async getUserSubscriptionTransactions(userId: number): Promise<SubscriptionTransaction[]> {
    return Array.from(this.subscriptionTransactions.values()).filter(
      (transaction) => transaction.userId === userId
    );
  }

  async getSubscriptionTransaction(id: number): Promise<SubscriptionTransaction | undefined> {
    return this.subscriptionTransactions.get(id);
  }

  async createSubscriptionTransaction(transaction: InsertSubscriptionTransaction): Promise<SubscriptionTransaction> {
    const id = this.currentSubscriptionTransactionId++;
    const newTransaction: SubscriptionTransaction = { 
      ...transaction, 
      id 
    };
    this.subscriptionTransactions.set(id, newTransaction);
    return newTransaction;
  }

  // User subscription management
  async updateUserSubscription(userId: number, planType: SubscriptionPlanType, expiryDate: Date): Promise<User | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;

    const updatedUser = { 
      ...user, 
      subscriptionPlan: planType,
      subscriptionExpiry: expiryDate
    };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async getUserSubscriptionDetails(userId: number): Promise<{plan: SubscriptionPlan, expiryDate: Date | null} | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;

    const plan = await this.getSubscriptionPlanByName(user.subscriptionPlan || 'free');
    if (!plan) return undefined;

    return {
      plan,
      expiryDate: user.subscriptionExpiry || null
    };
  }

  async checkUserSubscriptionAccess(userId: number, featureName: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;

    // Check if subscription has expired
    if (user.subscriptionExpiry && new Date(user.subscriptionExpiry) < new Date()) {
      // Subscription expired, downgrade to free
      await this.updateUserSubscription(userId, 'free', new Date());
      return this.checkFeatureAccessByPlan('free', featureName);
    }

    return this.checkFeatureAccessByPlan(user.subscriptionPlan || 'free', featureName);
  }

  // Helper method to check feature access by plan name
  private checkFeatureAccessByPlan(planType: string, featureName: string): boolean {
    switch (featureName) {
      case 'analytics':
        return ['basic', 'premium', 'elite'].includes(planType.toLowerCase());
      case 'health_integrations':
        return ['premium', 'elite'].includes(planType.toLowerCase());
      case 'custom_workouts':
        return ['basic', 'premium', 'elite'].includes(planType.toLowerCase());
      case 'pdf_upload':
        return ['premium', 'elite'].includes(planType.toLowerCase());
      default:
        return true; // Default access for unspecified features
    }
  }
}

export const storage = new MemStorage();

import { pgTable, text, serial, integer, boolean, timestamp, json, real, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define subscription plan types for validation
export const SubscriptionPlanTypes = [
  'basic',
  'advanced',
  'trial' // 7-day trial of advanced features
] as const;

// Define health metric types for validation
export const HealthMetricTypes = [
  'blood_pressure',
  'heart_rate',
  'blood_glucose',
  'weight',
  'body_fat',
  'sleep_duration',
  'sleep_quality',
  'oxygen_saturation',
  'temperature',
  'cholesterol',
  'respiration_rate',
  'hrv',
  'stress_level',
  'steps'
] as const;

// Define medication types for validation
export const MedicationTypes = [
  'tablet',
  'capsule',
  'liquid',
  'injection',
  'topical',
  'inhaler',
  'patch',
  'drops',
  'spray',
  'powder',
  'other'
] as const;

// Define injection sites for validation
export const InjectionSites = [
  'left_arm',
  'right_arm',
  'left_thigh',
  'right_thigh',
  'abdomen',
  'buttocks',
  'deltoid',
  'other'
] as const;

// User model
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  height: real("height"),
  weight: real("weight"),
  bodyFat: real("body_fat"),
  dailyCalorieTarget: integer("daily_calorie_target"),
  dailyStepTarget: integer("daily_step_target"),
  dailyProteinTarget: integer("daily_protein_target"),
  dailyCarbsTarget: integer("daily_carbs_target"),
  dailyFatTarget: integer("daily_fat_target"),
  profileType: text("profile_type").default("standard"),
  dashboardWidgets: json("dashboard_widgets"),
  subscriptionPlan: text("subscription_plan").default("free").notNull(),
  subscriptionExpiry: timestamp("subscription_expiry"),
  stripeCustomerId: text("stripe_customer_id"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

// Exercise model
export const exercises = pgTable("exercises", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  muscleGroup: text("muscle_group").notNull(),
  description: text("description"),
});

export const insertExerciseSchema = createInsertSchema(exercises).omit({
  id: true,
});

// Workout templates model
export const workoutTemplates = pgTable("workout_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  exerciseCount: integer("exercise_count").notNull(),
  duration: integer("duration").notNull(),
  color: text("color").default("#3F51B5"),
  scheduledDay: text("scheduled_day"), // Monday, Tuesday, etc.
  description: text("description"),
});

export const insertWorkoutTemplateSchema = createInsertSchema(workoutTemplates).omit({
  id: true,
});

// Workout template exercises junction table
export const workoutTemplateExercises = pgTable("workout_template_exercises", {
  id: serial("id").primaryKey(),
  workoutTemplateId: integer("workout_template_id").notNull(),
  exerciseId: integer("exercise_id").notNull(),
  sets: integer("sets").notNull(),
  repsMin: integer("reps_min").notNull(),
  repsMax: integer("reps_max").notNull(),
  restSeconds: integer("rest_seconds"),
  order: integer("order").notNull(),
});

export const insertWorkoutTemplateExerciseSchema = createInsertSchema(workoutTemplateExercises).omit({
  id: true,
});

// Completed workout model
export const completedWorkouts = pgTable("completed_workouts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  workoutTemplateId: integer("workout_template_id").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  isCompleted: boolean("is_completed").default(false),
});

export const insertCompletedWorkoutSchema = createInsertSchema(completedWorkouts).omit({
  id: true,
  endTime: true,
  isCompleted: true,
});

// Workout sets model
export const workoutSets = pgTable("workout_sets", {
  id: serial("id").primaryKey(),
  completedWorkoutId: integer("completed_workout_id").notNull(),
  exerciseId: integer("exercise_id").notNull(),
  weight: real("weight").notNull(),
  reps: integer("reps").notNull(),
  rpe: integer("rpe"),
  setNumber: integer("set_number").notNull(),
  setType: text("set_type").default("working").notNull(), // 'warmup' or 'working'
  isCompleted: boolean("is_completed").default(false),
  timestamp: timestamp("timestamp").notNull(),
});

export const insertWorkoutSetSchema = createInsertSchema(workoutSets).omit({
  id: true,
});

// Activity model
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // workout, meal, medication
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  date: timestamp("date").notNull(),
  isCompleted: boolean("is_completed").default(false),
  metadata: json("metadata"),
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
});

// Nutrition/meals model
export const meals = pgTable("meals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  calories: integer("calories").notNull(),
  protein: real("protein").notNull(),
  carbs: real("carbs").notNull(),
  fat: real("fat").notNull(),
  foods: json("foods").notNull(),
});

export const insertMealSchema = createInsertSchema(meals).omit({
  id: true,
});

// Daily stats tracking
export const dailyStats = pgTable("daily_stats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: timestamp("date").notNull(),
  caloriesConsumed: integer("calories_consumed").default(0),
  caloriesBurned: integer("calories_burned").default(0),
  proteinConsumed: real("protein_consumed").default(0),
  carbsConsumed: real("carbs_consumed").default(0),
  fatConsumed: real("fat_consumed").default(0),
  stepsCount: integer("steps_count").default(0),
  waterIntake: real("water_intake").default(0),
  weightMeasurement: real("weight_measurement"),
});

export const insertDailyStatsSchema = createInsertSchema(dailyStats).omit({
  id: true,
});

// Health metrics model
export const healthMetrics = pgTable("health_metrics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  metricType: text("metric_type").notNull(), // blood_pressure, heart_rate, blood_glucose, etc.
  value: real("value"), // For numeric values like heart rate
  systolic: integer("systolic"), // For blood pressure - top number
  diastolic: integer("diastolic"), // For blood pressure - bottom number
  notes: text("notes"),
  tags: json("tags"), // For storing additional metadata or tags
});

export const insertHealthMetricSchema = createInsertSchema(healthMetrics).omit({
  id: true,
});

// Define types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Exercise = typeof exercises.$inferSelect;
export type InsertExercise = z.infer<typeof insertExerciseSchema>;

export type WorkoutTemplate = typeof workoutTemplates.$inferSelect;
export type InsertWorkoutTemplate = z.infer<typeof insertWorkoutTemplateSchema>;

export type WorkoutTemplateExercise = typeof workoutTemplateExercises.$inferSelect;
export type InsertWorkoutTemplateExercise = z.infer<typeof insertWorkoutTemplateExerciseSchema>;

export type CompletedWorkout = typeof completedWorkouts.$inferSelect;
export type InsertCompletedWorkout = z.infer<typeof insertCompletedWorkoutSchema>;

export type WorkoutSet = typeof workoutSets.$inferSelect;
export type InsertWorkoutSet = z.infer<typeof insertWorkoutSetSchema>;

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;

export type Meal = typeof meals.$inferSelect;
export type InsertMeal = z.infer<typeof insertMealSchema>;

export type DailyStats = typeof dailyStats.$inferSelect;
export type InsertDailyStats = z.infer<typeof insertDailyStatsSchema>;

// Medications model
export const medications = pgTable("medications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // tablet, capsule, liquid, injection, etc.
  dosage: text("dosage").notNull(), // e.g., "10mg", "5ml"
  frequency: text("frequency").notNull(), // e.g., "once daily", "twice daily"
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"), // Optional end date
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
});

export const insertMedicationSchema = createInsertSchema(medications).omit({
  id: true,
});

// Medication schedule model
export const medicationSchedule = pgTable("medication_schedule", {
  id: serial("id").primaryKey(),
  medicationId: integer("medication_id").notNull(),
  scheduledTime: timestamp("scheduled_time").notNull(),
  takenTime: timestamp("taken_time"),
  isTaken: boolean("is_taken").default(false),
  skipped: boolean("skipped").default(false),
  notes: text("notes"),
  injectionSite: text("injection_site"), // For injections only
});

export const insertMedicationScheduleSchema = createInsertSchema(medicationSchedule).omit({
  id: true,
  takenTime: true,
  isTaken: true,
  skipped: true,
});

export type HealthMetric = typeof healthMetrics.$inferSelect;
export type InsertHealthMetric = z.infer<typeof insertHealthMetricSchema>;
export type HealthMetricType = typeof HealthMetricTypes[number];

export type Medication = typeof medications.$inferSelect;
export type InsertMedication = z.infer<typeof insertMedicationSchema>;
export type MedicationType = typeof MedicationTypes[number];

// Subscription plans model
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: real("price").notNull(),
  billingCycle: text("billing_cycle").notNull(), // monthly, annually
  features: json("features").notNull(), // Array of features included
  stripePriceId: text("stripe_price_id"), // Stripe price ID for billing
  isActive: boolean("is_active").default(true),
  maxWorkoutTemplates: integer("max_workout_templates"),
  maxHealthMetrics: integer("max_health_metrics"),
  maxMedications: integer("max_medications"),
  allowsAnalytics: boolean("allows_analytics").default(false),
  allowsHealthIntegrations: boolean("allows_health_integrations").default(false),
  allowsCustomWorkouts: boolean("allows_custom_workouts").default(false),
  allowsPdfUpload: boolean("allows_pdf_upload").default(false),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
});

// Subscription transactions model
export const subscriptionTransactions = pgTable("subscription_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  subscriptionPlanId: integer("subscription_plan_id").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull(), // succeeded, failed, pending
  transactionDate: timestamp("transaction_date").notNull().defaultNow(),
  paymentMethod: text("payment_method"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  receiptUrl: text("receipt_url"),
  metadata: json("metadata"),
});

export const insertSubscriptionTransactionSchema = createInsertSchema(subscriptionTransactions).omit({
  id: true,
  transactionDate: true,
});

export type MedicationSchedule = typeof medicationSchedule.$inferSelect;
export type InsertMedicationSchedule = z.infer<typeof insertMedicationScheduleSchema>;
export type InjectionSite = typeof InjectionSites[number];

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlanType = typeof SubscriptionPlanTypes[number];

export type SubscriptionTransaction = typeof subscriptionTransactions.$inferSelect;
export type InsertSubscriptionTransaction = z.infer<typeof insertSubscriptionTransactionSchema>;

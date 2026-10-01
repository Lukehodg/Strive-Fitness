import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  json,
  real,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { CoachSnapshot, CoachPlan } from "./coach";
import type { SessionFeedback } from "./planning";

export const scheduledWorkouts = pgTable("scheduled_workouts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: integer("template_id").notNull().references(() => workoutTemplates.id),
  name: text("name").notNull(),
  originDay: date("origin_day").notNull(),
  day: date("day").notNull(),
  timezone: text("timezone").notNull(),
  revision: integer("revision").notNull().default(0),
  skipped: boolean("skipped").notNull().default(false),
  sessionId: integer("session_id").references(() => completedWorkouts.id),
}, (t) => [uniqueIndex("scheduled_origin").on(t.userId, t.templateId, t.originDay, t.timezone), uniqueIndex("scheduled_session").on(t.sessionId), index("scheduled_owner_day").on(t.userId, t.day)]);

export const sessionFeedback = pgTable("session_feedback", {
  sessionId: integer("session_id").primaryKey().references(() => completedWorkouts.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  response: json("response").$type<SessionFeedback>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Define subscription plan types for validation
export const coachDecisions = pgTable("coach_decisions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recommendationId: integer("recommendation_id").notNull().references(() => coachRecommendations.id, { onDelete: "cascade" }),
  choice: text("choice").$type<"proposed" | "original">().notNull(),
  plan: json("plan").$type<CoachPlan>().notNull(),
  sessionId: integer("session_id").references(() => completedWorkouts.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("coach_decision_recommendation").on(t.recommendationId), uniqueIndex("coach_decision_session").on(t.sessionId)]);
export const coachRecommendations = pgTable("coach_recommendations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Snapshot survives template deletion; this is an identity, deliberately not a FK.
  templateId: integer("template_id").notNull(),
  scheduledId: integer("scheduled_id").references(() => scheduledWorkouts.id),
  requestKey: text("request_key").notNull(),
  inputHash: text("input_hash").notNull(),
  snapshot: json("snapshot").$type<CoachSnapshot>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("coach_request_owner").on(t.userId, t.requestKey), index("coach_owner_created").on(t.userId, t.createdAt)]);

export const SubscriptionPlanTypes = [
  "basic",
  "advanced",
  "trial", // 7-day trial of advanced features
] as const;

// Define health metric types for validation
export const HealthMetricTypes = [
  "blood_pressure",
  "heart_rate",
  "blood_glucose",
  "weight",
  "body_fat",
  "sleep_duration",
  "sleep_quality",
  "oxygen_saturation",
  "temperature",
  "cholesterol",
  "respiration_rate",
  "hrv",
  "stress_level",
  "steps",
] as const;

// Define exercise categories for validation
export const ExerciseCategories = [
  "strength",
  "bodyweight",
  "cardio",
  "endurance",
  "hiit",
  "functional",
] as const;

// Define exercise measurement types for validation
export const ExerciseMeasurementTypes = [
  "weight_reps", // Traditional weight lifting (bench press: 100kg x 10 reps)
  "distance_time", // Running, swimming (5km in 25min)
  "reps_only", // Bodyweight exercises (20 push-ups)
  "time_only", // Plank (60 seconds)
  "distance_only", // Sled push (20 meters)
  "calories", // Rowing, biking (100 calories)
  "laps", // Swimming (10 laps)
  "height", // Box jumps (24-inch box)
  "custom", // User defined measurement
] as const;

// Define workout types for validation
export const WorkoutTypes = [
  "traditional", // Standard strength training
  "endurance", // Endurance or HYROX-style workouts
  "hiit", // High intensity interval training
  "cardio", // Pure cardio sessions
  "circuit", // Circuit training
  "custom", // User-defined formats
] as const;

// Define medication types for validation
export const MedicationTypes = [
  "tablet",
  "capsule",
  "liquid",
  "injection",
  "topical",
  "inhaler",
  "patch",
  "drops",
  "spray",
  "powder",
  "other",
] as const;

// Define injection sites for validation
export const InjectionSites = [
  "left_arm",
  "right_arm",
  "left_thigh",
  "right_thigh",
  "abdomen",
  "buttocks",
  "deltoid",
  "other",
] as const;

// User model
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
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
  subscriptionExpiry: timestamp("subscription_expiry", { withTimezone: true }),
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
  measurementType: text("measurement_type").default("weight_reps"),
  defaultTarget: json("default_target"), // Stores target values based on measurementType
  isEndurance: boolean("is_endurance").default(false),
});

export const insertExerciseSchema = createInsertSchema(exercises).omit({
  id: true,
});

// Workout templates model
export const workoutTemplates = pgTable("workout_templates", {
  creationKey: text("creation_key"),
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  exerciseCount: integer("exercise_count").notNull(),
  duration: integer("duration").notNull(),
  color: text("color").default("#3F51B5"),
  scheduledDay: text("scheduled_day"), // Monday, Tuesday, etc.
  description: text("description"),
  workoutType: text("workout_type").default("traditional"), // traditional, endurance, hiit, etc.
  targetTimeInMinutes: integer("target_time_in_minutes"), // For endurance/HYROX workouts
  rounds: integer("rounds"), // For circuit/HIIT workouts
  isReversed: boolean("is_reversed").default(false), // For completing exercises in reverse order (HYROX type)
});

export const insertWorkoutTemplateSchema = createInsertSchema(
  workoutTemplates,
).omit({
  id: true,
});

// Workout template exercises junction table
export const workoutTemplateExercises = pgTable("workout_template_exercises", {
  id: serial("id").primaryKey(),
  workoutTemplateId: integer("workout_template_id")
    .notNull()
    .references(() => workoutTemplates.id),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id),
  sets: integer("sets").notNull(),
  repsMin: integer("reps_min").notNull(),
  repsMax: integer("reps_max").notNull(),
  restSeconds: integer("rest_seconds"),
  order: integer("order").notNull(),
  // Endurance workout specific fields
  distance: real("distance"), // Distance in meters/kilometers
  duration: integer("duration"), // Duration in seconds
  targetType: text("target_type").default("reps"), // reps, time, distance, calories
  targetValue: real("target_value"), // The target value based on targetType
  intervals: integer("intervals"), // Number of intervals for HIIT
  workToRestRatio: text("work_to_rest_ratio"), // Format: "40:20" (40s work, 20s rest)
});

export const insertWorkoutTemplateExerciseSchema = createInsertSchema(
  workoutTemplateExercises,
).omit({
  id: true,
});

// Completed workout model
export const completedWorkouts = pgTable("completed_workouts", {
  planSnapshot: json("plan_snapshot").$type<{
    name: string;
    coach?: { recommendationId: number; decisionId: number; choice: "proposed" | "original"; reasons: string[] };
    guidance?: {
      version: string;
      assessedAt: string;
      mode: string;
      reasons: string[];
    };
    exercises: {
      exerciseId: number;
      name: string;
      sets: number;
      repsMin: number;
      repsMax: number;
      restSeconds: number;
    }[];
  }>(),
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workoutTemplateId: integer("workout_template_id")
    .notNull()
    .references(() => workoutTemplates.id),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  isCompleted: boolean("is_completed").default(false),
});

export const insertCompletedWorkoutSchema = createInsertSchema(
  completedWorkouts,
).omit({
  id: true,
  endTime: true,
  isCompleted: true,
});

// Workout sets model
export const workoutSets = pgTable("workout_sets", {
  id: serial("id").primaryKey(),
  completedWorkoutId: integer("completed_workout_id")
    .notNull()
    .references(() => completedWorkouts.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id),
  weight: real("weight"),
  reps: integer("reps"),
  rpe: integer("rpe"),
  setNumber: integer("set_number").notNull(),
  setType: text("set_type").default("working").notNull(), // 'warmup' or 'working'
  isCompleted: boolean("is_completed").default(false),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  // Fields for endurance and other workout types
  distance: real("distance"), // Distance in meters
  duration: integer("duration"), // Time in seconds
  pace: real("pace"), // Time per distance unit (e.g., minutes per km)
  calories: integer("calories"), // Calories burned
  heartRate: integer("heart_rate"), // Average heart rate during the set
  laps: integer("laps"), // Number of laps
  notes: text("notes"), // Additional notes
  perceivedEffort: integer("perceived_effort"), // Scale 1-10
  elevationGain: real("elevation_gain"), // For climbing/hill exercises
  measurementType: text("measurement_type").default("weight_reps"), // Same as exercise.measurementType
  metricValue: json("metric_value"), // Flexible storage for any metric type
});

export const insertWorkoutSetSchema = createInsertSchema(workoutSets).omit({
  id: true,
});

// Activity model
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // workout, meal, medication
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time", { withTimezone: true }),
  endTime: timestamp("end_time", { withTimezone: true }),
  date: timestamp("date", { withTimezone: true }).notNull(),
  isCompleted: boolean("is_completed").default(false),
  metadata: json("metadata"),
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
});

// Nutrition/meals model
export const mailConnections = pgTable("mail_connections", {
  id: serial("id").primaryKey(), userId:integer("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
  provider:text("provider").notNull(), address:text("address"), tokens:text("tokens"),
  leaseKey:text("lease_key"), leaseUntil:timestamp("lease_until",{withTimezone:true}),
},t=>[uniqueIndex("mail_connection_owner").on(t.userId,t.provider)]);
export const mailAuthorizations = pgTable("mail_authorizations", {
  id:text("id").primaryKey(), userId:integer("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
  provider:text("provider").notNull(), stateHash:text("state_hash").notNull(), claimHash:text("claim_hash").notNull(),
  verifier:text("verifier").notNull(), code:text("code"), expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
  callbackAt:timestamp("callback_at",{withTimezone:true}), claimedAt:timestamp("claimed_at",{withTimezone:true}),
},t=>[uniqueIndex("mail_oauth_state").on(t.stateHash)]);
export const mailImports = pgTable("mail_imports", {
  id:serial("id").primaryKey(), userId:integer("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
  provider:text("provider").notNull(), sourceAddress:text("source_address").notNull(), sourceId:text("source_id").notNull(),
  sender:text("sender").notNull(), subject:text("subject").notNull(), body:text("body").notNull(),
  status:text("status").notNull().default("pending"), importedAt:timestamp("imported_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("mail_import_source").on(t.userId,t.provider,t.sourceAddress,t.sourceId)]);
export const mailOutgoing = pgTable("mail_outgoing", {
  id:serial("id").primaryKey(), userId:integer("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
  requestKey:text("request_key").notNull(), requestHash:text("request_hash").notNull(), provider:text("provider").notNull(),
  recipient:text("recipient").notNull(), subject:text("subject").notNull(), body:text("body").notNull(),
  status:text("status").notNull(), createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("mail_outgoing_request").on(t.userId,t.requestKey)]);

export const meals = pgTable("meals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  calories: integer("calories").notNull(),
  protein: real("protein").notNull(),
  carbs: real("carbs").notNull(),
  fat: real("fat").notNull(),
  foods: json("foods").notNull(),
  creationKey: text("creation_key"),
  creationHash: text("creation_hash"),
}, (t) => [uniqueIndex("meal_creation_owner").on(t.userId, t.creationKey)]);

export const insertMealSchema = createInsertSchema(meals).omit({
  id: true,
  creationKey: true,
  creationHash: true,
});

// Daily stats tracking
export const dailyStats = pgTable(
  "daily_stats",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    caloriesConsumed: integer("calories_consumed").default(0),
    caloriesBurned: integer("calories_burned").default(0),
    proteinConsumed: real("protein_consumed").default(0),
    carbsConsumed: real("carbs_consumed").default(0),
    fatConsumed: real("fat_consumed").default(0),
    stepsCount: integer("steps_count").default(0),
    waterIntake: real("water_intake").default(0),
    weightMeasurement: real("weight_measurement"),
  },
  (table) => [
    uniqueIndex("daily_stats_user_date").on(table.userId, table.date),
  ],
);

export const insertDailyStatsSchema = createInsertSchema(dailyStats).omit({
  id: true,
});

// Health metrics model
export const healthMetrics = pgTable("health_metrics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
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

export type WorkoutTemplateExercise =
  typeof workoutTemplateExercises.$inferSelect;
export type InsertWorkoutTemplateExercise = z.infer<
  typeof insertWorkoutTemplateExerciseSchema
>;

export type CompletedWorkout = typeof completedWorkouts.$inferSelect;
export type InsertCompletedWorkout = z.infer<
  typeof insertCompletedWorkoutSchema
>;

export type WorkoutSet = typeof workoutSets.$inferSelect;
export type InsertWorkoutSet = z.infer<typeof insertWorkoutSetSchema>;

export type ExerciseCategory = (typeof ExerciseCategories)[number];
export type ExerciseMeasurementType = (typeof ExerciseMeasurementTypes)[number];
export type WorkoutType = (typeof WorkoutTypes)[number];

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;

export type Meal = typeof meals.$inferSelect;
export type InsertMeal = z.infer<typeof insertMealSchema>;

export type DailyStats = typeof dailyStats.$inferSelect;
export type InsertDailyStats = z.infer<typeof insertDailyStatsSchema>;

// Medications model
export const medications = pgTable("medications", {
  category: text("category").notNull().default("medication"),
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // tablet, capsule, liquid, injection, etc.
  dosage: text("dosage").notNull(), // e.g., "10mg", "5ml"
  frequency: text("frequency").notNull(), // e.g., "once daily", "twice daily"
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }), // Optional end date
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
});

export const insertMedicationSchema = createInsertSchema(medications).omit({
  id: true,
});

export const routineLogs = pgTable(
  "routine_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    medicationId: integer("medication_id")
      .notNull()
      .references(() => medications.id),
    name: text("name").notNull(),
    dosage: text("dosage").notNull(),
    status: text("status").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    requestKey: text("request_key").notNull(),
  },
  (table) => [
    uniqueIndex("routine_log_request").on(table.userId, table.requestKey),
  ],
);

// Medication schedule model
export const medicationSchedule = pgTable("medication_schedule", {
  id: serial("id").primaryKey(),
  medicationId: integer("medication_id")
    .notNull()
    .references(() => medications.id, { onDelete: "cascade" }),
  scheduledTime: timestamp("scheduled_time", { withTimezone: true }).notNull(),
  takenTime: timestamp("taken_time", { withTimezone: true }),
  isTaken: boolean("is_taken").default(false),
  skipped: boolean("skipped").default(false),
  notes: text("notes"),
  injectionSite: text("injection_site"), // For injections only
});

export const insertMedicationScheduleSchema = createInsertSchema(
  medicationSchedule,
).omit({
  id: true,
  takenTime: true,
  isTaken: true,
  skipped: true,
});

export type HealthMetric = typeof healthMetrics.$inferSelect;
export type InsertHealthMetric = z.infer<typeof insertHealthMetricSchema>;
export type HealthMetricType = (typeof HealthMetricTypes)[number];

export type Medication = typeof medications.$inferSelect;
export type InsertMedication = z.infer<typeof insertMedicationSchema>;
export type MedicationType = (typeof MedicationTypes)[number];

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
  allowsHealthIntegrations: boolean("allows_health_integrations").default(
    false,
  ),
  allowsCustomWorkouts: boolean("allows_custom_workouts").default(false),
  allowsPdfUpload: boolean("allows_pdf_upload").default(false),
});

export const insertSubscriptionPlanSchema = createInsertSchema(
  subscriptionPlans,
).omit({
  id: true,
});

// Subscription transactions model
export const subscriptionTransactions = pgTable("subscription_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subscriptionPlanId: integer("subscription_plan_id").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull(), // succeeded, failed, pending
  transactionDate: timestamp("transaction_date", { withTimezone: true })
    .notNull()
    .defaultNow(),
  paymentMethod: text("payment_method"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  receiptUrl: text("receipt_url"),
  metadata: json("metadata"),
});

export const insertSubscriptionTransactionSchema = createInsertSchema(
  subscriptionTransactions,
).omit({
  id: true,
  transactionDate: true,
});

export type MedicationSchedule = typeof medicationSchedule.$inferSelect;
export type InsertMedicationSchedule = z.infer<
  typeof insertMedicationScheduleSchema
>;
export type InjectionSite = (typeof InjectionSites)[number];

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<
  typeof insertSubscriptionPlanSchema
>;
export type SubscriptionPlanType = (typeof SubscriptionPlanTypes)[number];

export type SubscriptionTransaction =
  typeof subscriptionTransactions.$inferSelect;
export type InsertSubscriptionTransaction = z.infer<
  typeof insertSubscriptionTransactionSchema
>;

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("sessions_expiry").on(table.expiresAt)],
);

export const dailyCheckIns = pgTable(
  "daily_check_ins",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    energy: text("energy").notNull(),
    soreness: text("soreness").notNull(),
    limited: boolean("limited").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("check_in_user_day").on(table.userId, table.day)],
);

// Provider credentials never leave the server. Encrypted with a deployment key,
// independent of the database; clients only receive a status projection.
export const wearableConnections = pgTable(
  "wearable_connections",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    subject: text("subject"),
    credentials: text("credentials"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("disconnected"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    failures: integer("failures").notNull().default(0),
    lastError: text("last_error"),
    leaseId: text("lease_id"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("wearable_user_provider").on(t.userId, t.provider),
    index("wearable_sync_due").on(t.nextSyncAt),
  ],
);

export const wearableAuthorizations = pgTable(
  "wearable_authorizations",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    stateHash: text("state_hash").notNull(),
    claimHash: text("claim_hash").notNull(),
    verifier: text("verifier"),
    code: text("code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    callbackAt: timestamp("callback_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("wearable_oauth_state").on(t.stateHash),
    index("wearable_oauth_expiry").on(t.expiresAt),
  ],
);

export const wearableDays = pgTable(
  "wearable_days",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    day: date("day").notNull(),
    sourceId: text("source_id").notNull(),
    score: real("score"),
    sleepMinutes: real("sleep_minutes"),
    hrv: real("hrv"),
    calibrating: boolean("calibrating").notNull().default(false),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("wearable_day_source").on(t.userId, t.provider, t.day)],
);

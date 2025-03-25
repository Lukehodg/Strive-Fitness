import { pgTable, text, serial, integer, boolean, timestamp, json, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  profileType: text("profile_type").default("standard"),
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
  stepsCount: integer("steps_count").default(0),
  waterIntake: real("water_intake").default(0),
  weightMeasurement: real("weight_measurement"),
});

export const insertDailyStatsSchema = createInsertSchema(dailyStats).omit({
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

import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { 
  insertActivitySchema, 
  insertCompletedWorkoutSchema,
  insertExerciseSchema,
  insertMealSchema,
  insertUserSchema,
  insertWorkoutSetSchema,
  insertWorkoutTemplateExerciseSchema,
  insertWorkoutTemplateSchema,
  insertMedicationSchema,
  insertMedicationScheduleSchema,
  HealthMetricTypes
} from "@shared/schema";
import { searchFoods, getFallbackFoods } from "./nutritionApi";
import { getProductByBarcode } from "./openFoodFactsApi";
import { handleConnectHealthPlatform, handleSyncHealthData } from "./healthIntegrations";
import { handleSignIn, handleSignUp, handleSocialAuth } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {
  // User routes
  app.get("/api/user/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const user = await storage.getUser(id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Don't send password to client
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  app.post("/api/user", async (req: Request, res: Response) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      const { password, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ message: "Invalid user data", error });
    }
  });

  app.patch("/api/user/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const userData = req.body;
      const updatedUser = await storage.updateUser(id, userData);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ message: "Invalid user data", error });
    }
  });
  
  // Dashboard widget routes
  app.get("/api/users/:userId/widgets", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      const widgets = await storage.getUserWidgets(userId);
      
      if (!widgets) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(widgets);
    } catch (error) {
      res.status(500).json({ message: "Failed to get user widgets", error });
    }
  });
  
  app.put("/api/users/:userId/widgets", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      const widgets = req.body;
      
      if (!Array.isArray(widgets)) {
        return res.status(400).json({ message: "Widgets must be an array" });
      }
      
      const updatedWidgets = await storage.updateUserWidgets(userId, widgets);
      
      if (!updatedWidgets) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(updatedWidgets);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user widgets", error });
    }
  });

  // Exercise routes
  app.get("/api/exercises", async (_req: Request, res: Response) => {
    const exercises = await storage.getExercises();
    res.json(exercises);
  });

  app.get("/api/exercises/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const exercise = await storage.getExercise(id);
    
    if (!exercise) {
      return res.status(404).json({ message: "Exercise not found" });
    }
    
    res.json(exercise);
  });

  app.post("/api/exercises", async (req: Request, res: Response) => {
    try {
      const exerciseData = insertExerciseSchema.parse(req.body);
      const exercise = await storage.createExercise(exerciseData);
      res.status(201).json(exercise);
    } catch (error) {
      res.status(400).json({ message: "Invalid exercise data", error });
    }
  });

  // Workout template routes
  app.get("/api/users/:userId/workout-templates", async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId, 10);
    const templates = await storage.getWorkoutTemplates(userId);
    res.json(templates);
  });

  app.get("/api/workout-templates/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const template = await storage.getWorkoutTemplate(id);
    
    if (!template) {
      return res.status(404).json({ message: "Workout template not found" });
    }
    
    res.json(template);
  });

  app.post("/api/workout-templates", async (req: Request, res: Response) => {
    try {
      const templateData = insertWorkoutTemplateSchema.parse(req.body);
      const template = await storage.createWorkoutTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      res.status(400).json({ message: "Invalid workout template data", error });
    }
  });

  // Workout template exercises routes
  app.get("/api/workout-templates/:id/exercises", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const exercises = await storage.getWorkoutTemplateExercises(id);
    res.json(exercises);
  });

  app.post("/api/workout-template-exercises", async (req: Request, res: Response) => {
    try {
      console.log("Received workout template exercise data:", req.body);
      
      // Validate the exercise data with more detailed error logging
      try {
        const exerciseData = insertWorkoutTemplateExerciseSchema.parse(req.body);
        console.log("Validated exercise data:", exerciseData);
        
        const exercise = await storage.createWorkoutTemplateExercise(exerciseData);
        console.log("Created template exercise:", exercise);
        
        res.status(201).json(exercise);
      } catch (validationError) {
        console.error("Validation error:", validationError);
        res.status(400).json({ 
          message: "Invalid template exercise data", 
          error: validationError,
          receivedData: req.body
        });
      }
    } catch (error) {
      console.error("Server error processing template exercise:", error);
      res.status(500).json({ message: "Server error processing template exercise", error });
    }
  });

  // Completed workouts routes
  app.get("/api/users/:userId/completed-workouts", async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId, 10);
    const workouts = await storage.getCompletedWorkouts(userId);
    res.json(workouts);
  });

  app.get("/api/completed-workouts/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const workout = await storage.getCompletedWorkout(id);
    
    if (!workout) {
      return res.status(404).json({ message: "Completed workout not found" });
    }
    
    res.json(workout);
  });

  app.post("/api/completed-workouts", async (req: Request, res: Response) => {
    try {
      console.log("Received completed workout data:", req.body);
      
      try {
        // Parse and transform data
        let workoutData = {...req.body};
        
        // Convert ISO string dates to Date objects
        if (typeof workoutData.startTime === 'string') {
          workoutData.startTime = new Date(workoutData.startTime);
        }
        
        // Validate using schema
        workoutData = insertCompletedWorkoutSchema.parse(workoutData);
        console.log("Validated workout data:", workoutData);
        
        // Create the workout
        const workout = await storage.createCompletedWorkout(workoutData);
        console.log("Created completed workout:", workout);
        
        res.status(201).json(workout);
      } catch (validationError) {
        console.error("Validation error:", validationError);
        res.status(400).json({ 
          message: "Invalid completed workout data - validation failed", 
          error: validationError,
          receivedData: req.body
        });
      }
    } catch (error) {
      console.error("Server error creating completed workout:", error);
      res.status(500).json({ message: "Server error creating completed workout", error });
    }
  });

  app.patch("/api/completed-workouts/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const workoutData = req.body;
      const updatedWorkout = await storage.updateCompletedWorkout(id, workoutData);
      
      if (!updatedWorkout) {
        return res.status(404).json({ message: "Completed workout not found" });
      }
      
      res.json(updatedWorkout);
    } catch (error) {
      res.status(400).json({ message: "Invalid workout data", error });
    }
  });

  // Workout sets routes
  app.get("/api/completed-workouts/:id/sets", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const sets = await storage.getWorkoutSets(id);
    res.json(sets);
  });

  app.get("/api/exercises/:id/sets", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const sets = await storage.getWorkoutSetsByExercise(id);
    res.json(sets);
  });

  app.post("/api/workout-sets", async (req: Request, res: Response) => {
    try {
      console.log("Received workout set data:", req.body);
      
      // Manually validate and transform the data
      const data = {
        completedWorkoutId: Number(req.body.completedWorkoutId),
        exerciseId: Number(req.body.exerciseId),
        weight: Number(req.body.weight),
        reps: Number(req.body.reps),
        rpe: req.body.rpe ? Number(req.body.rpe) : null,
        setNumber: Number(req.body.setNumber),
        setType: req.body.setType || 'working',
        isCompleted: Boolean(req.body.isCompleted),
        timestamp: new Date(req.body.timestamp)
      };
      
      console.log("Transformed workout set data:", data);
      
      // Now try to validate with the schema
      try {
        const setData = insertWorkoutSetSchema.parse(data);
        console.log("Validated workout set data:", setData);
        const set = await storage.createWorkoutSet(setData);
        res.status(201).json(set);
      } catch (validationError: any) {
        console.error("Validation error:", validationError);
        res.status(400).json({ 
          message: "Invalid workout set data - validation failed", 
          error: validationError.errors || validationError 
        });
      }
    } catch (error) {
      console.error("General error in workout set creation:", error);
      res.status(500).json({ message: "Server error creating workout set", error });
    }
  });

  app.patch("/api/workout-sets/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const setData = req.body;
      const updatedSet = await storage.updateWorkoutSet(id, setData);
      
      if (!updatedSet) {
        return res.status(404).json({ message: "Workout set not found" });
      }
      
      res.json(updatedSet);
    } catch (error) {
      res.status(400).json({ message: "Invalid set data", error });
    }
  });

  // Activities routes
  app.get("/api/users/:userId/activities", async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId, 10);
    const dateParam = req.query.date as string;
    const date = dateParam ? new Date(dateParam) : new Date();
    
    const activities = await storage.getActivities(userId, date);
    res.json(activities);
  });

  app.post("/api/activities", async (req: Request, res: Response) => {
    try {
      const activityData = insertActivitySchema.parse(req.body);
      const activity = await storage.createActivity(activityData);
      res.status(201).json(activity);
    } catch (error) {
      res.status(400).json({ message: "Invalid activity data", error });
    }
  });

  app.patch("/api/activities/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const activityData = req.body;
      const updatedActivity = await storage.updateActivity(id, activityData);
      
      if (!updatedActivity) {
        return res.status(404).json({ message: "Activity not found" });
      }
      
      res.json(updatedActivity);
    } catch (error) {
      res.status(400).json({ message: "Invalid activity data", error });
    }
  });

  // Meals routes
  app.get("/api/users/:userId/meals", async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId, 10);
    const dateParam = req.query.date as string;
    const date = dateParam ? new Date(dateParam) : new Date();
    
    const meals = await storage.getMeals(userId, date);
    res.json(meals);
  });

  app.get("/api/meals/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const meal = await storage.getMeal(id);
      
      if (!meal) {
        return res.status(404).json({ message: "Meal not found" });
      }
      
      res.json(meal);
    } catch (error) {
      res.status(400).json({ message: "Error fetching meal", error });
    }
  });

  app.post("/api/meals", async (req: Request, res: Response) => {
    try {
      // Ensure timestamp is a Date object before parsing
      const data = { ...req.body };
      
      // Convert timestamp string to Date if necessary
      if (data.timestamp && typeof data.timestamp === 'string') {
        data.timestamp = new Date(data.timestamp);
      }
      
      const mealData = insertMealSchema.parse(data);
      const meal = await storage.createMeal(mealData);
      
      // Get the current date at midnight to match with daily stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Get or create daily stats for the user
      let dailyStats = await storage.getDailyStats(mealData.userId, today);
      
      if (!dailyStats) {
        // Create new daily stats if none exist for today
        dailyStats = await storage.createDailyStats({
          userId: mealData.userId,
          date: today,
          caloriesConsumed: 0,
          caloriesBurned: 0,
          proteinConsumed: 0,
          carbsConsumed: 0,
          fatConsumed: 0,
          stepsCount: 0,
          waterIntake: 0
        });
      }
      
      // Update the daily stats with the new meal data
      await storage.updateDailyStats(dailyStats.id, {
        caloriesConsumed: (dailyStats.caloriesConsumed || 0) + mealData.calories,
        proteinConsumed: (dailyStats.proteinConsumed || 0) + mealData.protein,
        carbsConsumed: (dailyStats.carbsConsumed || 0) + mealData.carbs,
        fatConsumed: (dailyStats.fatConsumed || 0) + mealData.fat
      });
      
      res.status(201).json(meal);
    } catch (error) {
      console.error("Error creating meal:", error);
      res.status(400).json({ message: "Invalid meal data", error });
    }
  });
  
  app.patch("/api/meals/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const originalMeal = await storage.getMeal(id);
      
      if (!originalMeal) {
        return res.status(404).json({ message: "Meal not found" });
      }
      
      // Prepare data for update with proper date handling
      const data = { ...req.body };
      if (data.timestamp && typeof data.timestamp === 'string') {
        data.timestamp = new Date(data.timestamp);
      }
      
      const updatedMeal = await storage.updateMeal(id, data);
      
      // Update daily stats to reflect changes in meal
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const dailyStats = await storage.getDailyStats(originalMeal.userId, today);
      if (dailyStats) {
        // Calculate the differences in nutritional values
        const caloriesDiff = (updatedMeal?.calories || 0) - originalMeal.calories;
        const proteinDiff = (updatedMeal?.protein || 0) - originalMeal.protein;
        const carbsDiff = (updatedMeal?.carbs || 0) - originalMeal.carbs;
        const fatDiff = (updatedMeal?.fat || 0) - originalMeal.fat;
        
        // Update daily stats with the differences
        await storage.updateDailyStats(dailyStats.id, {
          caloriesConsumed: (dailyStats.caloriesConsumed || 0) + caloriesDiff,
          proteinConsumed: (dailyStats.proteinConsumed || 0) + proteinDiff,
          carbsConsumed: (dailyStats.carbsConsumed || 0) + carbsDiff,
          fatConsumed: (dailyStats.fatConsumed || 0) + fatDiff
        });
      }
      
      res.json(updatedMeal);
    } catch (error) {
      console.error("Error updating meal:", error);
      res.status(400).json({ message: "Invalid meal data", error });
    }
  });
  
  app.delete("/api/meals/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const meal = await storage.getMeal(id);
      
      if (!meal) {
        return res.status(404).json({ message: "Meal not found" });
      }
      
      // Delete the meal
      const deleted = await storage.deleteMeal(id);
      
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete meal" });
      }
      
      // Update daily stats to remove the meal's nutritional values
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const dailyStats = await storage.getDailyStats(meal.userId, today);
      if (dailyStats) {
        await storage.updateDailyStats(dailyStats.id, {
          caloriesConsumed: Math.max(0, (dailyStats.caloriesConsumed || 0) - meal.calories),
          proteinConsumed: Math.max(0, (dailyStats.proteinConsumed || 0) - meal.protein),
          carbsConsumed: Math.max(0, (dailyStats.carbsConsumed || 0) - meal.carbs),
          fatConsumed: Math.max(0, (dailyStats.fatConsumed || 0) - meal.fat)
        });
      }
      
      res.status(200).json({ message: "Meal deleted successfully" });
    } catch (error) {
      console.error("Error deleting meal:", error);
      res.status(400).json({ message: "Error deleting meal", error });
    }
  });

  // Daily stats routes
  app.get("/api/users/:userId/daily-stats", async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId, 10);
    const dateParam = req.query.date as string;
    const date = dateParam ? new Date(dateParam) : new Date();
    
    const stats = await storage.getDailyStats(userId, date);
    
    if (!stats) {
      return res.status(404).json({ message: "Daily stats not found" });
    }
    
    res.json(stats);
  });

  app.patch("/api/daily-stats/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const statsData = req.body;
      const updatedStats = await storage.updateDailyStats(id, statsData);
      
      if (!updatedStats) {
        return res.status(404).json({ message: "Daily stats not found" });
      }
      
      res.json(updatedStats);
    } catch (error) {
      res.status(400).json({ message: "Invalid stats data", error });
    }
  });

  // Health Metrics routes
  app.get("/api/users/:userId/health-metrics", async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId, 10);
    const startDateParam = req.query.startDate as string;
    const endDateParam = req.query.endDate as string;
    const metricType = req.query.type as string;
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }
    
    try {
      // Default to last 30 days if no date range is provided
      const endDate = endDateParam ? new Date(endDateParam) : new Date();
      const startDate = startDateParam ? new Date(startDateParam) : new Date(endDate);
      if (!startDateParam) {
        startDate.setDate(startDate.getDate() - 30); // Default to 30 days before end date
      }
      
      if ((startDateParam && isNaN(startDate.getTime())) || 
          (endDateParam && isNaN(endDate.getTime()))) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      let metrics;
      
      if (metricType && HealthMetricTypes.includes(metricType as any)) {
        // Get metrics of a specific type
        metrics = await storage.getHealthMetricsByType(userId, metricType as any, startDate, endDate);
      } else {
        // Get all metrics
        metrics = await storage.getHealthMetrics(userId, startDate, endDate);
      }
      
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching health metrics:", error);
      res.status(500).json({ message: "Error fetching health metrics" });
    }
  });
  
  app.get("/api/health-metrics/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }
    
    try {
      const metric = await storage.getHealthMetric(id);
      
      if (metric) {
        res.json(metric);
      } else {
        res.status(404).json({ message: "Health metric not found" });
      }
    } catch (error) {
      console.error("Error fetching health metric:", error);
      res.status(500).json({ message: "Error fetching health metric" });
    }
  });
  
  app.post("/api/health-metrics", async (req: Request, res: Response) => {
    try {
      // Convert timestamp string to Date if needed
      const metricData = { ...req.body };
      if (typeof metricData.timestamp === 'string') {
        metricData.timestamp = new Date(metricData.timestamp);
      } else if (!metricData.timestamp) {
        metricData.timestamp = new Date(); // Default to current time
      }
      
      const metric = await storage.createHealthMetric(metricData);
      res.status(201).json(metric);
    } catch (error) {
      console.error("Error creating health metric:", error);
      res.status(500).json({ message: "Error creating health metric" });
    }
  });
  
  app.patch("/api/health-metrics/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }
    
    try {
      // Convert timestamp string to Date if it's being updated
      const metricData = { ...req.body };
      if (typeof metricData.timestamp === 'string') {
        metricData.timestamp = new Date(metricData.timestamp);
      }
      
      const updatedMetric = await storage.updateHealthMetric(id, metricData);
      
      if (updatedMetric) {
        res.json(updatedMetric);
      } else {
        res.status(404).json({ message: "Health metric not found" });
      }
    } catch (error) {
      console.error("Error updating health metric:", error);
      res.status(500).json({ message: "Error updating health metric" });
    }
  });
  
  app.delete("/api/health-metrics/:id", async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }
    
    try {
      const success = await storage.deleteHealthMetric(id);
      
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ message: "Health metric not found" });
      }
    } catch (error) {
      console.error("Error deleting health metric:", error);
      res.status(500).json({ message: "Error deleting health metric" });
    }
  });

  // Nutrition API routes for food search and barcode lookup
  app.get("/api/nutrition/barcode/:barcode", async (req: Request, res: Response) => {
    const barcode = req.params.barcode;
    
    if (!barcode || barcode.trim() === '') {
      return res.status(400).json({ message: "Barcode is required" });
    }
    
    try {
      const product = await getProductByBarcode(barcode);
      
      if (product) {
        res.json(product);
      } else {
        res.status(404).json({ 
          message: "Product not found", 
          barcode
        });
      }
    } catch (error) {
      console.error("Error fetching product by barcode:", error);
      res.status(500).json({ 
        message: "Error searching for product",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  app.get("/api/nutrition/search", async (req: Request, res: Response) => {
    const query = req.query.q as string;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ message: "Search query is required" });
    }
    
    try {
      // Check if we have the API credentials
      const hasApiCredentials = process.env.NUTRITIONIX_APP_ID && process.env.NUTRITIONIX_API_KEY;
      
      if (hasApiCredentials) {
        // Use the real API if credentials are available
        const foods = await searchFoods(query);
        res.json(foods);
      } else {
        // Use the fallback data if no API credentials
        const fallbackFoods = getFallbackFoods(query);
        
        // Inform the client that we're using fallback data
        res.setHeader('X-Using-Fallback', 'true');
        res.json(fallbackFoods);
      }
    } catch (error) {
      console.error("Error searching for nutritional data:", error);
      
      // If the API fails, use fallback data as a last resort
      const fallbackFoods = getFallbackFoods(query);
      res.setHeader('X-Using-Fallback', 'true');
      res.status(200).json(fallbackFoods);
    }
  });

  // Health Integrations routes
  
  // Route to connect to a health platform (Apple Health, Garmin, Android Health)
  app.post("/api/health-integrations/connect", handleConnectHealthPlatform);
  
  // Route to sync data from a connected health platform
  app.get("/api/users/:userId/health-integrations/sync", handleSyncHealthData);
  
  // Route to get status of connected health platforms
  app.get("/api/users/:userId/health-integrations", async (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId, 10);
    
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    
    // In a real app, we would check the database for connected platforms
    // For this prototype, we'll return mock connection statuses
    res.json({
      apple_health: { connected: true, last_sync: new Date(Date.now() - 3600000).toISOString() },
      garmin: { connected: false, last_sync: null },
      android_health: { connected: true, last_sync: new Date(Date.now() - 86400000).toISOString() },
      whoop: { connected: false, last_sync: null },
      oura: { connected: false, last_sync: null }
    });
  });
  
  // Medication and Supplement routes
  
  // Route to get all medications for a user
  app.get("/api/users/:userId/medications", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      const medications = await storage.getMedications(userId);
      res.json(medications);
    } catch (error) {
      console.error('Error getting medications:', error);
      res.status(500).json({ message: 'Failed to get medications' });
    }
  });
  
  // Route to get active medications for a user
  app.get("/api/users/:userId/medications/active", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      const medications = await storage.getActiveMedications(userId);
      res.json(medications);
    } catch (error) {
      console.error('Error getting active medications:', error);
      res.status(500).json({ message: 'Failed to get active medications' });
    }
  });
  
  // Route to get a specific medication
  app.get("/api/medications/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const medication = await storage.getMedication(id);
      
      if (!medication) {
        return res.status(404).json({ message: 'Medication not found' });
      }
      
      res.json(medication);
    } catch (error) {
      console.error('Error getting medication:', error);
      res.status(500).json({ message: 'Failed to get medication' });
    }
  });
  
  // Route to create a new medication
  app.post("/api/medications", async (req: Request, res: Response) => {
    try {
      // Handle date conversion
      const data = { ...req.body };
      if (data.startDate && typeof data.startDate === 'string') {
        data.startDate = new Date(data.startDate);
      }
      if (data.endDate && typeof data.endDate === 'string') {
        data.endDate = new Date(data.endDate);
      }
      
      const result = insertMedicationSchema.safeParse(data);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: 'Invalid medication data', 
          error: result.error 
        });
      }
      
      const medication = await storage.createMedication(result.data);
      res.status(201).json(medication);
    } catch (error) {
      console.error('Error creating medication:', error);
      res.status(500).json({ message: 'Failed to create medication' });
    }
  });
  
  // Route to update a medication
  app.patch("/api/medications/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const medication = await storage.getMedication(id);
      
      if (!medication) {
        return res.status(404).json({ message: 'Medication not found' });
      }
      
      // Handle date conversion
      const data = { ...req.body };
      if (data.startDate && typeof data.startDate === 'string') {
        data.startDate = new Date(data.startDate);
      }
      if (data.endDate && typeof data.endDate === 'string') {
        data.endDate = new Date(data.endDate);
      }
      
      const updatedMedication = await storage.updateMedication(id, data);
      res.json(updatedMedication);
    } catch (error) {
      console.error('Error updating medication:', error);
      res.status(500).json({ message: 'Failed to update medication' });
    }
  });
  
  // Route to delete a medication
  app.delete("/api/medications/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await storage.deleteMedication(id);
      
      if (!result) {
        return res.status(404).json({ message: 'Medication not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting medication:', error);
      res.status(500).json({ message: 'Failed to delete medication' });
    }
  });
  
  // Route to get medication schedules for a specific medication
  app.get("/api/medications/:medicationId/schedules", async (req: Request, res: Response) => {
    try {
      const medicationId = parseInt(req.params.medicationId, 10);
      const schedules = await storage.getMedicationSchedules(medicationId);
      res.json(schedules);
    } catch (error) {
      console.error('Error getting medication schedules:', error);
      res.status(500).json({ message: 'Failed to get medication schedules' });
    }
  });
  
  // Route to get medication schedules for a user within a date range
  app.get("/api/users/:userId/medication-schedules", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      let startDate: Date;
      let endDate: Date;
      
      if (req.query.startDate && req.query.endDate) {
        startDate = new Date(req.query.startDate as string);
        endDate = new Date(req.query.endDate as string);
      } else {
        // Default to today if no dates provided
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
      }
      
      const schedules = await storage.getMedicationSchedulesByDateRange(userId, startDate, endDate);
      res.json(schedules);
    } catch (error) {
      console.error('Error getting medication schedules:', error);
      res.status(500).json({ message: 'Failed to get medication schedules' });
    }
  });
  
  // Route to create a new medication schedule
  app.post("/api/medication-schedules", async (req: Request, res: Response) => {
    try {
      // Handle date conversion
      const data = { ...req.body };
      if (data.scheduledTime && typeof data.scheduledTime === 'string') {
        data.scheduledTime = new Date(data.scheduledTime);
      }
      if (data.takenTime && typeof data.takenTime === 'string') {
        data.takenTime = new Date(data.takenTime);
      }
      
      const result = insertMedicationScheduleSchema.safeParse(data);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: 'Invalid medication schedule data', 
          error: result.error 
        });
      }
      
      const schedule = await storage.createMedicationSchedule(result.data);
      res.status(201).json(schedule);
    } catch (error) {
      console.error('Error creating medication schedule:', error);
      res.status(500).json({ message: 'Failed to create medication schedule' });
    }
  });
  
  // Route to update a medication schedule
  app.patch("/api/medication-schedules/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const schedule = await storage.getMedicationSchedule(id);
      
      if (!schedule) {
        return res.status(404).json({ message: 'Medication schedule not found' });
      }
      
      // Handle date conversion
      const data = { ...req.body };
      if (data.scheduledTime && typeof data.scheduledTime === 'string') {
        data.scheduledTime = new Date(data.scheduledTime);
      }
      if (data.takenTime && typeof data.takenTime === 'string') {
        data.takenTime = new Date(data.takenTime);
      }
      
      const updatedSchedule = await storage.updateMedicationSchedule(id, data);
      res.json(updatedSchedule);
    } catch (error) {
      console.error('Error updating medication schedule:', error);
      res.status(500).json({ message: 'Failed to update medication schedule' });
    }
  });
  
  // Route to delete a medication schedule
  app.delete("/api/medication-schedules/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await storage.deleteMedicationSchedule(id);
      
      if (!result) {
        return res.status(404).json({ message: 'Medication schedule not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting medication schedule:', error);
      res.status(500).json({ message: 'Failed to delete medication schedule' });
    }
  });

  // Return server
  const httpServer = createServer(app);
  return httpServer;
}

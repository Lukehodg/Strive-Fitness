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
  insertWorkoutTemplateSchema
} from "@shared/schema";

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

  app.post("/api/meals", async (req: Request, res: Response) => {
    try {
      const mealData = insertMealSchema.parse(req.body);
      const meal = await storage.createMeal(mealData);
      res.status(201).json(meal);
    } catch (error) {
      res.status(400).json({ message: "Invalid meal data", error });
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

  // Return server
  const httpServer = createServer(app);
  return httpServer;
}

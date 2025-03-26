import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AIWorkoutGeneratorProps {
  open: boolean;
  onClose: () => void;
  userId: number;
}

export function AIWorkoutGenerator({ open, onClose, userId }: AIWorkoutGeneratorProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    focus: "full body",
    difficulty: "intermediate",
    duration: 45,
    equipment: "basic",
    workoutName: "",
    scheduledDay: ""
  });
  
  const [error, setError] = useState<string | null>(null);
  
  const generateWorkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/generate-workout", {
        userId,
        ...formData
      });
      return await res.json();
    },
    onSuccess: () => {
      // Clear the form
      setFormData({
        focus: "full body",
        difficulty: "intermediate",
        duration: 45,
        equipment: "basic",
        workoutName: "",
        scheduledDay: ""
      });
      
      // Invalidate queries to refresh the workout templates
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/workout-templates`] });
      
      // Close the dialog
      onClose();
    },
    onError: (error: any) => {
      console.error("Error generating workout:", error);
      setError("Failed to generate workout. Please try again.");
    }
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    generateWorkoutMutation.mutate();
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 text-white border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl font-bold">
            <Sparkles className="mr-2 h-5 w-5 text-primary" />
            AI Workout Generator
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Create a customized workout based on your preferences
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <Alert variant="destructive" className="bg-red-900 border-red-700 text-white">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="workoutName">Workout Name (Optional)</Label>
            <Input
              id="workoutName"
              placeholder="My Custom Workout"
              value={formData.workoutName}
              onChange={(e) => setFormData({ ...formData, workoutName: e.target.value })}
              className="bg-gray-900 border-gray-700"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="focus">Workout Focus</Label>
            <Select
              value={formData.focus}
              onValueChange={(value) => setFormData({ ...formData, focus: value })}
            >
              <SelectTrigger className="bg-gray-900 border-gray-700">
                <SelectValue placeholder="Select focus" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="full body">Full Body</SelectItem>
                <SelectItem value="upper body">Upper Body</SelectItem>
                <SelectItem value="lower body">Lower Body</SelectItem>
                <SelectItem value="core">Core</SelectItem>
                <SelectItem value="cardio">Cardio</SelectItem>
                <SelectItem value="strength">Strength</SelectItem>
                <SelectItem value="hypertrophy">Hypertrophy</SelectItem>
                <SelectItem value="endurance">Endurance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="difficulty">Difficulty Level</Label>
            <Select
              value={formData.difficulty}
              onValueChange={(value) => setFormData({ ...formData, difficulty: value })}
            >
              <SelectTrigger className="bg-gray-900 border-gray-700">
                <SelectValue placeholder="Select difficulty" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label htmlFor="duration">Duration (minutes): {formData.duration}</Label>
            </div>
            <Slider
              id="duration"
              min={15}
              max={90}
              step={5}
              defaultValue={[formData.duration]}
              onValueChange={(value) => setFormData({ ...formData, duration: value[0] })}
              className="my-4"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>15 min</span>
              <span>90 min</span>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="equipment">Equipment Available</Label>
            <Select
              value={formData.equipment}
              onValueChange={(value) => setFormData({ ...formData, equipment: value })}
            >
              <SelectTrigger className="bg-gray-900 border-gray-700">
                <SelectValue placeholder="Select equipment" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="none">Bodyweight Only</SelectItem>
                <SelectItem value="basic">Basic (Dumbbells, Pull-up Bar)</SelectItem>
                <SelectItem value="full">Full Gym</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="scheduledDay">Schedule Workout (Optional)</Label>
            <Select
              value={formData.scheduledDay}
              onValueChange={(value) => setFormData({ ...formData, scheduledDay: value })}
            >
              <SelectTrigger className="bg-gray-900 border-gray-700">
                <SelectValue placeholder="Select day" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="">None</SelectItem>
                <SelectItem value="Monday">Monday</SelectItem>
                <SelectItem value="Tuesday">Tuesday</SelectItem>
                <SelectItem value="Wednesday">Wednesday</SelectItem>
                <SelectItem value="Thursday">Thursday</SelectItem>
                <SelectItem value="Friday">Friday</SelectItem>
                <SelectItem value="Saturday">Saturday</SelectItem>
                <SelectItem value="Sunday">Sunday</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="bg-gray-700 hover:bg-gray-600 border-gray-600"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={generateWorkoutMutation.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {generateWorkoutMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Workout
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
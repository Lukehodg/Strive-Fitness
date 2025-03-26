import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronRightIcon, MoreVerticalIcon } from '@/lib/icons';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface WorkoutTemplate {
  id: number;
  name: string;
  description?: string;
  scheduledDay?: string;
  exerciseCount: number;
  duration: number;
  color: string;
}

interface WorkoutTemplatesProps {
  templates: WorkoutTemplate[];
  onEdit: () => void;
}

const WorkoutTemplates: React.FC<WorkoutTemplatesProps> = ({ templates, onEdit }) => {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<WorkoutTemplate | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    scheduledDay: '',
    duration: 0,
    color: ''
  });
  
  // Mutation for starting a new workout
  const startWorkoutMutation = useMutation({
    mutationFn: async (templateId: number) => {
      console.log("Starting workout with template ID:", templateId);
      
      // Create a new Date object for the start time
      const currentTime = new Date();
      
      try {
        // Format the date as an ISO string - this is required by the API
        // The server will parse this into a Date object
        const response = await apiRequest('POST', '/api/completed-workouts', {
          userId: 1, // In a real app, we would get this from auth
          workoutTemplateId: templateId,
          startTime: currentTime.toISOString()
        });
        
        // Parse the JSON response
        const responseData = await response.json();
        console.log("Workout created successfully:", responseData);
        return responseData;
      } catch (error) {
        console.error("Error creating workout:", error);
        throw error;
      }
    },
    onSuccess: (data: any) => {
      console.log("Success data:", data);
      
      toast({
        title: "Workout Started",
        description: "Your workout has been started",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/completed-workouts'] });
      
      // Make sure we have a valid ID
      if (data && data.id && !isNaN(data.id)) {
        // Convert to number and ensure it's a valid integer
        const workoutId = Math.floor(Number(data.id));
        console.log(`Navigating to workout with ID: ${workoutId}`);
        
        // Use window.location for a hard navigation
        window.location.href = `/workouts/active/${workoutId}`;
      } else {
        console.error("Invalid workout ID in response:", data);
        toast({
          title: "Error",
          description: "Failed to start workout - invalid ID",
          variant: "destructive"
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start workout",
        variant: "destructive"
      });
      console.error(error);
    }
  });

  // Mutation for updating a workout template
  const updateWorkoutMutation = useMutation({
    mutationFn: async (template: Partial<WorkoutTemplate> & { id: number }) => {
      return await apiRequest('PATCH', `/api/workout-templates/${template.id}`, template);
    },
    onSuccess: () => {
      toast({
        title: "Workout Updated",
        description: "Your workout has been updated",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/workout-templates'] });
      setShowEditDialog(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update workout",
        variant: "destructive"
      });
      console.error(error);
    }
  });

  // Mutation for deleting a workout template
  const deleteWorkoutMutation = useMutation({
    mutationFn: async (templateId: number) => {
      return await apiRequest('DELETE', `/api/workout-templates/${templateId}`);
    },
    onSuccess: () => {
      toast({
        title: "Workout Deleted",
        description: "Your workout has been deleted",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/workout-templates'] });
      setShowDeleteDialog(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete workout",
        variant: "destructive"
      });
      console.error(error);
    }
  });

  const handleTemplateClick = (templateId: number, e: React.MouseEvent<HTMLDivElement>) => {
    // Skip if clicking on the dropdown menu
    if ((e.target as HTMLElement).closest('.dropdown-trigger')) {
      e.stopPropagation();
      return;
    }
    
    startWorkoutMutation.mutate(templateId);
  };
  
  const handleEditClick = (template: WorkoutTemplate, e: React.MouseEvent<Element>) => {
    e.stopPropagation();
    setSelectedTemplate(template);
    setEditFormData({
      name: template.name,
      description: template.description || '',
      scheduledDay: template.scheduledDay || 'none',
      duration: template.duration,
      color: template.color
    });
    setShowEditDialog(true);
  };
  
  const handleDeleteClick = (template: WorkoutTemplate, e: React.MouseEvent<Element>) => {
    e.stopPropagation();
    setSelectedTemplate(template);
    setShowDeleteDialog(true);
  };
  
  const handleSaveEdit = () => {
    if (!selectedTemplate) return;
    
    updateWorkoutMutation.mutate({
      id: selectedTemplate.id,
      name: editFormData.name,
      description: editFormData.description,
      scheduledDay: editFormData.scheduledDay === 'none' ? '' : editFormData.scheduledDay,
      duration: editFormData.duration,
      color: editFormData.color
    });
  };
  
  const handleConfirmDelete = () => {
    if (!selectedTemplate) return;
    deleteWorkoutMutation.mutate(selectedTemplate.id);
  };

  return (
    <div className="bg-gray-800 rounded-xl shadow-sm p-4 mb-6 border border-gray-700">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-['Inter',sans-serif] text-lg font-semibold text-white">My Workouts</h3>
        <span className="text-primary text-sm cursor-pointer" onClick={onEdit}>Edit</span>
      </div>
      
      {/* Edit Workout Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-gray-800 text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Workout</DialogTitle>
            <DialogDescription className="text-gray-400">
              Make changes to your workout template.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Workout Name</Label>
              <Input 
                id="name" 
                value={editFormData.name} 
                onChange={(e) => setEditFormData({...editFormData, name: e.target.value})} 
                className="bg-gray-900 border-gray-700"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea 
                id="description" 
                value={editFormData.description} 
                onChange={(e) => setEditFormData({...editFormData, description: e.target.value})} 
                className="bg-gray-900 border-gray-700"
                placeholder="Optional description"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="scheduledDay">Scheduled Day</Label>
              <Select 
                value={editFormData.scheduledDay} 
                onValueChange={(value) => setEditFormData({...editFormData, scheduledDay: value})}
              >
                <SelectTrigger className="bg-gray-900 border-gray-700">
                  <SelectValue placeholder="Select a day" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="none">None</SelectItem>
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
            
            <div className="grid gap-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input 
                id="duration" 
                type="number" 
                value={editFormData.duration.toString()} 
                onChange={(e) => setEditFormData({...editFormData, duration: parseInt(e.target.value) || 0})} 
                className="bg-gray-900 border-gray-700"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowEditDialog(false)}
              className="bg-gray-700 hover:bg-gray-600 border-gray-600"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={updateWorkoutMutation.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {updateWorkoutMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-gray-800 text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Delete Workout</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete this workout template? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {selectedTemplate && (
            <div className="py-4">
              <p className="text-white font-medium">{selectedTemplate.name}</p>
              <p className="text-gray-400 text-sm">{selectedTemplate.exerciseCount} Exercises · {selectedTemplate.duration} min</p>
              {selectedTemplate.scheduledDay && <p className="text-primary text-sm">Scheduled for {selectedTemplate.scheduledDay}</p>}
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteDialog(false)}
              className="bg-gray-700 hover:bg-gray-600 border-gray-600"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteWorkoutMutation.isPending}
            >
              {deleteWorkoutMutation.isPending ? "Deleting..." : "Delete Workout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {Array.isArray(templates) && templates.map((template) => (
        <div 
          key={template.id}
          className="bg-gray-900 rounded-lg p-3 mb-3 last:mb-0 flex items-center justify-between cursor-pointer border border-gray-700"
          onClick={(e) => handleTemplateClick(template.id, e)}
        >
          <div className="flex items-center">
            <div className={`bg-opacity-20 rounded-lg p-2 mr-3`} style={{ backgroundColor: `${template.color}30` }}>
              <span className="material-icons" style={{ color: template.color }}>fitness_center</span>
            </div>
            <div>
              <h4 className="font-medium text-white">{template.name}</h4>
              <p className="text-xs text-gray-400">
                {template.exerciseCount} Exercises · {template.duration} min
                {template.scheduledDay && <span className="ml-2 text-primary">· {template.scheduledDay}</span>}
              </p>
              {template.description && <p className="text-xs text-gray-500 mt-1">{template.description}</p>}
            </div>
          </div>
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="p-1 text-gray-400 hover:text-white focus:outline-none dropdown-trigger"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVerticalIcon className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700">
                <DropdownMenuItem 
                  className="text-white hover:bg-gray-700 cursor-pointer"
                  onClick={(e) => handleEditClick(template, e as unknown as React.MouseEvent<Element>)}
                >
                  Edit Workout
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-red-500 hover:bg-gray-700 cursor-pointer"
                  onClick={(e) => handleDeleteClick(template, e as unknown as React.MouseEvent<Element>)}
                >
                  Delete Workout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
};

export default WorkoutTemplates;

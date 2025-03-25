import React from 'react';
import { useLocation } from 'wouter';
import { ChevronRightIcon } from '@/lib/icons';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface WorkoutTemplate {
  id: number;
  name: string;
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
  
  // Mutation for starting a new workout
  const startWorkoutMutation = useMutation({
    mutationFn: async (templateId: number) => {
      console.log("Starting workout with template ID:", templateId);
      return await apiRequest('POST', '/api/completed-workouts', {
        userId: 1, // In a real app, we would get this from auth
        workoutTemplateId: templateId,
        startTime: new Date()
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Workout Started",
        description: "Your workout has been started",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/completed-workouts'] });
      setLocation(`/workouts/active/${data.id}`);
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

  const handleTemplateClick = (templateId: number) => {
    startWorkoutMutation.mutate(templateId);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-['Inter',sans-serif] text-lg font-semibold">My Workouts</h3>
        <span className="text-primary text-sm cursor-pointer" onClick={onEdit}>Edit</span>
      </div>
      
      {templates.map((template) => (
        <div 
          key={template.id}
          className="bg-[#F5F5F5] rounded-lg p-3 mb-3 last:mb-0 flex items-center justify-between cursor-pointer"
          onClick={() => handleTemplateClick(template.id)}
        >
          <div className="flex items-center">
            <div className={`bg-opacity-10 rounded-lg p-2 mr-3`} style={{ backgroundColor: `${template.color}20` }}>
              <span className="material-icons" style={{ color: template.color }}>fitness_center</span>
            </div>
            <div>
              <h4 className="font-medium">{template.name}</h4>
              <p className="text-xs text-gray-500">{template.exerciseCount} Exercises · {template.duration} min</p>
            </div>
          </div>
          <ChevronRightIcon className="text-gray-400 w-5 h-5" />
        </div>
      ))}
    </div>
  );
};

export default WorkoutTemplates;

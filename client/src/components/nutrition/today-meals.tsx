import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MoreVerticalIcon } from '@/lib/icons';
import AddFoodForm from './add-food-form';

interface Food {
  name: string;
}

interface Meal {
  id: number;
  name: string;
  time: string;
  calories: number;
  foods: Food[];
  protein?: number;
  carbs?: number;
  fat?: number;
  timestamp?: Date;
  userId?: number;
}

interface TodayMealsProps {
  meals: Meal[];
  onAddMeal: () => void;
}

const TodayMeals: React.FC<TodayMealsProps> = ({ meals, onAddMeal }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);

  const handleDelete = async () => {
    if (!selectedMeal) return;
    
    try {
      await apiRequest(`/api/meals/${selectedMeal.id}`, 'DELETE');
      
      // Invalidate and refetch meals data
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/meals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/daily-stats'] });
      
      toast({
        title: "Meal deleted",
        description: "The meal has been successfully deleted.",
      });
      
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting meal:', error);
      toast({
        title: "Error",
        description: "There was an error deleting the meal. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEditSuccess = () => {
    setIsEditDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['/api/users/1/meals'] });
    queryClient.invalidateQueries({ queryKey: ['/api/users/1/daily-stats'] });
    
    toast({
      title: "Meal updated",
      description: "The meal has been successfully updated.",
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-['Inter',sans-serif] text-lg font-semibold">Today's Meals</h3>
        <span className="text-primary text-sm cursor-pointer" onClick={onAddMeal}>Add Meal</span>
      </div>
      
      {meals.map((meal) => (
        <div key={meal.id} className="bg-[#F5F5F5] rounded-lg p-3 mb-3 last:mb-0">
          <div className="flex justify-between mb-2">
            <h4 className="font-medium">{meal.name}</h4>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{meal.time} · {meal.calories} cal</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreVerticalIcon className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => {
                      setSelectedMeal(meal);
                      setIsEditDialogOpen(true);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="text-red-500"
                    onClick={() => {
                      setSelectedMeal(meal);
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {meal.foods.map((food, index) => (
              <div key={index} className="relative group">
                <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full cursor-pointer hover:bg-gray-300 transition-colors">
                  {food.name}
                </span>
                <div className="absolute hidden group-hover:flex bg-white shadow-md rounded-md p-1 -top-8 right-0 z-10">
                  <button 
                    className="text-blue-600 hover:text-blue-800 px-2"
                    onClick={() => {
                      setSelectedMeal(meal);
                      setIsEditDialogOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <div className="w-px bg-gray-300"></div>
                  <button 
                    className="text-red-600 hover:text-red-800 px-2"
                    onClick={() => {
                      setSelectedMeal(meal);
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          {meal.protein && meal.carbs && meal.fat && (
            <div className="flex mt-2 gap-2 text-xs">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">P: {meal.protein}g</span>
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full">C: {meal.carbs}g</span>
              <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full">F: {meal.fat}g</span>
            </div>
          )}
        </div>
      ))}
      
      {meals.length === 0 && (
        <div className="bg-[#F5F5F5] rounded-lg p-4 text-center">
          <p className="text-gray-500">No meals recorded today</p>
          <button 
            className="mt-2 bg-primary text-white text-sm px-4 py-2 rounded-lg"
            onClick={onAddMeal}
          >
            Add Your First Meal
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Meal</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this meal? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Meal Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Meal</DialogTitle>
            <DialogDescription>
              Make changes to the meal information.
            </DialogDescription>
          </DialogHeader>
          {selectedMeal && (
            <AddFoodForm 
              onSuccess={handleEditSuccess} 
              defaultMealName={selectedMeal.name}
              editMode={true}
              mealId={selectedMeal.id}
              initialValues={{
                calories: selectedMeal.calories,
                protein: selectedMeal.protein || 0,
                carbs: selectedMeal.carbs || 0,
                fat: selectedMeal.fat || 0,
                foodName: selectedMeal.foods[0]?.name || '',
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TodayMeals;

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EditNutritionGoalsProps {
  currentGoals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  onSave: (newGoals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => void;
}

const EditNutritionGoals: React.FC<EditNutritionGoalsProps> = ({ currentGoals, onSave }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [goals, setGoals] = useState({ ...currentGoals });
  const [macroDistribution, setMacroDistribution] = useState({
    protein: Math.round((currentGoals.protein * 4 / currentGoals.calories) * 100),
    carbs: Math.round((currentGoals.carbs * 4 / currentGoals.calories) * 100),
    fat: Math.round((currentGoals.fat * 9 / currentGoals.calories) * 100),
  });
  
  // Reset goals when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setGoals({ ...currentGoals });
      setMacroDistribution({
        protein: Math.round((currentGoals.protein * 4 / currentGoals.calories) * 100),
        carbs: Math.round((currentGoals.carbs * 4 / currentGoals.calories) * 100),
        fat: Math.round((currentGoals.fat * 9 / currentGoals.calories) * 100),
      });
    }
    setOpen(isOpen);
  };
  
  // Handle calorie target change
  const handleCalorieChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCalories = parseInt(e.target.value) || 0;
    
    // Update goals based on the new calorie value while maintaining macro percentages
    const newGoals = {
      calories: newCalories,
      protein: Math.round((macroDistribution.protein / 100) * newCalories / 4),
      carbs: Math.round((macroDistribution.carbs / 100) * newCalories / 4),
      fat: Math.round((macroDistribution.fat / 100) * newCalories / 9),
    };
    
    setGoals(newGoals);
  };
  
  // Handle individual macro changes
  const handleMacroChange = (macro: 'protein' | 'carbs' | 'fat', value: number) => {
    const newGoals = { ...goals };
    
    // Set the new value for the specific macro
    newGoals[macro] = value;
    
    // Recalculate the percentages
    const newMacroDistribution = {
      protein: Math.round((newGoals.protein * 4 / newGoals.calories) * 100),
      carbs: Math.round((newGoals.carbs * 4 / newGoals.calories) * 100),
      fat: Math.round((newGoals.fat * 9 / newGoals.calories) * 100),
    };
    
    setMacroDistribution(newMacroDistribution);
    setGoals(newGoals);
  };
  
  // Handle percentage distribution change
  const handleDistributionChange = (macro: 'protein' | 'carbs' | 'fat', percentage: number) => {
    const newDistribution = { ...macroDistribution, [macro]: percentage };
    
    // Ensure the percentages don't exceed 100%
    const total = newDistribution.protein + newDistribution.carbs + newDistribution.fat;
    if (total > 100) {
      // Adjust other macros proportionally
      const otherMacros = ['protein', 'carbs', 'fat'].filter(m => m !== macro) as Array<'protein' | 'carbs' | 'fat'>;
      const excess = total - 100;
      const currentOtherTotal = otherMacros.reduce((sum, m) => sum + newDistribution[m], 0);
      
      otherMacros.forEach(m => {
        const proportion = newDistribution[m] / currentOtherTotal;
        newDistribution[m] = Math.max(0, Math.round(newDistribution[m] - (excess * proportion)));
      });
    }
    
    setMacroDistribution(newDistribution);
    
    // Update gram values based on percentages
    const newGoals = {
      calories: goals.calories,
      protein: Math.round((newDistribution.protein / 100) * goals.calories / 4),
      carbs: Math.round((newDistribution.carbs / 100) * goals.calories / 4),
      fat: Math.round((newDistribution.fat / 100) * goals.calories / 9),
    };
    
    setGoals(newGoals);
  };
  
  // Handle save
  const handleSave = () => {
    onSave(goals);
    setOpen(false);
    
    toast({
      title: "Nutrition Goals Updated",
      description: "Your macro goals have been successfully updated.",
    });
  };
  
  // Calculate totals
  const totalPercentage = macroDistribution.protein + macroDistribution.carbs + macroDistribution.fat;
  const caloriesFromMacros = 
    (goals.protein * 4) + 
    (goals.carbs * 4) + 
    (goals.fat * 9);
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          <span>Edit Goals</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nutrition Goal Settings</DialogTitle>
          <DialogDescription>
            Adjust your daily calorie target and macronutrient distribution.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Calorie Target */}
          <div className="grid gap-2">
            <Label htmlFor="calories">Daily Calorie Target</Label>
            <Input
              id="calories"
              type="number"
              value={goals.calories}
              onChange={handleCalorieChange}
              min={1200}
              max={7000}
              className="w-full"
            />
          </div>
          
          {/* Macro Distribution */}
          <div className="pt-4">
            <h4 className="text-sm font-medium mb-4">Macronutrient Distribution</h4>
            
            {/* Protein */}
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <Label htmlFor="protein-percent">Protein ({macroDistribution.protein}%)</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="protein-grams"
                    type="number"
                    value={goals.protein}
                    onChange={(e) => handleMacroChange('protein', parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-16 h-7 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">g</span>
                </div>
              </div>
              <Slider
                defaultValue={[macroDistribution.protein]}
                value={[macroDistribution.protein]}
                onValueChange={(values) => handleDistributionChange('protein', values[0])}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
            
            {/* Carbs */}
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <Label htmlFor="carbs-percent">Carbs ({macroDistribution.carbs}%)</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="carbs-grams"
                    type="number"
                    value={goals.carbs}
                    onChange={(e) => handleMacroChange('carbs', parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-16 h-7 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">g</span>
                </div>
              </div>
              <Slider
                defaultValue={[macroDistribution.carbs]}
                value={[macroDistribution.carbs]}
                onValueChange={(values) => handleDistributionChange('carbs', values[0])}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
            
            {/* Fat */}
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <Label htmlFor="fat-percent">Fat ({macroDistribution.fat}%)</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="fat-grams"
                    type="number"
                    value={goals.fat}
                    onChange={(e) => handleMacroChange('fat', parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-16 h-7 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">g</span>
                </div>
              </div>
              <Slider
                defaultValue={[macroDistribution.fat]}
                value={[macroDistribution.fat]}
                onValueChange={(values) => handleDistributionChange('fat', values[0])}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
          </div>
          
          {/* Summary */}
          <div className="bg-muted p-3 rounded-md text-sm">
            <h4 className="font-medium mb-2">Summary</h4>
            <div className="flex justify-between text-xs">
              <span>Total: {totalPercentage}%</span>
              <span>Calories from macros: {caloriesFromMacros}</span>
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <div className="bg-blue-500/20 rounded px-2 py-1">P: {macroDistribution.protein}%</div>
              <div className="bg-green-500/20 rounded px-2 py-1">C: {macroDistribution.carbs}%</div>
              <div className="bg-yellow-500/20 rounded px-2 py-1">F: {macroDistribution.fat}%</div>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditNutritionGoals;
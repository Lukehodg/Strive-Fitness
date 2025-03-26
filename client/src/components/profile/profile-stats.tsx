import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ruler, Weight, ActivitySquare, Percent } from 'lucide-react';

interface ProfileStatsProps {
  height: number;
  weight: number;
  bmi: number;
  bodyFat: number;
}

const ProfileStats: React.FC<ProfileStatsProps> = ({ height, weight, bmi, bodyFat }) => {
  // Function to determine BMI category and color
  const getBmiCategory = (bmiValue: number) => {
    if (bmiValue < 18.5) return { category: "Underweight", color: "text-blue-500" };
    if (bmiValue < 25) return { category: "Normal", color: "text-green-500" };
    if (bmiValue < 30) return { category: "Overweight", color: "text-yellow-500" };
    return { category: "Obese", color: "text-red-500" };
  };

  const bmiStatus = getBmiCategory(bmi);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Your Body Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10">
            <div className="flex-shrink-0 h-10 w-10 rounded-md bg-primary/20 flex items-center justify-center text-primary">
              <Ruler className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Height</p>
              <p className="text-lg font-medium">{height} cm</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10">
            <div className="flex-shrink-0 h-10 w-10 rounded-md bg-primary/20 flex items-center justify-center text-primary">
              <Weight className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Weight</p>
              <p className="text-lg font-medium">{weight} kg</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10">
            <div className="flex-shrink-0 h-10 w-10 rounded-md bg-primary/20 flex items-center justify-center text-primary">
              <ActivitySquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">BMI</p>
              <div className="flex items-center">
                <p className="text-lg font-medium">{bmi.toFixed(1)}</p>
                <span className={`ml-2 text-xs ${bmiStatus.color}`}>{bmiStatus.category}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10">
            <div className="flex-shrink-0 h-10 w-10 rounded-md bg-primary/20 flex items-center justify-center text-primary">
              <Percent className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Body Fat</p>
              <p className="text-lg font-medium">{bodyFat}%</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProfileStats;

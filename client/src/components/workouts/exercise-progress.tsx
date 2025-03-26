import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { format, subMonths } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { apiRequest } from '@/lib/queryClient';

interface Exercise {
  id: number;
  name: string;
  category: string;
  muscleGroup: string;
  description?: string;
}

interface PersonalBest {
  weight: number;
  label: string;
}

interface DataPoint {
  date: string;
  weight: number;
}

interface ExerciseProgressProps {
  open: boolean;
  onClose: () => void;
  selectedExerciseId?: number;
}

const ExerciseProgress: React.FC<ExerciseProgressProps> = ({ 
  open, 
  onClose,
  selectedExerciseId 
}) => {
  const [_, setLocation] = useLocation();
  const [timeRange, setTimeRange] = useState<string>('month');
  const [activeRange, setActiveRange] = useState<string>('month');
  const [chartData, setChartData] = useState<DataPoint[]>([]);

  // Fetch exercise data
  const { data: exercise } = useQuery<Exercise>({
    queryKey: [`/api/exercises/${selectedExerciseId}`],
    enabled: !!selectedExerciseId && open,
    staleTime: 60000, // 1 minute
  });
  
  // Fetch exercise sets
  const { data: exerciseSets } = useQuery({
    queryKey: [`/api/exercises/${selectedExerciseId}/sets`],
    enabled: !!selectedExerciseId && open,
    staleTime: 60000, // 1 minute
  });

  // Prepare personal best data
  const preparePersonalBests = (setsData: unknown): PersonalBest[] => {
    // Cast to any[] to handle the TypeScript error
    const sets = setsData as any[] | undefined;
    
    if (!sets || !Array.isArray(sets) || sets.length === 0) {
      return [
        { weight: 0, label: '1RM' },
        { weight: 0, label: '5RM' },
        { weight: 0, label: '10RM' }
      ];
    }
    
    // Calculate 1RM, 5RM, 10RM based on sets
    // This is a simple approximation (weight of highest weight set for each rep range)
    const oneRM = sets
      .filter(set => set.reps === 1)
      .sort((a, b) => b.weight - a.weight)[0]?.weight || 0;
      
    const fiveRM = sets
      .filter(set => set.reps >= 3 && set.reps <= 6)
      .sort((a, b) => b.weight - a.weight)[0]?.weight || 0;
      
    const tenRM = sets
      .filter(set => set.reps >= 8 && set.reps <= 12)
      .sort((a, b) => b.weight - a.weight)[0]?.weight || 0;
    
    return [
      { weight: oneRM, label: '1RM' },
      { weight: fiveRM, label: '5RM' },
      { weight: tenRM, label: '10RM' }
    ];
  };

  const handleRangeClick = (range: string) => {
    setActiveRange(range);
    setTimeRange(range);
  };

  const handleViewFullExercise = () => {
    if (selectedExerciseId) {
      setLocation(`/exercise/${selectedExerciseId}`);
    }
  };

  // Generate chart data based on time range and exercise sets
  useEffect(() => {
    // Cast exerciseSets to any[] to avoid TypeScript error
    const sets = exerciseSets as any[] | undefined;
    
    if (!sets || !Array.isArray(sets) || sets.length === 0) {
      setChartData([]);
      return;
    }
    
    const today = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case 'month':
        startDate = subMonths(today, 1);
        break;
      case '3months':
        startDate = subMonths(today, 3);
        break;
      case '6months':
        startDate = subMonths(today, 6);
        break;
      case 'year':
        startDate = subMonths(today, 12);
        break;
      default:
        startDate = subMonths(today, 1);
    }
    
    // Group sets by date and find max weight for each date
    const dateMap = new Map<string, number>();
    
    sets.forEach(set => {
      const setDate = new Date(set.timestamp);
      if (setDate >= startDate) {
        const dateKey = format(setDate, 'MM/dd');
        const currentMax = dateMap.get(dateKey) || 0;
        if (set.weight > currentMax) {
          dateMap.set(dateKey, set.weight);
        }
      }
    });
    
    // Convert map to array of data points
    const progressData: DataPoint[] = Array.from(dateMap).map(([date, weight]) => ({
      date,
      weight
    }));
    
    // Sort by date
    progressData.sort((a, b) => {
      const [aMonth, aDay] = a.date.split('/').map(Number);
      const [bMonth, bDay] = b.date.split('/').map(Number);
      return aMonth !== bMonth ? aMonth - bMonth : aDay - bDay;
    });
    
    setChartData(progressData);
  }, [exerciseSets, timeRange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative bg-gray-900 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5">
          <button 
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
            onClick={onClose}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          {exercise ? (
            <>
              <h2 className="text-xl font-bold text-white mb-1">{exercise.name}</h2>
              <div className="flex mb-4">
                <span className="text-sm bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
                  {exercise.muscleGroup}
                </span>
              </div>
              
              <div className="bg-gray-800 rounded-lg p-4 mb-4">
                <h3 className="text-gray-400 text-sm mb-2">Personal Best</h3>
                <div className="flex justify-between">
                  {preparePersonalBests(exerciseSets).map((pb, index) => (
                    <div key={index} className="text-center">
                      <span className="text-xl font-bold text-white block">{pb.weight}kg</span>
                      <span className="text-xs text-gray-400">{pb.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <h3 className="text-lg font-semibold text-white mb-2">Progress Chart</h3>
              {chartData.length > 0 ? (
                <div className="bg-gray-800 rounded-lg p-3 h-48 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#444" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#ccc' }} />
                      <YAxis unit="kg" tick={{ fontSize: 10, fill: '#ccc' }} width={30} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#333', borderColor: '#555' }}
                        labelStyle={{ color: '#eee' }}
                        itemStyle={{ color: '#eee' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="weight" 
                        stroke="#3F51B5" 
                        strokeWidth={2}
                        dot={{ stroke: '#3F51B5', strokeWidth: 2, r: 4 }}
                        activeDot={{ stroke: '#3F51B5', strokeWidth: 2, r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="bg-gray-800 rounded-lg p-4 h-48 mb-4 flex items-center justify-center">
                  <span className="text-gray-400">No progress data available</span>
                </div>
              )}
              
              <div className="flex justify-between mb-5 bg-gray-800 rounded-lg p-2">
                <button 
                  className={`text-xs font-medium px-2 py-1 rounded ${activeRange === 'month' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
                  onClick={() => handleRangeClick('month')}
                >
                  Month
                </button>
                <button 
                  className={`text-xs font-medium px-2 py-1 rounded ${activeRange === '3months' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
                  onClick={() => handleRangeClick('3months')}
                >
                  3 Months
                </button>
                <button 
                  className={`text-xs font-medium px-2 py-1 rounded ${activeRange === '6months' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
                  onClick={() => handleRangeClick('6months')}
                >
                  6 Months
                </button>
                <button 
                  className={`text-xs font-medium px-2 py-1 rounded ${activeRange === 'year' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
                  onClick={() => handleRangeClick('year')}
                >
                  Year
                </button>
              </div>
              
              <div className="flex space-x-3">
                <button 
                  className="flex-1 bg-primary/90 hover:bg-primary text-white py-3 rounded-lg font-medium transition-colors"
                  onClick={handleViewFullExercise}
                >
                  View Full Details
                </button>
                <button 
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-lg font-medium transition-colors"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-center items-center h-64">
              <div className="text-gray-400">Loading exercise data...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExerciseProgress;
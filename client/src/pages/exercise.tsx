import type { Exercise as ExerciseRecord, WorkoutSet } from "@shared/schema";
import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths, subDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";

import ExerciseDetail from "@/components/exercise/exercise-detail";
import ProgressChart from "@/components/exercise/progress-chart";

interface ExerciseProps {
  exerciseId: number;
}

const Exercise: React.FC<ExerciseProps> = ({ exerciseId }) => {
  const { toast } = useToast();
  const [chartData, setChartData] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState<string>("month");

  // Fetch exercise data
  const { data: exercise } = useQuery<ExerciseRecord>({
    queryKey: [`/api/exercises/${exerciseId}`],
    staleTime: 60000, // 1 minute
  });

  // Fetch exercise sets
  const { data: exerciseSets, refetch: refetchSets } = useQuery<WorkoutSet[]>({
    queryKey: [`/api/exercises/${exerciseId}/sets`],
    staleTime: 60000, // 1 minute
  });

  // Sets belong to an active workout, rather than a global exercise history.
  const handleAddSet = () => {
    toast({
      title: "Start a workout first",
      description:
        "Open Train and start a workout to record sets in your session.",
    });
  };
  // Prepare personal best data
  const preparePersonalBests = (sets: any[] | undefined) => {
    if (!sets || sets.length === 0) {
      return [
        { weight: 0, label: "1RM" },
        { weight: 0, label: "5RM" },
        { weight: 0, label: "10RM" },
      ];
    }

    // Calculate 1RM, 5RM, 10RM based on sets
    // This is a simple approximation (weight of highest weight set for each rep range)
    const oneRM =
      sets
        .filter((set) => set.reps === 1)
        .sort((a, b) => b.weight - a.weight)[0]?.weight || 0;

    const fiveRM =
      sets
        .filter((set) => set.reps >= 3 && set.reps <= 6)
        .sort((a, b) => b.weight - a.weight)[0]?.weight || 0;

    const tenRM =
      sets
        .filter((set) => set.reps >= 8 && set.reps <= 12)
        .sort((a, b) => b.weight - a.weight)[0]?.weight || 0;

    return [
      { weight: oneRM, label: "1RM" },
      { weight: fiveRM, label: "5RM" },
      { weight: tenRM, label: "10RM" },
    ];
  };

  // Prepare recent sets data
  const prepareRecentSets = (sets: any[] | undefined) => {
    if (!sets || sets.length === 0) return [];

    return sets.slice(0, 3).map((set, index) => ({
      id: set.id,
      setNumber: index + 1,
      reps: set.reps,
      weight: set.weight,
      date: format(new Date(set.timestamp), "d MMM yyyy"),
    }));
  };

  // Generate chart data based on time range
  useEffect(() => {
    if (!exerciseSets) return;

    const today = new Date();
    let startDate: Date;

    switch (timeRange) {
      case "month":
        startDate = subMonths(today, 1);
        break;
      case "3months":
        startDate = subMonths(today, 3);
        break;
      case "6months":
        startDate = subMonths(today, 6);
        break;
      case "year":
        startDate = subMonths(today, 12);
        break;
      default:
        startDate = subMonths(today, 1);
    }

    const data = exerciseSets
      .filter(
        (set) =>
          set.isCompleted &&
          new Date(set.timestamp) >= startDate &&
          new Date(set.timestamp) <= today,
      )
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      )
      .map((set) => ({
        date: format(new Date(set.timestamp), "MM/dd"),
        weight: set.weight,
      }));
    setChartData(data);
  }, [exerciseSets, timeRange]);
  if (!exercise || !exerciseSets) {
    return (
      <div className="p-4 flex items-center justify-center h-[90vh]">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <ExerciseDetail
        name={exercise.name}
        category={exercise.muscleGroup}
        personalBests={preparePersonalBests(exerciseSets)}
        recentSets={prepareRecentSets(exerciseSets)}
        onAddSet={handleAddSet}
      />

      <ProgressChart data={chartData} onTimeRangeChange={setTimeRange} />
    </div>
  );
};

export default Exercise;

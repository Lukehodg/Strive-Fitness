import React, { useState } from 'react';
import { ChevronRightIcon } from '@/lib/icons';
import { useQuery } from '@tanstack/react-query';
import ExerciseProgress from './exercise-progress';

interface Exercise {
  id: number;
  name: string;
  category: string;
  muscleGroup: string;
}

interface ExerciseProgressListProps {
  onClose: () => void;
}

const ExerciseProgressList: React.FC<ExerciseProgressListProps> = ({ onClose }) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | undefined>(undefined);
  const [showProgressModal, setShowProgressModal] = useState<boolean>(false);

  // Fetch all exercises
  const { data: exercises, isLoading } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
    staleTime: 60000, // 1 minute
  });

  const muscleGroups = [
    { id: 'all', name: 'All' },
    { id: 'chest', name: 'Chest' },
    { id: 'back', name: 'Back' },
    { id: 'shoulders', name: 'Shoulders' },
    { id: 'arms', name: 'Arms' },
    { id: 'legs', name: 'Legs' },
    { id: 'core', name: 'Core' }
  ];

  // Filter exercises based on search query and selected filter
  const filteredExercises = exercises?.filter(exercise => {
    const matchesSearch = exercise.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = selectedFilter === 'all' || 
      exercise.muscleGroup.toLowerCase() === selectedFilter.toLowerCase();
    
    return matchesSearch && matchesFilter;
  });

  const handleExerciseClick = (exerciseId: number) => {
    setSelectedExerciseId(exerciseId);
    setShowProgressModal(true);
  };

  const handleCloseProgressModal = () => {
    setShowProgressModal(false);
  };

  return (
    <div className="bg-gray-900 text-white">
      <div className="p-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Exercise Progress</h2>
        <button 
          className="text-gray-400 hover:text-white"
          onClick={onClose}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-4 mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800 rounded-lg px-4 py-2 pl-9 text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="absolute left-3 top-2.5 text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="px-4 overflow-x-auto">
        <div className="flex space-x-2 pb-2">
          {muscleGroups.map(group => (
            <button
              key={group.id}
              onClick={() => setSelectedFilter(group.id)}
              className={`px-3 py-1 text-sm rounded-full whitespace-nowrap transition-colors ${
                selectedFilter === group.id
                  ? 'bg-primary text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 mt-4">
        {isLoading ? (
          <div className="py-4 text-center text-gray-500">
            Loading exercises...
          </div>
        ) : filteredExercises && filteredExercises.length > 0 ? (
          <div className="space-y-3 pb-4">
            {filteredExercises.map(exercise => (
              <div
                key={exercise.id}
                onClick={() => handleExerciseClick(exercise.id)}
                className="flex items-center justify-between bg-gray-800 p-3 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors"
              >
                <div>
                  <h3 className="font-medium">{exercise.name}</h3>
                  <span className="text-sm text-gray-400">{exercise.muscleGroup}</span>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-500" />
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">
            {searchQuery ? 'No exercises match your search' : 'No exercises found'}
          </div>
        )}
      </div>

      {/* Exercise Progress Modal */}
      <ExerciseProgress
        open={showProgressModal}
        onClose={handleCloseProgressModal}
        selectedExerciseId={selectedExerciseId}
      />
    </div>
  );
};

export default ExerciseProgressList;
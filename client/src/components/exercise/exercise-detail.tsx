import React, { useState } from 'react';
import { MoreVerticalIcon } from '@/lib/icons';

interface ExerciseSet {
  id: number;
  setNumber: number;
  reps: number;
  weight: number;
  date: string;
}

interface PersonalBest {
  weight: number;
  label: string;
}

interface ExerciseDetailProps {
  name: string;
  category: string;
  personalBests: PersonalBest[];
  recentSets: ExerciseSet[];
  onAddSet: (weight: number, reps: number, rpe: number) => void;
}

const ExerciseDetail: React.FC<ExerciseDetailProps> = ({
  name,
  category,
  personalBests,
  recentSets,
  onAddSet
}) => {
  const [weight, setWeight] = useState('65');
  const [reps, setReps] = useState('10');
  const [rpe, setRpe] = useState('8');

  const handleAddSet = () => {
    onAddSet(parseFloat(weight), parseInt(reps, 10), parseInt(rpe, 10));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-['Inter',sans-serif] text-xl font-bold">{name}</h2>
        <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded">{category}</span>
      </div>
      
      <div className="bg-[#F5F5F5] rounded-lg p-3 mb-4">
        <h3 className="text-gray-500 text-sm mb-2">Personal Best</h3>
        <div className="flex justify-between">
          {personalBests.map((pb, index) => (
            <div key={index}>
              <span className="text-xl font-bold">{pb.weight}kg</span>
              <span className="text-sm text-gray-500 ml-1">{pb.label}</span>
            </div>
          ))}
        </div>
      </div>
      
      <h3 className="text-gray-700 font-medium mb-2">Recent Sets</h3>
      <div className="space-y-3 mb-4">
        {recentSets.map((set) => (
          <div key={set.id} className="flex justify-between items-center pb-2 border-b border-gray-200">
            <div>
              <div className="flex text-sm">
                <span className="font-medium mr-4">Set {set.setNumber}</span>
                <span className="mr-2">{set.reps} reps</span>
                <span>{set.weight}kg</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">{set.date}</div>
            </div>
            <div className="flex items-center">
              <MoreVerticalIcon className="text-gray-400 w-5 h-5" />
            </div>
          </div>
        ))}
      </div>
      
      <h3 className="text-gray-700 font-medium mb-2">Record New Set</h3>
      <div className="space-y-3 mb-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Weight (kg)</label>
            <input 
              type="number" 
              value={weight} 
              onChange={(e) => setWeight(e.target.value)}
              className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg p-2 w-full text-center" 
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Reps</label>
            <input 
              type="number" 
              value={reps} 
              onChange={(e) => setReps(e.target.value)}
              className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg p-2 w-full text-center" 
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">RPE (1-10)</label>
            <input 
              type="number" 
              value={rpe} 
              onChange={(e) => setRpe(e.target.value)}
              min="1"
              max="10"
              className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg p-2 w-full text-center" 
            />
          </div>
        </div>
      </div>
      
      <div className="flex space-x-3">
        <button 
          className="flex-1 bg-primary text-white py-3 rounded-lg font-medium"
          onClick={handleAddSet}
        >
          Add Set
        </button>
        <button className="flex-1 bg-[#F5F5F5] border border-[#E0E0E0] py-3 rounded-lg font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ExerciseDetail;

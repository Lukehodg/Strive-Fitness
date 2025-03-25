import React from 'react';

interface ProfileStatsProps {
  height: number;
  weight: number;
  bmi: number;
  bodyFat: number;
}

const ProfileStats: React.FC<ProfileStatsProps> = ({ height, weight, bmi, bodyFat }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <h3 className="font-['Inter',sans-serif] text-lg font-semibold mb-3">Your Stats</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <span className="text-gray-500 text-sm">Height</span>
          <span className="text-lg font-medium">{height} cm</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-sm">Weight</span>
          <span className="text-lg font-medium">{weight} kg</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-sm">BMI</span>
          <span className="text-lg font-medium">{bmi.toFixed(1)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 text-sm">Body Fat</span>
          <span className="text-lg font-medium">{bodyFat}%</span>
        </div>
      </div>
    </div>
  );
};

export default ProfileStats;

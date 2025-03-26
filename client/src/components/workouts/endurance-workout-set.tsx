import React, { useState } from 'react';
import { Timer as TimerIcon, Heart, Flame, TrendingUp, BarChart, Watch } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';

interface EnduranceWorkoutSetProps {
  set: any;
  exerciseId: number;
  setIndex: number;
  isCompleted: boolean;
  measurementType: string;
  exercise: any;
  onUpdateValue: (exerciseId: number, setIndex: number, field: string, value: number | string) => void;
  onSave: (exerciseId: number, setIndex: number) => void;
}

const EnduranceWorkoutSet: React.FC<EnduranceWorkoutSetProps> = ({
  set,
  exerciseId,
  setIndex,
  isCompleted,
  measurementType,
  exercise,
  onUpdateValue,
  onSave
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Format time value from seconds to mm:ss
  const formatTimeValue = (seconds: number | string | null): string => {
    if (seconds === null || seconds === '') return '';
    const totalSeconds = typeof seconds === 'string' ? parseInt(seconds, 10) : seconds;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Parse time input from mm:ss to seconds
  const parseTimeInput = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0], 10) || 0;
      const secs = parseInt(parts[1], 10) || 0;
      return mins * 60 + secs;
    }
    return parseInt(timeStr, 10) || 0;
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const value = e.target.value;
    // Store the duration in seconds
    const seconds = parseTimeInput(value);
    onUpdateValue(exerciseId, setIndex, field, seconds);
  };

  const renderInputFields = () => {
    switch (measurementType) {
      case 'distance_time':
        return (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Distance (m)</label>
              <input 
                type="number" 
                value={set.distance || ''} 
                onChange={(e) => onUpdateValue(exerciseId, setIndex, 'distance', e.target.value)}
                disabled={isCompleted}
                placeholder="0"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white" 
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Time (mm:ss)</label>
              <input 
                type="text" 
                value={formatTimeValue(set.duration)} 
                onChange={(e) => handleTimeChange(e, 'duration')}
                disabled={isCompleted}
                placeholder="00:00"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white"
              />
            </div>
          </div>
        );
      
      case 'time_only':
        return (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Duration (mm:ss)</label>
              <input 
                type="text" 
                value={formatTimeValue(set.duration)} 
                onChange={(e) => handleTimeChange(e, 'duration')}
                disabled={isCompleted}
                placeholder="00:00"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white" 
              />
            </div>
          </div>
        );
      
      case 'distance_only':
        return (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Distance (m)</label>
              <input 
                type="number" 
                value={set.distance || ''} 
                onChange={(e) => onUpdateValue(exerciseId, setIndex, 'distance', e.target.value)}
                disabled={isCompleted}
                placeholder="0"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white" 
              />
            </div>
          </div>
        );
      
      case 'calories':
        return (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Calories</label>
              <input 
                type="number" 
                value={set.calories || ''} 
                onChange={(e) => onUpdateValue(exerciseId, setIndex, 'calories', e.target.value)}
                disabled={isCompleted}
                placeholder="0"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white" 
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Time (mm:ss)</label>
              <input 
                type="text" 
                value={formatTimeValue(set.duration)} 
                onChange={(e) => handleTimeChange(e, 'duration')}
                disabled={isCompleted}
                placeholder="00:00"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white"
              />
            </div>
          </div>
        );
      
      case 'laps':
        return (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Laps</label>
              <input 
                type="number" 
                value={set.laps || ''} 
                onChange={(e) => onUpdateValue(exerciseId, setIndex, 'laps', e.target.value)}
                disabled={isCompleted}
                placeholder="0"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white" 
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Time (mm:ss)</label>
              <input 
                type="text" 
                value={formatTimeValue(set.duration)} 
                onChange={(e) => handleTimeChange(e, 'duration')}
                disabled={isCompleted}
                placeholder="00:00"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white"
              />
            </div>
          </div>
        );
      
      case 'height':
        return (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Height (cm)</label>
              <input 
                type="number" 
                value={set.height || ''} 
                onChange={(e) => onUpdateValue(exerciseId, setIndex, 'height', e.target.value)}
                disabled={isCompleted}
                placeholder="0"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white" 
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Reps</label>
              <input 
                type="number" 
                value={set.reps || ''} 
                onChange={(e) => onUpdateValue(exerciseId, setIndex, 'reps', e.target.value)}
                disabled={isCompleted}
                placeholder="0"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white"
              />
            </div>
          </div>
        );
      
      case 'reps_only':
        return (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Reps</label>
              <input 
                type="number" 
                value={set.reps || ''} 
                onChange={(e) => onUpdateValue(exerciseId, setIndex, 'reps', e.target.value)}
                disabled={isCompleted}
                placeholder="0"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white" 
              />
            </div>
          </div>
        );
      
      default:
        // Default to standard weight/reps inputs for backward compatibility
        return (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Weight (kg)</label>
              <input 
                type="number" 
                value={set.weight || ''} 
                onChange={(e) => onUpdateValue(exerciseId, setIndex, 'weight', e.target.value)}
                disabled={isCompleted}
                placeholder="0"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white" 
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Reps</label>
              <input 
                type="number" 
                value={set.reps || ''} 
                onChange={(e) => onUpdateValue(exerciseId, setIndex, 'reps', e.target.value)}
                disabled={isCompleted}
                placeholder="0"
                className="bg-gray-900 border border-gray-600 rounded-lg p-2 w-full text-center text-white" 
              />
            </div>
          </div>
        );
    }
  };

  const renderAdvancedMetrics = () => {
    if (!showAdvanced) return null;
    
    return (
      <div className="mt-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
        <h6 className="text-xs font-medium text-gray-400 mb-2">Advanced Metrics</h6>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="flex items-center mb-1">
              <Heart size={12} className="text-red-400 mr-1" />
              <label className="text-xs text-gray-400">Heart Rate</label>
            </div>
            <input 
              type="number" 
              value={set.heartRate || ''} 
              onChange={(e) => onUpdateValue(exerciseId, setIndex, 'heartRate', e.target.value)}
              disabled={isCompleted}
              placeholder="BPM"
              className="bg-gray-800 border border-gray-700 rounded p-1 w-full text-xs text-center text-white" 
            />
          </div>
          <div>
            <div className="flex items-center mb-1">
              <Flame size={12} className="text-orange-400 mr-1" />
              <label className="text-xs text-gray-400">Calories</label>
            </div>
            <input 
              type="number" 
              value={set.calories || ''} 
              onChange={(e) => onUpdateValue(exerciseId, setIndex, 'calories', e.target.value)}
              disabled={isCompleted}
              placeholder="kcal"
              className="bg-gray-800 border border-gray-700 rounded p-1 w-full text-xs text-center text-white" 
            />
          </div>
          <div>
            <div className="flex items-center mb-1">
              <BarChart size={12} className="text-blue-400 mr-1" />
              <label className="text-xs text-gray-400">Effort (1-10)</label>
            </div>
            <input 
              type="number" 
              min="1" 
              max="10" 
              value={set.perceivedEffort || ''} 
              onChange={(e) => onUpdateValue(exerciseId, setIndex, 'perceivedEffort', e.target.value)}
              disabled={isCompleted}
              placeholder="1-10"
              className="bg-gray-800 border border-gray-700 rounded p-1 w-full text-xs text-center text-white" 
            />
          </div>
        </div>
        
        {/* Conditionally show pace for distance exercises */}
        {(['distance_time', 'distance_only'].includes(measurementType)) && (
          <div className="mt-2">
            <div className="flex items-center mb-1">
              <Watch size={12} className="text-green-400 mr-1" />
              <label className="text-xs text-gray-400">Pace (min/km)</label>
            </div>
            <input 
              type="text" 
              value={set.pace || ''} 
              onChange={(e) => onUpdateValue(exerciseId, setIndex, 'pace', e.target.value)}
              disabled={isCompleted}
              placeholder="min/km"
              className="bg-gray-800 border border-gray-700 rounded p-1 w-full text-xs text-center text-white" 
            />
          </div>
        )}
        
        {/* Conditionally show elevation gain for running, cycling, etc. */}
        {(['distance_time', 'distance_only'].includes(measurementType) && 
          ['Running', 'Cycling', 'Hiking'].includes(exercise?.name || '')) && (
          <div className="mt-2">
            <div className="flex items-center mb-1">
              <TrendingUp size={12} className="text-purple-400 mr-1" />
              <label className="text-xs text-gray-400">Elevation Gain (m)</label>
            </div>
            <input 
              type="number" 
              value={set.elevationGain || ''} 
              onChange={(e) => onUpdateValue(exerciseId, setIndex, 'elevationGain', e.target.value)}
              disabled={isCompleted}
              placeholder="meters"
              className="bg-gray-800 border border-gray-700 rounded p-1 w-full text-xs text-center text-white" 
            />
          </div>
        )}
        
        <div className="mt-2">
          <div className="flex items-center mb-1">
            <div className="text-xs text-gray-400">Notes</div>
          </div>
          <textarea 
            value={set.notes || ''} 
            onChange={(e) => onUpdateValue(exerciseId, setIndex, 'notes', e.target.value)}
            disabled={isCompleted}
            placeholder="Add notes (technique, intensity, etc.)"
            className="bg-gray-800 border border-gray-700 rounded p-1 w-full text-xs text-white h-16 resize-none" 
          />
        </div>
      </div>
    );
  };

  return (
    <div 
      className={`border rounded-lg p-3 ${
        isCompleted 
          ? 'border-green-700 bg-green-900/30' 
          : 'border-gray-700 bg-gray-700'
      }`}
    >
      <div className="flex justify-between items-center mb-3">
        <h5 className="font-medium text-white">Set {setIndex + 1}</h5>
        <div className="flex items-center space-x-2">
          <button 
            className="text-xs px-2 py-1 rounded-full bg-blue-900/30 text-blue-400 border border-blue-800 hover:bg-blue-800/30 transition-colors"
            onClick={() => setShowAdvanced(!showAdvanced)}
            disabled={isCompleted}
          >
            {showAdvanced ? 'Hide Metrics' : 'More Metrics'}
          </button>
        </div>
      </div>
      
      {renderInputFields()}
      {renderAdvancedMetrics()}
      
      <div className="mt-3">
        {!isCompleted ? (
          <button 
            className="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white w-full py-2 rounded-lg text-sm transition-colors"
            onClick={() => onSave(exerciseId, setIndex)}
          >
            Save Set
          </button>
        ) : (
          <button 
            className="bg-gradient-to-r from-green-600 to-green-700 text-white w-full py-2 rounded-lg text-sm"
            disabled
          >
            Completed
          </button>
        )}
      </div>
    </div>
  );
};

export default EnduranceWorkoutSet;
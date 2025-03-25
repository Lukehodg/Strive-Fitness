import React from 'react';

interface ProgressCircleProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  label: string;
  value: string;
  total?: string;
}

const ProgressCircle: React.FC<ProgressCircleProps> = ({
  progress,
  size = 70,
  strokeWidth = 6,
  color,
  label,
  value,
  total
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ height: size, width: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            className="progress-ring-bg"
            stroke="#E0E0E0"
            strokeWidth={strokeWidth}
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          <circle
            className="progress-ring-circle"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className="text-xs font-semibold">{progress}%</span>
        </div>
      </div>
      <span className="text-sm mt-1">{label}</span>
      {total ? (
        <span className="text-xs text-gray-500">{value}/{total}</span>
      ) : (
        <span className="text-xs text-gray-500">{value}</span>
      )}
    </div>
  );
};

export default ProgressCircle;

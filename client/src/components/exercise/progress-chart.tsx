import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface DataPoint {
  date: string;
  weight: number;
}

interface ProgressChartProps {
  data: DataPoint[];
  onTimeRangeChange: (range: string) => void;
}

const ProgressChart: React.FC<ProgressChartProps> = ({ data, onTimeRangeChange }) => {
  const [activeRange, setActiveRange] = useState<string>('month');

  const handleRangeClick = (range: string) => {
    setActiveRange(range);
    onTimeRangeChange(range);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="font-['Inter',sans-serif] text-lg font-semibold mb-4">Progress Chart</h3>
      
      {data.length > 0 ? (
        <div className="h-48 rounded-lg">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis unit="kg" tick={{ fontSize: 10 }} width={30} />
              <Tooltip />
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
        <div className="h-48 bg-[#F5F5F5] rounded-lg flex items-center justify-center">
          <span className="text-gray-500">Weight progression chart will appear here</span>
        </div>
      )}
      
      <div className="flex justify-between mt-4">
        <button 
          className={`text-sm font-medium ${activeRange === 'month' ? 'text-primary' : 'text-gray-500'}`}
          onClick={() => handleRangeClick('month')}
        >
          Last Month
        </button>
        <button 
          className={`text-sm font-medium ${activeRange === '3months' ? 'text-primary' : 'text-gray-500'}`}
          onClick={() => handleRangeClick('3months')}
        >
          3 Months
        </button>
        <button 
          className={`text-sm font-medium ${activeRange === '6months' ? 'text-primary' : 'text-gray-500'}`}
          onClick={() => handleRangeClick('6months')}
        >
          6 Months
        </button>
        <button 
          className={`text-sm font-medium ${activeRange === 'year' ? 'text-primary' : 'text-gray-500'}`}
          onClick={() => handleRangeClick('year')}
        >
          1 Year
        </button>
      </div>
    </div>
  );
};

export default ProgressChart;

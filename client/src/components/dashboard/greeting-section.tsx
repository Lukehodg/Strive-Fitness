import React from 'react';
import { format } from 'date-fns';

interface GreetingSectionProps {
  username: string;
}

const GreetingSection: React.FC<GreetingSectionProps> = ({ username }) => {
  const today = new Date();
  const formattedDate = format(today, "EEEE, d MMMM");

  return (
    <div className="mb-6">
      <h2 className="font-['Inter',sans-serif] text-2xl font-bold text-white">Hey, {username}!</h2>
      <p className="text-gray-400">{formattedDate}</p>
    </div>
  );
};

export default GreetingSection;

import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  withText?: boolean;
  textClassName?: string;
}

export function Logo({ 
  size = 'md', 
  className = '', 
  withText = true,
  textClassName = ''
}: LogoProps) {
  // Size mappings
  const sizeMap = {
    sm: { logo: 32, text: 'text-xl' },
    md: { logo: 48, text: 'text-2xl' },
    lg: { logo: 64, text: 'text-4xl' },
  };
  
  const { logo: logoSize, text: textSize } = sizeMap[size];
  
  return (
    <div className={`flex items-center ${className}`}>
      {/* SVG Logo */}
      <svg 
        width={logoSize} 
        height={logoSize} 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="mr-2"
      >
        {/* Background Circle */}
        <circle cx="50" cy="50" r="48" fill="url(#gradientFill)" />
        
        {/* Letter "S" stylized */}
        <path 
          d="M35 65C35 65 45 75 65 65C85 55 65 40 65 40C65 40 55 30 35 40C15 50 35 65 35 65Z" 
          stroke="white" 
          strokeWidth="6" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
        
        {/* Gradient Definition */}
        <defs>
          <linearGradient id="gradientFill" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3B82F6" /> {/* blue-500 */}
            <stop offset="100%" stopColor="#8B5CF6" /> {/* purple-500 */}
          </linearGradient>
        </defs>
      </svg>
      
      {/* Text "Strive" */}
      {withText && (
        <span className={`font-bold ${textSize} ${textClassName || 'bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent'}`}>
          Strive
        </span>
      )}
    </div>
  );
}

export default Logo;
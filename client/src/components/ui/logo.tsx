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
      {/* Image Logo */}
      <img 
        src="/assets/logo.jpeg" 
        alt="Strive Logo" 
        width={logoSize} 
        height={logoSize} 
        className="mr-2 rounded-full object-cover"
      />
      
      {/* Text "Strive" */}
      {withText && (
        <span className={`font-bold ${textSize} ${textClassName || 'bg-gradient-to-r from-emerald-500 to-blue-600 bg-clip-text text-transparent'}`}>
          Strive
        </span>
      )}
    </div>
  );
}

export default Logo;
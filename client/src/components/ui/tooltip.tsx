import React, { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  position = 'top',
  delay = 400
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const childRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimeout = useRef<NodeJS.Timeout | null>(null);
  
  const showTooltip = () => {
    showTimeout.current = setTimeout(() => {
      setIsVisible(true);
      calculatePosition();
    }, delay);
  };
  
  const hideTooltip = () => {
    if (showTimeout.current) {
      clearTimeout(showTimeout.current);
      showTimeout.current = null;
    }
    setIsVisible(false);
  };
  
  const calculatePosition = () => {
    if (!childRef.current || !tooltipRef.current) return;
    
    const childRect = childRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    
    let top = 0;
    let left = 0;
    
    switch (position) {
      case 'top':
        top = childRect.top - tooltipRect.height - 8;
        left = childRect.left + (childRect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'bottom':
        top = childRect.bottom + 8;
        left = childRect.left + (childRect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'left':
        top = childRect.top + (childRect.height / 2) - (tooltipRect.height / 2);
        left = childRect.left - tooltipRect.width - 8;
        break;
      case 'right':
        top = childRect.top + (childRect.height / 2) - (tooltipRect.height / 2);
        left = childRect.right + 8;
        break;
    }
    
    // Adjust for screen boundaries
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (left < 8) left = 8;
    if (left + tooltipRect.width > viewportWidth - 8) {
      left = viewportWidth - tooltipRect.width - 8;
    }
    
    if (top < 8) top = 8;
    if (top + tooltipRect.height > viewportHeight - 8) {
      top = viewportHeight - tooltipRect.height - 8;
    }
    
    setTooltipPosition({ top, left });
  };
  
  // Recalculate position on scroll or resize
  useEffect(() => {
    if (isVisible) {
      const handleScroll = () => calculatePosition();
      const handleResize = () => calculatePosition();
      
      window.addEventListener('scroll', handleScroll);
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isVisible]);
  
  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (showTimeout.current) {
        clearTimeout(showTimeout.current);
      }
    };
  }, []);
  
  return (
    <div className="inline-block relative" onMouseEnter={showTooltip} onMouseLeave={hideTooltip} ref={childRef}>
      {children}
      
      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-50 bg-gray-900 text-white text-xs rounded-md shadow-lg px-2 py-1 max-w-xs pointer-events-none border border-gray-800"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          {content}
          <div 
            className={`absolute w-2 h-2 bg-gray-900 border-r border-b border-gray-800 transform rotate-45 ${
              position === 'top' ? 'bottom-[-5px] left-1/2 ml-[-4px]' :
              position === 'bottom' ? 'top-[-5px] left-1/2 ml-[-4px]' :
              position === 'left' ? 'right-[-5px] top-1/2 mt-[-4px]' :
              'left-[-5px] top-1/2 mt-[-4px]'
            }`}
          />
        </div>
      )}
    </div>
  );
};
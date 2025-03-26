import React from 'react';
import { Plus } from 'lucide-react';
import { useLocation } from 'wouter';
import ProgressCircle from '@/components/ui/progress-circle';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export interface Widget {
  id: string;
  type: 'progress' | 'nutrition' | 'workout' | 'activity';
  title: string;
  data: any;
  route?: string; // Optional route to navigate to when widget is clicked
}

interface WidgetSystemProps {
  widgets: Widget[];
  onRemoveWidget: (id: string) => void;
}

// Generic component to render different types of widgets
const WidgetRenderer: React.FC<{ 
  widget: Widget; 
  onRemove: (id: string) => void 
}> = ({ widget, onRemove }) => {
  const [_, setLocation] = useLocation();
  
  // Render different widget types
  const renderWidgetContent = () => {
    switch (widget.type) {
      case 'progress':
        return (
          <ProgressCircle
            progress={widget.data.percentage}
            color={widget.data.color}
            label={widget.data.label}
            value={widget.data.value}
            total={widget.data.total}
          />
        );
      case 'nutrition':
        return (
          <div className="flex flex-col">
            <span className="text-gray-400 text-sm">Calories Remaining</span>
            <div className="text-xl font-bold text-white">
              {widget.data.remaining}
            </div>
            <div className="flex items-baseline">
              <span className="text-sm text-white">{widget.data.consumed}</span>
              <span className="text-gray-400 text-xs ml-1">/ {widget.data.target}</span>
            </div>
          </div>
        );
      case 'workout':
        return (
          <div className="flex flex-col">
            <span className="text-gray-400 text-sm">Next Workout</span>
            <div className="text-white font-medium">{widget.data.name}</div>
            <div className="text-xs text-gray-400 mt-1">
              {widget.data.exerciseCount} exercises · {widget.data.duration} min
            </div>
          </div>
        );
      case 'activity':
        return (
          <div className="flex flex-col">
            <span className="text-gray-400 text-sm">Activity</span>
            <div className="text-white font-medium">{widget.data.title}</div>
            <div className="text-xs text-gray-400 mt-1">{widget.data.description}</div>
          </div>
        );
      default:
        return <div>Unknown widget type</div>;
    }
  };

  return (
    <div className="relative dark-card p-4">
      <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-gray-400 hover:text-white"
          onClick={() => onRemove(widget.id)}
        >
          <span className="sr-only">Remove</span>
          <span className="material-icons text-sm">close</span>
        </Button>
      </div>
      <h3 className="font-['Inter',sans-serif] text-sm font-medium mb-2 text-white">{widget.title}</h3>
      {renderWidgetContent()}
      {widget.route && (
        <div className="absolute bottom-2 right-2 text-xs text-blue-400">
          <span className="material-icons text-xs">arrow_forward</span>
        </div>
      )}
    </div>
  );
};

// Widget placeholder for adding new widgets
const AddWidgetPlaceholder: React.FC<{ 
  onAddWidget: () => void;
  availableWidgets: { type: string; title: string }[];
  onSelectWidgetType: (type: string) => void;
}> = ({ onAddWidget, availableWidgets, onSelectWidgetType }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="dark-card p-4 flex flex-col items-center justify-center h-full cursor-pointer border border-dashed border-gray-700 hover:border-gray-500 transition-colors">
          <Plus className="text-gray-400 mb-2" />
          <span className="text-sm text-gray-400">Add Widget</span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        {availableWidgets.map((widget) => (
          <DropdownMenuItem 
            key={widget.type}
            onClick={() => onSelectWidgetType(widget.type)}
          >
            {widget.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const WidgetSystem: React.FC<WidgetSystemProps> = ({ widgets, onRemoveWidget }) => {
  const [_, navigate] = useLocation();
  
  // Direct click handler at the parent level
  const handleWidgetClick = (route?: string) => {
    if (route) {
      console.log("Navigating to:", route);
      navigate(route);
    }
  };
  
  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {widgets.map((widget) => {
        // Add a wrapper div to handle click events more reliably
        const hasRoute = Boolean(widget.route);
        
        return (
          <div 
            key={widget.id}
            className={`${hasRoute ? 'cursor-pointer hover:opacity-90 transition-opacity relative overflow-hidden group' : ''}`}
            onClick={hasRoute ? () => handleWidgetClick(widget.route) : undefined}
          >
            {hasRoute && (
              <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center z-10">
                <div className="bg-blue-500/20 rounded-full p-1">
                  <span className="material-icons text-white text-lg">
                    arrow_forward
                  </span>
                </div>
              </div>
            )}
            <WidgetRenderer 
              widget={widget} 
              onRemove={onRemoveWidget} 
            />
          </div>
        );
      })}
      
      {/* Show empty state when no widgets */}
      {widgets.length === 0 && (
        <div className="col-span-3 dark-card p-6 flex flex-col items-center justify-center">
          <p className="text-gray-400 text-center">
            No widgets added yet. Click the "Add Widget" button to customize your dashboard.
          </p>
        </div>
      )}
    </div>
  );
};

export default WidgetSystem;
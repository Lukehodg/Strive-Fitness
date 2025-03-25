import React from 'react';
import { ChevronRightIcon } from '@/lib/icons';

interface SettingItem {
  icon: string;
  label: string;
  action: () => void;
}

interface SettingsProps {
  settings: SettingItem[];
}

const Settings: React.FC<SettingsProps> = ({ settings }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="font-['Inter',sans-serif] text-lg font-semibold mb-3">Settings</h3>
      <div className="space-y-4">
        {settings.map((setting, index) => (
          <div 
            key={index}
            className={`flex items-center justify-between py-2 ${
              index < settings.length - 1 ? 'border-b border-gray-200' : ''
            } cursor-pointer`}
            onClick={setting.action}
          >
            <div className="flex items-center">
              <span className="material-icons text-gray-500 mr-3">{setting.icon}</span>
              <span>{setting.label}</span>
            </div>
            <ChevronRightIcon className="text-gray-400 w-5 h-5" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default Settings;

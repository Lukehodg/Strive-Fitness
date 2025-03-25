import React from 'react';

interface ProfileHeaderProps {
  name: string;
  profileType: string;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({ name, profileType }) => {
  return (
    <div className="flex items-center mb-6">
      <div className="w-20 h-20 bg-gray-300 rounded-full mr-4 flex items-center justify-center text-gray-600">
        <span className="material-icons text-3xl">person</span>
      </div>
      <div>
        <h2 className="font-['Inter',sans-serif] text-2xl font-bold">{name}</h2>
        <p className="text-gray-600">{profileType} Member</p>
      </div>
    </div>
  );
};

export default ProfileHeader;

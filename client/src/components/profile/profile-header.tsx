import React from 'react';
import { UserCircle2 } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

interface ProfileHeaderProps {
  name: string;
  profileType: string;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({ name, profileType }) => {
  return (
    <div className="flex items-center space-x-4 mb-6">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/10 to-primary/30 shadow-sm flex items-center justify-center text-primary">
        <UserCircle2 className="h-12 w-12" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">{name}</h2>
        <div className="flex items-center mt-1">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
            {profileType} Member
          </Badge>
        </div>
      </div>
    </div>
  );
};

export default ProfileHeader;

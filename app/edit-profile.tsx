import { useRouter } from "expo-router";

import { Loading, Screen } from "@/components/ui";
import { ProfileForm } from "@/components/ProfileForm";
import { useMyProfile } from "@/hooks/useProfile";

export default function EditProfileScreen() {
  const router = useRouter();
  const { data: profile, isLoading } = useMyProfile();

  if (isLoading) return <Loading />;

  return (
    <Screen edges={["bottom"]}>
      <ProfileForm
        submitLabel="Save changes"
        initial={{
          display_name: profile?.display_name,
          area_label: profile?.area_label,
          bio: profile?.bio,
          avatar_url: profile?.avatar_url,
        }}
        onDone={() => router.back()}
      />
    </Screen>
  );
}

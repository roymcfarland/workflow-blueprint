import { BlueprintCard } from "@/components/blueprint/card";
import { PageTitle } from "@/components/blueprint/page-title";
import { ProfileForm } from "@/components/profile-form";
import { requireCurrentUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await requireCurrentUser();

  return (
    <div className="fade-up space-y-6">
      <PageTitle
        description="Update your identity, theme preference, and password from one place."
        eyebrow="Account"
        title="Profile"
      />

      <BlueprintCard className="p-5 lg:p-6">
        <ProfileForm user={user} />
      </BlueprintCard>
    </div>
  );
}

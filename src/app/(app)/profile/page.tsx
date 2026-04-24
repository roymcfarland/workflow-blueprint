import { BlueprintCard } from "@/components/blueprint/card";
import { PageTitle } from "@/components/blueprint/page-title";
import { ProfileForm } from "@/components/profile-form";
import { requireCurrentUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await requireCurrentUser();

  return (
    <div className="fade-up space-y-6">
      <PageTitle title="Profile" />

      <BlueprintCard className="p-6 lg:p-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="blueprint-title text-3xl text-ink">Account Details</p>
            <p className="text-lg text-ink-muted">
              Update your identity, theme preference, and password from one place.
            </p>
          </div>

          <ProfileForm user={user} />
        </div>
      </BlueprintCard>
    </div>
  );
}

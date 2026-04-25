import { InvitationsAdmin } from "@/components/admin/invitations-admin";
import { PageTitle } from "@/components/blueprint/page-title";
import { requireCurrentAdmin } from "@/lib/auth";
import { listInvitations } from "@/lib/data";

export default async function AdminInvitationsPage() {
  await requireCurrentAdmin();
  const invitations = await listInvitations();

  return (
    <div className="fade-up space-y-6">
      <PageTitle title="Invitations" />
      <InvitationsAdmin initialInvitations={invitations} />
    </div>
  );
}

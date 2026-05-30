import { ApiTokensAdmin } from "@/components/admin/api-tokens-admin";
import { PageTitle } from "@/components/blueprint/page-title";
import { requireCurrentAdmin } from "@/lib/auth";
import { listApiTokens } from "@/lib/data";

export default async function AdminApiTokensPage() {
  await requireCurrentAdmin();
  const apiTokens = await listApiTokens();

  return (
    <div className="fade-up space-y-6">
      <PageTitle
        description="Issue read-only API tokens for external consumers and revoke them anytime."
        eyebrow="Admin"
        title="API tokens"
      />
      <ApiTokensAdmin initialApiTokens={apiTokens} />
    </div>
  );
}

import { DashboardOverview } from "@/components/dashboard-overview";
import { requireCurrentUser } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/data";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const data = await getDashboardSnapshot(user.id);

  return <DashboardOverview data={data} />;
}

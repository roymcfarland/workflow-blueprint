import {
  FlaskConical,
  LayoutDashboard,
  Leaf,
  type LucideIcon,
  UserPlus,
  UserRound,
} from "lucide-react";

const iconByKey: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  invitations: UserPlus,
  labs: FlaskConical,
  organics: Leaf,
  personal: UserRound,
};

export function BoardIcon({
  className,
  iconKey,
}: {
  className?: string;
  iconKey: string;
}) {
  const Icon = iconByKey[iconKey] ?? LayoutDashboard;

  return <Icon className={className} strokeWidth={2.1} />;
}

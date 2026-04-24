import {
  FlaskConical,
  LayoutDashboard,
  Leaf,
  type LucideIcon,
  UserRound,
} from "lucide-react";

const iconByKey: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
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

import type { CSSProperties } from "react";
import {
  Book,
  Briefcase,
  Code,
  FlaskConical,
  Globe,
  Heart,
  LayoutDashboard,
  Leaf,
  Lightbulb,
  type LucideIcon,
  Rocket,
  Star,
  Target,
  UserPlus,
  UserRound,
} from "lucide-react";

const iconByKey: Record<string, LucideIcon> = {
  book: Book,
  briefcase: Briefcase,
  code: Code,
  dashboard: LayoutDashboard,
  globe: Globe,
  heart: Heart,
  invitations: UserPlus,
  labs: FlaskConical,
  lightbulb: Lightbulb,
  organics: Leaf,
  personal: UserRound,
  rocket: Rocket,
  star: Star,
  target: Target,
};

export function BoardIcon({
  className,
  iconKey,
  style,
}: {
  className?: string;
  iconKey: string;
  style?: CSSProperties;
}) {
  const Icon = iconByKey[iconKey] ?? LayoutDashboard;

  return <Icon className={className} strokeWidth={2.1} style={style} />;
}

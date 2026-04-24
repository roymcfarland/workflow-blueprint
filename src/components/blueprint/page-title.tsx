import { cn } from "@/lib/utils";

export function PageTitle({
  className,
  title,
}: {
  className?: string;
  title: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <h1 className="blueprint-title text-[clamp(2.7rem,4vw,4.5rem)] leading-none text-ink">
        {title}
      </h1>
      <div className="h-1.5 w-48 rounded-full bg-ink" />
    </div>
  );
}

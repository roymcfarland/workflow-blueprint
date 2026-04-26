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
      <h1 className="blueprint-title text-4xl leading-none text-text-primary sm:text-5xl lg:text-6xl">
        {title}
      </h1>
      <div className="h-1 w-36 rounded-full bg-brand sm:w-48" />
    </div>
  );
}

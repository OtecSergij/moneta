import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-[22px] leading-[normal] font-bold tracking-[-0.03em]",
        className,
      )}
    >
      moneta
    </span>
  );
}

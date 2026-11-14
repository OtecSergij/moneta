import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/kit/button";

const MENU_ROW = "flex w-full items-center px-4 text-left";

function MenuTile({
  Icon,
  loading = false,
  className,
}: {
  Icon: LucideIcon;
  loading?: boolean;
  className: string;
}) {
  return (
    <span
      className={cn(
        "flex size-9 flex-none items-center justify-center rounded-[10px]",
        className,
      )}
    >
      {loading ? (
        <Spinner className="size-[18px]" />
      ) : (
        <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
      )}
    </span>
  );
}

function MenuButton({
  onClick,
  loading,
  disabled,
  className,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        MENU_ROW,
        "cursor-pointer py-2.5 hover-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

const TONE = {
  plain: { row: "min-h-[60px] text-ink", tile: "bg-page text-ink" },
  primary: { row: "min-h-[60px] text-ink", tile: "bg-primary-soft text-primary-ink" },
  danger: { row: "min-h-14 text-danger-ink", tile: "bg-danger-soft" },
} as const;

export function MenuGroup({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-group bg-card [&>*+*]:border-t [&>*+*]:border-row-line">
      {children}
    </div>
  );
}

export function MenuItem({
  Icon,
  tone = "plain",
  tile = true,
  loading = false,
  disabled = false,
  onClick,
  children,
}: {
  Icon: LucideIcon;
  tone?: keyof typeof TONE;
  tile?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <MenuButton
      onClick={onClick}
      loading={loading}
      disabled={disabled}
      className={cn(TONE[tone].row, tile ? "gap-3.5" : "gap-2.5")}
    >
      {tile ? (
        <MenuTile Icon={Icon} loading={loading} className={TONE[tone].tile} />
      ) : loading ? (
        <Spinner />
      ) : (
        <Icon aria-hidden className="size-5" strokeWidth={1.75} />
      )}
      <span className="text-base font-medium">{children}</span>
    </MenuButton>
  );
}

export function MenuRow({
  Icon,
  labelId,
  variant = "menu",
  loading = false,
  disabled = false,
  trailing,
  children,
}: {
  Icon: LucideIcon;
  labelId: string;
  variant?: "menu" | "panel";
  loading?: boolean;
  disabled?: boolean;
  trailing: ReactNode;
  children: ReactNode;
}) {
  const panel = variant === "panel";
  return (
    <div
      className={cn(
        MENU_ROW,
        panel
          ? "gap-4 rounded-panel bg-page py-3.5"
          : "min-h-[60px] gap-3.5 py-2.5",
      )}
    >
      {panel ? null : (
        <MenuTile
          Icon={Icon}
          loading={loading}
          className={cn(TONE.plain.tile, disabled && "opacity-50")}
        />
      )}
      <span
        id={labelId}
        className={cn(
          "flex-1",
          panel
            ? "flex items-center gap-1.5 text-[15px] font-semibold"
            : "text-base font-medium",
          disabled && "opacity-50",
        )}
      >
        {panel ? (
          <Icon aria-hidden className="size-4" strokeWidth={1.75} />
        ) : null}
        {children}
      </span>
      {trailing}
    </div>
  );
}

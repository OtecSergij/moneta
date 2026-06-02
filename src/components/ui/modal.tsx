"use client";

import { type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared modal shell — Overlay + centered Content + optional header (Title +
// Close). Centralises the long Content className, z-index layering and the
// radix `aria-describedby` opt-out that the three dialogs (edit expense, the
// category form, the delete confirm) used to copy verbatim.
export function Modal({
  title,
  onClose,
  size = "md",
  children,
}: {
  title?: string;
  onClose: () => void;
  size?: "sm" | "md";
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-lg focus:outline-none",
            size === "sm" ? "max-w-sm" : "max-w-md",
          )}
        >
          {title ? (
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-text">
                {title}
              </Dialog.Title>
              <Dialog.Close
                aria-label="Закрыть"
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-border/60 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                <X className="size-5" />
              </Dialog.Close>
            </div>
          ) : null}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

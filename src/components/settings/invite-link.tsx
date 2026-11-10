"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Link as LinkIcon, RotateCcw } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import { createInviteAction } from "@/lib/actions/invites";
import { displayInviteUrl } from "@/lib/invites";
import { Button } from "@/components/kit/button";

const COPIED_MS = 2000;

export function InviteLink({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  function create() {
    startTransition(async () => {
      let res;
      try {
        res = await createInviteAction();
      } catch (error) {
        unstable_rethrow(error);
        toast.error("Не удалось создать ссылку");
        return;
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      setCopied(false);
      setUrl(res.data.url);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      toast.error("Не удалось скопировать ссылку");
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  if (!url) {
    return (
      <div className="border-t border-row-line p-4">
        <Button onClick={create} loading={pending} className="w-full">
          <LinkIcon className="size-[18px]" strokeWidth={1.75} aria-hidden />
          Создать ссылку-приглашение
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-row-line p-4">
      <span className="text-[13px] font-medium text-ink-2">
        Ссылка-приглашение
      </span>
      <div className="flex items-center gap-2 rounded-field bg-page py-1.5 pr-1.5 pl-3.5">
        <span className="min-w-0 flex-1 truncate text-sm text-ink">
          {displayInviteUrl(url)}
        </span>
        <Button
          variant="select"
          onClick={copy}
          style={copied ? { background: "var(--color-ok)" } : undefined}
        >
          {copied ? (
            <Check className="size-4" strokeWidth={1.75} aria-hidden />
          ) : (
            <Copy className="size-4" strokeWidth={1.75} aria-hidden />
          )}
          <span aria-live="polite">
            {copied ? "Скопировано" : "Копировать"}
          </span>
        </Button>
      </div>
      <button
        type="button"
        onClick={create}
        disabled={pending}
        className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-control bg-page text-[15px] font-medium text-ink transition-colors hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />
        Создать новую ссылку
      </button>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Link as LinkIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { createInviteAction } from "@/lib/actions/invites";
import { runAction } from "@/lib/hooks/use-action-runner";
import { displayInviteUrl } from "@/lib/invites";
import { Button } from "@/components/kit/button";
import { FIELD_LABEL_CLASS } from "@/components/kit/text-field";

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
      await runAction(() => createInviteAction(), "Не удалось создать ссылку", {
        onSuccess: (invite) => {
          if (copiedTimer.current) clearTimeout(copiedTimer.current);
          setCopied(false);
          setUrl(invite.url);
        },
      });
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
      <div className="p-4">
        <Button onClick={create} loading={pending} className="w-full">
          <LinkIcon className="size-[18px]" strokeWidth={1.75} aria-hidden />
          Создать ссылку-приглашение
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <span className={FIELD_LABEL_CLASS}>Ссылка-приглашение</span>
      <div className="flex items-center gap-2 rounded-field bg-page py-1.5 pr-1.5 pl-3.5">
        <span className="min-w-0 flex-1 truncate text-sm text-ink">
          {displayInviteUrl(url)}
        </span>
        <Button
          variant={copied ? "success" : "tint"}
          onClick={copy}
          disabled={pending}
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
      <Button variant="secondary" size="sm" loading={pending} onClick={create}>
        <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />
        Создать новую ссылку
      </Button>
    </div>
  );
}

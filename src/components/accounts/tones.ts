const TONE_CLASSES = ["bg-primary-ink", "bg-account-2", "bg-account-3"] as const;

export function accountToneClass(toneIndex: number): string {
  return TONE_CLASSES[Math.min(toneIndex, TONE_CLASSES.length - 1)];
}

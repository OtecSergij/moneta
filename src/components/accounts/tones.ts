const TONE_CLASSES = ["bg-primary-ink", "bg-[#60A5FA]", "bg-[#BFDBFE]"] as const;

export function accountToneClass(toneIndex: number): string {
  return TONE_CLASSES[Math.min(toneIndex, TONE_CLASSES.length - 1)];
}

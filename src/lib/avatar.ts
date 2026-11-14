type AvatarTone = { bg: string; fg: string };

const TONES: readonly AvatarTone[] = [
  { bg: "#E8EFFD", fg: "#1D4ED8" },
  { bg: "#FCE7F3", fg: "#9D174D" },
  { bg: "#DCFCE7", fg: "#166534" },
  { bg: "#FEF3C7", fg: "#92400E" },
];

export function avatarInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase("ru") : "?";
}

export function avatarTone(index: number): AvatarTone {
  const i = Math.trunc(index) % TONES.length;
  return TONES[i < 0 ? i + TONES.length : i];
}

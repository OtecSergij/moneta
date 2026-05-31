type ClassValue = string | number | false | null | undefined;

// Tiny classnames joiner — no clsx/tailwind-merge dependency needed for the
// simple conditional class composition our components do.
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}

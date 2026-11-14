import { formatDayTitle } from "@/lib/dates";

export function toDayGroups<B extends { day: string }>(
  buckets: B[],
  now: Date,
): (B & { heading: string })[] {
  return buckets.map((bucket) => ({
    ...bucket,
    heading: formatDayTitle(bucket.day, now),
  }));
}

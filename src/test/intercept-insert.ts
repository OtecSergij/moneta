import { vi } from "vitest";
import { db } from "@/db";

// Runs `beforeInsert` after the caller's own checks, right before its next insert.
export function interceptNextInsert(beforeInsert: () => Promise<unknown>) {
  const realInsert = db.insert.bind(db);
  vi.spyOn(db, "insert").mockImplementationOnce(((table: Parameters<typeof db.insert>[0]) => {
    const builder = realInsert(table);
    const realValues = builder.values.bind(builder);
    return Object.assign(builder, {
      values: (row: Parameters<typeof realValues>[0]) => {
        const query = realValues(row);
        const realReturning = query.returning.bind(query);
        return Object.assign(query, {
          returning: (fields: Parameters<typeof realReturning>[0]) =>
            beforeInsert().then(() => realReturning(fields)),
        });
      },
    });
  }) as unknown as typeof db.insert);
}

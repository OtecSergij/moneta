import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { compile } from "tailwindcss";

const GLOBALS = path.resolve(__dirname, "globals.css");
const TAILWIND = path.resolve("node_modules/tailwindcss/index.css");
const NAV_HOVERS = new Set(["hover-tab", "hover-side"]);

let source = "";
let build: (candidates: string[]) => string;

beforeAll(async () => {
  source = await readFile(GLOBALS, "utf8");
  const compiler = await compile(source, {
    base: path.dirname(GLOBALS),
    loadStylesheet: async (id, base) => {
      const file = id === "tailwindcss" ? TAILWIND : path.resolve(base, id);
      return {
        path: file,
        base: path.dirname(file),
        content: await readFile(file, "utf8"),
      };
    },
  });
  build = (candidates) => compiler.build(candidates);
});

describe("disabled controls", () => {
  it("dims every disabled control, busy or loading ones included", () => {
    const css = build(["disabled:opacity-50", "has-disabled:opacity-50"]);
    expect(css).toMatch(/&:disabled\s*\{\s*opacity: 50%;/);
    expect(css).toMatch(/&:has\(\*:disabled\)\s*\{\s*opacity: 50%;/);
    expect(source).not.toContain("@custom-variant disabled");
  });

  it("shows no hover on a disabled control", () => {
    const hovers = [...source.matchAll(/@utility (hover-[\w-]+)/g)]
      .map((m) => m[1])
      .filter((name) => !NAV_HOVERS.has(name));
    expect(hovers.length).toBeGreaterThan(0);
    for (const name of hovers) {
      const rules = build([name])
        .split("\n")
        .filter((line) => line.includes(":hover"));
      expect(rules.length, name).toBeGreaterThan(0);
      for (const rule of rules) expect(rule, name).toContain(":not(:disabled)");
    }
  });

  it("keeps the text colour of a disabled input on iOS Safari", () => {
    const css = build([]);
    expect(css).toMatch(
      /input:disabled,\s*input:disabled::placeholder\s*\{\s*-webkit-text-fill-color: currentcolor;/,
    );
  });
});

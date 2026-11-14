import { describe, expect, it } from "vitest";
import { redactEmails } from "@/lib/redact-emails";

describe("redactEmails", () => {
  it("masks addresses in strings and leaves other text alone", () => {
    expect(redactEmails("Sign-up attempt for existing email: Ghost.1+x@Moneta.test")).toBe(
      "Sign-up attempt for existing email: [email]",
    );
    expect(redactEmails("Rate limiting skipped")).toBe("Rate limiting skipped");
  });

  it("masks addresses inside objects and arrays", () => {
    expect(redactEmails({ email: "nobody-here@moneta.test", path: "/sign-in/email" })).toEqual({
      email: "[email]",
      path: "/sign-in/email",
    });
    expect(redactEmails(["a@b.co", 3, null])).toEqual(["[email]", 3, null]);
  });

  it("masks addresses in an error's message, stack, fields and cause", () => {
    const cause = new Error("duplicate key: (email)=(anna@moneta.test)");
    const error = Object.assign(new Error("Failed query, params: anna@moneta.test", { cause }), {
      params: ["anna@moneta.test", "Анна"],
    });

    const redacted = redactEmails(error);

    expect(redacted).toBeInstanceOf(Error);
    expect(redacted.message).toBe("Failed query, params: [email]");
    expect(redacted.stack).not.toContain("anna@moneta.test");
    expect(redacted.params).toEqual(["[email]", "Анна"]);
    expect((redacted.cause as Error).message).toBe("duplicate key: (email)=([email])");
    expect(error.message).toContain("anna@moneta.test");
  });

  it("masks the whole address when the local part has an apostrophe or a plus sign", () => {
    expect(redactEmails("User not found pat.o'neil@gmail.com")).toBe("User not found [email]");
    expect(redactEmails({ email: "john.smith'x@gmail.com" })).toEqual({ email: "[email]" });
    expect(redactEmails("anna+bills@moneta.test signed in")).toBe("[email] signed in");
    expect(redactEmails("a!#$%&*/=?^_`{|}~-b@x.io")).toBe("[email]");
  });

  it("masks every link of a cause chain, set as an option or as an own field", () => {
    const root = Object.assign(new Error("insert failed"), {
      detail: "Failing row contains (1, null, o'brien@moneta.test, t)",
    });
    const middle = new Error("pg: anna@moneta.test", { cause: root });
    const top = new Error("Failed query, params: anna@moneta.test");
    Object.assign(top, { cause: middle, params: ["anna@moneta.test"] });

    const redacted = redactEmails(top) as Error & { params: string[] };
    const redactedMiddle = redacted.cause as Error;
    const redactedRoot = redactedMiddle.cause as Error & { detail: string };

    expect(redacted.message).toBe("Failed query, params: [email]");
    expect(redacted.params).toEqual(["[email]"]);
    expect(redactedMiddle.message).toBe("pg: [email]");
    expect(redactedMiddle.stack).not.toContain("moneta.test");
    expect(redactedRoot.message).toBe("insert failed");
    expect(redactedRoot.detail).toBe("Failing row contains (1, null, [email], t)");
    expect((top.cause as Error).message).toBe("pg: anna@moneta.test");
  });

  it("masks an object that appears twice and survives a cycle", () => {
    const shared = { email: "anna@moneta.test" };
    const cause: Record<string, unknown> = { shared };
    const error = Object.assign(new Error("boom"), { params: shared, cause });
    cause.error = error;

    const redacted = redactEmails(error);
    const redactedCause = redacted.cause as Record<string, unknown>;

    expect(redacted.params).toEqual({ email: "[email]" });
    expect(redactedCause.shared).toBe(redacted.params);
    expect(redactedCause.error).toBe(redacted);
  });
});

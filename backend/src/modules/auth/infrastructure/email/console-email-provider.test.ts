import { describe, expect, it } from "vitest";
import { ConsoleEmailProvider } from "./console-email-provider.js";

describe("ConsoleEmailProvider", () => {
  it("writes the message to the injected writer and sends nothing else", async () => {
    const lines: string[] = [];
    const provider = new ConsoleEmailProvider((line) => lines.push(line));

    await provider.send({ to: "buyer@example.com", subject: "Your code", text: "Code 123456" });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("buyer@example.com");
    expect(lines[0]).toContain("Your code");
    expect(lines[0]).toContain("Code 123456");
  });
});

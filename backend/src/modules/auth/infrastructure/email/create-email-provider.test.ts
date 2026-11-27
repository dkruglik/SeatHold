import { describe, expect, it, vi } from "vitest";
import { ConsoleEmailProvider } from "./console-email-provider.js";
import { createEmailProvider, type EmailConfig } from "./create-email-provider.js";
import { SmtpEmailProvider } from "./smtp-email-provider.js";

const base: EmailConfig = {
  appEnv: "local",
  emailProvider: "smtp",
  emailFrom: "no-reply@seathold.local",
  smtpHost: "localhost",
  smtpPort: 1025,
};
const deps = { writeLine: vi.fn() };

describe("createEmailProvider", () => {
  it("picks the console provider for console", () => {
    expect(createEmailProvider({ ...base, emailProvider: "console" }, deps)).toBeInstanceOf(ConsoleEmailProvider);
  });

  it("picks the SMTP provider for smtp", () => {
    expect(createEmailProvider(base, deps)).toBeInstanceOf(SmtpEmailProvider);
  });

  it("uses the injected transporter for smtp", async () => {
    const sendMail = vi.fn().mockResolvedValue({});

    await createEmailProvider(base, { ...deps, transporter: { sendMail } }).send({ to: "a@example.com", subject: "s", text: "t" });

    expect(sendMail).toHaveBeenCalledOnce();
  });

  it("refuses console in production, naming the variable and no value", () => {
    expect(() => createEmailProvider({ ...base, appEnv: "production", emailProvider: "console" }, deps)).toThrow(/EMAIL_PROVIDER/);
  });

  it("accepts smtp in production", () => {
    expect(createEmailProvider({ ...base, appEnv: "production" }, deps)).toBeInstanceOf(SmtpEmailProvider);
  });
});

import { describe, expect, it, vi } from "vitest";
import { InfrastructureError } from "../../../../shared/errors/app-error.js";
import { SmtpEmailProvider } from "./smtp-email-provider.js";

const message = { to: "buyer@example.com", subject: "Your code", text: "Code body 123456" };

describe("SmtpEmailProvider", () => {
  it("sends from EMAIL_FROM to the recipient with the subject and text", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const provider = new SmtpEmailProvider({ sendMail }, "no-reply@seathold.local");

    await provider.send(message);

    expect(sendMail).toHaveBeenCalledExactlyOnceWith({
      from: "no-reply@seathold.local",
      to: "buyer@example.com",
      subject: "Your code",
      text: "Code body 123456",
    });
  });

  it("maps a transport failure to InfrastructureError without the password or the body", async () => {
    const failure = Object.assign(new Error("535 auth failed for mailer:hunter2-secret; body Code body 123456"), { code: "EAUTH" });
    const provider = new SmtpEmailProvider({ sendMail: vi.fn().mockRejectedValue(failure) }, "no-reply@seathold.local");

    const error = await provider.send(message).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(InfrastructureError);
    const text = JSON.stringify({ message: (error as Error).message, stack: (error as Error).stack, cause: (error as Error).cause });
    expect(text).not.toContain("hunter2-secret");
    expect(text).not.toContain("123456");
    expect((error as Error).message).toContain("EAUTH");
  });
});

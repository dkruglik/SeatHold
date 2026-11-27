import type { EmailMessage } from "./ports/email-provider.js";

/** The login code email. Plain text; the code is the only secret in it. */
export function loginCodeEmail(to: string, code: string, expiresInMinutes: number): EmailMessage {
  return {
    to,
    subject: "Your SeatHold sign-in code",
    text: [
      `Your SeatHold sign-in code is ${code}.`,
      "",
      `It expires in ${expiresInMinutes} minutes and works once.`,
      "If you did not ask for it, you can ignore this email.",
    ].join("\n"),
  };
}

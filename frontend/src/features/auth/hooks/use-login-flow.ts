import { useState } from "react";
import { ApiError } from "../../../shared/lib/api-client";
import { formatRetry } from "../../../shared/lib/format";
import { useAuthApi } from "./use-auth-api";
import { useAuthSession } from "./use-auth-session";

export type LoginStep = "email" | "code";

const invalidCodeMessage = "That code is not right or has expired. Check it and try again, or send a new code.";
const genericMessage = "Something went wrong. Please try again.";

/** The two-step login: email, then code. Signing in updates the `me` state; the page then redirects. */
export function useLoginFlow() {
  const api = useAuthApi();
  const session = useAuthSession();
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof ApiError && failure.code === "INVALID_CODE" ? invalidCodeMessage : genericMessage);
    } finally {
      setPending(false);
    }
  }

  return {
    step,
    email,
    error,
    pending,
    submitEmail: (value: string) =>
      run(async () => {
        const result = await api.requestCode(value);
        setEmail(value);
        if (result.kind === "rate_limited") {
          setError(`Too many code requests. Try again in ${formatRetry(result.retryAfterSeconds)}.`);
          return;
        }
        setStep("code");
      }),
    submitCode: (code: string) => {
      if (!/^\d{6}$/.test(code)) {
        setError("Enter the 6-digit code from the email.");
        return Promise.resolve();
      }
      return run(async () => session.signIn(await api.verify(email, code)));
    },
    changeEmail: () => {
      setError(null);
      setStep("email");
    },
  };
}

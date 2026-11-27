import { Alert } from "@mantine/core";
import type { Closed } from "../hooks/use-guest-access";

const titles: Record<Closed, string> = {
  used: "This link was already used",
  expired: "This link has expired",
  invalid: "This link is not valid",
  no_session: "Open the link from your email",
  blocked: "We could not verify this request",
  error: "Something went wrong",
};

const bodies: Partial<Record<Closed, string>> = {
  no_session: "Your tickets are in the email we sent after your booking.",
  blocked: "This link could not be checked. Request a new link below.",
};

export function ClosedNotice({ reason }: { readonly reason: Closed }) {
  return (
    <Alert color={reason === "no_session" ? "blue" : "red"} role={reason === "error" ? "alert" : "status"} title={titles[reason]}>
      {bodies[reason] ?? "You can ask for new links below."}
    </Alert>
  );
}

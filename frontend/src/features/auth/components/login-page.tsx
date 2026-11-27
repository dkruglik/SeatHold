import { Alert, Anchor, Button, Card, PageLayout, Stack, Text, TextInput } from "../../../shared/ui";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { useLoginFlow } from "../hooks/use-login-flow";
import { useMe } from "../hooks/use-me";
import { safeRedirectPath } from "../lib/safe-redirect";

function ErrorAlert({ message }: { readonly message: string | null }) {
  return message === null ? null : (
    <Alert color="red" role="alert">
      {message}
    </Alert>
  );
}

function EmailStep({ initial, pending, onSubmit }: { readonly initial: string; readonly pending: boolean; readonly onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState(initial);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(email.trim());
  };
  return (
    <form onSubmit={submit}>
      <Stack>
        <Text>Enter your email and we will send you a 6-digit sign-in code.</Text>
        <TextInput label="Email" type="email" name="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
        <Button type="submit" loading={pending}>
          Send code
        </Button>
      </Stack>
    </form>
  );
}

function CodeStep(props: { readonly email: string; readonly pending: boolean; readonly onSubmit: (code: string) => void; readonly onChangeEmail: () => void }) {
  const [code, setCode] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onSubmit(code);
  };
  return (
    <form onSubmit={submit}>
      <Stack>
        <Text style={{ overflowWrap: "anywhere" }}>We sent a code to {props.email}. It is valid for 10 minutes.</Text>
        <TextInput
          label="6-digit code"
          name="code"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={code}
          onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, ""))}
        />
        <Button type="submit" loading={props.pending}>
          Sign in
        </Button>
        <Button type="button" variant="subtle" onClick={props.onChangeEmail}>
          Use a different email or send a new code
        </Button>
      </Stack>
    </form>
  );
}

/** Email, then code. A signed-in user (including right after this form succeeds) is sent on to the page they came from. */
export function LoginPage() {
  const location = useLocation();
  const me = useMe();
  const flow = useLoginFlow();
  const target = safeRedirectPath((location.state as { from?: unknown } | null)?.from);

  if (me.data) {
    return <Navigate to={target} replace />;
  }
  return (
    <main>
      <PageLayout title="Sign in" size="xs">
        <Card p={{ base: "md", sm: "xl" }}>
          <Stack>
            <ErrorAlert message={flow.error} />
            {flow.step === "email" ? (
              <EmailStep initial={flow.email} pending={flow.pending} onSubmit={(email) => void flow.submitEmail(email)} />
            ) : (
              <CodeStep email={flow.email} pending={flow.pending} onSubmit={(code) => void flow.submitCode(code)} onChangeEmail={flow.changeEmail} />
            )}
            <Anchor component={Link} to="/" size="sm">
              Back to home
            </Anchor>
          </Stack>
        </Card>
      </PageLayout>
    </main>
  );
}

import { Alert, Button, ColorSchemeToggle, Group, Text } from "../../../shared/ui";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError } from "../../../shared/lib/api-client";
import { useAuthApi } from "../hooks/use-auth-api";
import { useAuthSession } from "../hooks/use-auth-session";
import { useMe } from "../hooks/use-me";

function AccountError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Group gap="sm" wrap="wrap" justify="flex-end">
      <Alert color="red" role="alert" py={4} px="sm">
        Could not load your account.
      </Alert>
      <Button variant="default" size="compact-md" onClick={onRetry}>
        Retry
      </Button>
    </Group>
  );
}

function SignedIn({ email, admin, failed, onLogout }: { readonly email: string; readonly admin: boolean; readonly failed: boolean; readonly onLogout: () => void }) {
  return (
    <Group gap="sm" wrap="wrap" justify="flex-end">
      <Text size="sm" style={{ overflowWrap: "anywhere" }}>
        {email}
      </Text>
      <Button component={Link} to="/bookings" variant="subtle" size="compact-md">
        My bookings
      </Button>
      {admin ? (
        <Button component={Link} to="/admin" variant="subtle" size="compact-md">
          Back office
        </Button>
      ) : null}
      <Button variant="default" size="compact-md" onClick={onLogout}>
        Log out
      </Button>
      {failed ? (
        <Alert color="red" role="alert" w="100%">
          Could not log out. Please try again.
        </Alert>
      ) : null}
    </Group>
  );
}

/** Header area: Sign in for a visitor; the email and Log out for a signed-in user. Renders nothing while `me` loads; if it failed, an alert with Retry. */
function AccountMenu() {
  const me = useMe();
  const api = useAuthApi();
  const session = useAuthSession();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  async function logout() {
    setFailed(false);
    try {
      await api.logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setFailed(true);
        return;
      }
    }
    await session.signOut();
    void navigate("/");
  }

  if (me.isError) {
    return <AccountError onRetry={() => void me.refetch()} />;
  }
  if (me.data === undefined) {
    return null;
  }
  if (me.data === null) {
    return (
      <Button component={Link} to="/login" variant="light" size="compact-md">
        Sign in
      </Button>
    );
  }
  return <SignedIn email={me.data.email} admin={me.data.role === "admin"} failed={failed} onLogout={() => void logout()} />;
}

/** The header's right side: the color scheme toggle and the account menu. */
export function UserMenu() {
  return (
    <Group gap="sm" wrap="wrap" justify="flex-end">
      <ColorSchemeToggle />
      <AccountMenu />
    </Group>
  );
}

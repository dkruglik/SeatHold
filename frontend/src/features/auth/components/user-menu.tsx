import { Alert, Button, Group, Text } from "@mantine/core";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError } from "../../../shared/lib/api-client";
import { useAuthApi } from "../hooks/use-auth-api";
import { useAuthSession } from "../hooks/use-auth-session";
import { useMe } from "../hooks/use-me";

/** Header area: Sign in for a visitor; the email and Log out for a signed-in user. Renders nothing while `me` loads or if it failed. */
export function UserMenu() {
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
  return (
    <Group gap="sm" wrap="wrap" justify="flex-end">
      <Text size="sm" style={{ overflowWrap: "anywhere" }}>
        {me.data.email}
      </Text>
      <Button variant="default" size="compact-md" onClick={() => void logout()}>
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

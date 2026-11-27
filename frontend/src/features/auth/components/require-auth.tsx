import { Alert, Center, Loader } from "../../../shared/ui";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useMe } from "../hooks/use-me";

/**
 * Sends an anonymous visitor to the login page and remembers where they were going. This is a UX guard only:
 * the server decides what a caller may do (DECISIONS O55).
 */
export function RequireAuth({ children }: { readonly children: ReactNode }) {
  const me = useMe();
  const location = useLocation();

  if (me.isError) {
    return (
      <Alert color="red" role="alert" m="md">
        We could not check your sign-in. Reload the page to try again.
      </Alert>
    );
  }
  if (me.isPending) {
    return (
      <Center p="xl">
        <Loader aria-label="Checking your sign-in" />
      </Center>
    );
  }
  if (me.data === null) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }
  return <>{children}</>;
}

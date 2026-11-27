import type { ReactNode } from "react";
import { useMe } from "../hooks/use-me";
import { NotAllowedPage } from "./not-allowed-page";
import { RequireAuth } from "./require-auth";

function AdminOnly({ children }: { readonly children: ReactNode }) {
  const me = useMe();
  return me.data?.role === "admin" ? <>{children}</> : <NotAllowedPage />;
}

/** Anonymous goes to login, a buyer sees Not allowed, an admin sees the children. UX only: `/api/admin/*` enforces the role on the server. */
export function RequireAdmin({ children }: { readonly children: ReactNode }) {
  return (
    <RequireAuth>
      <AdminOnly>{children}</AdminOnly>
    </RequireAuth>
  );
}

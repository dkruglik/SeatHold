import type { RouteObject } from "react-router";
import { AdminPage } from "../features/admin";
import { LoginPage, RequireAdmin } from "../features/auth";
import { DiscoveryPage } from "../features/discovery";

export const routes: RouteObject[] = [
  { path: "/", element: <DiscoveryPage /> },
  { path: "/login", element: <LoginPage /> },
  {
    path: "/admin",
    element: (
      <RequireAdmin>
        <AdminPage />
      </RequireAdmin>
    ),
  },
];

import type { RouteObject } from "react-router";
import { AdminPage } from "../features/admin";
import { LoginPage, RequireAdmin } from "../features/auth";
import { HomePage } from "../features/home";

export const routes: RouteObject[] = [
  { path: "/", element: <HomePage /> },
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

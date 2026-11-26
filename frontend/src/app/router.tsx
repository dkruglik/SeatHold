import type { RouteObject } from "react-router";
import { AdminPage } from "../features/admin";
import { LoginPage, RequireAdmin } from "../features/auth";
import { DiscoveryPage } from "../features/discovery";
import { EventPage } from "../features/event";

export const routes: RouteObject[] = [
  { path: "/", element: <DiscoveryPage /> },
  { path: "/events/:eventId", element: <EventPage /> },
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

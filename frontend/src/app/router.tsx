import type { RouteObject } from "react-router";
import { AdminPage } from "../features/admin";
import { LoginPage, RequireAdmin, RequireAuth } from "../features/auth";
import { DiscoveryPage } from "../features/discovery";
import { EventPage } from "../features/event";
import { GuestAccessPage } from "../features/guest";
import { MyBookingsPage } from "../features/my-bookings";

export const routes: RouteObject[] = [
  { path: "/", element: <DiscoveryPage /> },
  { path: "/events/:eventId", element: <EventPage /> },
  {
    path: "/bookings",
    element: (
      <RequireAuth>
        <MyBookingsPage />
      </RequireAuth>
    ),
  },
  { path: "/guest/access", element: <GuestAccessPage /> },
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

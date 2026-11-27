import type { RouteObject } from "react-router";
import { AdminEventDetailPage } from "./admin-event-detail-page";
import { AdminEventsPage } from "./admin-events-page";
import { CreateEventPage } from "./create-event-page";

/** The back office screens. The app mounts them under one `RequireAdmin`; the server enforces the role on every call. */
export const adminRoutes: RouteObject[] = [
  { path: "/admin", element: <AdminEventsPage /> },
  { path: "/admin/events/new", element: <CreateEventPage /> },
  { path: "/admin/events/:eventId", element: <AdminEventDetailPage /> },
];

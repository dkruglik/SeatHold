import { Anchor, Container, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router";
import { useApiClient } from "../../app/api-client-context";
import { AdminApi } from "./services/admin-api";

/** Placeholder back office until Phase 4: proves the admin boundary end to end. */
export function AdminPage() {
  const client = useApiClient();
  const api = useMemo(() => new AdminApi(client), [client]);
  const ping = useQuery({ queryKey: ["admin", "ping"], queryFn: () => api.ping(), retry: false });

  return (
    <Container size="md" py="xl" component="main">
      <Title order={1}>Back office</Title>
      <Text mt="md" role={ping.isError ? "alert" : "status"}>
        {ping.isError ? "The admin API did not answer." : ping.data?.ok ? "Admin API reachable." : "Checking the admin API..."}
      </Text>
      <Anchor component={Link} to="/" mt="md" display="block">
        Back to home
      </Anchor>
    </Container>
  );
}

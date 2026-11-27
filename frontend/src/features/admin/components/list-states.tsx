import { Alert, Button, Group, Pagination, Skeleton, Stack, Text } from "@mantine/core";

export function ListSkeleton({ label }: { readonly label: string }) {
  return (
    <Stack role="status" aria-label={label} gap="sm">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={40} radius="md" />
      ))}
    </Stack>
  );
}

export function ListError({ title, onRetry }: { readonly title: string; readonly onRetry: () => void }) {
  return (
    <Alert color="red" role="alert" title={title}>
      <Group gap="sm" wrap="wrap">
        <Text size="sm">Something went wrong. Try again.</Text>
        <Button variant="default" size="compact-md" onClick={onRetry}>
          Retry
        </Button>
      </Group>
    </Alert>
  );
}

const controlLabels = { first: "First page", previous: "Previous page", next: "Next page", last: "Last page" } as const;

export function Pager({ page, totalPages, onPage }: { readonly page: number; readonly totalPages: number; readonly onPage: (page: number) => void }) {
  return totalPages > 1 ? <Pagination total={totalPages} value={page} onChange={onPage} getControlProps={(control) => ({ "aria-label": controlLabels[control] })} /> : null;
}

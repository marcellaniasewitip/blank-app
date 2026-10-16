import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { errorMessage } from '@/api/client';
import { m } from '@/i18n';

/** Standard loading / error / content switch for a query. */
export function QueryState({
  isPending,
  error,
  refetch,
  children,
}: {
  isPending: boolean;
  error: unknown;
  refetch?: () => unknown;
  children: ReactNode;
}) {
  if (isPending)
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  if (error)
    return (
      <Alert color="red" title={m.app.error}>
        <Stack gap="xs" align="flex-start">
          <Text size="sm">{errorMessage(error)}</Text>
          {refetch && (
            <Button size="xs" variant="light" color="red" onClick={() => refetch()}>
              {m.app.retry}
            </Button>
          )}
        </Stack>
      </Alert>
    );
  return <>{children}</>;
}

export function Empty({ children }: { children?: ReactNode }) {
  return (
    <Text c="dimmed" ta="center" py="lg" size="sm">
      {children ?? m.common.noData}
    </Text>
  );
}

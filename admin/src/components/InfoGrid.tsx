import { SimpleGrid, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

/** Label/value pairs for detail pages. */
export function InfoGrid({ items, cols = 3 }: { items: [ReactNode, ReactNode][]; cols?: number }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: cols }} spacing="md" verticalSpacing="sm">
      {items.map(([k, v], i) => (
        <Stack gap={0} key={i}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {k}
          </Text>
          <div style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{v ?? '—'}</div>
        </Stack>
      ))}
    </SimpleGrid>
  );
}

import { Button, Center } from '@mantine/core';
import { m } from '@/i18n';

export function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}) {
  if (!hasNextPage) return null;
  return (
    <Center mt="md">
      <Button variant="default" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
        {m.common.loadMore}
      </Button>
    </Center>
  );
}

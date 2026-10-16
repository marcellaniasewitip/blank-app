import { Anchor, Card, Group, Select, Table, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CustomerListItem } from '@/api';
import { LoadMore } from '@/components/CursorList';
import { useCursorList } from '@/components/useCursorList';
import { PageHeader } from '@/components/PageHeader';
import { Empty, QueryState } from '@/components/QueryState';
import { StatusBadge } from '@/components/StatusBadge';
import { m } from '@/i18n';
import { formatDateTime } from '@/lib/time';

export default function CustomersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [dq] = useDebouncedValue(q.trim(), 350);
  const query = { q: dq || undefined, status: status ?? undefined };
  const list = useCursorList<CustomerListItem>(['customers', query], (p) => api.customers.list({ ...query, ...p }));

  return (
    <>
      <PageHeader title={m.customers.title} />
      <Card withBorder mb="md">
        <Group align="flex-end">
          <TextInput label={m.common.search} placeholder={m.customers.searchPlaceholder} leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} w={260} />
          <Select
            label={m.common.status}
            data={[
              { value: 'active', label: m.common.active },
              { value: 'suspended', label: 'Suspended' },
            ]}
            value={status}
            onChange={setStatus}
            clearable
            placeholder={m.common.all}
            w={180}
          />
        </Group>
      </Card>
      <Card withBorder>
        <QueryState isPending={list.isPending} error={list.error} refetch={list.refetch}>
          {list.items.length === 0 ? (
            <Empty />
          ) : (
            <Table.ScrollContainer minWidth={700}>
              <Table striped highlightOnHover fz="sm" data-testid="customers-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{m.common.name}</Table.Th>
                    <Table.Th>{m.common.phone}</Table.Th>
                    <Table.Th>{m.common.status}</Table.Th>
                    <Table.Th ta="right">{m.customers.orders}</Table.Th>
                    <Table.Th>{m.common.created}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.items.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>
                        <Anchor component={Link} to={`/customers/${c.id}`}>
                          {c.name ?? '—'}
                        </Anchor>
                      </Table.Td>
                      <Table.Td ff="monospace">{c.phone}</Table.Td>
                      <Table.Td>
                        <StatusBadge value={c.status} />
                      </Table.Td>
                      <Table.Td ta="right">{c.orderCount}</Table.Td>
                      <Table.Td>{formatDateTime(c.createdAt)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          <LoadMore hasNextPage={list.hasNextPage} isFetchingNextPage={list.isFetchingNextPage} fetchNextPage={list.fetchNextPage} />
        </QueryState>
      </Card>
    </>
  );
}

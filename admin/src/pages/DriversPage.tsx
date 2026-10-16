import { Anchor, Badge, Card, Group, Select, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type DriverListItem } from '@/api';
import { LoadMore } from '@/components/CursorList';
import { useCursorList } from '@/components/useCursorList';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { Empty, QueryState } from '@/components/QueryState';
import { StatusBadge } from '@/components/StatusBadge';
import { m } from '@/i18n';
import { timeAgo } from '@/lib/time';

const STATUSES = ['pending_docs', 'pending_approval', 'approved', 'rejected', 'suspended'];

export default function DriversPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status');
  const online = params.get('online');
  const [q, setQ] = useState('');
  const [dq] = useDebouncedValue(q.trim(), 350);
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const query = { status: status ?? undefined, online: online ?? undefined, q: dq || undefined };
  const list = useCursorList<DriverListItem>(['drivers', query], (p) => api.drivers.list({ ...query, ...p }));

  return (
    <>
      <PageHeader title={m.drivers.title} />
      <Card withBorder mb="md">
        <Group align="flex-end">
          <TextInput label={m.common.search} placeholder={m.drivers.searchPlaceholder} leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} w={260} />
          <Select
            label={m.drivers.status}
            data={STATUSES.map((s) => ({ value: s, label: m.enums.driverStatus[s] }))}
            value={status}
            onChange={(v) => setParam('status', v)}
            clearable
            placeholder={m.common.all}
            w={200}
            data-testid="driver-status-filter"
          />
          <Select
            label={m.drivers.online}
            data={[
              { value: 'true', label: m.drivers.online },
              { value: 'false', label: m.drivers.offline },
            ]}
            value={online}
            onChange={(v) => setParam('online', v)}
            clearable
            placeholder={m.common.all}
            w={140}
          />
        </Group>
      </Card>
      <Card withBorder>
        <QueryState isPending={list.isPending} error={list.error} refetch={list.refetch}>
          {list.items.length === 0 ? (
            <Empty />
          ) : (
            <Table.ScrollContainer minWidth={900}>
              <Table striped highlightOnHover fz="sm" data-testid="drivers-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{m.common.name}</Table.Th>
                    <Table.Th>{m.common.phone}</Table.Th>
                    <Table.Th>{m.drivers.status}</Table.Th>
                    <Table.Th>{m.drivers.online}</Table.Th>
                    <Table.Th>{m.drivers.truck}</Table.Th>
                    <Table.Th ta="right">{m.drivers.balance}</Table.Th>
                    <Table.Th>{m.drivers.rating}</Table.Th>
                    <Table.Th>{m.drivers.lastSeen}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.items.map((d) => (
                    <Table.Tr key={d.id}>
                      <Table.Td>
                        <Anchor component={Link} to={`/drivers/${d.id}`}>
                          {d.name ?? '—'}
                        </Anchor>
                        {d.accountStatus === 'suspended' && (
                          <Badge ml={6} size="xs" color="red">
                            {m.drivers.accountSuspended}
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td ff="monospace">{d.phone}</Table.Td>
                      <Table.Td>
                        <StatusBadge value={d.status} labels={m.enums.driverStatus} />
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="dot" color={d.online ? 'teal' : 'gray'}>
                          {d.online ? m.drivers.online : m.drivers.offline}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{d.truck ? `${d.truck.plate} · ${d.truck.capacityLitres.toLocaleString('en')} L` : '—'}</Table.Td>
                      <Table.Td ta="right">
                        <Money toea={d.balanceToea} />
                      </Table.Td>
                      <Table.Td>
                        {d.ratingCount ? (
                          <Text size="sm">
                            ★ {d.ratingAvg.toFixed(1)} ({d.ratingCount})
                          </Text>
                        ) : (
                          '—'
                        )}
                      </Table.Td>
                      <Table.Td>{timeAgo(d.lastSeenAt)}</Table.Td>
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

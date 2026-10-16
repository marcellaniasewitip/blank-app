import { Anchor, Card, SegmentedControl, Table, Text } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DisputeListItem } from '@/api';
import { LoadMore } from '@/components/CursorList';
import { useCursorList } from '@/components/useCursorList';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { Empty, QueryState } from '@/components/QueryState';
import { OrderStatusBadge, StatusBadge } from '@/components/StatusBadge';
import { humanize, label, m } from '@/i18n';
import { formatDateTime } from '@/lib/time';

export default function DisputesPage() {
  const [status, setStatus] = useState('open,investigating');
  const query = { status: status === 'all' ? undefined : status };
  const list = useCursorList<DisputeListItem>(['disputes', query], (p) => api.disputes.list({ ...query, ...p }));
  return (
    <>
      <PageHeader title={m.disputes.title} />
      <Card withBorder mb="md">
        <SegmentedControl
          value={status}
          onChange={setStatus}
          data={[
            { value: 'open,investigating', label: 'Open' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'all', label: m.common.all },
          ]}
        />
      </Card>
      <Card withBorder>
        <QueryState isPending={list.isPending} error={list.error} refetch={list.refetch}>
          {list.items.length === 0 ? (
            <Empty />
          ) : (
            <Table.ScrollContainer minWidth={900}>
              <Table striped highlightOnHover fz="sm" data-testid="disputes-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{m.common.created}</Table.Th>
                    <Table.Th>{m.common.order}</Table.Th>
                    <Table.Th>{m.disputes.category}</Table.Th>
                    <Table.Th>{m.disputes.raisedBy}</Table.Th>
                    <Table.Th>{m.disputes.description}</Table.Th>
                    <Table.Th ta="right">{m.orders.price}</Table.Th>
                    <Table.Th>{m.common.status}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.items.map((d) => (
                    <Table.Tr key={d.id}>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(d.createdAt)}</Table.Td>
                      <Table.Td>
                        <Anchor component={Link} to={`/disputes/${d.id}`} ff="monospace" fw={600}>
                          {d.order.shortCode}
                        </Anchor>
                        <div>
                          <OrderStatusBadge status={d.order.status} />
                        </div>
                      </Table.Td>
                      <Table.Td>{humanize(d.category)}</Table.Td>
                      <Table.Td>
                        {d.raisedBy.name ?? d.raisedBy.phone}
                        <Text size="xs" c="dimmed">
                          {label(m.enums.actorType, d.raisedByType)}
                        </Text>
                      </Table.Td>
                      <Table.Td maw={320}>
                        <Text size="sm" lineClamp={2}>
                          {d.description}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Money toea={d.order.priceToea} />
                      </Table.Td>
                      <Table.Td>
                        <StatusBadge value={d.status} />
                      </Table.Td>
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

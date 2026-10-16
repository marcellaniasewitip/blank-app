import { Anchor, Badge, Button, Card, Group, MultiSelect, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ORDER_STATUSES, type AdminOrder } from '@/api';
import { LoadMore } from '@/components/CursorList';
import { useCursorList } from '@/components/useCursorList';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { Empty, QueryState } from '@/components/QueryState';
import { OrderStatusBadge, StatusBadge } from '@/components/StatusBadge';
import { config } from '@/config';
import { label, m } from '@/i18n';
import { formatDateTime, localDayEndExclusiveIso, localDayStartIso, pickerDateToYmd, ymdToPickerDate } from '@/lib/time';
import { useRealtime } from '@/realtime/RealtimeProvider';

export default function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const { connected } = useRealtime();
  const status = params.get('status') ?? '';
  const paymentMethod = params.get('paymentMethod') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const customerId = params.get('customerId') ?? '';
  const driverId = params.get('driverId') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debouncedQ] = useDebouncedValue(q.trim(), 350);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== debouncedQ) set({ q: debouncedQ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const query = {
    status: status || undefined,
    paymentMethod: paymentMethod || undefined,
    q: debouncedQ || undefined,
    customerId: customerId || undefined,
    driverId: driverId || undefined,
    from: from ? localDayStartIso(from) : undefined,
    // Backend `to` is inclusive.
    to: to ? new Date(new Date(localDayEndExclusiveIso(to)).getTime() - 1).toISOString() : undefined,
  };

  const list = useCursorList<AdminOrder>(['orders', query], (p) => api.orders.list({ ...query, ...p }), {
    refetchInterval: connected ? false : config.pollMs.orders,
  });

  return (
    <>
      <PageHeader title={m.orders.title} actions={connected ? <Badge variant="dot" color="teal">{m.orders.liveUpdated}</Badge> : undefined} />
      <Card withBorder mb="md">
        <Group align="flex-end" wrap="wrap">
          <TextInput
            label={m.common.search}
            placeholder={m.orders.searchPlaceholder}
            leftSection={<IconSearch size={16} />}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            w={240}
            data-testid="orders-search"
          />
          <MultiSelect
            label={m.orders.status}
            data={ORDER_STATUSES.map((s) => ({ value: s, label: label(m.enums.orderStatus, s) }))}
            value={status ? status.split(',') : []}
            onChange={(v) => set({ status: v.join(',') })}
            clearable
            w={300}
            placeholder={m.common.all}
          />
          <Select
            label={m.orders.paymentMethod}
            data={[
              { value: 'cod', label: m.enums.paymentMethod.cod },
              { value: 'cellmoney', label: m.enums.paymentMethod.cellmoney },
            ]}
            value={paymentMethod || null}
            onChange={(v) => set({ paymentMethod: v ?? '' })}
            clearable
            placeholder={m.common.all}
            w={180}
          />
          <DatePickerInput
            type="range"
            label={m.common.dateRange}
            value={[from ? ymdToPickerDate(from) : null, to ? ymdToPickerDate(to) : null]}
            onChange={([a, b]) => set({ from: a ? pickerDateToYmd(a) : '', to: b ? pickerDateToYmd(b) : '' })}
            clearable
            allowSingleDateInRange
            valueFormat="DD MMM YYYY"
            w={250}
          />
          {(customerId || driverId) && (
            <Button variant="light" rightSection={<IconX size={14} />} onClick={() => set({ customerId: '', driverId: '' })}>
              {customerId ? m.common.customer : m.common.driver}: {(customerId || driverId).slice(0, 8)}
            </Button>
          )}
        </Group>
      </Card>
      <Card withBorder>
        <QueryState isPending={list.isPending} error={list.error} refetch={list.refetch}>
          {list.items.length === 0 ? (
            <Empty />
          ) : (
            <Table.ScrollContainer minWidth={1000}>
              <Table striped highlightOnHover fz="sm" data-testid="orders-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{m.common.order}</Table.Th>
                    <Table.Th>{m.orders.createdAt}</Table.Th>
                    <Table.Th>{m.orders.status}</Table.Th>
                    <Table.Th>{m.orders.package}</Table.Th>
                    <Table.Th ta="right">{m.orders.price}</Table.Th>
                    <Table.Th>{m.orders.paymentMethod}</Table.Th>
                    <Table.Th>{m.common.customer}</Table.Th>
                    <Table.Th>{m.common.driver}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.items.map((o) => (
                    <Table.Tr key={o.id}>
                      <Table.Td>
                        <Anchor component={Link} to={`/orders/${o.id}`} fw={600} ff="monospace">
                          {o.shortCode}
                        </Anchor>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(o.timeline.createdAt)}</Table.Td>
                      <Table.Td>
                        <OrderStatusBadge status={o.status} />
                      </Table.Td>
                      <Table.Td>
                        {o.package.name ?? '—'} × {o.quantity}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Money toea={o.priceToea} />
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="xs">{label(m.enums.paymentMethod, o.paymentMethod)}</Text>
                          <StatusBadge value={o.paymentStatus} />
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{o.customer.name ?? '—'}</Text>
                        <Text size="xs" c="dimmed">
                          {o.customer.phone}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {o.driver ? (
                          <>
                            <Text size="sm">{o.driver.name ?? '—'}</Text>
                            <Text size="xs" c="dimmed">
                              {o.driver.plate}
                            </Text>
                          </>
                        ) : (
                          <Text size="xs" c="dimmed">
                            {m.orders.noDriver}
                          </Text>
                        )}
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

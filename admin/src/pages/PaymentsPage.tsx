import { ActionIcon, Badge, Button, Card, Code, Drawer, Group, Menu, MultiSelect, Select, Stack, Table, Tabs, Text, TextInput, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconDots, IconSearch } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Payment, type WebhookEvent } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { ActionModal } from '@/components/ActionModal';
import { CopyText } from '@/components/CopyText';
import { LoadMore } from '@/components/CursorList';
import { useCursorList } from '@/components/useCursorList';
import { InfoGrid } from '@/components/InfoGrid';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { Empty, QueryState } from '@/components/QueryState';
import { StatusBadge } from '@/components/StatusBadge';
import { fmt, label, m } from '@/i18n';
import { formatKina } from '@/lib/money';
import { formatDateTime } from '@/lib/time';

const STATUSES = ['initiated', 'pending', 'succeeded', 'failed', 'reversed', 'expired'];
const OPEN = ['initiated', 'pending'];

type PayAction = 'confirm' | 'fail' | 'recheck' | 'completeRefund' | 'retryRefund';

function actionsFor(p: Payment, can: (perm: 'payments.confirm' | 'payments.refund') => boolean): PayAction[] {
  const out: PayAction[] = [];
  if (p.purpose === 'refund') {
    if (can('payments.refund') && p.status !== 'succeeded') out.push('completeRefund', 'retryRefund');
    return out;
  }
  if (!can('payments.confirm')) return out;
  if (p.direction === 'in' && p.status !== 'succeeded') out.push('confirm');
  if (OPEN.includes(p.status)) out.push('fail');
  if (OPEN.includes(p.status) && p.adapter !== 'manual' && p.providerRef) out.push('recheck');
  return out;
}

function PaymentsTable({ items, onAction, onOpen }: { items: Payment[]; onAction: (p: Payment, a: PayAction) => void; onOpen: (p: Payment) => void }) {
  const { can } = useAuth();
  const labels: Record<PayAction, string> = {
    confirm: m.payments.confirm,
    fail: m.payments.markFailed,
    recheck: m.payments.recheck,
    completeRefund: m.payments.completeRefund,
    retryRefund: m.payments.retryRefund,
  };
  if (items.length === 0) return <Empty />;
  return (
    <Table.ScrollContainer minWidth={1100}>
      <Table striped highlightOnHover fz="sm" data-testid="payments-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{m.common.created}</Table.Th>
            <Table.Th>{m.common.reference}</Table.Th>
            <Table.Th>{m.payments.purpose}</Table.Th>
            <Table.Th>{m.payments.adapter}</Table.Th>
            <Table.Th ta="right">{m.common.amount}</Table.Th>
            <Table.Th ta="right">{m.payments.fee}</Table.Th>
            <Table.Th>{m.payments.msisdn}</Table.Th>
            <Table.Th>{m.common.status}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((p) => {
            const acts = actionsFor(p, can);
            return (
              <Table.Tr key={p.id}>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(p.createdAt)}</Table.Td>
                <Table.Td>
                  <Text size="sm" ff="monospace" fw={600} style={{ cursor: 'pointer' }} onClick={() => onOpen(p)}>
                    {p.reference}
                  </Text>
                  {p.providerRef && (
                    <Text size="xs" c="dimmed" ff="monospace">
                      {p.providerRef}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {label(m.enums.purpose, p.purpose)}{' '}
                  <Badge size="xs" variant="outline" color={p.direction === 'in' ? 'teal' : 'grape'}>
                    {p.direction}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {p.provider}/{p.adapter}
                </Table.Td>
                <Table.Td ta="right">
                  <Money toea={p.amountToea} fw={600} />
                </Table.Td>
                <Table.Td ta="right">
                  <Money toea={p.feeToea} c="dimmed" />
                </Table.Td>
                <Table.Td ff="monospace">{p.msisdn ?? '—'}</Table.Td>
                <Table.Td>
                  <StatusBadge value={p.status} />
                  {p.failureReason && (
                    <Text size="xs" c="dimmed" maw={220}>
                      {p.failureReason}
                    </Text>
                  )}
                  {p.expiresAt && OPEN.includes(p.status) && (
                    <Text size="xs" c="dimmed">
                      {m.payments.expires} {formatDateTime(p.expiresAt)}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap" justify="flex-end">
                    {acts[0] && (
                      <Button size="xs" variant="light" onClick={() => onAction(p, acts[0])}>
                        {labels[acts[0]]}
                      </Button>
                    )}
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" aria-label={m.common.actions}>
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item onClick={() => onOpen(p)}>{m.common.details}</Menu.Item>
                        {acts.slice(1).map((a) => (
                          <Menu.Item key={a} color={a === 'fail' ? 'red' : undefined} onClick={() => onAction(p, a)}>
                            {labels[a]}
                          </Menu.Item>
                        ))}
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function WebhooksTab() {
  const list = useCursorList<WebhookEvent>(['webhooks'], (p) => api.payments.webhooks(p));
  const [open, setOpen] = useState<WebhookEvent | null>(null);
  return (
    <QueryState isPending={list.isPending} error={list.error} refetch={list.refetch}>
      {list.items.length === 0 ? (
        <Empty />
      ) : (
        <Table striped highlightOnHover fz="sm" data-testid="webhooks-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{m.common.created}</Table.Th>
              <Table.Th>{m.payments.provider}</Table.Th>
              <Table.Th>{m.payments.eventKey}</Table.Th>
              <Table.Th>{m.payments.signature}</Table.Th>
              <Table.Th>{m.payments.processed}</Table.Th>
              <Table.Th>{m.payments.error}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {list.items.map((w) => (
              <Table.Tr key={w.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(w)}>
                <Table.Td>{formatDateTime(w.createdAt)}</Table.Td>
                <Table.Td>{w.provider}</Table.Td>
                <Table.Td ff="monospace">{w.eventKey}</Table.Td>
                <Table.Td>
                  <Badge color={w.signatureOk ? 'teal' : 'red'} variant="light">
                    {w.signatureOk ? m.payments.sigOk : m.payments.sigBad}
                  </Badge>
                </Table.Td>
                <Table.Td>{w.processedAt ? formatDateTime(w.processedAt) : <Text size="xs" c="dimmed">{m.payments.notProcessed}</Text>}</Table.Td>
                <Table.Td>
                  <Text size="xs" c="red">
                    {w.error ?? ''}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <LoadMore hasNextPage={list.hasNextPage} isFetchingNextPage={list.isFetchingNextPage} fetchNextPage={list.fetchNextPage} />
      <Drawer opened={!!open} onClose={() => setOpen(null)} position="right" size="lg" title={open?.eventKey}>
        {open && (
          <Stack>
            <Text size="sm" fw={600}>
              Headers
            </Text>
            <Code block>{JSON.stringify(open.headers, null, 2)}</Code>
            <Text size="sm" fw={600}>
              {m.payments.raw}
            </Text>
            <Code block style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(open.rawBody), null, 2);
                } catch {
                  return open.rawBody;
                }
              })()}
            </Code>
          </Stack>
        )}
      </Drawer>
    </QueryState>
  );
}

export default function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const tab = params.get('tab') ?? 'payments';
  const status = params.get('status') ?? '';
  const purpose = params.get('purpose') ?? '';
  const adapter = params.get('adapter') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [dq] = useDebouncedValue(q.trim(), 350);
  const [action, setAction] = useState<{ p: Payment; a: PayAction } | null>(null);
  const [detail, setDetail] = useState<Payment | null>(null);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if ((params.get('q') ?? '') !== dq) set({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const query = { status: status || undefined, purpose: purpose || undefined, adapter: adapter || undefined, q: dq || undefined };
  const payments = useCursorList<Payment>(['payments', 'list', query], (p) => api.payments.list({ ...query, ...p }), { enabled: tab === 'payments' });
  const refundQuery = { purpose: 'refund', status: 'initiated,pending,failed' };
  const refunds = useCursorList<Payment>(['payments', 'refunds'], (p) => api.payments.list({ ...refundQuery, ...p }), { enabled: tab === 'refunds' });

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['payments'] }), qc.invalidateQueries({ queryKey: ['overview'] }), qc.invalidateQueries({ queryKey: ['topups'] }), qc.invalidateQueries({ queryKey: ['orders'] })]);

  const modal = (() => {
    if (!action) return null;
    const { p, a } = action;
    const amount = formatKina(p.amountToea);
    const common = { opened: true, onClose: () => setAction(null) };
    switch (a) {
      case 'confirm':
        return (
          <ActionModal
            {...common}
            title={fmt(m.payments.confirmTitle, { ref: p.reference })}
            body={fmt(m.payments.confirmBody, { amount, ref: p.reference })}
            color="teal"
            confirmLabel={m.payments.confirm}
            fields={[{ name: 'receiptRef', label: m.payments.receiptRef, required: true, maxLength: 100 }]}
            successMessage={m.payments.confirmed}
            onSubmit={async (v) => {
              await api.payments.confirm(p.id, v.receiptRef);
              await refresh();
            }}
          />
        );
      case 'fail':
        return (
          <ActionModal
            {...common}
            title={fmt(m.payments.failTitle, { ref: p.reference })}
            color="red"
            confirmLabel={m.payments.markFailed}
            fields={[{ name: 'reason', label: m.common.reason, type: 'textarea', required: true, maxLength: 500 }]}
            successMessage={m.payments.failed}
            onSubmit={async (v) => {
              await api.payments.fail(p.id, v.reason);
              await refresh();
            }}
          />
        );
      case 'recheck':
        return (
          <ActionModal
            {...common}
            title={m.payments.recheck}
            body={`${p.reference} · ${amount}`}
            successMessage={m.payments.rechecked}
            onSubmit={async () => {
              await api.payments.recheck(p.id);
              await refresh();
            }}
          />
        );
      case 'completeRefund':
        return (
          <ActionModal
            {...common}
            title={fmt(m.payments.completeRefundTitle, { amount })}
            body={fmt(m.payments.completeRefundBody, { amount })}
            color="grape"
            confirmLabel={m.payments.completeRefund}
            fields={[{ name: 'externalRef', label: m.payments.externalRef, required: true, maxLength: 100 }]}
            successMessage={m.payments.refundCompleted}
            onSubmit={async (v) => {
              await api.payments.completeRefund(p.id, v.externalRef);
              await refresh();
            }}
          />
        );
      case 'retryRefund':
        return (
          <ActionModal
            {...common}
            title={fmt(m.payments.retryRefundTitle, { amount })}
            body={p.failureReason ?? undefined}
            confirmLabel={m.payments.retryRefund}
            successMessage={m.payments.refundRetried}
            onSubmit={async () => {
              await api.payments.retryRefund(p.id);
              await refresh();
            }}
          />
        );
    }
  })();

  return (
    <>
      <PageHeader title={m.payments.title} />
      <Tabs value={tab} onChange={(v) => set({ tab: v === 'payments' ? '' : (v ?? '') })} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="payments">{m.payments.tabPayments}</Tabs.Tab>
          <Tabs.Tab value="refunds">{m.payments.tabRefunds}</Tabs.Tab>
          <Tabs.Tab value="webhooks">{m.payments.tabWebhooks}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="payments">
          <Card withBorder mb="md">
            <Group align="flex-end" wrap="wrap">
              <TextInput label={m.common.search} placeholder={m.payments.searchPlaceholder} leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} w={260} />
              <MultiSelect label={m.common.status} data={STATUSES} value={status ? status.split(',') : []} onChange={(v) => set({ status: v.join(',') })} clearable placeholder={m.common.all} w={280} />
              <Select
                label={m.payments.purpose}
                data={['order', 'topup', 'refund', 'payout'].map((v) => ({ value: v, label: label(m.enums.purpose, v) }))}
                value={purpose || null}
                onChange={(v) => set({ purpose: v ?? '' })}
                clearable
                placeholder={m.common.all}
                w={150}
              />
              <Select label={m.payments.adapter} data={['manual', 'mock', 'cash']} value={adapter || null} onChange={(v) => set({ adapter: v ?? '' })} clearable placeholder={m.common.all} w={150} searchable />
            </Group>
          </Card>
          <Card withBorder>
            <QueryState isPending={payments.isPending} error={payments.error} refetch={payments.refetch}>
              <PaymentsTable items={payments.items} onAction={(p, a) => setAction({ p, a })} onOpen={setDetail} />
              <LoadMore hasNextPage={payments.hasNextPage} isFetchingNextPage={payments.isFetchingNextPage} fetchNextPage={payments.fetchNextPage} />
            </QueryState>
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="refunds">
          <Card withBorder>
            <Text size="sm" c="dimmed" mb="sm">
              {m.payments.openRefunds}
            </Text>
            <QueryState isPending={refunds.isPending} error={refunds.error} refetch={refunds.refetch}>
              <PaymentsTable items={refunds.items} onAction={(p, a) => setAction({ p, a })} onOpen={setDetail} />
              <LoadMore hasNextPage={refunds.hasNextPage} isFetchingNextPage={refunds.isFetchingNextPage} fetchNextPage={refunds.fetchNextPage} />
            </QueryState>
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="webhooks">
          <Card withBorder>
            <WebhooksTab />
          </Card>
        </Tabs.Panel>
      </Tabs>
      {modal}
      <Drawer opened={!!detail} onClose={() => setDetail(null)} position="right" size="lg" title={detail?.reference}>
        {detail && (
          <Stack>
            <InfoGrid
              cols={2}
              items={[
                ['ID', <CopyText key="id" value={detail.id} display={detail.id.slice(0, 8)} />],
                [m.common.status, <StatusBadge key="s" value={detail.status} />],
                [m.common.amount, <Money key="a" toea={detail.amountToea} />],
                [m.payments.fee, <span key="f"><Money toea={detail.feeToea} /> ({detail.feeBearer})</span>],
                [m.payments.purpose, `${label(m.enums.purpose, detail.purpose)} · ${detail.purposeId.slice(0, 8)}`],
                [m.payments.adapter, `${detail.provider}/${detail.adapter}`],
                [m.payments.providerRef, detail.providerRef ?? '—'],
                [m.payments.msisdn, detail.msisdn ?? '—'],
                [m.payments.settled, formatDateTime(detail.settledAt)],
                [m.payments.expires, formatDateTime(detail.expiresAt)],
                [m.payments.failure, detail.failureReason ?? '—'],
                ['Idempotency-Key', <Tooltip key="k" label={detail.idempotencyKey}><Text size="xs" ff="monospace" truncate maw={200}>{detail.idempotencyKey}</Text></Tooltip>],
              ]}
            />
            <Text size="sm" fw={600}>
              {m.payments.raw}
            </Text>
            <Code block style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(detail.rawPayload, null, 2) ?? 'null'}
            </Code>
          </Stack>
        )}
      </Drawer>
    </>
  );
}

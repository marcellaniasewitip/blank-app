import { Alert, Button, Card, Group, Radio, Stack, Text, TextInput, Title } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type DisputeDetail } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { ActionModal } from '@/components/ActionModal';
import { InfoGrid } from '@/components/InfoGrid';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { QueryState } from '@/components/QueryState';
import { OrderStatusBadge, StatusBadge } from '@/components/StatusBadge';
import { fmt, humanize, label, m } from '@/i18n';
import { formatKina, parseKinaToToea, toeaToKinaInput } from '@/lib/money';
import { formatDateTime } from '@/lib/time';

type Decision = 'reject' | 'favour_driver' | 'favour_customer';

function ResolveModal({ d, onClose, onDone }: { d: DisputeDetail; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [decision, setDecision] = useState<Decision>('favour_customer');
  const [refund, setRefund] = useState(toeaToKinaInput(d.order.priceToea));
  const refundToea = refund.trim() ? parseKinaToToea(refund) : null;
  const refundError = decision === 'favour_customer' && refund.trim() && (refundToea === null || refundToea > d.order.priceToea) ? `${m.common.invalidAmount} (≤ ${formatKina(d.order.priceToea)})` : null;
  return (
    <ActionModal
      opened
      onClose={onClose}
      title={fmt(m.disputes.resolveTitle, { code: d.order.shortCode })}
      color={decision === 'favour_customer' ? 'grape' : decision === 'reject' ? 'gray' : 'teal'}
      confirmLabel={m.disputes.resolve}
      fields={[{ name: 'notes', label: m.disputes.resolutionNotes, type: 'textarea', required: true, maxLength: 2000 }]}
      validate={() => refundError}
      successMessage={m.disputes.resolved}
      onSubmit={async (v) => {
        await api.disputes.resolve(d.id, {
          decision,
          notes: v.notes,
          refundToea: decision === 'favour_customer' && refundToea !== null ? refundToea : undefined,
        });
        await onDone();
      }}
    >
      <Radio.Group label={m.disputes.decision} value={decision} onChange={(v) => setDecision(v as Decision)}>
        <Stack gap="xs" mt="xs">
          <Radio value="favour_customer" label={m.disputes.decisionCustomer} />
          <Radio value="favour_driver" label={m.disputes.decisionDriver} />
          <Radio value="reject" label={m.disputes.decisionReject} />
        </Stack>
      </Radio.Group>
      {decision === 'favour_customer' && (
        <TextInput
          label={m.disputes.refundAmount}
          leftSection="K"
          inputMode="decimal"
          value={refund}
          onChange={(e) => setRefund(e.currentTarget.value)}
          description={fmt(m.disputes.refundHint, { amount: formatKina(d.order.priceToea) })}
          error={refundError}
        />
      )}
    </ActionModal>
  );
}

export default function DisputeDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['dispute', id], queryFn: () => api.disputes.get(id) });
  const [modal, setModal] = useState<'investigate' | 'resolve' | null>(null);
  const d = q.data;
  const open = d && (d.status === 'open' || d.status === 'investigating');
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['dispute', id] }), qc.invalidateQueries({ queryKey: ['disputes'] }), qc.invalidateQueries({ queryKey: ['overview'] }), d && qc.invalidateQueries({ queryKey: ['order', d.orderId] })]);

  return (
    <QueryState isPending={q.isPending} error={q.error} refetch={q.refetch}>
      {d && (
        <>
          <PageHeader
            title={
              <Group gap="sm">
                {humanize(d.category)} <StatusBadge value={d.status} />
              </Group>
            }
            subtitle={`${d.order.shortCode} · ${formatDateTime(d.createdAt)}`}
            actions={
              <>
                {can('orders.view') && (
                  <Button component={Link} to={`/orders/${d.orderId}`} variant="default">
                    {m.disputes.viewOrder}
                  </Button>
                )}
                {d.status === 'open' && (
                  <Button variant="light" onClick={() => setModal('investigate')}>
                    {m.disputes.investigate}
                  </Button>
                )}
                {open && <Button onClick={() => setModal('resolve')}>{m.disputes.resolve}</Button>}
              </>
            }
          />
          <Stack maw={1000}>
            <Card withBorder>
              <Title order={5} mb="xs">
                {m.disputes.description}
              </Title>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{d.description}</Text>
            </Card>
            <Card withBorder>
              <InfoGrid
                items={[
                  [m.disputes.raisedBy, `${d.raisedBy.name ?? '—'} (${label(m.enums.actorType, d.raisedByType)}) · ${d.raisedBy.phone}`],
                  [m.common.order, d.order.shortCode],
                  [m.disputes.orderStatus, <OrderStatusBadge key="s" status={d.order.status} />],
                  [m.disputes.beforeDispute, d.order.statusBeforeDispute ? label(m.enums.orderStatus, d.order.statusBeforeDispute) : '—'],
                  [m.orders.price, <Money key="p" toea={d.order.priceToea} />],
                  [m.orders.paymentMethod, `${label(m.enums.paymentMethod, d.order.paymentMethod)} · ${d.order.paymentStatus}`],
                ]}
              />
            </Card>
            {!open && (
              <Alert color={d.status === 'resolved' ? 'teal' : 'gray'} title={`${m.disputes.outcome}: ${d.outcome ? label(m.enums.disputeOutcome, d.outcome) : humanize(d.status)}`}>
                <Stack gap={4}>
                  {d.refundToea !== null && (
                    <Text size="sm">
                      {m.disputes.refund}: <Money toea={d.refundToea} />
                    </Text>
                  )}
                  {d.resolutionNotes && <Text size="sm">{d.resolutionNotes}</Text>}
                  <Text size="xs" c="dimmed">
                    {m.disputes.resolvedAt} {formatDateTime(d.resolvedAt)}
                  </Text>
                </Stack>
              </Alert>
            )}
          </Stack>
          <ActionModal
            opened={modal === 'investigate'}
            onClose={() => setModal(null)}
            title={m.disputes.investigate}
            successMessage={m.disputes.investigating}
            onSubmit={async () => {
              await api.disputes.investigate(d.id);
              await refresh();
            }}
          />
          {modal === 'resolve' && <ResolveModal d={d} onClose={() => setModal(null)} onDone={refresh} />}
        </>
      )}
    </QueryState>
  );
}

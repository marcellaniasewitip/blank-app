import { Badge, type MantineColor } from '@mantine/core';
import { label, m } from '@/i18n';

const ORDER_COLORS: Record<string, MantineColor> = {
  PENDING_PAYMENT: 'yellow',
  SEARCHING: 'cyan',
  ACCEPTED: 'blue',
  LOADING: 'indigo',
  EN_ROUTE: 'violet',
  ARRIVED: 'grape',
  DELIVERED: 'teal',
  COMPLETED: 'green',
  CANCELLED: 'gray',
  EXPIRED: 'gray',
  FAILED: 'red',
  DISPUTED: 'orange',
};

const GENERIC: Record<string, MantineColor> = {
  // drivers
  pending_docs: 'gray',
  pending_approval: 'yellow',
  approved: 'green',
  rejected: 'red',
  suspended: 'orange',
  // documents / topups
  pending: 'yellow',
  failed: 'red',
  // payments
  initiated: 'gray',
  succeeded: 'green',
  reversed: 'grape',
  expired: 'gray',
  // payouts
  requested: 'yellow',
  paid: 'green',
  // disputes
  open: 'orange',
  investigating: 'blue',
  resolved: 'green',
  // accounts
  active: 'green',
  disabled: 'gray',
  // order payment status
  unpaid: 'gray',
  refund_pending: 'orange',
  refunded: 'grape',
  missing: 'gray',
  accepted: 'green',
  declined: 'red',
  missed: 'gray',
};

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <Badge color={ORDER_COLORS[status] ?? 'gray'} variant="light">
      {label(m.enums.orderStatus, status)}
    </Badge>
  );
}

export function StatusBadge({ value, labels, color }: { value: string | null | undefined; labels?: Record<string, string>; color?: MantineColor }) {
  if (!value) return <>—</>;
  return (
    <Badge color={color ?? GENERIC[value] ?? 'gray'} variant="light">
      {labels ? label(labels, value) : label({}, value)}
    </Badge>
  );
}

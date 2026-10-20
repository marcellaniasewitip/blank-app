import { Badge, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton, type MantineColor } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { IconAlertTriangle, IconCash, IconChartBar, IconCoins, IconReceipt, IconReceiptRefund, IconSteeringWheel, IconTruckDelivery, IconWallet } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ORDER_STATUSES } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import type { PermissionRequirement } from '@/auth/permissions';
import { PageHeader } from '@/components/PageHeader';
import { Empty, QueryState } from '@/components/QueryState';
import { OrderStatusBadge } from '@/components/StatusBadge';
import { config } from '@/config';
import { fmt, label, m } from '@/i18n';
import { formatKina } from '@/lib/money';
import { formatDate } from '@/lib/time';
import { useRealtime } from '@/realtime/RealtimeProvider';

function Stat({ title, value, hint, icon, color, testId }: { title: string; value: ReactNode; hint?: string; icon: ReactNode; color: MantineColor; testId?: string }) {
  return (
    <Card withBorder data-testid={testId} className="cw-stat" style={{ '--cw-stat-color': `var(--mantine-color-${color}-6)` } as React.CSSProperties} p={{ base: 'sm', sm: 'md' }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} lh={1.3}>
          {title}
        </Text>
        <ThemeIcon variant="light" color={color} radius="md" size="lg">
          {icon}
        </ThemeIcon>
      </Group>
      <Text fz={{ base: 20, sm: 28 }} fw={700} mt={4} c={`${color}.8`}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Card>
  );
}

export default function OverviewPage() {
  const { connected } = useRealtime();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['overview'], queryFn: api.overview, refetchInterval: connected ? 60_000 : config.pollMs.overview });
  const o = q.data;

  const queues: { key: string; label: string; count: number; to: string; icon: ReactNode; perm: PermissionRequirement }[] = o
    ? [
        { key: 'drivers', label: m.overview.driverApprovals, count: o.pending.driverApprovals, to: '/drivers?status=pending_approval', icon: <IconSteeringWheel size={18} />, perm: 'drivers.view' },
        { key: 'topups', label: m.overview.topups, count: o.pending.topups, to: '/topups', icon: <IconCoins size={18} />, perm: 'wallet.view' },
        { key: 'payouts', label: m.overview.payouts, count: o.pending.payouts, to: '/payouts', icon: <IconCash size={18} />, perm: 'payouts.process' },
        { key: 'disputes', label: m.overview.disputes, count: o.pending.disputes, to: '/disputes', icon: <IconAlertTriangle size={18} />, perm: 'disputes.resolve' },
        { key: 'manual', label: m.overview.manualPayments, count: o.pending.manualPayments, to: '/payments?purpose=order&status=initiated,pending&adapter=manual', icon: <IconReceipt size={18} />, perm: 'payments.view' },
        { key: 'refunds', label: m.overview.refunds, count: o.pending.refunds, to: '/payments?tab=refunds', icon: <IconReceiptRefund size={18} />, perm: 'payments.view' },
      ]
    : [];

  const chart = o ? ORDER_STATUSES.filter((s) => o.ordersToday.byStatus[s]).map((s) => ({ status: label(m.enums.orderStatus, s), count: o.ordersToday.byStatus[s] ?? 0 })) : [];

  return (
    <>
      <PageHeader title={m.overview.title} subtitle={o ? `${m.overview.today}: ${formatDate(new Date())}` : undefined} />
      <QueryState isPending={q.isPending} error={q.error} refetch={q.refetch}>
        {o && (
          <Stack>
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing={{ base: 'xs', sm: 'md' }}>
              <Stat title={m.overview.ordersToday} value={o.ordersToday.total} icon={<IconTruckDelivery size={20} />} color="ocean" testId="stat-orders" />
              <Stat title={m.overview.activeDrivers} value={o.activeDrivers} icon={<IconSteeringWheel size={20} />} color="teal" testId="stat-drivers" />
              <Stat title={m.overview.revenue} value={formatKina(o.revenueTodayToea)} hint={m.overview.revenueHint} icon={<IconWallet size={20} />} color="violet" testId="stat-revenue" />
              <Stat title={m.overview.gmv} value={formatKina(o.gmvTodayToea)} hint={fmt(m.overview.gmvHint, { count: o.completedToday })} icon={<IconChartBar size={20} />} color="orange" testId="stat-gmv" />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <Card withBorder>
                <Title order={5} mb="sm">
                  {m.overview.byStatus}
                </Title>
                {o.ordersToday.total === 0 ? (
                  <Empty>{m.overview.noOrders}</Empty>
                ) : (
                  <Stack>
                    <BarChart h={200} data={chart} dataKey="status" series={[{ name: 'count', color: 'ocean.6', label: m.orders.title }]} />
                    <Group gap="xs">
                      {ORDER_STATUSES.filter((s) => o.ordersToday.byStatus[s]).map((s) => (
                        <UnstyledButton key={s} component={Link} to={`/orders?status=${s}`}>
                          <Group gap={4}>
                            <OrderStatusBadge status={s} />
                            <Text size="sm" fw={600}>
                              {o.ordersToday.byStatus[s]}
                            </Text>
                          </Group>
                        </UnstyledButton>
                      ))}
                    </Group>
                  </Stack>
                )}
              </Card>
              <Card withBorder>
                <Title order={5} mb="sm">
                  {m.overview.pending}
                </Title>
                <Stack gap="xs">
                  {queues
                    .filter((qq) => can(qq.perm))
                    .map((qq) => (
                      <UnstyledButton key={qq.key} component={Link} to={qq.to} data-testid={`queue-${qq.key}`}>
                        <Group justify="space-between" p="xs" wrap="nowrap" className="cw-queue" data-hot={qq.count > 0 || undefined}>
                          <Group gap="sm">
                            <ThemeIcon variant="light" color={qq.count ? 'orange' : 'ocean'}>
                              {qq.icon}
                            </ThemeIcon>
                            <Text size="sm">{qq.label}</Text>
                          </Group>
                          <Badge color={qq.count ? 'orange' : 'gray'} size="lg" variant={qq.count ? 'filled' : 'light'}>
                            {qq.count}
                          </Badge>
                        </Group>
                      </UnstyledButton>
                    ))}
                </Stack>
              </Card>
            </SimpleGrid>
          </Stack>
        )}
      </QueryState>
    </>
  );
}

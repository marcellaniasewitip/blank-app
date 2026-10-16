import { Anchor, Button, Card, Grid, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { BarChart, DonutChart, LineChart } from '@mantine/charts';
import { IconDownload } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DailyRow, type RangeQuery } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { DateRangeFilter } from '@/components/DateRange';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { Empty, QueryState } from '@/components/QueryState';
import { m } from '@/i18n';
import { filenameFromDisposition, saveBlob } from '@/lib/download';
import { formatKina } from '@/lib/money';
import { notifyError, notifySuccess } from '@/lib/notify';
import { lastNDays, localDayEndExclusiveIso, localDayStartIso, type YmdRange } from '@/lib/time';

const kinaFmt = (v: number) => formatKina(Math.round(v));

function sum(rows: DailyRow[], k: keyof DailyRow): number {
  return rows.reduce((a, r) => a + (r[k] as number), 0);
}

export default function ReportsPage() {
  const { can } = useAuth();
  const [range, setRange] = useState<YmdRange>(lastNDays(30));
  const [downloading, setDownloading] = useState<string | null>(null);
  const q: RangeQuery = { from: localDayStartIso(range.from), to: localDayEndExclusiveIso(range.to) };

  const daily = useQuery({ queryKey: ['reports', 'daily', q], queryFn: () => api.reports.daily(q) });
  const payments = useQuery({ queryKey: ['reports', 'payments', q], queryFn: () => api.reports.payments(q) });
  const drivers = useQuery({ queryKey: ['reports', 'drivers', q], queryFn: () => api.reports.drivers(q) });

  const download = async (kind: 'daily' | 'orders' | 'payments') => {
    setDownloading(kind);
    try {
      const res = await api.reports.csv(kind, q);
      const blob = await res.blob();
      saveBlob(blob, filenameFromDisposition(res.headers.get('Content-Disposition'), `cooper-waters-${kind}-${range.from}_${range.to}.csv`));
      notifySuccess(m.reports.exported);
    } catch (err) {
      notifyError(err);
    } finally {
      setDownloading(null);
    }
  };

  const rows = daily.data ?? [];
  const p = payments.data;
  const methodData = p
    ? [
        { name: m.reports.cash, value: p.cash.amountToea, color: 'teal.6' },
        { name: m.reports.cellmoneyOrders, value: p.cellmoney.orders.amountToea, color: 'blue.6' },
        { name: m.reports.cellmoneyTopups, value: p.cellmoney.topups.amountToea, color: 'indigo.4' },
        { name: m.reports.bankTopups, value: p.bank.amountToea, color: 'orange.6' },
      ]
    : [];

  return (
    <>
      <PageHeader
        title={m.reports.title}
        subtitle={m.reports.rangeHint}
        actions={
          <Group gap="xs">
            {(['daily', 'orders', 'payments'] as const).map((k) => (
              <Button key={k} variant="light" leftSection={<IconDownload size={16} />} loading={downloading === k} onClick={() => void download(k)} data-testid={`csv-${k}`}>
                {k === 'daily' ? m.reports.exportDaily : k === 'orders' ? m.reports.exportOrders : m.reports.exportPayments}
              </Button>
            ))}
          </Group>
        }
      />
      <Card withBorder mb="md">
        <DateRangeFilter value={range} onChange={setRange} />
      </Card>
      <Stack>
        <Card withBorder>
          <Title order={5} mb="sm">
            {m.reports.daily}
          </Title>
          <QueryState isPending={daily.isPending} error={daily.error} refetch={daily.refetch}>
            {rows.length === 0 ? (
              <Empty />
            ) : (
              <Stack>
                <SimpleGrid cols={{ base: 1, lg: 2 }}>
                  <div>
                    <Text size="sm" fw={500} mb={4}>
                      {m.reports.chartOrders}
                    </Text>
                    <BarChart
                      h={220}
                      data={rows}
                      dataKey="day"
                      type="stacked"
                      series={[
                        { name: 'completed', label: m.reports.completed, color: 'green.6' },
                        { name: 'cancelled', label: m.reports.cancelled, color: 'gray.5' },
                        { name: 'expired', label: m.reports.expired, color: 'yellow.6' },
                        { name: 'failed', label: m.reports.failed, color: 'red.6' },
                      ]}
                      withLegend
                    />
                  </div>
                  <div>
                    <Text size="sm" fw={500} mb={4}>
                      {m.reports.chartRevenue}
                    </Text>
                    <LineChart
                      h={220}
                      data={rows}
                      dataKey="day"
                      valueFormatter={kinaFmt}
                      series={[
                        { name: 'gmv_toea', label: m.reports.gmv, color: 'blue.6' },
                        { name: 'commission_toea', label: m.reports.commission, color: 'teal.6' },
                      ]}
                      withLegend
                      curveType="monotone"
                    />
                  </div>
                </SimpleGrid>
                <Table.ScrollContainer minWidth={900}>
                  <Table striped fz="sm" data-testid="daily-table">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{m.reports.day}</Table.Th>
                        <Table.Th ta="right">{m.reports.orders}</Table.Th>
                        <Table.Th ta="right">{m.reports.completed}</Table.Th>
                        <Table.Th ta="right">{m.reports.cancelled}</Table.Th>
                        <Table.Th ta="right">{m.reports.expired}</Table.Th>
                        <Table.Th ta="right">{m.reports.failed}</Table.Th>
                        <Table.Th ta="right">{m.reports.gmv}</Table.Th>
                        <Table.Th ta="right">{m.reports.commission}</Table.Th>
                        <Table.Th ta="right">{m.reports.cash}</Table.Th>
                        <Table.Th ta="right">{m.reports.cellmoney}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {rows.map((r) => (
                        <Table.Tr key={r.day}>
                          <Table.Td ff="monospace">{r.day}</Table.Td>
                          <Table.Td ta="right">{r.orders}</Table.Td>
                          <Table.Td ta="right">{r.completed}</Table.Td>
                          <Table.Td ta="right">{r.cancelled}</Table.Td>
                          <Table.Td ta="right">{r.expired}</Table.Td>
                          <Table.Td ta="right">{r.failed}</Table.Td>
                          <Table.Td ta="right"><Money toea={r.gmv_toea} /></Table.Td>
                          <Table.Td ta="right"><Money toea={r.commission_toea} /></Table.Td>
                          <Table.Td ta="right"><Money toea={r.cod_toea} /></Table.Td>
                          <Table.Td ta="right"><Money toea={r.cellmoney_toea} /></Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                    <Table.Tfoot>
                      <Table.Tr fw={700}>
                        <Table.Td>{m.reports.totals}</Table.Td>
                        <Table.Td ta="right">{sum(rows, 'orders')}</Table.Td>
                        <Table.Td ta="right">{sum(rows, 'completed')}</Table.Td>
                        <Table.Td ta="right">{sum(rows, 'cancelled')}</Table.Td>
                        <Table.Td ta="right">{sum(rows, 'expired')}</Table.Td>
                        <Table.Td ta="right">{sum(rows, 'failed')}</Table.Td>
                        <Table.Td ta="right"><Money toea={sum(rows, 'gmv_toea')} /></Table.Td>
                        <Table.Td ta="right"><Money toea={sum(rows, 'commission_toea')} /></Table.Td>
                        <Table.Td ta="right"><Money toea={sum(rows, 'cod_toea')} /></Table.Td>
                        <Table.Td ta="right"><Money toea={sum(rows, 'cellmoney_toea')} /></Table.Td>
                      </Table.Tr>
                    </Table.Tfoot>
                  </Table>
                </Table.ScrollContainer>
              </Stack>
            )}
          </QueryState>
        </Card>
        <Grid>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Card withBorder h="100%">
              <Title order={5} mb="sm">
                {m.reports.paymentsByMethod}
              </Title>
              <QueryState isPending={payments.isPending} error={payments.error} refetch={payments.refetch}>
                {p && (
                  <Stack>
                    {methodData.some((d) => d.value > 0) && (
                      <Group justify="center">
                        <DonutChart data={methodData} valueFormatter={kinaFmt} withLabelsLine={false} size={160} thickness={26} tooltipDataSource="segment" />
                      </Group>
                    )}
                    <Table fz="sm" data-testid="payments-report">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{m.common.method}</Table.Th>
                          <Table.Th ta="right">{m.reports.count}</Table.Th>
                          <Table.Th ta="right">{m.common.amount}</Table.Th>
                          <Table.Th ta="right">{m.reports.fees}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        <Table.Tr>
                          <Table.Td>{m.reports.cash}</Table.Td>
                          <Table.Td ta="right">{p.cash.orders}</Table.Td>
                          <Table.Td ta="right"><Money toea={p.cash.amountToea} /></Table.Td>
                          <Table.Td ta="right">—</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td>{m.reports.cellmoneyOrders}</Table.Td>
                          <Table.Td ta="right">{p.cellmoney.orders.count}</Table.Td>
                          <Table.Td ta="right"><Money toea={p.cellmoney.orders.amountToea} /></Table.Td>
                          <Table.Td ta="right"><Money toea={p.cellmoney.orders.feesToea} /></Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td>{m.reports.cellmoneyTopups}</Table.Td>
                          <Table.Td ta="right">{p.cellmoney.topups.count}</Table.Td>
                          <Table.Td ta="right"><Money toea={p.cellmoney.topups.amountToea} /></Table.Td>
                          <Table.Td ta="right"><Money toea={p.cellmoney.topups.feesToea} /></Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td>{m.reports.bankTopups}</Table.Td>
                          <Table.Td ta="right">{p.bank.topups}</Table.Td>
                          <Table.Td ta="right"><Money toea={p.bank.amountToea} /></Table.Td>
                          <Table.Td ta="right">—</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td>{m.reports.refunds}</Table.Td>
                          <Table.Td ta="right">{p.refunds.count}</Table.Td>
                          <Table.Td ta="right"><Money toea={-p.refunds.amountToea} colored /></Table.Td>
                          <Table.Td />
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td>{m.reports.payouts}</Table.Td>
                          <Table.Td ta="right">{p.payouts.count}</Table.Td>
                          <Table.Td ta="right"><Money toea={-p.payouts.amountToea} colored /></Table.Td>
                          <Table.Td />
                        </Table.Tr>
                        <Table.Tr fw={700}>
                          <Table.Td>{m.reports.netCommission}</Table.Td>
                          <Table.Td />
                          <Table.Td ta="right"><Money toea={p.platformCommissionNetToea} /></Table.Td>
                          <Table.Td />
                        </Table.Tr>
                      </Table.Tbody>
                    </Table>
                  </Stack>
                )}
              </QueryState>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Card withBorder h="100%">
              <Title order={5} mb="sm">
                {m.reports.drivers}
              </Title>
              <QueryState isPending={drivers.isPending} error={drivers.error} refetch={drivers.refetch}>
                {!drivers.data?.length ? (
                  <Empty />
                ) : (
                  <Table striped fz="sm" data-testid="drivers-report">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{m.common.driver}</Table.Th>
                        <Table.Th ta="right">{m.reports.completed}</Table.Th>
                        <Table.Th ta="right">{m.reports.gmv}</Table.Th>
                        <Table.Th ta="right">{m.reports.commission}</Table.Th>
                        <Table.Th ta="right">★</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {drivers.data.map((d) => (
                        <Table.Tr key={d.driver_id}>
                          <Table.Td>
                            {can('drivers.view') ? (
                              <Anchor component={Link} to={`/drivers/${d.driver_id}`} size="sm">
                                {d.name ?? d.phone}
                              </Anchor>
                            ) : (
                              (d.name ?? d.phone)
                            )}
                          </Table.Td>
                          <Table.Td ta="right">{d.completed}</Table.Td>
                          <Table.Td ta="right"><Money toea={d.gmv_toea} /></Table.Td>
                          <Table.Td ta="right"><Money toea={d.commission_toea} /></Table.Td>
                          <Table.Td ta="right">{d.rating_avg ? d.rating_avg.toFixed(1) : '—'}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
              </QueryState>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </>
  );
}

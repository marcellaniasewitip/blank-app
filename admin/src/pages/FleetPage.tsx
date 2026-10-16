import { Anchor, Badge, Card, Grid, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Circle, CircleMarker, Polygon, Popup, Tooltip } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { api, type FleetDriver } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { MapBase } from '@/components/MapBase';
import { PageHeader } from '@/components/PageHeader';
import { QueryState } from '@/components/QueryState';
import { OrderStatusBadge } from '@/components/StatusBadge';
import { config } from '@/config';
import { fmt, m } from '@/i18n';
import { timeAgo } from '@/lib/time';
import { useRealtime } from '@/realtime/RealtimeProvider';

type MarkerKind = 'active' | 'online' | 'stale' | 'offline';

function markerKind(d: FleetDriver): MarkerKind {
  if (d.activeOrder) return 'active';
  if (!d.online) return 'offline';
  return d.stale ? 'stale' : 'online';
}

const COLORS: Record<MarkerKind, string> = { active: '#7048e8', online: '#2f9e44', stale: '#f08c00', offline: '#868e96' };
const LABELS: Record<MarkerKind, string> = { active: m.fleet.legendActive, online: m.fleet.legendOnline, stale: m.fleet.legendStale, offline: m.fleet.legendOffline };

export default function FleetPage() {
  const { connected } = useRealtime();
  const { can } = useAuth();
  const fleet = useQuery({ queryKey: ['fleet'], queryFn: api.fleet, refetchInterval: connected ? 60_000 : config.pollMs.fleet });
  const depots = useQuery({ queryKey: ['depots'], queryFn: api.depots.list, staleTime: 300_000 });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.all, staleTime: 300_000, retry: false, enabled: can('settings.edit') });
  const defaultRadius = (settings.data?.['depot.geofence_radius_m']?.value as number | undefined) ?? 150;
  const drivers = (fleet.data ?? []).filter((d) => d.lat !== null && d.lng !== null);
  const online = drivers.filter((d) => d.online).length;

  return (
    <>
      <PageHeader title={m.fleet.title} subtitle={`${fmt(m.fleet.drivers, { count: drivers.length })} · ${fmt(m.fleet.onlineCount, { count: online })}`} />
      <QueryState isPending={fleet.isPending} error={fleet.error} refetch={fleet.refetch}>
        <Grid>
          <Grid.Col span={{ base: 12, md: 9 }}>
            <Card withBorder p={0}>
              <MapBase height="calc(100vh - 190px)">
                {(depots.data ?? []).map((dp) =>
                  dp.geofencePolygon ? (
                    <Polygon key={dp.id} positions={dp.geofencePolygon.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number])} pathOptions={{ color: '#1c7ed6', weight: 1, fillOpacity: 0.1 }}>
                      <Tooltip>{`${m.fleet.depot}: ${dp.name}`}</Tooltip>
                    </Polygon>
                  ) : (
                    <Circle key={dp.id} center={[dp.lat, dp.lng]} radius={dp.geofenceRadiusM ?? defaultRadius} pathOptions={{ color: '#1c7ed6', weight: 1, fillOpacity: 0.1 }}>
                      <Tooltip>{`${m.fleet.depot}: ${dp.name}`}</Tooltip>
                    </Circle>
                  ),
                )}
                {drivers.map((d) => {
                  const kind = markerKind(d);
                  return (
                    <CircleMarker
                      key={d.driverId}
                      center={[d.lat!, d.lng!]}
                      radius={kind === 'active' ? 10 : 8}
                      pathOptions={{ color: '#fff', weight: 2, fillColor: COLORS[kind], fillOpacity: 0.95 }}
                    >
                      <Tooltip>{`${d.name ?? d.phone} · ${d.plate ?? ''}`}</Tooltip>
                      <Popup>
                        <Stack gap={4}>
                          <Anchor component={Link} to={`/drivers/${d.driverId}`} fw={600}>
                            {d.name ?? d.phone}
                          </Anchor>
                          <Text size="xs">
                            {d.phone} · {d.plate ?? '—'}
                          </Text>
                          <Text size="xs">
                            {LABELS[kind]} · {m.fleet.lastSeen} {timeAgo(d.lastSeenAt)}
                          </Text>
                          {d.activeOrder && (
                            <Group gap={4}>
                              <Anchor component={Link} to={`/orders/${d.activeOrder.id}`} size="xs">
                                {d.activeOrder.shortCode}
                              </Anchor>
                              <OrderStatusBadge status={d.activeOrder.status} />
                            </Group>
                          )}
                        </Stack>
                      </Popup>
                    </CircleMarker>
                  );
                })}
                {drivers
                  .filter((d) => d.activeOrder)
                  .map((d) => (
                    <CircleMarker key={`dest-${d.driverId}`} center={[d.activeOrder!.deliveryLat, d.activeOrder!.deliveryLng]} radius={5} pathOptions={{ color: COLORS.active, dashArray: '2 3', fillOpacity: 0.2 }}>
                      <Tooltip>{d.activeOrder!.shortCode}</Tooltip>
                    </CircleMarker>
                  ))}
              </MapBase>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Card withBorder>
              <Group gap="xs" mb="sm">
                {(Object.keys(COLORS) as MarkerKind[]).map((k) => (
                  <Badge key={k} variant="dot" color={COLORS[k]} styles={{ root: { '--badge-dot-color': COLORS[k] } as React.CSSProperties }}>
                    {LABELS[k]}
                  </Badge>
                ))}
              </Group>
              <ScrollArea h="calc(100vh - 290px)">
                <Stack gap="xs" data-testid="fleet-list">
                  {drivers.length === 0 && <Text c="dimmed">{m.fleet.noLocation}</Text>}
                  {drivers.map((d) => (
                    <Group key={d.driverId} justify="space-between" wrap="nowrap">
                      <Stack gap={0}>
                        <Anchor component={Link} to={`/drivers/${d.driverId}`} size="sm">
                          {d.name ?? d.phone}
                        </Anchor>
                        <Text size="xs" c="dimmed">
                          {d.plate ?? '—'} · {timeAgo(d.lastSeenAt)}
                        </Text>
                      </Stack>
                      <Badge size="xs" style={{ background: COLORS[markerKind(d)] }}>
                        {LABELS[markerKind(d)]}
                      </Badge>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea>
            </Card>
          </Grid.Col>
        </Grid>
      </QueryState>
    </>
  );
}

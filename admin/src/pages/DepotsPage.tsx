import { Alert, Badge, Button, Card, Grid, Group, NavLink, NumberInput, SegmentedControl, Stack, Switch, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { Circle, Marker, Polygon, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { api, errorMessage, type Depot } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { ActionModal } from '@/components/ActionModal';
import { MapBase } from '@/components/MapBase';
import { PageHeader } from '@/components/PageHeader';
import { QueryState } from '@/components/QueryState';
import { config } from '@/config';
import { fmt, m } from '@/i18n';
import { circleToLatLngs, isValidLatLng, latLngsToPolygon, polygonToLatLngs, type LatLng } from '@/lib/geo';
import { notifyError, notifySuccess } from '@/lib/notify';

interface Draft {
  id: string | null;
  name: string;
  lat: number;
  lng: number;
  active: boolean;
  mode: 'radius' | 'polygon';
  radius: number | '';
  points: LatLng[];
}

const pinIcon = L.divIcon({
  className: 'cw-pin',
  html: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C7 0 0 6.5 0 14.5 0 25 15 40 15 40s15-15 15-25.5C30 6.5 23 0 15 0z" fill="#1c7ed6" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#fff"/></svg>',
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});
const vertexIcon = L.divIcon({ className: 'cw-vertex', iconSize: [12, 12], iconAnchor: [6, 6] });

function toDraft(d: Depot): Draft {
  return {
    id: d.id,
    name: d.name,
    lat: d.lat,
    lng: d.lng,
    active: d.active,
    mode: d.geofencePolygon ? 'polygon' : 'radius',
    radius: d.geofenceRadiusM ?? '',
    points: polygonToLatLngs(d.geofencePolygon),
  };
}

function newDraft(center: LatLng): Draft {
  return { id: null, name: '', lat: center[0], lng: center[1], active: true, mode: 'radius', radius: '', points: [] };
}

/** Recenters the map when another depot is selected. */
function Recenter({ center, token }: { center: LatLng; token: string }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return null;
}

function ClickToAdd({ enabled, onAdd }: { enabled: boolean; onAdd: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      if (enabled) onAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function CenterReporter({ onCenter }: { onCenter: (c: LatLng) => void }) {
  const map = useMapEvents({
    moveend() {
      const c = map.getCenter();
      onCenter([c.lat, c.lng]);
    },
  });
  return null;
}

export default function DepotsPage() {
  const { can } = useAuth();
  const editable = can('depots.manage');
  const qc = useQueryClient();
  const depots = useQuery({ queryKey: ['depots'], queryFn: api.depots.list });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.all, enabled: can('settings.edit'), staleTime: 300_000 });
  const defaultRadius = (settings.data?.['depot.geofence_radius_m']?.value as number | undefined) ?? 150;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mapCenter, setMapCenter] = useState<LatLng>(config.map.center);

  // Select the first depot once loaded.
  useEffect(() => {
    if (!draft && depots.data && depots.data.length > 0) setDraft(toDraft(depots.data[0]));
  }, [depots.data, draft]);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const select = (d: Depot) => {
    setDraft(toDraft(d));
    setDrawing(false);
    setError(null);
  };

  const validation = useMemo(() => {
    if (!draft) return null;
    if (!draft.name.trim()) return `${m.depots.name}: ${m.common.required}`;
    if (!isValidLatLng(draft.lat, draft.lng)) return `${m.depots.lat}/${m.depots.lng}`;
    if (draft.mode === 'radius' && draft.radius !== '' && (!Number.isInteger(draft.radius) || draft.radius < 10 || draft.radius > 5000)) return `${m.depots.radius}: 10–5000`;
    if (draft.mode === 'polygon' && draft.points.length < 3) return m.depots.polygonTooSmall;
    return null;
  }, [draft]);

  const save = async () => {
    if (!draft || validation) return;
    const body = {
      name: draft.name.trim(),
      lat: draft.lat,
      lng: draft.lng,
      active: draft.active,
      geofenceRadiusM: draft.mode === 'radius' && draft.radius !== '' ? draft.radius : null,
      geofencePolygon: draft.mode === 'polygon' ? latLngsToPolygon(draft.points) : null,
    };
    setBusy(true);
    setError(null);
    try {
      const saved = draft.id ? await api.depots.update(draft.id, body) : await api.depots.create(body);
      notifySuccess(draft.id ? m.depots.updated : m.depots.created);
      await qc.invalidateQueries({ queryKey: ['depots'] });
      setDraft(toDraft(saved));
      setDrawing(false);
    } catch (err) {
      setError(errorMessage(err));
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const center: LatLng = draft ? [draft.lat, draft.lng] : config.map.center;
  const radiusM = draft && draft.radius !== '' ? draft.radius : defaultRadius;

  return (
    <>
      <PageHeader
        title={m.depots.title}
        actions={
          editable && (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => {
                setDraft(newDraft(mapCenter));
                setDrawing(false);
                setError(null);
              }}
            >
              {m.depots.new}
            </Button>
          )
        }
      />
      <QueryState isPending={depots.isPending} error={depots.error} refetch={depots.refetch}>
        <Grid>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Card withBorder p="xs" data-testid="depot-list">
              {(depots.data ?? []).map((d) => (
                <NavLink
                  key={d.id}
                  label={d.name}
                  active={draft?.id === d.id}
                  onClick={() => select(d)}
                  description={d.geofencePolygon ? m.depots.usesPolygon : d.geofenceRadiusM ? fmt(m.depots.usesRadius, { value: d.geofenceRadiusM }) : m.depots.usesDefault}
                  rightSection={!d.active ? <Badge size="xs" color="gray">{m.common.inactive}</Badge> : undefined}
                />
              ))}
              {draft && !draft.id && <NavLink label={draft.name || m.depots.new} active />}
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 9 }}>
            {!draft ? (
              <Card withBorder>
                <Text c="dimmed">{m.depots.selectOrCreate}</Text>
              </Card>
            ) : (
              <Stack>
                <Card withBorder>
                  <Grid>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                      <TextInput label={m.depots.name} value={draft.name} onChange={(e) => patch({ name: e.currentTarget.value })} disabled={!editable} withAsterisk maxLength={100} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, sm: 3 }}>
                      <NumberInput label={m.depots.lat} value={draft.lat} decimalScale={6} onChange={(v) => typeof v === 'number' && patch({ lat: v })} disabled={!editable} min={-90} max={90} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, sm: 3 }}>
                      <NumberInput label={m.depots.lng} value={draft.lng} decimalScale={6} onChange={(v) => typeof v === 'number' && patch({ lng: v })} disabled={!editable} min={-180} max={180} />
                    </Grid.Col>
                  </Grid>
                  <Group mt="md" align="flex-end" wrap="wrap">
                    <Stack gap={4}>
                      <Text size="sm" fw={500}>
                        {m.depots.geofence}
                      </Text>
                      <SegmentedControl
                        value={draft.mode}
                        disabled={!editable}
                        onChange={(v) => {
                          patch({ mode: v as Draft['mode'] });
                          setDrawing(v === 'polygon' && draft.points.length === 0);
                        }}
                        data={[
                          { value: 'radius', label: m.depots.modeRadius },
                          { value: 'polygon', label: m.depots.modePolygon },
                        ]}
                      />
                    </Stack>
                    {draft.mode === 'radius' ? (
                      <NumberInput
                        label={m.depots.radius}
                        description={fmt(m.depots.radiusDefault, { value: defaultRadius })}
                        value={draft.radius}
                        onChange={(v) => patch({ radius: v === '' ? '' : Number(v) })}
                        min={10}
                        max={5000}
                        step={10}
                        allowDecimal={false}
                        disabled={!editable}
                        w={260}
                      />
                    ) : (
                      editable && (
                        <Group gap="xs">
                          <Button size="xs" variant={drawing ? 'filled' : 'light'} color="orange" onClick={() => setDrawing((x) => !x)}>
                            {drawing ? m.depots.stopDrawing : m.depots.drawPolygon}
                          </Button>
                          <Button size="xs" variant="default" onClick={() => patch({ points: draft.points.slice(0, -1) })} disabled={!draft.points.length}>
                            {m.depots.undoPoint}
                          </Button>
                          <Button size="xs" variant="default" onClick={() => patch({ points: [] })} disabled={!draft.points.length}>
                            {m.depots.clearPolygon}
                          </Button>
                          <Button size="xs" variant="default" onClick={() => patch({ points: circleToLatLngs([draft.lat, draft.lng], radiusM, 8) })}>
                            {m.depots.polygonFromRadius}
                          </Button>
                          <Badge variant="light">{fmt(m.depots.points, { count: draft.points.length })}</Badge>
                        </Group>
                      )
                    )}
                    <Switch label={m.common.active} checked={draft.active} onChange={(e) => patch({ active: e.currentTarget.checked })} disabled={!editable} />
                  </Group>
                  <Text size="xs" c="dimmed" mt="xs">
                    {m.depots.pinHelp} {draft.mode === 'polygon' ? m.depots.polygonHelp : ''}
                  </Text>
                </Card>
                <Card withBorder p={0} style={{ cursor: drawing ? 'crosshair' : undefined }}>
                  <MapBase height={480} center={center} zoom={15}>
                    <Recenter center={center} token={draft.id ?? 'new'} />
                    <CenterReporter onCenter={setMapCenter} />
                    <ClickToAdd enabled={editable && draft.mode === 'polygon' && drawing} onAdd={(p) => patch({ points: [...draft.points, p] })} />
                    {(depots.data ?? [])
                      .filter((d) => d.id !== draft.id)
                      .map((d) =>
                        d.geofencePolygon ? (
                          <Polygon key={d.id} positions={polygonToLatLngs(d.geofencePolygon)} pathOptions={{ color: '#868e96', weight: 1, fillOpacity: 0.05 }}>
                            <Tooltip>{d.name}</Tooltip>
                          </Polygon>
                        ) : (
                          <Circle key={d.id} center={[d.lat, d.lng]} radius={d.geofenceRadiusM ?? defaultRadius} pathOptions={{ color: '#868e96', weight: 1, fillOpacity: 0.05 }}>
                            <Tooltip>{d.name}</Tooltip>
                          </Circle>
                        ),
                      )}
                    {draft.mode === 'radius' && <Circle center={center} radius={radiusM} pathOptions={{ color: '#1c7ed6', fillOpacity: 0.15 }} />}
                    {draft.mode === 'polygon' && draft.points.length >= 2 && <Polygon positions={draft.points} pathOptions={{ color: '#e8590c', fillOpacity: 0.15 }} />}
                    {draft.mode === 'polygon' &&
                      draft.points.map((p, i) => (
                        <Marker
                          key={`${i}-${p[0]}-${p[1]}`}
                          position={p}
                          icon={vertexIcon}
                          draggable={editable}
                          eventHandlers={{
                            dragend: (e) => {
                              const ll = (e.target as L.Marker).getLatLng();
                              patch({ points: draft.points.map((q, j) => (j === i ? ([ll.lat, ll.lng] as LatLng) : q)) });
                            },
                            click: () => editable && patch({ points: draft.points.filter((_, j) => j !== i) }),
                          }}
                        />
                      ))}
                    <Marker
                      position={center}
                      icon={pinIcon}
                      draggable={editable}
                      eventHandlers={{
                        dragend: (e) => {
                          const ll = (e.target as L.Marker).getLatLng();
                          patch({ lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6 });
                        },
                      }}
                    >
                      <Tooltip>{draft.name || m.depots.new}</Tooltip>
                    </Marker>
                  </MapBase>
                </Card>
                {error && <Alert color="red">{error}</Alert>}
                {editable && (
                  <Group justify="space-between">
                    {draft.id ? (
                      <Button color="red" variant="subtle" leftSection={<IconTrash size={16} />} onClick={() => setConfirmDelete(true)}>
                        {m.common.delete}
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Group>
                      {validation && (
                        <Text size="sm" c="red">
                          {validation}
                        </Text>
                      )}
                      <Button
                        variant="default"
                        onClick={() => {
                          const original = depots.data?.find((d) => d.id === draft.id);
                          setDraft(original ? toDraft(original) : null);
                          setDrawing(false);
                        }}
                      >
                        {m.common.reset}
                      </Button>
                      <Button onClick={save} loading={busy} disabled={!!validation}>
                        {draft.id ? m.common.save : m.common.create}
                      </Button>
                    </Group>
                  </Group>
                )}
              </Stack>
            )}
          </Grid.Col>
        </Grid>
      </QueryState>
      {draft?.id && (
        <ActionModal
          opened={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={fmt(m.depots.deleteTitle, { name: draft.name })}
          body={m.depots.deleteBody}
          color="red"
          confirmLabel={m.common.delete}
          successMessage={m.depots.deleted}
          onSubmit={async () => {
            await api.depots.remove(draft.id!);
            setDraft(null);
            await qc.invalidateQueries({ queryKey: ['depots'] });
          }}
        />
      )}
    </>
  );
}

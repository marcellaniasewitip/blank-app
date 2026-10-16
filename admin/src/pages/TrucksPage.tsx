import { Anchor, Button, Card, Group, Modal, NumberInput, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage, type TruckWithDriver } from '@/api';
import { LoadMore } from '@/components/CursorList';
import { useCursorList } from '@/components/useCursorList';
import { PageHeader } from '@/components/PageHeader';
import { Empty, QueryState } from '@/components/QueryState';
import { StatusBadge } from '@/components/StatusBadge';
import { fmt, m } from '@/i18n';
import { notifyError, notifySuccess } from '@/lib/notify';
import { formatDateTime } from '@/lib/time';

function EditTruck({ truck, onClose }: { truck: TruckWithDriver; onClose: () => void }) {
  const qc = useQueryClient();
  const [plate, setPlate] = useState(truck.plate);
  const [capacity, setCapacity] = useState<number | string>(truck.capacityLitres);
  const [active, setActive] = useState(truck.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plateOk = plate.trim().length >= 2 && plate.trim().length <= 20;
  const capOk = typeof capacity === 'number' && Number.isInteger(capacity) && capacity >= 100;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.trucks.update(truck.id, { plate: plate.trim(), capacityLitres: capacity as number, active });
      notifySuccess(m.trucks.updated);
      await qc.invalidateQueries({ queryKey: ['trucks'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>{fmt(m.trucks.editTitle, { plate: truck.plate })}</Text>} centered>
      <Stack>
        <TextInput label={m.trucks.plate} value={plate} onChange={(e) => setPlate(e.currentTarget.value.toUpperCase())} error={!plateOk ? '2–20' : undefined} />
        <NumberInput label={m.trucks.capacity} value={capacity} onChange={setCapacity} min={100} step={500} allowDecimal={false} thousandSeparator="," error={!capOk ? '≥ 100' : undefined} />
        <Switch label={m.common.active} checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />
        {error && <Text c="red" size="sm">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button onClick={save} loading={busy} disabled={!plateOk || !capOk}>
            {m.common.save}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function TrucksPage() {
  const [q, setQ] = useState('');
  const [dq] = useDebouncedValue(q.trim(), 350);
  const [editing, setEditing] = useState<TruckWithDriver | null>(null);
  const query = { q: dq || undefined };
  const list = useCursorList<TruckWithDriver>(['trucks', query], (p) => api.trucks.list({ ...query, ...p }));

  return (
    <>
      <PageHeader title={m.trucks.title} />
      <Card withBorder mb="md">
        <TextInput label={m.common.search} placeholder={m.trucks.searchPlaceholder} leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} w={260} />
      </Card>
      <Card withBorder>
        <QueryState isPending={list.isPending} error={list.error} refetch={list.refetch}>
          {list.items.length === 0 ? (
            <Empty />
          ) : (
            <Table.ScrollContainer minWidth={700}>
              <Table striped highlightOnHover fz="sm" data-testid="trucks-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{m.trucks.plate}</Table.Th>
                    <Table.Th ta="right">{m.trucks.capacity}</Table.Th>
                    <Table.Th>{m.trucks.driver}</Table.Th>
                    <Table.Th>{m.common.status}</Table.Th>
                    <Table.Th>{m.common.updated}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.items.map((t) => (
                    <Table.Tr key={t.id}>
                      <Table.Td ff="monospace" fw={600}>
                        {t.plate}
                      </Table.Td>
                      <Table.Td ta="right">{t.capacityLitres.toLocaleString('en')}</Table.Td>
                      <Table.Td>
                        <Anchor component={Link} to={`/drivers/${t.driverId}`} size="sm">
                          {t.driver.user.name ?? t.driver.user.phone}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>
                        <StatusBadge value={t.active ? 'active' : 'disabled'} />
                      </Table.Td>
                      <Table.Td>{formatDateTime(t.updatedAt)}</Table.Td>
                      <Table.Td>
                        <Button size="xs" variant="light" onClick={() => setEditing(t)}>
                          {m.common.edit}
                        </Button>
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
      {editing && <EditTruck truck={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

import { Alert, Button, Card, Group, Modal, NumberInput, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage, type Package } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { ActionModal } from '@/components/ActionModal';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { Empty, QueryState } from '@/components/QueryState';
import { StatusBadge } from '@/components/StatusBadge';
import { fmt, m } from '@/i18n';
import { formatKina, parseKinaToToea, toeaToKinaInput } from '@/lib/money';
import { notifyError, notifySuccess } from '@/lib/notify';

function PackageForm({ pkg, onClose }: { pkg: Package | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(pkg?.name ?? '');
  const [volume, setVolume] = useState<number | string>(pkg?.volumeLitres ?? 1000);
  const [price, setPrice] = useState(pkg ? toeaToKinaInput(pkg.priceToea) : '');
  const [sortOrder, setSortOrder] = useState<number | string>(pkg?.sortOrder ?? 0);
  const [active, setActive] = useState(pkg?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceToea = parseKinaToToea(price);
  const nameOk = name.trim().length >= 1 && name.trim().length <= 100;
  const volOk = typeof volume === 'number' && Number.isInteger(volume) && volume >= 1;
  const sortOk = typeof sortOrder === 'number' && Number.isInteger(sortOrder);
  const valid = nameOk && volOk && sortOk && priceToea !== null;

  const save = async () => {
    if (!valid || priceToea === null) return;
    const body = { name: name.trim(), volumeLitres: volume as number, priceToea, sortOrder: sortOrder as number, active };
    setBusy(true);
    setError(null);
    try {
      if (pkg) await api.packages.update(pkg.id, body);
      else await api.packages.create(body);
      notifySuccess(pkg ? m.packages.updated : m.packages.created);
      await qc.invalidateQueries({ queryKey: ['packages'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>{pkg ? fmt(m.packages.editTitle, { name: pkg.name }) : m.packages.new}</Text>} centered>
      <Stack>
        <TextInput label={m.packages.name} value={name} onChange={(e) => setName(e.currentTarget.value)} withAsterisk maxLength={100} data-autofocus />
        <NumberInput label={m.packages.volume} value={volume} onChange={setVolume} min={1} allowDecimal={false} thousandSeparator="," withAsterisk />
        <TextInput
          label={m.packages.price}
          leftSection="K"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.currentTarget.value)}
          error={price && priceToea === null ? m.common.invalidAmount : undefined}
          description={priceToea !== null ? `${formatKina(priceToea)} = ${priceToea} toea` : m.common.kinaHint}
          withAsterisk
          data-testid="package-price"
        />
        <NumberInput label={m.packages.sortOrder} value={sortOrder} onChange={setSortOrder} allowDecimal={false} />
        <Switch label={m.common.active} checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />
        {pkg && (
          <Text size="xs" c="dimmed">
            {m.packages.priceNote}
          </Text>
        )}
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button onClick={save} loading={busy} disabled={!valid}>
            {m.common.save}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function PackagesPage() {
  const { can } = useAuth();
  const editable = can('pricing.edit');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['packages'], queryFn: api.packages.list });
  const [editing, setEditing] = useState<Package | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Package | null>(null);

  return (
    <>
      <PageHeader
        title={m.packages.title}
        subtitle={m.packages.priceNote}
        actions={
          editable && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
              {m.packages.new}
            </Button>
          )
        }
      />
      <Card withBorder>
        <QueryState isPending={q.isPending} error={q.error} refetch={q.refetch}>
          {!q.data?.length ? (
            <Empty />
          ) : (
            <Table striped highlightOnHover fz="sm" data-testid="packages-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{m.packages.name}</Table.Th>
                  <Table.Th ta="right">{m.packages.volume}</Table.Th>
                  <Table.Th ta="right">{m.packages.price}</Table.Th>
                  <Table.Th ta="right">{m.packages.sortOrder}</Table.Th>
                  <Table.Th>{m.common.status}</Table.Th>
                  {editable && <Table.Th />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {q.data.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td fw={500}>{p.name}</Table.Td>
                    <Table.Td ta="right">{p.volumeLitres.toLocaleString('en')}</Table.Td>
                    <Table.Td ta="right">
                      <Money toea={p.priceToea} />
                    </Table.Td>
                    <Table.Td ta="right">{p.sortOrder}</Table.Td>
                    <Table.Td>
                      <StatusBadge value={p.active ? 'active' : 'disabled'} />
                    </Table.Td>
                    {editable && (
                      <Table.Td>
                        <Group gap="xs" justify="flex-end">
                          <Button size="xs" variant="light" onClick={() => setEditing(p)}>
                            {m.common.edit}
                          </Button>
                          <Button size="xs" variant="subtle" color="red" onClick={() => setDeleting(p)}>
                            {m.common.delete}
                          </Button>
                        </Group>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </QueryState>
      </Card>
      {editing && <PackageForm pkg={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ActionModal
        opened={!!deleting}
        onClose={() => setDeleting(null)}
        title={fmt(m.packages.deleteTitle, { name: deleting?.name ?? '' })}
        body={m.packages.deleteBody}
        color="red"
        confirmLabel={m.common.delete}
        successMessage={m.packages.deleted}
        onSubmit={async () => {
          if (!deleting) return;
          await api.packages.remove(deleting.id);
          await qc.invalidateQueries({ queryKey: ['packages'] });
        }}
      />
    </>
  );
}

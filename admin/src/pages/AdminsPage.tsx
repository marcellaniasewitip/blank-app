import { ActionIcon, Alert, Badge, Button, Card, Checkbox, Group, Menu, Modal, PasswordInput, Select, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Textarea } from '@mantine/core';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage, type AdminUser, type PermissionDef, type Role } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { ActionModal } from '@/components/ActionModal';
import { PageHeader } from '@/components/PageHeader';
import { Empty, QueryState } from '@/components/QueryState';
import { StatusBadge } from '@/components/StatusBadge';
import { fmt, m } from '@/i18n';
import { notifyError, notifySuccess } from '@/lib/notify';
import { formatDateTime } from '@/lib/time';

const strongPassword = (pw: string) => pw.length >= 12 && /[A-Za-z]/.test(pw) && /\d/.test(pw);

function NewAdminModal({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^\S+@\S+\.\S+$/.test(email) && name.trim() && strongPassword(password) && roleId;

  const save = async () => {
    if (!valid || !roleId) return;
    setBusy(true);
    setError(null);
    try {
      await api.access.createAdmin({ email: email.trim(), name: name.trim(), password, roleId });
      notifySuccess(m.admins.created);
      await qc.invalidateQueries({ queryKey: ['admins'] });
      await qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>{m.admins.newAdmin}</Text>} centered>
      <Stack>
        <TextInput label={m.common.email} type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} withAsterisk data-autofocus />
        <TextInput label={m.common.name} value={name} onChange={(e) => setName(e.currentTarget.value)} withAsterisk maxLength={80} />
        <PasswordInput
          label={m.admins.password}
          description={m.admins.passwordHint}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          error={password && !strongPassword(password) ? m.admins.passwordHint : undefined}
          withAsterisk
          autoComplete="new-password"
        />
        <Select label={m.admins.role} data={roles.map((r) => ({ value: r.id, label: r.name }))} value={roleId} onChange={setRoleId} withAsterisk />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button onClick={save} loading={busy} disabled={!valid}>
            {m.common.create}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function RoleModal({ role, permissions, onClose }: { role: Role | null; permissions: PermissionDef[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = permissions.reduce<Record<string, PermissionDef[]>>((acc, p) => {
    const g = p.key.split('.')[0];
    (acc[g] ??= []).push(p);
    return acc;
  }, {});

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim(), description: description.trim() || undefined, permissions: selected };
      if (role) await api.access.updateRole(role.id, body);
      else await api.access.createRole(body);
      notifySuccess(m.admins.roleSaved);
      await Promise.all([qc.invalidateQueries({ queryKey: ['roles'] }), qc.invalidateQueries({ queryKey: ['me'] })]);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>{role ? fmt(m.admins.editRole, { name: role.name }) : m.admins.newRole}</Text>} size="xl" centered>
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label={m.admins.roleName} value={name} onChange={(e) => setName(e.currentTarget.value)} withAsterisk maxLength={60} />
          <Textarea label={m.admins.roleDescription} value={description} onChange={(e) => setDescription(e.currentTarget.value)} maxLength={200} autosize />
        </SimpleGrid>
        <Group justify="space-between">
          <Text fw={500} size="sm">
            {m.admins.permissions} ({selected.length}/{permissions.length})
          </Text>
          <Group gap="xs">
            <Button size="xs" variant="subtle" onClick={() => setSelected(permissions.map((p) => p.key))}>
              {m.admins.selectAll}
            </Button>
            <Button size="xs" variant="subtle" onClick={() => setSelected([])}>
              {m.admins.clearAll}
            </Button>
          </Group>
        </Group>
        <Checkbox.Group value={selected} onChange={setSelected}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {Object.entries(groups).map(([g, perms]) => (
              <Card withBorder key={g} padding="sm">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>
                  {g}
                </Text>
                <Stack gap={6}>
                  {perms.map((p) => (
                    <Checkbox key={p.key} value={p.key} label={<Text size="sm" ff="monospace">{p.key}</Text>} description={p.description} />
                  ))}
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        </Checkbox.Group>
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button onClick={save} loading={busy} disabled={!name.trim()}>
            {m.common.save}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

type AdminAction = 'role' | 'disable' | 'enable' | 'resetTotp' | 'resetPassword';

export default function AdminsPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const admins = useQuery({ queryKey: ['admins'], queryFn: api.access.admins });
  const roles = useQuery({ queryKey: ['roles'], queryFn: api.access.roles });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: api.access.permissions, staleTime: Infinity });
  const [tab, setTab] = useState<string | null>('admins');
  const [newAdmin, setNewAdmin] = useState(false);
  const [roleEdit, setRoleEdit] = useState<Role | 'new' | null>(null);
  const [roleDelete, setRoleDelete] = useState<Role | null>(null);
  const [action, setAction] = useState<{ a: AdminUser; kind: AdminAction } | null>(null);
  const [newRoleId, setNewRoleId] = useState<string | null>(null);

  const refreshAdmins = () => Promise.all([qc.invalidateQueries({ queryKey: ['admins'] }), qc.invalidateQueries({ queryKey: ['roles'] })]);

  const actionModal = (() => {
    if (!action) return null;
    const { a, kind } = action;
    const close = () => setAction(null);
    switch (kind) {
      case 'role':
        return (
          <ActionModal
            opened
            onClose={close}
            title={`${m.admins.changeRole}: ${a.name}`}
            validate={() => (!newRoleId || newRoleId === a.role.id ? m.common.required : null)}
            successMessage={m.admins.updated}
            onSubmit={async () => {
              await api.access.updateAdmin(a.id, { roleId: newRoleId! });
              await refreshAdmins();
            }}
          >
            <Select label={m.admins.role} data={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} value={newRoleId} onChange={setNewRoleId} />
          </ActionModal>
        );
      case 'disable':
      case 'enable':
        return (
          <ActionModal
            opened
            onClose={close}
            title={fmt(kind === 'disable' ? m.admins.disableTitle : m.admins.enableTitle, { name: a.name })}
            body={kind === 'disable' ? m.admins.disableBody : undefined}
            color={kind === 'disable' ? 'red' : 'teal'}
            confirmLabel={kind === 'disable' ? m.admins.disable : m.admins.enable}
            successMessage={m.admins.updated}
            onSubmit={async () => {
              await api.access.updateAdmin(a.id, { status: kind === 'disable' ? 'disabled' : 'active' });
              await refreshAdmins();
            }}
          />
        );
      case 'resetTotp':
        return (
          <ActionModal
            opened
            onClose={close}
            title={fmt(m.admins.resetTotpTitle, { name: a.name })}
            body={m.admins.resetTotpBody}
            color="orange"
            confirmLabel={m.admins.resetTotp}
            successMessage={m.admins.updated}
            onSubmit={async () => {
              await api.access.updateAdmin(a.id, { resetTotp: true });
              await refreshAdmins();
            }}
          />
        );
      case 'resetPassword':
        return (
          <ActionModal
            opened
            onClose={close}
            title={fmt(m.admins.resetPasswordTitle, { name: a.name })}
            color="orange"
            confirmLabel={m.admins.resetPassword}
            fields={[{ name: 'password', label: m.admins.newPassword, type: 'password', required: true, description: m.admins.passwordHint, maxLength: 200 }]}
            validate={(v) => (strongPassword(v.password ?? '') ? null : m.admins.passwordHint)}
            successMessage={m.admins.updated}
            onSubmit={async (v) => {
              await api.access.updateAdmin(a.id, { password: v.password });
              await refreshAdmins();
            }}
          />
        );
    }
  })();

  return (
    <>
      <PageHeader
        title={m.admins.title}
        actions={
          tab === 'admins' ? (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setNewAdmin(true)} disabled={!roles.data}>
              {m.admins.newAdmin}
            </Button>
          ) : (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setRoleEdit('new')} disabled={!permissions.data}>
              {m.admins.newRole}
            </Button>
          )
        }
      />
      <Tabs value={tab} onChange={setTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="admins">{m.admins.tabAdmins}</Tabs.Tab>
          <Tabs.Tab value="roles">{m.admins.tabRoles}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="admins">
          <Card withBorder>
            <QueryState isPending={admins.isPending} error={admins.error} refetch={admins.refetch}>
              {!admins.data?.length ? (
                <Empty />
              ) : (
                <Table.ScrollContainer minWidth={900}>
                  <Table striped highlightOnHover fz="sm" data-testid="admins-table">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{m.common.name}</Table.Th>
                        <Table.Th>{m.common.email}</Table.Th>
                        <Table.Th>{m.admins.role}</Table.Th>
                        <Table.Th>{m.common.status}</Table.Th>
                        <Table.Th>{m.admins.totp}</Table.Th>
                        <Table.Th>{m.admins.lastLogin}</Table.Th>
                        <Table.Th />
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {admins.data.map((a) => {
                        const self = a.id === me?.id;
                        return (
                          <Table.Tr key={a.id}>
                            <Table.Td>
                              {a.name}{' '}
                              {self && (
                                <Badge size="xs" variant="outline">
                                  {m.admins.you}
                                </Badge>
                              )}
                            </Table.Td>
                            <Table.Td>{a.email}</Table.Td>
                            <Table.Td>{a.role.name}</Table.Td>
                            <Table.Td>
                              <StatusBadge value={a.status} />
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="light" color={a.totpEnabled ? 'teal' : 'gray'}>
                                {a.totpEnabled ? m.common.yes : m.common.no}
                              </Badge>
                            </Table.Td>
                            <Table.Td>{formatDateTime(a.lastLoginAt)}</Table.Td>
                            <Table.Td>
                              <Menu position="bottom-end" withinPortal>
                                <Menu.Target>
                                  <ActionIcon variant="subtle" aria-label={m.common.actions}>
                                    <IconDots size={16} />
                                  </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                  <Menu.Item
                                    disabled={self}
                                    onClick={() => {
                                      setNewRoleId(a.role.id);
                                      setAction({ a, kind: 'role' });
                                    }}
                                  >
                                    {m.admins.changeRole}
                                  </Menu.Item>
                                  <Menu.Item onClick={() => setAction({ a, kind: 'resetPassword' })}>{m.admins.resetPassword}</Menu.Item>
                                  <Menu.Item disabled={!a.totpEnabled} onClick={() => setAction({ a, kind: 'resetTotp' })}>
                                    {m.admins.resetTotp}
                                  </Menu.Item>
                                  {a.status === 'active' ? (
                                    <Menu.Item color="red" disabled={self} onClick={() => setAction({ a, kind: 'disable' })}>
                                      {m.admins.disable}
                                    </Menu.Item>
                                  ) : (
                                    <Menu.Item color="teal" onClick={() => setAction({ a, kind: 'enable' })}>
                                      {m.admins.enable}
                                    </Menu.Item>
                                  )}
                                </Menu.Dropdown>
                              </Menu>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </QueryState>
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="roles">
          <QueryState isPending={roles.isPending} error={roles.error} refetch={roles.refetch}>
            <SimpleGrid cols={{ base: 1, md: 2 }} data-testid="roles-grid">
              {(roles.data ?? []).map((r) => (
                <Card withBorder key={r.id}>
                  <Group justify="space-between" mb={4}>
                    <Group gap="xs">
                      <Text fw={600}>{r.name}</Text>
                      {r.isSystem && (
                        <Badge size="xs" variant="outline">
                          {m.admins.system}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {m.admins.adminCount}: {r.adminCount}
                    </Text>
                  </Group>
                  {r.description && (
                    <Text size="sm" c="dimmed" mb="xs">
                      {r.description}
                    </Text>
                  )}
                  <Group gap={4} mb="sm">
                    {r.permissions.map((p) => (
                      <Badge key={p} size="xs" variant="light" color="gray" tt="none">
                        {p}
                      </Badge>
                    ))}
                  </Group>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => setRoleEdit(r)} disabled={!permissions.data}>
                      {m.common.edit}
                    </Button>
                    {!r.isSystem && (
                      <Button size="xs" variant="subtle" color="red" onClick={() => setRoleDelete(r)} disabled={r.adminCount > 0}>
                        {m.common.delete}
                      </Button>
                    )}
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
          </QueryState>
        </Tabs.Panel>
      </Tabs>
      {newAdmin && roles.data && <NewAdminModal roles={roles.data} onClose={() => setNewAdmin(false)} />}
      {roleEdit && permissions.data && <RoleModal role={roleEdit === 'new' ? null : roleEdit} permissions={permissions.data} onClose={() => setRoleEdit(null)} />}
      <ActionModal
        opened={!!roleDelete}
        onClose={() => setRoleDelete(null)}
        title={fmt(m.admins.deleteRoleTitle, { name: roleDelete?.name ?? '' })}
        body={m.admins.deleteRoleBody}
        color="red"
        confirmLabel={m.common.delete}
        successMessage={m.admins.roleDeleted}
        onSubmit={async () => {
          if (!roleDelete) return;
          await api.access.deleteRole(roleDelete.id);
          await qc.invalidateQueries({ queryKey: ['roles'] });
        }}
      />
      {actionModal}
    </>
  );
}

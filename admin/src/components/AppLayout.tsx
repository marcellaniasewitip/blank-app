import { AppShell, Badge, Burger, Group, Menu, NavLink, ScrollArea, Text, ThemeIcon, Tooltip, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconDroplet, IconLogout, IconUserShield } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink as RouterNavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { filterByPermission } from '@/auth/permissions';
import { config } from '@/config';
import { m } from '@/i18n';
import { NAV, type NavItem } from '@/nav';
import { useRealtime } from '@/realtime/RealtimeProvider';

function NavEntry({ item, counts, onNavigate }: { item: NavItem; counts?: Record<string, number>; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const Icon = item.icon;
  const n = item.badge && counts ? counts[item.badge] : 0;
  const active = item.to === '/' ? pathname === '/' : !!item.to && pathname.startsWith(item.to);
  return (
    <NavLink
      component={RouterNavLink}
      to={item.to!}
      label={item.label}
      active={active}
      onClick={onNavigate}
      leftSection={Icon ? <Icon size={18} stroke={1.6} /> : undefined}
      rightSection={
        n ? (
          <Badge size="sm" color="red" circle={n < 10}>
            {n}
          </Badge>
        ) : undefined
      }
    />
  );
}

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { me, signOut, can } = useAuth();
  const { connected } = useRealtime();
  const nav = filterByPermission(NAV, me?.permissions);

  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: api.overview,
    enabled: can('dashboard.view'),
    refetchInterval: connected ? 120_000 : config.pollMs.overview,
  });
  const p = overview.data?.pending;
  const counts = p ? { driverApprovals: p.driverApprovals, topups: p.topups, payouts: p.payouts, disputes: p.disputes, payments: p.manualPayments + p.refunds } : undefined;

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <ThemeIcon variant="light" radius="xl">
              <IconDroplet size={18} />
            </ThemeIcon>
            <Text fw={700}>{m.app.name}</Text>
            <Text c="dimmed" size="sm">
              {m.app.subtitle}
            </Text>
          </Group>
          <Group gap="sm">
            {can('dashboard.view') && (
              <Tooltip label={connected ? 'Socket.IO /realtime' : `${config.pollMs.fleet / 1000}s`}>
                <Badge variant="dot" color={connected ? 'teal' : 'gray'} data-testid="realtime-status">
                  {connected ? m.app.realtimeOn : m.app.realtimeOff}
                </Badge>
              </Tooltip>
            )}
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <UnstyledButton>
                  <Group gap={6}>
                    <div style={{ textAlign: 'right' }}>
                      <Text size="sm" fw={500} lh={1.1}>
                        {me?.name}
                      </Text>
                      <Text size="xs" c="dimmed" lh={1.1}>
                        {me?.role.name}
                      </Text>
                    </div>
                    <IconChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{me?.email}</Menu.Label>
                <Menu.Item component={Link} to="/profile" leftSection={<IconUserShield size={16} />}>
                  {m.app.profile}
                </Menu.Item>
                <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={() => void signOut()}>
                  {m.app.signOut}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <ScrollArea>
          {nav.map((item) =>
            item.children ? (
              <div key={item.label}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" pt="md" pb={4}>
                  {item.label}
                </Text>
                {item.children.map((c) => (
                  <NavEntry key={c.to} item={c} counts={counts} onNavigate={close} />
                ))}
              </div>
            ) : (
              <NavEntry key={item.to} item={item} counts={counts} onNavigate={close} />
            ),
          )}
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

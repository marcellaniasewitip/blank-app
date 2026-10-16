import { Button, Center, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { errorMessage } from '@/api/client';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import type { PermissionRequirement } from '@/auth/permissions';
import { m } from '@/i18n';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, me, meError, refetchMe, signOut } = useAuth();
  const loc = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (!me && meError && !loading)
    return (
      <Center h="100vh">
        <Stack align="center" gap="xs" maw={420}>
          <Title order={4}>{m.app.error}</Title>
          <Text c="dimmed" ta="center">
            {errorMessage(meError)}
          </Text>
          <Group>
            <Button onClick={refetchMe}>{m.app.retry}</Button>
            <Button variant="default" onClick={() => void signOut()}>
              {m.app.signOut}
            </Button>
          </Group>
        </Stack>
      </Center>
    );
  if (loading || !me)
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  return <>{children}</>;
}

export function Forbidden() {
  return (
    <Center py={80}>
      <Stack align="center" gap="xs" maw={480}>
        <Title order={3}>{m.app.forbidden}</Title>
        <Text c="dimmed" ta="center">
          {m.app.forbiddenBody}
        </Text>
      </Stack>
    </Center>
  );
}

export function NotFound() {
  return (
    <Center py={80}>
      <Stack align="center" gap="xs">
        <Title order={3}>{m.app.notFound}</Title>
        <Text c="dimmed">{m.app.notFoundBody}</Text>
        <Button component={Link} to="/" variant="light">
          {m.app.backHome}
        </Button>
      </Stack>
    </Center>
  );
}

export function RequirePerm({ perm, children }: { perm: PermissionRequirement; children: ReactNode }) {
  const { can } = useAuth();
  return <>{can(perm) ? children : <Forbidden />}</>;
}

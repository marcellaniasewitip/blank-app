import { Alert, Badge, Button, Card, Code, Group, PinInput, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { api, errorMessage } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { InfoGrid } from '@/components/InfoGrid';
import { m } from '@/i18n';
import { notifyError, notifySuccess } from '@/lib/notify';

export default function ProfilePage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;

  const start = async () => {
    setBusy(true);
    try {
      setSetup(await api.auth.totpSetup());
      setCode('');
      setError(null);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const enable = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await api.auth.totpEnable(value);
      notifySuccess(m.profile.enabledToast);
      setSetup(null);
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={m.profile.title} />
      <Stack maw={900}>
        <Card withBorder>
          <InfoGrid
            items={[
              [m.common.name, me.name],
              [m.common.email, me.email],
              [m.profile.role, me.role.name],
            ]}
          />
        </Card>
        <Card withBorder>
          <Group justify="space-between" mb="sm">
            <Title order={4}>{m.profile.totp}</Title>
            <Badge color={me.totpEnabled ? 'teal' : 'gray'} data-testid="totp-status">
              {me.totpEnabled ? m.profile.totpEnabled : m.profile.totpDisabled}
            </Badge>
          </Group>
          {me.totpEnabled ? (
            <Text size="sm" c="dimmed">
              {m.profile.resetHint}
            </Text>
          ) : !setup ? (
            <Stack align="flex-start">
              <Text size="sm">{m.profile.totpIntro}</Text>
              <Button onClick={start} loading={busy}>
                {m.profile.setup}
              </Button>
            </Stack>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Stack align="center">
                <QRCodeSVG value={setup.otpauthUrl} size={200} marginSize={2} data-testid="totp-qr" />
              </Stack>
              <Stack>
                <Text size="sm">{m.profile.scan}</Text>
                <Text size="xs" c="dimmed">
                  {m.profile.secret}
                </Text>
                <Code style={{ wordBreak: 'break-all' }}>{setup.secret}</Code>
                <Text size="sm">{m.profile.enterCode}</Text>
                <PinInput length={6} type="number" oneTimeCode value={code} onChange={setCode} onComplete={(v) => void enable(v)} />
                {error && <Alert color="red">{error}</Alert>}
                <Group>
                  <Button onClick={() => void enable()} loading={busy} disabled={code.length !== 6}>
                    {m.profile.enable}
                  </Button>
                  <Button variant="default" onClick={() => setSetup(null)}>
                    {m.common.cancel}
                  </Button>
                </Group>
              </Stack>
            </SimpleGrid>
          )}
        </Card>
        <Card withBorder>
          <Title order={5} mb="xs">
            {m.profile.permissions}
          </Title>
          <Group gap={6}>
            {me.permissions.map((p) => (
              <Badge key={p} variant="outline" color="gray" tt="none">
                {p}
              </Badge>
            ))}
          </Group>
        </Card>
      </Stack>
    </>
  );
}

import { Alert, Anchor, Button, Center, Paper, PasswordInput, PinInput, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { IconDroplet } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { m } from '@/i18n';

export function LoginPage() {
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) return <Navigate to={from} replace />;

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.login({ email: email.trim(), password });
      if (res.mfaRequired) {
        setMfaToken(res.mfaToken);
      } else {
        signIn(res);
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitTotp = async (value = code) => {
    if (!mfaToken || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const pair = await api.auth.verifyTotp({ mfaToken, code: value });
      signIn(pair);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center mih="100vh" p="md" className="cw-login">
      <Paper shadow="xl" p={{ base: 'lg', sm: 'xl' }} w={400} maw="100%">
        <Stack>
          <Stack align="center" gap={4}>
            <ThemeIcon size={48} radius="xl" variant="light">
              <IconDroplet size={28} />
            </ThemeIcon>
            <Title order={3} ta="center">
              {mfaToken ? m.login.totpTitle : m.login.title}
            </Title>
          </Stack>
          {error && (
            <Alert color="red" title={m.login.failed} data-testid="login-error">
              {error}
            </Alert>
          )}
          {!mfaToken ? (
            <form onSubmit={submitLogin}>
              <Stack>
                <TextInput label={m.login.email} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
                <PasswordInput label={m.login.password} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
                <Button type="submit" loading={busy} fullWidth>
                  {m.login.submit}
                </Button>
              </Stack>
            </form>
          ) : (
            <Stack align="center">
              <Text size="sm" c="dimmed" ta="center">
                {m.login.totpBody}
              </Text>
              <PinInput
                length={6}
                type="number"
                oneTimeCode
                autoFocus
                value={code}
                onChange={setCode}
                onComplete={(v) => void submitTotp(v)}
                aria-label={m.login.totpCode}
              />
              <Button loading={busy} fullWidth onClick={() => void submitTotp()} disabled={code.length !== 6}>
                {m.login.verify}
              </Button>
              <Anchor
                component="button"
                size="sm"
                onClick={() => {
                  setMfaToken(null);
                  setCode('');
                  setError(null);
                }}
              >
                {m.login.back}
              </Anchor>
            </Stack>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}

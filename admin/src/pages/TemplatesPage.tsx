import { Badge, Button, Card, Code, Group, Progress, SimpleGrid, Stack, Switch, Text, TextInput, Textarea, Title } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type NotificationTemplate } from '@/api';
import { PageHeader } from '@/components/PageHeader';
import { QueryState } from '@/components/QueryState';
import { fmt, m } from '@/i18n';
import { checkSmsBody, toGsm7Safe } from '@/lib/gsm7';
import { notifyError, notifySuccess } from '@/lib/notify';

function variablesOf(...texts: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const t of texts) for (const mm of (t ?? '').matchAll(/\{\{\s*(\w+)\s*\}\}/g)) set.add(mm[1]);
  return [...set];
}

function SmsCounter({ body }: { body: string }) {
  const c = checkSmsBody(body);
  const pct = Math.min(100, (c.length / c.max) * 100);
  return (
    <Stack gap={2}>
      <Group justify="space-between">
        <Text size="xs" c={c.tooLong ? 'red' : 'dimmed'} data-testid="sms-counter">
          {fmt(m.templates.counter, { length: c.length, max: c.max })}
        </Text>
        {!c.gsm7 && (
          <Text size="xs" c="red">
            {fmt(m.templates.notGsm, { chars: c.invalidChars.map((ch) => JSON.stringify(ch)).join(' ') })}
          </Text>
        )}
      </Group>
      <Progress value={pct} size="xs" color={c.tooLong ? 'red' : pct > 85 ? 'yellow' : 'teal'} />
    </Stack>
  );
}

function TemplateCard({ t }: { t: NotificationTemplate }) {
  const qc = useQueryClient();
  const [pushTitle, setPushTitle] = useState(t.pushTitle ?? '');
  const [pushBody, setPushBody] = useState(t.pushBody ?? '');
  const [smsBody, setSmsBody] = useState(t.smsBody ?? '');
  const [critical, setCritical] = useState(t.critical);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPushTitle(t.pushTitle ?? '');
    setPushBody(t.pushBody ?? '');
    setSmsBody(t.smsBody ?? '');
    setCritical(t.critical);
  }, [t]);

  const sms = checkSmsBody(smsBody);
  const smsRequired = critical && !smsBody.trim();
  const dirty = pushTitle !== (t.pushTitle ?? '') || pushBody !== (t.pushBody ?? '') || smsBody !== (t.smsBody ?? '') || critical !== t.critical;
  const valid = (!smsBody || sms.ok) && !smsRequired && pushTitle.length <= 100 && pushBody.length <= 300;
  const fixable = smsBody !== toGsm7Safe(smsBody);

  const save = async () => {
    setBusy(true);
    try {
      await api.templates.update(t.key, {
        pushTitle: pushTitle.trim() ? pushTitle : null,
        pushBody: pushBody.trim() ? pushBody : null,
        smsBody: smsBody.trim() ? smsBody : null,
        critical,
      });
      notifySuccess(fmt(m.templates.saved, { key: t.key }));
      await qc.invalidateQueries({ queryKey: ['templates'] });
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const vars = variablesOf(t.pushTitle, t.pushBody, t.smsBody);

  return (
    <Card withBorder data-testid={`template-${t.key}`}>
      <Group justify="space-between" mb="sm">
        <Code fw={600}>{t.key}</Code>
        {t.critical && <Badge color="orange">SMS</Badge>}
      </Group>
      <Stack gap="sm">
        <TextInput label={m.templates.pushTitle} value={pushTitle} onChange={(e) => setPushTitle(e.currentTarget.value)} maxLength={100} />
        <Textarea label={m.templates.pushBody} value={pushBody} onChange={(e) => setPushBody(e.currentTarget.value)} maxLength={300} autosize minRows={2} />
        <Textarea
          label={m.templates.smsBody}
          value={smsBody}
          onChange={(e) => setSmsBody(e.currentTarget.value)}
          autosize
          minRows={2}
          maxLength={320}
          error={smsRequired ? m.common.required : sms.tooLong ? m.templates.tooLong : !sms.gsm7 ? ' ' : undefined}
        />
        <SmsCounter body={smsBody} />
        <Switch label={m.templates.critical} checked={critical} onChange={(e) => setCritical(e.currentTarget.checked)} />
        {vars.length > 0 && (
          <Text size="xs" c="dimmed">
            {m.templates.variables}: {vars.map((v) => `{{${v}}}`).join(' ')}
          </Text>
        )}
        <Group justify="flex-end">
          {fixable && (
            <Button size="xs" variant="subtle" onClick={() => setSmsBody(toGsm7Safe(smsBody))}>
              {m.templates.fixQuotes}
            </Button>
          )}
          <Button size="xs" onClick={save} loading={busy} disabled={!dirty || !valid}>
            {m.common.save}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export default function TemplatesPage() {
  const q = useQuery({ queryKey: ['templates'], queryFn: api.templates.list });
  return (
    <>
      <PageHeader title={m.templates.title} subtitle={m.templates.intro} />
      <QueryState isPending={q.isPending} error={q.error} refetch={q.refetch}>
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          {(q.data ?? []).map((t) => (
            <TemplateCard key={t.key} t={t} />
          ))}
        </SimpleGrid>
        {q.data?.length === 0 && <Title order={5}>{m.common.noData}</Title>}
      </QueryState>
    </>
  );
}

import { Autocomplete, Badge, Button, Card, Code, Group, NumberInput, Select, Stack, Switch, TagsInput, Text, TextInput, Title } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/api';
import { PageHeader } from '@/components/PageHeader';
import { QueryState } from '@/components/QueryState';
import { fmt, humanize, label, m } from '@/i18n';
import { formatKina, parseKinaToToea, toeaToKinaInput } from '@/lib/money';
import { notifyError, notifySuccess } from '@/lib/notify';
import { SETTING_GROUPS, settingGroup, settingKind, type SettingKind } from '@/lib/settingsMeta';

type Draft = string | number | boolean | string[];

function effectiveKind(kind: SettingKind, commissionType: string): SettingKind {
  if (kind.kind !== 'commissionValue') return kind;
  return commissionType === 'flat' ? { kind: 'money' } : { kind: 'number', min: 0, max: 100, unit: '%' };
}

function toDraft(kind: SettingKind, value: unknown): Draft {
  switch (kind.kind) {
    case 'money':
      return toeaToKinaInput(typeof value === 'number' ? value : 0);
    case 'boolean':
      return Boolean(value);
    case 'numberList':
    case 'stringList':
      return Array.isArray(value) ? value.map(String) : [];
    case 'integer':
    case 'number':
      return typeof value === 'number' ? value : '';
    default:
      return value === null || value === undefined ? '' : String(value);
  }
}

/** Editor draft → JSON value for PUT /admin/settings/:key, or an error message. */
function fromDraft(kind: SettingKind, draft: Draft): { value?: unknown; error?: string } {
  switch (kind.kind) {
    case 'money': {
      const t = parseKinaToToea(String(draft));
      return t === null ? { error: m.common.invalidAmount } : { value: t };
    }
    case 'boolean':
      return { value: Boolean(draft) };
    case 'integer': {
      if (typeof draft !== 'number' || !Number.isInteger(draft)) return { error: m.common.required };
      if (kind.min !== undefined && draft < kind.min) return { error: `≥ ${kind.min}` };
      return { value: draft };
    }
    case 'number': {
      if (typeof draft !== 'number' || !Number.isFinite(draft)) return { error: m.common.required };
      if (kind.min !== undefined && draft < kind.min) return { error: `≥ ${kind.min}` };
      if (kind.max !== undefined && draft > kind.max) return { error: `≤ ${kind.max}` };
      return { value: draft };
    }
    case 'numberList': {
      const list = draft as string[];
      if (!list.length) return { error: m.settings.listEmpty };
      const nums = list.map((s) => Number(s));
      if (nums.some((n) => !Number.isInteger(n) || n <= 0)) return { error: '> 0' };
      return { value: nums };
    }
    case 'stringList': {
      const list = (draft as string[]).map((s) => s.trim()).filter(Boolean);
      if (!list.length) return { error: m.settings.listEmpty };
      return { value: list };
    }
    default:
      return { value: String(draft) };
  }
}

function SettingRow({ settingKey, value, isDefault, commissionType }: { settingKey: string; value: unknown; isDefault: boolean; commissionType: string }) {
  const qc = useQueryClient();
  const kind = effectiveKind(settingKind(settingKey, value), commissionType);
  const [draft, setDraft] = useState<Draft>(() => toDraft(kind, value));
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(toDraft(kind, value)), [value, kind.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = fromDraft(kind, draft);
  const dirty = parsed.value !== undefined && JSON.stringify(parsed.value) !== JSON.stringify(value);

  const save = async () => {
    if (parsed.error) return;
    setBusy(true);
    try {
      await api.settings.set(settingKey, parsed.value);
      notifySuccess(fmt(m.settings.saved, { key: settingKey }));
      await qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  let input: React.ReactNode;
  switch (kind.kind) {
    case 'enum':
      input = <Select data={kind.options.map((o) => ({ value: o, label: settingKey === 'order.customer_cancel_free_until' ? label(m.enums.orderStatus, o) : humanize(o) }))} value={String(draft)} onChange={(v) => v && setDraft(v)} allowDeselect={false} w={260} />;
      break;
    case 'boolean':
      input = <Switch checked={Boolean(draft)} onChange={(e) => setDraft(e.currentTarget.checked)} label={draft ? m.common.yes : m.common.no} />;
      break;
    case 'money':
      input = (
        <TextInput
          leftSection="K"
          inputMode="decimal"
          value={String(draft)}
          onChange={(e) => setDraft(e.currentTarget.value)}
          error={parsed.error}
          description={parsed.value !== undefined ? `${formatKina(parsed.value as number)} = ${parsed.value as number} toea` : undefined}
          w={260}
        />
      );
      break;
    case 'integer':
    case 'number':
      input = (
        <NumberInput
          value={draft as number | string}
          onChange={(v) => setDraft(typeof v === 'number' ? v : '')}
          allowDecimal={kind.kind === 'number'}
          decimalScale={kind.kind === 'number' ? 2 : 0}
          min={kind.min}
          max={kind.kind === 'number' ? kind.max : undefined}
          rightSection={kind.unit ? <Text size="xs" c="dimmed">{kind.unit}</Text> : undefined}
          error={parsed.error}
          thousandSeparator=","
          w={260}
        />
      );
      break;
    case 'numberList':
    case 'stringList':
      input = <TagsInput value={draft as string[]} onChange={setDraft} error={parsed.error} placeholder={m.settings.addItem} w={460} clearable splitChars={[',', ' ']} />;
      break;
    default:
      input =
        kind.kind === 'string' && kind.suggestions ? (
          <Autocomplete data={kind.suggestions} value={String(draft)} onChange={setDraft} w={260} />
        ) : (
          <TextInput value={String(draft)} onChange={(e) => setDraft(e.currentTarget.value)} w={260} />
        );
  }

  return (
    <Group justify="space-between" align="flex-start" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }} wrap="wrap" data-testid={`setting-${settingKey}`}>
      <Stack gap={2} maw={420}>
        <Group gap="xs">
          <Text fw={500} size="sm">
            {m.settings.labels[settingKey] ?? humanize(settingKey)}
          </Text>
          <Badge size="xs" variant="light" color={isDefault ? 'gray' : 'blue'}>
            {isDefault ? m.settings.isDefault : m.settings.changed}
          </Badge>
        </Group>
        <Code fz="xs">{settingKey}</Code>
        {settingKey === 'commission.value' && (
          <Text size="xs" c="dimmed">
            {commissionType === 'flat' ? m.settings.commissionValueHintFlat : m.settings.commissionValueHintPercent}
          </Text>
        )}
      </Stack>
      <Group align="flex-start" gap="xs">
        {input}
        <Button size="sm" onClick={save} loading={busy} disabled={!dirty || !!parsed.error}>
          {m.settings.saveKey}
        </Button>
      </Group>
    </Group>
  );
}

export default function SettingsPage() {
  const q = useQuery({ queryKey: ['settings'], queryFn: api.settings.all });
  const entries = Object.entries(q.data ?? {});
  const commissionType = String(q.data?.['commission.type']?.value ?? 'percent');

  return (
    <>
      <PageHeader title={m.settings.title} subtitle={m.settings.intro} />
      <QueryState isPending={q.isPending} error={q.error} refetch={q.refetch}>
        <Stack>
          {SETTING_GROUPS.map((g) => {
            const rows = entries.filter(([k]) => settingGroup(k) === g);
            if (!rows.length) return null;
            return (
              <Card withBorder key={g}>
                <Title order={5}>{m.settings.groups[g]}</Title>
                {rows.map(([k, v]) => (
                  <SettingRow key={k} settingKey={k} value={v.value} isDefault={v.isDefault} commissionType={commissionType} />
                ))}
              </Card>
            );
          })}
        </Stack>
      </QueryState>
    </>
  );
}

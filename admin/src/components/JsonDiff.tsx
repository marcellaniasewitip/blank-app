import { Badge, Code, Switch, Table, Text } from '@mantine/core';
import { useState } from 'react';
import { m } from '@/i18n';
import { jsonDiff, renderValue, type DiffKind } from '@/lib/diff';

const COLORS: Record<DiffKind, string> = { added: 'teal', removed: 'red', changed: 'yellow', same: 'gray' };

export function JsonDiff({ before, after }: { before: unknown; after: unknown }) {
  const [showSame, setShowSame] = useState(false);
  const rows = jsonDiff(before, after);
  if (rows.length === 0) return <Text c="dimmed" size="sm">{m.audit.noChanges}</Text>;
  const visible = showSame ? rows : rows.filter((r) => r.kind !== 'same');
  return (
    <>
      <Switch size="xs" mb="xs" label={m.audit.showUnchanged} checked={showSame} onChange={(e) => setShowSame(e.currentTarget.checked)} />
      <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={180}>{m.audit.field}</Table.Th>
            <Table.Th>{m.audit.before}</Table.Th>
            <Table.Th>{m.audit.after}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visible.map((r) => (
            <Table.Tr key={r.key}>
              <Table.Td>
                <Badge size="xs" color={COLORS[r.kind]} variant="light" mr={4}>
                  {r.kind}
                </Badge>
                <Text span size="xs" ff="monospace">
                  {r.key}
                </Text>
              </Table.Td>
              <Table.Td bg={r.kind === 'removed' || r.kind === 'changed' ? 'var(--mantine-color-red-light)' : undefined}>
                <Code block style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'transparent' }}>
                  {renderValue(r.before)}
                </Code>
              </Table.Td>
              <Table.Td bg={r.kind === 'added' || r.kind === 'changed' ? 'var(--mantine-color-teal-light)' : undefined}>
                <Code block style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'transparent' }}>
                  {renderValue(r.after)}
                </Code>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}

import { ActionIcon, CopyButton, Group, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { m } from '@/i18n';

export function CopyText({ value, display, mono = true }: { value: string; display?: string; mono?: boolean }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Text span size="sm" ff={mono ? 'monospace' : undefined} style={{ wordBreak: 'break-all' }}>
        {display ?? value}
      </Text>
      <CopyButton value={value} timeout={1500}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? m.common.copied : m.common.copy} withArrow>
            <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} aria-label={m.common.copy}>
              {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

import { Text, type TextProps } from '@mantine/core';
import { formatKina } from '@/lib/money';

export function Money({ toea, signed, colored, ...rest }: { toea: number | null | undefined; signed?: boolean; colored?: boolean } & TextProps) {
  const color = colored && typeof toea === 'number' ? (toea < 0 ? 'red' : toea > 0 ? 'teal' : undefined) : undefined;
  return (
    <Text span c={color} ff="monospace" style={{ whiteSpace: 'nowrap' }} {...rest}>
      {formatKina(toea, { signed })}
    </Text>
  );
}

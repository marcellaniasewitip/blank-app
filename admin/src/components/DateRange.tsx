import { Button, Group } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { m } from '@/i18n';
import { lastNDays, localYmd, pickerDateToYmd, ymdToPickerDate, type YmdRange } from '@/lib/time';

export type { YmdRange };


export function DateRangeFilter({ value, onChange, presets = true }: { value: YmdRange; onChange: (r: YmdRange) => void; presets?: boolean }) {
  return (
    <Group gap="xs" align="flex-end" wrap="wrap">
      <DatePickerInput
        type="range"
        label={m.common.dateRange}
        value={[ymdToPickerDate(value.from), ymdToPickerDate(value.to)]}
        onChange={([a, b]) => {
          if (a && b) onChange({ from: pickerDateToYmd(a), to: pickerDateToYmd(b) });
        }}
        valueFormat="DD MMM YYYY"
        maxDate={new Date()}
        w={260}
        allowSingleDateInRange
      />
      {presets && (
        <Button.Group>
          {(
            [
              ['7', m.reports.presets.d7],
              ['30', m.reports.presets.d30],
              ['90', m.reports.presets.d90],
              ['month', m.reports.presets.month],
            ] as const
          ).map(([v, text]) => (
            <Button
              key={v}
              size="xs"
              variant="default"
              onClick={() => {
                const to = localYmd();
                onChange(v === 'month' ? { from: `${to.slice(0, 8)}01`, to } : lastNDays(Number(v)));
              }}
            >
              {text}
            </Button>
          ))}
        </Button.Group>
      )}
    </Group>
  );
}

import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { CopyText } from '@/components/CopyText';
import { LedgerTable, WalletAdjustModal } from '@/components/Ledger';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { QueryState } from '@/components/QueryState';
import { m } from '@/i18n';
import { formatDateTime } from '@/lib/time';

export default function PlatformWalletPage() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['platform-wallet'], queryFn: api.wallets.platform });
  const [adjust, setAdjust] = useState(false);
  const w = q.data?.wallet;
  return (
    <>
      <PageHeader
        title={m.wallet.title}
        actions={
          can('wallet.adjust') &&
          w && (
            <Button onClick={() => setAdjust(true)} data-testid="wallet-adjust">
              {m.wallet.adjust}
            </Button>
          )
        }
      />
      <QueryState isPending={q.isPending} error={q.error} refetch={q.refetch}>
        {w && (
          <Stack>
            <Card withBorder>
              <Group justify="space-between" align="flex-end">
                <Stack gap={0}>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    {m.wallet.balance}
                  </Text>
                  <Money toea={w.balanceToea} fz={32} fw={700} data-testid="platform-balance" />
                </Stack>
                <Stack gap={0} align="flex-end">
                  <CopyText value={w.id} />
                  <Text size="xs" c="dimmed">
                    {m.common.updated} {formatDateTime(w.updatedAt)}
                  </Text>
                </Stack>
              </Group>
            </Card>
            <Card withBorder>
              <Title order={5} mb="sm">
                {m.wallet.ledger}
              </Title>
              <LedgerTable walletId={w.id} />
            </Card>
          </Stack>
        )}
      </QueryState>
      {adjust && w && <WalletAdjustModal walletId={w.id} opened onClose={() => setAdjust(false)} invalidate={[['platform-wallet']]} />}
    </>
  );
}

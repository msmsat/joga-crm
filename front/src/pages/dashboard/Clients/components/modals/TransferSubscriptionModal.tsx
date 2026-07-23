import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clientsApi } from '../../../../../api/clients/clients.api';
import { queryKeys } from '../../../../../api/queryKeys';
import { errorMessage } from '../../../../../api/errorMessage';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input } from '../../../../../components/ui/modal';
import { Select, useToast } from '../../../../../components/ui/index';
import type { WalletSubscription } from '../../../../../api/clients/clients.types';

const SEARCH_DEBOUNCE_MS = 300;

interface TransferSubscriptionModalProps {
  clientId: number;
  sub: WalletSubscription;
  onClose: () => void;
}

// «Передать» абонемент другому клиенту студии (V5-7, Блок 4.1).
export function TransferSubscriptionModal({ clientId, sub, onClose }: TransferSubscriptionModalProps) {
  const { t } = useTranslation(['clients', 'common']);
  const toast = useToast();
  const qc = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: results } = useQuery({
    queryKey: ['clients', 'transfer-search', search],
    queryFn: () => clientsApi.getList({ search, limit: 10 }),
    enabled: search.length > 0,
  });

  const options = (results?.items ?? [])
    .filter(c => c.id !== clientId)
    .map(c => ({ value: String(c.id), label: `${c.name} ${c.last_name ?? ''}`.trim() }));

  const transferMut = useMutation({
    mutationFn: () => clientsApi.transferSubscription(clientId, sub.id, Number(targetId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.wallet(clientId) });
      qc.invalidateQueries({ queryKey: queryKeys.wallet(Number(targetId)) });
      toast.success(t('clients:panel.wallet.transferSuccess'));
      onClose();
    },
    onError: (e: unknown) => toast.error(errorMessage(e, t)),
  });

  return (
    <ModalShell size="sm" onClose={onClose}>
      <ModalHeader title={t('clients:panel.wallet.transferTitle')} />
      <ModalBody>
        <Input
          label={t('clients:panel.wallet.transferSearchLabel')}
          value={searchInput}
          onChange={setSearchInput}
          placeholder={t('clients:panel.wallet.transferSearchPlaceholder')}
        />
        <Select
          value={targetId}
          options={options}
          onChange={setTargetId}
          placeholder={t('clients:panel.wallet.transferSelectPlaceholder')}
          disabled={options.length === 0}
        />
      </ModalBody>
      <ModalFooter>
        <GhostButton onClick={onClose}>{t('common:buttons.cancel')}</GhostButton>
        <PrimaryButton
          onClick={() => transferMut.mutate()}
          disabled={!targetId}
          loading={transferMut.isPending}
        >
          {t('clients:panel.wallet.transferConfirm')}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}

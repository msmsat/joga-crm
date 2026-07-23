import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Clients.module.css';
import type { ClientData } from './types';
import { useClientsList, useClientCategories, useClientProfile, useClientMutations } from './hooks/useClientsList';
import { ClientsToolbar } from './components/ClientsToolbar';
import { ClientsTable } from './components/ClientsTable';
import { ClientProfileSlider } from './components/ClientProfileSlider';
import { AddClientModal } from './components/modals/AddClientModal';
import { ConfirmModal, useToast } from '../../../components/ui/index';
import { mapProfile } from './utils/mapClient';

export default function Clients() {
  const { t } = useTranslation('clients');
  const toast = useToast();
  // Категории с сервера: используем только key + count, label серверный (ru) игнорируем.
  const categories = useClientCategories();
  const [activeCatKey, setActiveCatKey] = useState('all');
  const mutations = useClientMutations();

  const {
    clients, hasMore, isLoading,
    rawSearch, setRawSearch,
    setCategory,
    loadMore,
  } = useClientsList();

  const [activeClientId, setActiveClientId] = useState<number | null>(null);
  const [isPanelOpen,    setIsPanelOpen]    = useState(false);
  const [removingId,     setRemovingId]     = useState<number | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState<ClientData | null>(null);

  const { profile: activeProfile } = useClientProfile(isPanelOpen ? activeClientId : null);
  const activeClient = activeProfile ? mapProfile(activeProfile) : (clients.find(c => c.id === activeClientId) ?? null);

  const handleCatChange = useCallback((key: string) => {
    setActiveCatKey(key);
    setCategory(key);
  }, [setCategory]);

  const handleCardSelect = useCallback((cl: ClientData) => {
    if (activeClientId === cl.id && isPanelOpen) {
      setIsPanelOpen(false);
    } else {
      setActiveClientId(cl.id);
      setIsPanelOpen(true);
    }
  }, [activeClientId, isPanelOpen]);

  const handlePanelClose = useCallback(() => setIsPanelOpen(false), []);

  const handleAddSuccess = useCallback(() => {
    // Инвалидацию списка/категорий уже сделал useClientMutations().create — здесь только UI.
    setIsAddModalOpen(false);
  }, []);

  const handleDeleteRequest = useCallback((id: number) => {
    const target = clients.find(c => c.id === id) ?? (activeClientId === id ? activeClient : null);
    if (target) setDeleteTarget(target);
  }, [clients, activeClientId, activeClient]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    await mutations.delete(id);
    setRemovingId(id);
    setTimeout(() => {
      setRemovingId(null);
      setActiveClientId(null);
      setIsPanelOpen(false);
    }, 320);
    toast.success(t('deleteModal.success'));
  }, [deleteTarget, mutations, toast, t]);

  return (
    <>
      <style>{`
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes panelSlideIn { from { opacity: 0; transform: translateX(32px) } to { opacity: 1; transform: translateX(0) } }
        @keyframes chartFadeIn { from { opacity: 0; transform: scale(0.98) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>

      <ClientsToolbar
        categories={categories}
        activeCatKey={activeCatKey}
        onCatChange={handleCatChange}
        searchQuery={rawSearch}
        onSearch={setRawSearch}
        onAddClick={() => setIsAddModalOpen(true)}
      />

      <div className={styles.panelContainer}>
        <div className={`${styles.gridWrap} ${isPanelOpen ? styles.gridWrapShifted : ''}`}>
          <ClientsTable
            clients={clients}
            activeClientId={activeClientId}
            isPanelOpen={isPanelOpen}
            onSelect={handleCardSelect}
            removingId={removingId}
          />
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <button
                onClick={() => loadMore()}
                disabled={isLoading}
                style={{
                  padding: '10px 24px',
                  background: 'var(--card)',
                  border: '1px solid var(--border2)',
                  borderRadius: '10px',
                  fontSize: '13px', fontWeight: 600, color: 'var(--text)',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font)', opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? t('loading') : t('loadMore')}
              </button>
            </div>
          )}
        </div>

        <ClientProfileSlider
          client={activeClient}
          profile={activeProfile}
          isOpen={isPanelOpen}
          onClose={handlePanelClose}
          onDelete={handleDeleteRequest}
        />
      </div>

      <AddClientModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />

      {deleteTarget && (
        <ConfirmModal
          title={t('deleteModal.title')}
          message={`${t('deleteModal.body')} «${deleteTarget.name}${deleteTarget.last_name ? ' ' + deleteTarget.last_name : ''}». ${t('deleteModal.warning')}`}
          confirmText={t('deleteModal.confirm')}
          cancelText={t('deleteModal.cancel')}
          danger
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

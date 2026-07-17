import { useState, useCallback, useEffect } from 'react';
import styles from './Clients.module.css';
import type { ClientData } from './types';
import type { ClientFormState } from './hooks/useClientForm';
import { useClientsList } from './hooks/useClientsList';
import { ClientsToolbar } from './components/ClientsToolbar';
import { ClientsTable } from './components/ClientsTable';
import { ClientProfileSlider } from './components/ClientProfileSlider';
import { AddClientModal } from './components/modals/AddClientModal';
import { DeleteClientModal } from './components/modals/DeleteClientModal';
import { clientsApi } from '../../../api/clients';
import type { ClientProfile, CategoryStat } from '../../../api/clients/clients.types';
import { mapProfile } from './utils/mapClient';

export default function Clients() {
  // Категории с сервера: храним и label (для табов), и key (для фильтра на бэке).
  const [categories, setCategories] = useState<CategoryStat[]>([{ key: 'all', label: 'Все', count: 0 }]);
  const [activeCatKey, setActiveCatKey] = useState('all');
  const [activeProfile, setActiveProfile] = useState<ClientProfile | null>(null);

  const {
    clients, hasMore, isLoading,
    rawSearch, setRawSearch,
    setCategory,
    reload, loadMore, patchLocal, removeLocal,
  } = useClientsList();

  const [activeClient,   setActiveClient]   = useState<ClientData | null>(null);
  const [isPanelOpen,    setIsPanelOpen]    = useState(false);
  const [removingId,     setRemovingId]     = useState<number | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState<ClientData | null>(null);

  const loadCategories = useCallback(() => {
    clientsApi.getCategories().then(setCategories);
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  // Таб-строки для тулбара ("VIP (12)") и активная строка.
  const categoryLabels = categories.map(c => `${c.label} (${c.count})`);
  const activeCatLabel = categoryLabels[categories.findIndex(c => c.key === activeCatKey)] ?? categoryLabels[0] ?? '';

  const handleCatChange = useCallback((label: string) => {
    const idx = categoryLabels.indexOf(label);
    const key = categories[idx]?.key ?? 'all';
    setActiveCatKey(key);
    setCategory(key);
  }, [categoryLabels, categories, setCategory]);

  const handleCardSelect = useCallback((cl: ClientData) => {
    if (activeClient?.id === cl.id && isPanelOpen) {
      setIsPanelOpen(false);
    } else {
      setActiveClient(cl);
      setIsPanelOpen(true);
      setActiveProfile(null);
      clientsApi.getProfile(cl.id).then(p => {
        setActiveProfile(p);
        const mapped = mapProfile(p);
        patchLocal(prev => prev.map(c => c.id === cl.id ? mapped : c));
        setActiveClient(mapped);
      });
    }
  }, [activeClient, isPanelOpen, patchLocal]);

  const handlePanelClose = useCallback(() => setIsPanelOpen(false), []);

  const handleAddSuccess = useCallback((_form: ClientFormState) => {
    setIsAddModalOpen(false);
    reload();
    loadCategories();
  }, [reload, loadCategories]);

  const handleDelete = useCallback((id: number) => {
    clientsApi.delete(id).then(() => {
      setRemovingId(id);
      setTimeout(() => {
        removeLocal(id);
        setRemovingId(null);
        setActiveClient(null);
        setActiveProfile(null);
        setIsPanelOpen(false);
      }, 320);
    });
  }, [removeLocal]);

  const handleFreezeChange = useCallback((id: number, frozen: boolean) => {
    patchLocal(prev => prev.map(c =>
      c.id === id ? { ...c, frozen, status: frozen ? 'frozen' : 'active' } : c
    ));
  }, [patchLocal]);

  return (
    <>
      <style>{`
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes panelSlideIn { from { opacity: 0; transform: translateX(32px) } to { opacity: 1; transform: translateX(0) } }
        @keyframes chartFadeIn { from { opacity: 0; transform: scale(0.98) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>

      <ClientsToolbar
        categories={categoryLabels}
        activeCat={activeCatLabel}
        onCatChange={handleCatChange}
        searchQuery={rawSearch}
        onSearch={setRawSearch}
        onAddClick={() => setIsAddModalOpen(true)}
      />

      <div className={styles.panelContainer}>
        <div className={styles.gridWrap}>
          <ClientsTable
            clients={clients}
            activeClientId={activeClient?.id ?? null}
            isPanelOpen={isPanelOpen}
            onSelect={handleCardSelect}
            removingId={removingId}
          />
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <button
                onClick={loadMore}
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
                {isLoading ? 'Загрузка…' : 'Загрузить ещё'}
              </button>
            </div>
          )}
        </div>

        <ClientProfileSlider
          client={activeClient}
          profile={activeProfile}
          isOpen={isPanelOpen}
          onClose={handlePanelClose}
          onDelete={handleDelete}
          onFreezeChange={handleFreezeChange}
        />
      </div>

      <AddClientModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />

      <DeleteClientModal
        isOpen={deleteTarget !== null}
        clientName={deleteTarget ? `${deleteTarget.name}${deleteTarget.last_name ? ' ' + deleteTarget.last_name : ''}` : ''}
        onConfirm={() => setDeleteTarget(null)}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

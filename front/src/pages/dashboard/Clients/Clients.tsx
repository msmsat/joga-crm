import { useState, useCallback, useEffect } from 'react';
import styles from './Clients.module.css';
import type { ClientData } from './types';
import type { ClientFormState } from './hooks/useClientForm';
import { useClientsFilters } from './hooks/useClientsFilters';
import { ClientsToolbar } from './components/ClientsToolbar';
import { ClientsTable } from './components/ClientsTable';
import { ClientProfileSlider } from './components/ClientProfileSlider';
import { AddClientModal } from './components/modals/AddClientModal';
import { DeleteClientModal } from './components/modals/DeleteClientModal';
import { clientsApi } from '../../../api/clients';
import type { ClientProfile } from '../../../api/clients/clients.types';
import { mapListItem, mapProfile } from './utils/mapClient';

export default function Clients() {
  const [localClients, setLocalClients] = useState<ClientData[]>([]);
  const [categories,   setCategories]   = useState<string[]>(['Все (0)']);
  const [activeProfile, setActiveProfile] = useState<ClientProfile | null>(null);

  const { filteredClients, searchQuery, setSearchQuery, activeCat, setActiveCat } =
    useClientsFilters(localClients, categories);

  const [activeClient,   setActiveClient]   = useState<ClientData | null>(null);
  const [isPanelOpen,    setIsPanelOpen]    = useState(false);
  const [removingId,     setRemovingId]     = useState<number | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState<ClientData | null>(null);

  const loadClients = useCallback(() => {
    clientsApi.getList().then(items => setLocalClients(items.map(mapListItem)));
  }, []);

  const loadCategories = useCallback(() => {
    clientsApi.getCategories().then(cats =>
      setCategories(cats.map(c => `${c.label} (${c.count})`))
    );
  }, []);

  useEffect(() => { loadClients(); },    [loadClients]);
  useEffect(() => { loadCategories(); }, [loadCategories]);

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
        setLocalClients(prev => prev.map(c => c.id === cl.id ? mapped : c));
        setActiveClient(mapped);
      });
    }
  }, [activeClient, isPanelOpen]);

  const handlePanelClose = useCallback(() => setIsPanelOpen(false), []);

  const handleAddSuccess = useCallback((_form: ClientFormState) => {
    setIsAddModalOpen(false);
    loadClients();
    loadCategories();
  }, [loadClients, loadCategories]);

  const handleDelete = useCallback((id: number) => {
    clientsApi.delete(id).then(() => {
      setRemovingId(id);
      setTimeout(() => {
        setLocalClients(prev => prev.filter(c => c.id !== id));
        setRemovingId(null);
        setActiveClient(null);
        setActiveProfile(null);
        setIsPanelOpen(false);
      }, 320);
    });
  }, []);

  const handleFreezeChange = useCallback((id: number, frozen: boolean) => {
    setLocalClients(prev => prev.map(c =>
      c.id === id ? { ...c, frozen, status: frozen ? 'frozen' : 'active' } : c
    ));
  }, []);

  return (
    <>
      <style>{`
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes panelSlideIn { from { opacity: 0; transform: translateX(32px) } to { opacity: 1; transform: translateX(0) } }
        @keyframes chartFadeIn { from { opacity: 0; transform: scale(0.98) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>

      <ClientsToolbar
        categories={categories}
        activeCat={activeCat}
        onCatChange={setActiveCat}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        onAddClick={() => setIsAddModalOpen(true)}
      />

      <div className={styles.panelContainer}>
        <div className={styles.gridWrap}>
          <ClientsTable
            clients={filteredClients}
            activeClientId={activeClient?.id ?? null}
            isPanelOpen={isPanelOpen}
            onSelect={handleCardSelect}
            removingId={removingId}
          />
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

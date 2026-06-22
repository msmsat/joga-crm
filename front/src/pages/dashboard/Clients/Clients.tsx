import { useState, useCallback } from 'react';
import styles from './Clients.module.css';
import { clientsData, CATEGORIES } from './constants';
import type { ClientData } from './types';
import type { ClientFormState } from './hooks/useClientForm';
import { useClientsFilters } from './hooks/useClientsFilters';
import { ClientsToolbar } from './components/ClientsToolbar';
import { ClientsTable } from './components/ClientsTable';
import { ClientProfileSlider } from './components/ClientProfileSlider';
import { AddClientModal } from './components/modals/AddClientModal';
import { DeleteClientModal } from './components/modals/DeleteClientModal';

export default function Clients() {
  const { filteredClients, searchQuery, setSearchQuery, activeCat, setActiveCat } = useClientsFilters(clientsData);

  const [activeClient,    setActiveClient]    = useState<ClientData | null>(null);
  const [isPanelOpen,     setIsPanelOpen]     = useState(false);
  const [isAddModalOpen,  setIsAddModalOpen]  = useState(false);
  const [deleteTarget,    setDeleteTarget]    = useState<ClientData | null>(null);

  const handleCardSelect = useCallback((cl: ClientData) => {
    if (activeClient?.id === cl.id && isPanelOpen) {
      setIsPanelOpen(false);
    } else {
      setActiveClient(cl);
      setIsPanelOpen(true);
    }
  }, [activeClient, isPanelOpen]);

  const handlePanelClose = useCallback(() => setIsPanelOpen(false), []);

  const handleAddSuccess = useCallback((_form: ClientFormState) => {
    setIsAddModalOpen(false);
  }, []);

  return (
    <>
      <style>{`
        .client-card {
          transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease, border-color 0.2s ease !important;
        }
        .client-card:hover { transform: translateY(-3px) scale(1.01); }
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes panelSlideIn { from { opacity: 0; transform: translateX(32px) } to { opacity: 1; transform: translateX(0) } }
        @keyframes chartFadeIn { from { opacity: 0; transform: scale(0.98) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>

      <ClientsToolbar
        categories={CATEGORIES}
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
          />
        </div>

        <ClientProfileSlider
          client={activeClient}
          isOpen={isPanelOpen}
          onClose={handlePanelClose}
        />
      </div>

      <AddClientModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />

      <DeleteClientModal
        isOpen={deleteTarget !== null}
        clientName={deleteTarget?.n ?? ''}
        onConfirm={() => setDeleteTarget(null)}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

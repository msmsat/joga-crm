import type { CSSProperties } from 'react';
import { CalendarPlus, Gift, Snowflake, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../components/ui/index';
import { Segmented } from '../../../../components/ui/modal';
import { ClientAvatar } from '../../../../components/ui/ClientAvatar';
import type { ClientData } from '../types';
import { STATUS_COLORS } from '../constants';
import { formatDate, getAvatarColor, getInitials } from '../utils/mapClient';
import { InlineEdit } from './InlineEdit';
import styles from './ClientPanelHeader.module.css';

export type ProfileTab = 'info' | 'events' | 'notes' | 'wallet';
const TABS: ProfileTab[] = ['info', 'events', 'notes', 'wallet'];

export function ClientPanelHeader({ client, canEdit, tab, tabsId, panelId, onTabChange, onClose, onBook, onBonus, onWhatsApp, onCopyId, onRegistrationDate }: {
  client: ClientData;
  canEdit: boolean;
  tab: ProfileTab;
  tabsId: string;
  panelId: string;
  onTabChange: (tab: ProfileTab) => void;
  onClose: () => void;
  onBook: () => void;
  onBonus: () => void;
  onWhatsApp: () => void;
  onCopyId: () => void;
  onRegistrationDate: (date: string) => void;
}) {
  const { t } = useTranslation('clients');
  const name = [client.name, client.last_name].filter(Boolean).join(' ');
  const since = client.registration_date
    ? t('panel.since', { date: formatDate(client.registration_date) }) : null;
  const style = {
    '--avatar-tint': getAvatarColor(client.id, client.avatar_color),
    '--client-state': STATUS_COLORS[client.status] || 'var(--text2)',
  } as CSSProperties;

  return (
    <header className={`${styles.header} cl-profile-header`} style={style}>
      <div className={`${styles.identity} cl-profile-identity`}>
        <ClientAvatar url={client.avatar_url} initials={getInitials(client.name, client.last_name)} className={`${styles.avatar} cl-profile-avatar`}/>
        <div className={`${styles.heading} cl-profile-heading`}>
          <h2 className={`${styles.name} cl-profile-name`} title={name}>{name}</h2>
          <div className={`${styles.meta} cl-profile-meta`}>
            <span className={styles.status}>{client.frozen && <Snowflake size={12} aria-hidden="true"/>}{t(`status.${client.frozen ? 'frozen' : client.status}`, { defaultValue: client.status })}</span>
            <Button size="sm" variant="ghost" onClick={onCopyId} ariaLabel={`#${client.id}${t('panel.contacts.copyHint')}`} style={{ padding: '2px 6px', fontSize: 11, border: 'none', boxShadow: 'none', borderRadius: 6 }}>#{client.id}</Button>
          </div>
          {since && <div className={`${styles.since} cl-profile-meta`}>
            {canEdit ? <InlineEdit key={client.id} value={client.registration_date ?? ''} type="date" title={t('panel.editDateHint')} onSave={onRegistrationDate}>{since}</InlineEdit> : since}
          </div>}
        </div>
        <Button variant="ghost" size="sm" ariaLabel={t('common:buttons.close')} onClick={onClose} style={{ width: 34, height: 34, padding: 0, flexShrink: 0, borderRadius: 10 }}><X size={16} aria-hidden="true"/></Button>
      </div>
      <div className={`${styles.actions} cl-profile-actions`}>
        <Button variant="ghost" size="sm" fullWidth icon={<WhatsAppIcon/>} disabled={!client.phone} ariaLabel={!client.phone ? t('panel.toasts.noPhone') : 'WhatsApp'} onClick={onWhatsApp} style={{ padding: '9px 6px', fontSize: 12, color: 'var(--whatsapp-text)' }}>WhatsApp</Button>
        {canEdit && <>
          <Button size="sm" fullWidth icon={<CalendarPlus size={15} aria-hidden="true"/>} onClick={onBook} style={{ padding: '9px 6px', fontSize: 12 }}>{t('panel.actions.book')}</Button>
          <Button variant="ghost" size="sm" fullWidth icon={<Gift size={15} aria-hidden="true"/>} onClick={onBonus} style={{ padding: '9px 6px', fontSize: 12 }}>{t('panel.actions.bonus')}</Button>
        </>}
      </div>
      <Segmented appearance="line" fit id={tabsId} panelId={panelId} value={tab} onChange={onTabChange} ariaLabel={name} options={TABS.map(value => ({ value, label: t(`panel.tabs.${value}`) }))}/>
    </header>
  );
}

function WhatsAppIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5Z"/><path d="m8.5 8 1.5 2-1 1c1 2 2 3 4 4l1-1 2 1.5c0 1-1 2-2 2-3 0-7-4-7-7 0-1 1-2 1.5-2.5Z"/></svg>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import i18n from '../../../../../i18n';
import type { ToastType, FinDocument } from '../../types';
import type { FinDocument as ApiDocument } from '../../../../../api/finances/finances.types';
import { Ico } from '../ui/FinanceIcons';
import { Toggle } from '../ui/Toggle';
import { InfoHint } from '../../../../../components/ui/InfoHint';
import styles from '../../Finances.module.css';
import { useDocuments, useCounterparties, useFinanceMutations } from '../../hooks/useFinances';
import { financesApi } from '../../../../../api/finances/finances.api';
import { queryKeys } from '../../../../../api/queryKeys';

// Бэкенд отдаёт doc_type/file_ext/counterparty_id/created_at — вид ждёт type/ext/party/date.
// UI-статусы: signed | pending | draft (бэкенд хранит их же строкой).
const toStatus = (s: string): FinDocument['status'] =>
  s === 'signed' || s === 'pending' ? s : 'draft';

const adapt = (d: ApiDocument, partyName: string, internalLabel: string): FinDocument => ({
  id: d.id,
  title: d.title,
  type: d.doc_type,
  date: new Date(d.created_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }),
  party: partyName || internalLabel,
  amount: d.amount ?? 0,
  status: toStatus(d.status),
  ext: (d.file_ext || 'PDF').toUpperCase(),
  hasFile: d.has_file,
});

export default function DocumentsTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const { t } = useTranslation('finances');
  const qc = useQueryClient();
  const { data: rawDocs = [], error: docsError } = useDocuments();
  const { data: parties = [], error: partiesError } = useCounterparties();
  const { createDocument, updateDocument, deleteDocument } = useFinanceMutations();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'signed' | 'pending'>('all');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: '', party: '', type: 'Договор', needsSignature: true });
  const [isDragHover, setIsDragHover] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState<{ [key: string]: boolean }>({});
  const [popoverDoc, setPopoverDoc] = useState<number | null>(null);
  const [popoverUp, setPopoverUp] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ALLOWED_EXT = ['pdf', 'docx', 'xlsx'];

  const pickFile = (file: File | null) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.includes(ext)) { showToast(t('documents.toasts.badFormat'), 'error'); return; }
    setSelectedFile(file);
    // Название документа подставляем из имени файла, если пользователь ещё не ввёл своё.
    setNewDoc(p => ({ ...p, title: p.title || file.name.replace(/\.[^.]+$/, '') }));
  };

  const docs = useMemo(() => {
    const byId = new Map(parties.map(c => [c.id, c.name]));
    const internalLabel = t('documents.internalDoc');
    return rawDocs.map(d => adapt(d, d.counterparty_id != null ? byId.get(d.counterparty_id) ?? '' : '', internalLabel));
  }, [rawDocs, parties, t]);

  useEffect(() => {
    if (docsError || partiesError) showToast(t('documents.toasts.loadFailed'), 'error');
  }, [docsError, partiesError, showToast, t]);

  const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
    signed: { label: t('documents.status.signed'), color: '#4E885B', bg: 'rgba(163,201,168,0.2)' },
    pending: { label: t('documents.status.pending'), color: '#D88C9A', bg: 'rgba(216,140,154,0.15)' },
    draft: { label: t('documents.status.draft'), color: '#666666', bg: 'rgba(26,26,26,0.06)' },
  };
  const extColors: Record<string, string> = { PDF: '#D88C9A', DOCX: '#7EB5D6', XLSX: '#A3C9A8' };

  const filtered = docs.filter(d => {
    const matchFilter = filter === 'all' || d.status === filter;
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.party.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const handleCreate = async () => {
    // Файл обязателен: без него получился бы «пустой» документ, который нельзя открыть.
    if (!newDoc.title.trim() || !selectedFile || saving) return;
    // Контрагент по имени → id; нет совпадения → внутренний документ (null).
    const match = newDoc.party.trim()
      ? parties.find(p => p.name.toLowerCase() === newDoc.party.trim().toLowerCase())
      : undefined;
    setSaving(true);
    const created = await createDocument({
      title: newDoc.title.trim(),
      doc_type: newDoc.type,
      file_ext: selectedFile.name.split('.').pop()!.toUpperCase(),
      status: newDoc.needsSignature ? 'pending' : 'draft',
      counterparty_id: match?.id ?? null,
    }).catch(() => null);
    if (!created) { setSaving(false); return; } // тост ошибки уже показан в useFinanceMutations
    try {
      await financesApi.uploadDocumentFile(created.id, selectedFile);
      qc.invalidateQueries({ queryKey: queryKeys.finDocuments });
      setNewDoc({ title: '', party: '', type: 'Договор', needsSignature: true });
      setSelectedFile(null);
      setAddOpen(false);
      showToast(t('documents.toasts.created'), 'success');
    } catch {
      // Файл не залился — удаляем только что созданную запись, чтобы не осталось пустого документа.
      await deleteDocument(created.id).catch(() => {});
      qc.invalidateQueries({ queryKey: queryKeys.finDocuments });
      showToast(t('documents.toasts.createFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = async (id: number, hasFile: boolean) => {
    if (!hasFile) { showToast(t('documents.toasts.noFile'), 'error'); return; }
    if (downloadingId !== null) return;
    setDownloadingId(id);
    try {
      await financesApi.openDocumentFile(id);
    } catch {
      showToast(t('documents.toasts.openFailed'), 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const signedCount = docs.filter(d => d.status === 'signed').length;
  const pendingCount = docs.filter(d => d.status === 'pending').length;
  const draftCount = docs.filter(d => d.status === 'draft').length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1A1A1A' }}>{t('tabs.documents')}</div>
        <InfoHint title={t('tabs.documents')} text={t('info.documents')} />
      </div>

      {/* 1. Сводные карточки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '28px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(163,201,168,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(163,201,168,0.12)', color: '#5BAB72', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Check /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('documents.signed')}</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{signedCount}</div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(216,140,154,0.12) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(216,140,154,0.12)', color: '#D88C9A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Edit /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('documents.pendingCount')}</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: pendingCount > 0 ? '#D88C9A' : '#1A1A1A' }}>{pendingCount}</span>
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(126,181,214,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(126,181,214,0.12)', color: '#7EB5D6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Doc /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('documents.draftCount')}</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{draftCount}</div>
        </div>
      </div>

      {/* 2. Панель управления */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', background: '#FFFFFF', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 8px 32px -8px rgba(26,26,26,0.04)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
          <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: isSearchFocused ? '#F9A08B' : '#999999', transition: 'color 0.2s', pointerEvents: 'none' }}><Ico.Search /></div>
          <input type="text" placeholder={t('documents.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setIsSearchFocused(false)} style={{ width: '100%', height: '48px', paddingLeft: '44px', paddingRight: search ? '40px' : '16px', background: '#FDFCFB', border: isSearchFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.06)', borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isSearchFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.25s', boxSizing: 'border-box', fontFamily: "'Manrope', sans-serif" }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(26,26,26,0.06)', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}><Ico.X /></button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', padding: '4px', borderRadius: '12px', flexShrink: 0 }}>
          {(['all', 'signed', 'pending'] as const).map(f => {
            const isActive = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: isActive ? '#FFFFFF' : 'transparent', color: isActive ? '#1A1A1A' : '#666666', boxShadow: isActive ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>
                {t(`documents.filters.${f}`)}
              </button>
            );
          })}
        </div>

        {!addOpen && (
          <button onClick={() => setAddOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '44px', padding: '0 20px', background: '#F9A08B', border: 'none', borderRadius: '10px', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', boxShadow: '0 6px 16px rgba(249, 160, 139, 0.25)', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.filter = 'brightness(1.05)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.filter = 'none'; }}>
            <Ico.Plus /> {t('documents.upload')}
          </button>
        )}
      </div>

      {/* 3. Зона создания документа */}
      {addOpen && (
        <div className={`${styles.morphContainer} card`} style={{ padding: '32px', marginBottom: '24px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 16px 40px -8px rgba(26,26,26,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px' }}>{t('documents.addTitle')}</div>
            <button onClick={() => { setAddOpen(false); setSelectedFile(null); }} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color='#1A1A1A'} onMouseLeave={e => e.currentTarget.style.color='#999'}><Ico.X /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
            <div
              style={{ border: isDragHover ? '2px dashed #F9A08B' : '2px dashed rgba(26,26,26,0.12)', borderRadius: '16px', background: isDragHover ? 'rgba(249, 160, 139, 0.03)' : 'rgba(26,26,26,0.01)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={() => setIsDragHover(true)} onMouseLeave={() => setIsDragHover(false)}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragHover(true); }}
              onDragLeave={() => setIsDragHover(false)}
              onDrop={e => { e.preventDefault(); setIsDragHover(false); pickFile(e.dataTransfer.files[0] ?? null); }}
            >
              <input
                ref={fileInputRef} type="file" accept=".pdf,.docx,.xlsx" style={{ display: 'none' }}
                onChange={e => pickFile(e.target.files?.[0] ?? null)}
              />
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F9A08B', marginBottom: '16px' }}>
                <Ico.Download />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginBottom: '4px' }}>{selectedFile ? selectedFile.name : t('documents.dropzoneTitle')}</div>
              <div style={{ fontSize: '12px', color: '#999999' }}>{selectedFile ? t('documents.dropzoneChange') : t('documents.dropzoneHint')}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>{t('documents.titleLabel')}</label>
                <input type="text" placeholder={t('documents.titlePlaceholder')} value={newDoc.title} onChange={e => setNewDoc(p => ({ ...p, title: e.target.value }))} onFocus={() => setIsInputFocused({ ...isInputFocused, title: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, title: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['title'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['title'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>{t('documents.partyLabel')}</label>
                <input type="text" placeholder={t('documents.partyPlaceholder')} value={newDoc.party} onChange={e => setNewDoc(p => ({ ...p, party: e.target.value }))} onFocus={() => setIsInputFocused({ ...isInputFocused, party: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, party: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['party'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['party'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(26,26,26,0.02)', borderRadius: '10px', border: '1px solid rgba(26,26,26,0.04)', marginTop: '8px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>{t('documents.needsSignature')}</div>
                  <div style={{ fontSize: '11px', color: '#999999', marginTop: '2px' }}>{t('documents.needsSignatureHint')}</div>
                </div>
                <Toggle on={newDoc.needsSignature} onChange={() => setNewDoc(p => ({ ...p, needsSignature: !p.needsSignature }))} />
              </div>
              {(() => { const canSave = !!newDoc.title.trim() && !!selectedFile && !saving; return (
              <button onClick={handleCreate} disabled={!canSave} style={{ marginTop: 'auto', padding: '14px', background: canSave ? '#F9A08B' : 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '10px', color: canSave ? '#FFFFFF' : '#999999', fontSize: '13px', fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: canSave ? '0 6px 20px rgba(249, 160, 139, 0.25)' : 'none' }}>
                {saving ? t('operations.saving') : !selectedFile ? t('documents.fileRequired') : t('documents.saveToBase')}
              </button>
              ); })()}
            </div>
          </div>
        </div>
      )}

      {/* 4. Список документов */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', overflow: 'visible' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center', background: '#FAFAFA' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(26,26,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#999999' }}><Ico.Doc /></div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', marginBottom: '6px' }}>{t('documents.emptyTitle')}</div>
            <div style={{ fontSize: '13px', color: '#666666' }}>{t('documents.emptyBody')}</div>
          </div>
        ) : filtered.map((doc, i) => {
          const sm = statusMeta[doc.status];
          const extColor = extColors[doc.ext] || '#999';
          return (
            <div key={doc.id} className={`${styles.docRow} ${popoverDoc === doc.id ? styles.docRowActive : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 24px', borderBottom: i < filtered.length - 1 ? '1px solid rgba(26,26,26,0.12)' : 'none', background: 'transparent', transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', borderLeft: '3px solid transparent' }}>
              <div style={{ width: '46px', height: '52px', borderRadius: '10px', background: extColor + '15', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: '4px', color: extColor, border: `1px solid ${extColor}30` }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={{ fontSize: '9px', fontWeight: 800, color: extColor, letterSpacing: '0.5px' }}>{doc.ext}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</div>
                <div style={{ fontSize: '12px', color: '#666666', fontWeight: 500 }}>
                  <span style={{ color: '#1A1A1A', fontWeight: 600 }}>{doc.party}</span> <span style={{ opacity: 0.5, margin: '0 4px' }}>•</span> {t('documents.uploaded', { date: doc.date })}
                </div>
              </div>
              <div style={{ flexShrink: 0, marginRight: '16px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: sm.bg, color: sm.color, padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, border: `1px solid ${sm.color}30` }}>
                  {doc.status === 'signed' ? <Ico.Check /> : doc.status === 'pending' ? <Ico.Edit /> : null}
                  {sm.label}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, position: 'relative' }}>
                <button onClick={() => handleOpen(doc.id, doc.hasFile)} disabled={downloadingId === doc.id} style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FDFCFB', border: '1px solid rgba(26,26,26,0.08)', cursor: downloadingId === doc.id ? 'default' : 'pointer', opacity: downloadingId === doc.id ? 0.6 : doc.hasFile ? 1 : 0.45, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666666', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.color = '#1A1A1A'; e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.transform = 'translateY(0)'; }} title={doc.hasFile ? t('documents.open') : t('documents.toasts.noFile')}><Ico.Open /></button>
                <button onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setPopoverUp(window.innerHeight - rect.bottom < 180); setPopoverDoc(popoverDoc === doc.id ? null : doc.id); }} style={{ width: '36px', height: '36px', borderRadius: '10px', background: popoverDoc === doc.id ? '#1A1A1A' : '#FDFCFB', border: '1px solid rgba(26,26,26,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: popoverDoc === doc.id ? '#FFFFFF' : '#666666', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { if (popoverDoc !== doc.id) { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.color = '#1A1A1A'; e.currentTarget.style.transform = 'translateY(-1px)'; } }} onMouseLeave={e => { if (popoverDoc !== doc.id) { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.transform = 'translateY(0)'; } }} title={t('documents.options')}><Ico.Dots /></button>

                {/* Dark popover — absolute к обёртке кнопок, едет вместе со строкой при скролле */}
                {popoverDoc === doc.id && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setPopoverDoc(null)} />
                    <div style={{ position: 'absolute', right: 0, ...(popoverUp ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }), background: '#111111', borderRadius: '14px', padding: '8px', zIndex: 999, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', minWidth: '210px' }}>
                      <div style={{ padding: '4px 12px 6px', fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>{t('documents.status.title')}</div>
                      {([
                        { status: 'signed' as const, label: t('documents.status.signed'), color: '#A3C9A8' },
                        { status: 'pending' as const, label: t('documents.status.pending'), color: '#D88C9A' },
                        { status: 'draft' as const, label: t('documents.status.draft'), color: 'rgba(255,255,255,0.4)' },
                      ]).map(opt => {
                        const isActive = doc.status === opt.status;
                        return (
                          <button
                            key={opt.status}
                            onClick={async () => {
                              const id = popoverDoc;
                              setPopoverDoc(null);
                              if (id == null) return;
                              try {
                                await updateDocument(id, { status: opt.status });
                                showToast(t('documents.toasts.statusChanged', { label: opt.label }), 'success');
                              } catch {
                                // тост уже показан в useFinanceMutations
                              }
                            }}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'transparent', border: 'none', borderRadius: '8px', color: isActive ? opt.color : 'rgba(255,255,255,0.65)', fontSize: '13px', fontWeight: isActive ? 700 : 500, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", textAlign: 'left', transition: 'background 0.12s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                            {opt.label}
                            {isActive && <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.45)', fontSize: '12px' }}>✓</span>}
                          </button>
                        );
                      })}
                      <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '4px 8px' }} />
                      <button
                        onClick={async () => {
                          const id = popoverDoc;
                          setPopoverDoc(null);
                          if (id == null) return;
                          try {
                            await deleteDocument(id);
                            showToast(t('documents.toasts.deleted'), 'error');
                          } catch {
                            // тост уже показан в useFinanceMutations
                          }
                        }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'transparent', border: 'none', borderRadius: '8px', color: '#D88C9A', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", textAlign: 'left', transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(216,140,154,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Ico.Trash /> {t('documents.delete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

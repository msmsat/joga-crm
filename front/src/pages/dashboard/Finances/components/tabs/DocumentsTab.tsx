import { useState } from 'react';
import type { ToastType, FinDocument } from '../../types';
import { DOCUMENTS_DATA } from '../../constants';
import { Ico } from '../ui/FinanceIcons';
import { Toggle } from '../ui/Toggle';
import styles from '../../Finances.module.css';

export default function DocumentsTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [docs, setDocs] = useState<FinDocument[]>(DOCUMENTS_DATA);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'signed' | 'pending'>('all');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: '', party: '', type: 'Договор', needsSignature: true });
  const [isDragHover, setIsDragHover] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState<{ [key: string]: boolean }>({});

  const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
    signed: { label: 'Подписан', color: '#4E885B', bg: 'rgba(163,201,168,0.2)' },
    pending: { label: 'Ожидает подписи', color: '#D88C9A', bg: 'rgba(216,140,154,0.15)' },
    draft: { label: 'Без подписи', color: '#666666', bg: 'rgba(26,26,26,0.06)' },
  };
  const extColors: Record<string, string> = { PDF: '#D88C9A', DOCX: '#7EB5D6', XLSX: '#A3C9A8' };

  const filtered = docs.filter(d => {
    const matchFilter = filter === 'all' || d.status === filter;
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.party.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const handleCreate = () => {
    if (!newDoc.title.trim()) { showToast('Загрузите файл или введите название', 'error'); return; }
    setDocs(prev => [{
      id: Date.now(), title: newDoc.title, type: newDoc.type,
      date: 'Только что', party: newDoc.party || 'Внутренний документ',
      amount: 0, status: newDoc.needsSignature ? 'pending' : 'draft', ext: 'PDF',
    }, ...prev]);
    setNewDoc({ title: '', party: '', type: 'Договор', needsSignature: true });
    setAddOpen(false);
    showToast('Документ успешно загружен в базу', 'success');
  };

  const signedCount = docs.filter(d => d.status === 'signed').length;
  const pendingCount = docs.filter(d => d.status === 'pending').length;
  const draftCount = docs.filter(d => d.status === 'draft').length;

  return (
    <>
      {/* 1. Сводные карточки */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '28px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(163,201,168,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(163,201,168,0.12)', color: '#5BAB72', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Check /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Подписано</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{signedCount}</div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(216,140,154,0.12) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(216,140,154,0.12)', color: '#D88C9A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Edit /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Ждут подписи</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>
            <span style={{ color: pendingCount > 0 ? '#D88C9A' : '#1A1A1A' }}>{pendingCount}</span>
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '24px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(126,181,214,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(126,181,214,0.12)', color: '#7EB5D6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Doc /></div>
            <div style={{ fontSize: '12px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Внутренние (Без подписи)</div>
          </div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-1px' }}>{draftCount}</div>
        </div>
      </div>

      {/* 2. Панель управления */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', background: '#FFFFFF', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 8px 32px -8px rgba(26,26,26,0.04)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
          <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: isSearchFocused ? '#F9A08B' : '#999999', transition: 'color 0.2s', pointerEvents: 'none' }}><Ico.Search /></div>
          <input type="text" placeholder="Искать по названию или контрагенту..." value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setIsSearchFocused(false)} style={{ width: '100%', height: '48px', paddingLeft: '44px', paddingRight: search ? '40px' : '16px', background: '#FDFCFB', border: isSearchFocused ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.06)', borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isSearchFocused ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.25s', boxSizing: 'border-box', fontFamily: "'Manrope', sans-serif" }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(26,26,26,0.06)', border: 'none', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}><Ico.X /></button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', padding: '4px', borderRadius: '12px', flexShrink: 0 }}>
          {(['all', 'signed', 'pending'] as const).map(f => {
            const isActive = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: isActive ? '#FFFFFF' : 'transparent', color: isActive ? '#1A1A1A' : '#666666', boxShadow: isActive ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>
                {f === 'all' ? 'Все' : f === 'signed' ? 'Подписаны' : 'Ждут подписи'}
              </button>
            );
          })}
        </div>

        {!addOpen && (
          <button onClick={() => setAddOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '44px', padding: '0 20px', background: '#F9A08B', border: 'none', borderRadius: '10px', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', boxShadow: '0 6px 16px rgba(249, 160, 139, 0.25)', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.filter = 'brightness(1.05)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.filter = 'none'; }}>
            <Ico.Plus /> Загрузить
          </button>
        )}
      </div>

      {/* 3. Зона создания документа */}
      {addOpen && (
        <div className={`${styles.morphContainer} card`} style={{ padding: '32px', marginBottom: '24px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 16px 40px -8px rgba(26,26,26,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px' }}>Добавить документ в базу</div>
            <button onClick={() => setAddOpen(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color='#1A1A1A'} onMouseLeave={e => e.currentTarget.style.color='#999'}><Ico.X /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
            <div
              style={{ border: isDragHover ? '2px dashed #F9A08B' : '2px dashed rgba(26,26,26,0.12)', borderRadius: '16px', background: isDragHover ? 'rgba(249, 160, 139, 0.03)' : 'rgba(26,26,26,0.01)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={() => setIsDragHover(true)} onMouseLeave={() => setIsDragHover(false)}
              onClick={() => showToast('Выбор файла...', 'info')}
            >
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#FFFFFF', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F9A08B', marginBottom: '16px' }}>
                <Ico.Download />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginBottom: '4px' }}>Нажмите или перетащите файл</div>
              <div style={{ fontSize: '12px', color: '#999999' }}>PDF, DOCX, XLSX (до 15 МБ)</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Название документа</label>
                <input type="text" placeholder="Например: Акт сдачи-приемки №48" value={newDoc.title} onChange={e => setNewDoc(p => ({ ...p, title: e.target.value }))} onFocus={() => setIsInputFocused({ ...isInputFocused, title: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, title: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['title'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['title'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>Контрагент (Если есть)</label>
                <input type="text" placeholder="Название ИП или ООО" value={newDoc.party} onChange={e => setNewDoc(p => ({ ...p, party: e.target.value }))} onFocus={() => setIsInputFocused({ ...isInputFocused, party: true })} onBlur={() => setIsInputFocused({ ...isInputFocused, party: false })} style={{ width: '100%', padding: '12px 16px', background: '#FDFCFB', border: isInputFocused['party'] ? '1.5px solid #F9A08B' : '1.5px solid rgba(26,26,26,0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#1A1A1A', outline: 'none', boxShadow: isInputFocused['party'] ? '0 0 0 3px rgba(249, 160, 139, 0.12)' : 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(26,26,26,0.02)', borderRadius: '10px', border: '1px solid rgba(26,26,26,0.04)', marginTop: '8px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>Документ требует подписи?</div>
                  <div style={{ fontSize: '11px', color: '#999999', marginTop: '2px' }}>Статус будет "Ожидает подписи"</div>
                </div>
                <Toggle on={newDoc.needsSignature} onChange={() => setNewDoc(p => ({ ...p, needsSignature: !p.needsSignature }))} />
              </div>
              <button onClick={handleCreate} disabled={!newDoc.title.trim()} style={{ marginTop: 'auto', padding: '14px', background: newDoc.title.trim() ? '#F9A08B' : 'rgba(26,26,26,0.04)', border: 'none', borderRadius: '10px', color: newDoc.title.trim() ? '#FFFFFF' : '#999999', fontSize: '13px', fontWeight: 700, cursor: newDoc.title.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: newDoc.title.trim() ? '0 6px 20px rgba(249, 160, 139, 0.25)' : 'none' }}>
                Сохранить в базу
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Список документов */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 12px 32px -4px rgba(26,26,26,0.02)', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center', background: '#FAFAFA' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(26,26,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#999999' }}><Ico.Doc /></div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', marginBottom: '6px' }}>В этой папке пусто</div>
            <div style={{ fontSize: '13px', color: '#666666' }}>Загрузите новый документ или измените фильтры</div>
          </div>
        ) : filtered.map((doc, i) => {
          const sm = statusMeta[doc.status];
          const extColor = extColors[doc.ext] || '#999';
          return (
            <div key={doc.id} className={styles.docRow} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 24px', borderBottom: i < filtered.length - 1 ? '1px solid rgba(26,26,26,0.12)' : 'none', background: 'transparent', transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)', borderLeft: '3px solid transparent' }}>
              <div style={{ width: '46px', height: '52px', borderRadius: '10px', background: extColor + '15', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, gap: '4px', color: extColor, border: `1px solid ${extColor}30` }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={{ fontSize: '9px', fontWeight: 800, color: extColor, letterSpacing: '0.5px' }}>{doc.ext}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A1A', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</div>
                <div style={{ fontSize: '12px', color: '#666666', fontWeight: 500 }}>
                  <span style={{ color: '#1A1A1A', fontWeight: 600 }}>{doc.party}</span> <span style={{ opacity: 0.5, margin: '0 4px' }}>•</span> Загружен {doc.date}
                </div>
              </div>
              <div style={{ flexShrink: 0, marginRight: '16px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: sm.bg, color: sm.color, padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, border: `1px solid ${sm.color}30` }}>
                  {doc.status === 'signed' ? <Ico.Check /> : doc.status === 'pending' ? <Ico.Edit /> : null}
                  {sm.label}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => showToast('Скачивание файла...', 'info')} style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FDFCFB', border: '1px solid rgba(26,26,26,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666666', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.color = '#1A1A1A'; e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.transform = 'translateY(0)'; }} title="Скачать"><Ico.Download /></button>
                <button onClick={() => showToast('Опции документа открыты')} style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FDFCFB', border: '1px solid rgba(26,26,26,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666666', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.color = '#1A1A1A'; e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#666666'; e.currentTarget.style.transform = 'translateY(0)'; }} title="Настройки"><Ico.Dots /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '../api'
import type { StudioListItem } from '../api/auth/auth.types'
import { queryKeys } from '../api/queryKeys'
import { resolveImageUrl } from '../api/client'
import { errorMessage } from '../api/errorMessage'
import { Button, Card, useToast } from '../components/ui/index'
import { setActiveToken } from '../utils/auth';

// Инициалы студии для карточки без лого — первые буквы первых двух слов названия.
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

export default function SelectCrm() {
  const { t } = useTranslation('settings')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  const { data: studios, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: () => authApi.getStudios(),
  })

  const select = useMutation({
    mutationFn: (studioId: number) => authApi.selectStudio(studioId),
    onSuccess: (data) => {
      if (data.access_token) setActiveToken(data.access_token)
      // Кэш Query набит данными предыдущей студии (клиенты, занятия, финансы) — без
      // сброса пользователь после переключения увидит чужие данные до первого рефетча.
      qc.clear()
      navigate('/dashboard')
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #FDFCFB)', padding: '60px 24px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '10%', left: '15%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(252,174,145,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '15%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(155,181,216,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: '720px', margin: '0 auto', position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '10px', borderRadius: '14px', background: 'rgba(252,174,145,0.1)', color: 'var(--peach)', marginBottom: '16px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 950, color: '#1A1A1A', margin: 0, letterSpacing: '-1px' }}>{t('workspace.title')}</h1>
          <p style={{ fontSize: '14px', color: 'var(--muted)', marginTop: '6px', fontWeight: 500 }}>{t('workspace.subtitle')}</p>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <span className="spinner" style={{ borderColor: 'var(--peach)' }} />
          </div>
        ) : isError ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '12px' }}>{t('workspace.loadError')}</p>
            <Button variant="ghost" onClick={() => refetch()}>{t('common:errors.retry')}</Button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {(studios ?? []).map((studio) => (
              <StudioCard
                key={studio.id}
                studio={studio}
                selecting={select.isPending && select.variables === studio.id}
                onSelect={() => { if (!studio.is_current && !select.isPending) select.mutate(studio.id) }}
              />
            ))}
          </div>
        )}

        <div
          onClick={() => navigate('/onboarding?new=1')}
          style={{ borderRadius: '18px', background: '#FFFFFF', border: '1.5px dashed rgba(26,26,26,0.15)', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--peach)', fontWeight: 700, fontSize: '13.5px', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--peach)'; e.currentTarget.style.background = 'rgba(252,174,145,0.02)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.15)'; e.currentTarget.style.background = '#FFFFFF' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          {t('workspace.createNew')}
        </div>
      </div>
    </div>
  )
}

function StudioCard({ studio, selecting, onSelect }: { studio: StudioListItem; selecting: boolean; onSelect: () => void }) {
  const { t } = useTranslation(['settings', 'staff'])
  const logoSrc = resolveImageUrl(studio.logo_url)

  return (
    <Card hover={!studio.is_current} onClick={onSelect} style={{ cursor: studio.is_current ? 'default' : 'pointer', opacity: selecting ? 0.7 : 1 }}>
      {studio.is_current && (
        <span style={{ position: 'absolute', top: '16px', right: '16px', padding: '3px 10px', borderRadius: '20px', background: 'rgba(163,201,168,0.18)', color: '#2A6B35', fontSize: '11px', fontWeight: 700 }}>
          {t('settings:workspace.current')}
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: logoSrc ? 'transparent' : 'var(--peach)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '16px' }}>
          {logoSrc ? <img src={logoSrc} alt={studio.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(studio.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{studio.name}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600, marginTop: '2px' }}>{t(`staff:roles.${studio.role}`, { defaultValue: studio.role })}</div>
        </div>
      </div>

      <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
        {t('settings:workspace.membersCount', { count: studio.members_count })} · {t('settings:workspace.clientsCount', { count: studio.clients_count })}
      </div>

      {selecting && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '16px' }}>
          <span className="spinner" style={{ borderColor: 'var(--peach)' }} />
        </div>
      )}
    </Card>
  )
}

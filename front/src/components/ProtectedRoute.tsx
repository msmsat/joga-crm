import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { UserMe } from '../api/auth/auth.types'
import { startSessionCheck } from '../lib/sessionCheck'
import { getActiveToken } from '../utils/auth'

function subscribeToSession(onChange: () => void) {
  window.addEventListener('auth-context-changed', onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener('auth-context-changed', onChange)
    window.removeEventListener('storage', onChange)
  }
}

interface Props { children: ReactNode; requireOnboarding?: boolean }

export default function ProtectedRoute(props: Props) {
  const token = useSyncExternalStore(subscribeToSession, getActiveToken)
  if (!token) return <Navigate to="/login" replace />
  // A new token must be validated before rendering any of the previous user's UI.
  return <SessionRoute key={token} {...props} token={token} />
}

function SessionRoute({ token, children, requireOnboarding = true }: Props & { token: string }) {
  const { t } = useTranslation('common')
  const [user, setUser] = useState<UserMe | null>(null)
  const [failed, setFailed] = useState(false)
  const retry = useRef<() => void>(() => {})

  useEffect(() => {
    const check = startSessionCheck(token, {
      onSuccess: setUser,
      onError: () => setFailed(true),
    })
    retry.current = check.retry
    window.addEventListener('online', check.retry)
    return () => {
      window.removeEventListener('online', check.retry)
      check.stop()
    }
  }, [token])

  if (!user) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', gap: 16,
      alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      {failed ? <>
        <p role="status">{t('errors.loadFailed')}</p>
        <button className="btn-primary" onClick={() => retry.current()}>{t('errors.retry')}</button>
      </> : <span className="spinner" role="status" aria-label={t('status.loading')} style={{ borderColor: 'var(--peach)' }} />}
    </div>
  )
  if (requireOnboarding && user.is_onboarded === false) return <Navigate to="/onboarding" replace />
  if (!requireOnboarding && user.is_onboarded === true) return <Navigate to="/dashboard" replace />
  return children
}

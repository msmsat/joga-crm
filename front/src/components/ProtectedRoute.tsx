import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { UserMe } from '../api/auth/auth.types'
import { startSessionCheck } from '../lib/sessionCheck'
import { getActiveToken } from '../utils/auth'
import { ErrorFallback } from './ui/index'

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
  // Ручной повтор ждёт исхода проверки: экран держит «пробуем», пока запрос идёт.
  // Если в этот момент уже летит автоповтор, ответ на него и закроет ожидание.
  const settle = useRef<() => void>(() => {})

  useEffect(() => {
    const check = startSessionCheck(token, {
      onSuccess: (me) => { settle.current(); setUser(me) },
      onError: () => { settle.current(); setFailed(true) },
    })
    retry.current = check.retry
    window.addEventListener('online', check.retry)
    return () => {
      window.removeEventListener('online', check.retry)
      check.stop()
    }
  }, [token])

  if (!user) return failed ? (
    <div style={{ minHeight: '100dvh', display: 'flex', background: 'var(--bg)' }}>
      <ErrorFallback
        description={t('errorBoundary.offline')}
        onRetry={() => new Promise<void>(resolve => { settle.current = resolve; retry.current() })}
      />
    </div>
  ) : (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <span className="spinner" role="status" aria-label={t('status.loading')} style={{ borderColor: 'var(--peach)' }} />
    </div>
  )
  if (requireOnboarding && user.is_onboarded === false) return <Navigate to="/onboarding" replace />
  if (!requireOnboarding && user.is_onboarded === true) return <Navigate to="/dashboard" replace />
  return children
}

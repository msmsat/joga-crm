import { authApi } from '../api/auth/auth.api'
import type { UserMe } from '../api/auth/auth.types'
import { getActiveToken, rememberAccountName } from '../utils/auth'

/** Keep deployment/network failures separate from a rejected session (HTTP 401). */
export function startSessionCheck(token: string, callbacks: {
  onSuccess: (user: UserMe) => void
  onError: (error: unknown) => void
}) {
  let stopped = false
  let complete = false
  let failures = 0
  let controller: AbortController | null = null
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  const isCurrent = () => !stopped && getActiveToken() === token

  async function retry() {
    if (!isCurrent() || controller || complete) return
    clearTimeout(retryTimer)
    const request = new AbortController()
    controller = request
    timeout = setTimeout(() => request.abort(), 10_000)
    try {
      const user = await authApi.getMe(request.signal)
      if (!isCurrent()) return
      complete = true
      callbacks.onSuccess(user)
      if (user.email) rememberAccountName(user.email, user.name)
    } catch (error) {
      if (!isCurrent()) return
      callbacks.onError(error)
      const status = (error as { status?: number } | null)?.status ?? 0
      if (!status || status === 408 || status === 429 || status >= 500) {
        // Bound the request rate while the server is restarting; recover without a login.
        retryTimer = setTimeout(() => void retry(), Math.min(5_000 * ++failures, 30_000))
      }
    } finally {
      clearTimeout(timeout)
      controller = null
    }
  }

  void retry()
  return {
    retry: () => void retry(),
    stop: () => {
      stopped = true
      clearTimeout(retryTimer)
      clearTimeout(timeout)
      controller?.abort()
    },
  }
}

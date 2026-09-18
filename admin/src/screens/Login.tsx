import { useState } from 'react'
import { api } from '../lib/api'
import { session } from '../lib/session'

export function Login({ onDone }: { onDone: (name: string) => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { token, name } = await api.login(login, password)
      session.save(token)
      onDone(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="panel w-full max-w-sm p-8"
      >
        <h1 className="text-2xl font-bold">Панель платформы</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Вход только для владельца продукта</p>

        <label className="mt-6 block text-sm text-[var(--muted)]" htmlFor="admin-login">Логин</label>
        <input
          id="admin-login"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          className="field mt-1 w-full"
        />

        <label className="mt-4 block text-sm text-[var(--muted)]" htmlFor="admin-password">Пароль</label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="field mt-1 w-full"
        />

        {error && <p className="mt-4 text-sm text-[var(--alert)]">{error}</p>}

        <button
          type="submit"
          disabled={busy || !login || !password}
          className="mt-6 w-full rounded-[10px] border border-[var(--ink)] bg-[var(--ink)] py-2.5 font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[var(--line)] disabled:text-[var(--muted)]"
        >
          {busy ? 'Проверяем…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}

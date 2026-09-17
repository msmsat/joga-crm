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
    <div className="flex min-h-dvh items-center justify-center bg-[#FDFCFB] p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]"
      >
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Панель платформы</h1>
        <p className="mt-1 text-sm text-[#666]">Вход только для владельца продукта</p>

        <label className="mt-6 block text-sm text-[#666]" htmlFor="admin-login">Логин</label>
        <input
          id="admin-login"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          className="mt-1 w-full rounded-lg border border-[#E6E2DE] px-3 py-2 outline-none focus:border-[#FCAE91]"
        />

        <label className="mt-4 block text-sm text-[#666]" htmlFor="admin-password">Пароль</label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-[#E6E2DE] px-3 py-2 outline-none focus:border-[#FCAE91]"
        />

        {error && <p className="mt-4 text-sm text-[#D88C9A]">{error}</p>}

        <button
          type="submit"
          disabled={busy || !login || !password}
          className="mt-6 w-full rounded-lg bg-[#FCAE91] py-2.5 font-semibold text-[#1A1A1A] disabled:opacity-50"
        >
          {busy ? 'Проверяем…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}

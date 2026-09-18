import { useEffect, useState } from 'react'
import { Shell, type Tab } from './components/Shell'
import { api } from './lib/api'
import { session } from './lib/session'
import { Accounts } from './screens/Accounts'
import { Feed } from './screens/Feed'
import { Login } from './screens/Login'
import { Overview } from './screens/Overview'
import { Visits } from './screens/Visits'

export default function App() {
  // Роутера нет намеренно — как в мини-приложении: экранов пять, и состояние
  // описывает их дешевле, чем библиотека маршрутизации. Заодно бэкенду не нужен
  // catch-all, который перехватывал бы пути API.
  const [name, setName] = useState<string | null>(null)
  // Нет токена — проверять нечего, и экран входа показывается сразу. Начальное
  // значение выводится из хранилища, а не выставляется потом из эффекта: иначе
  // первый кадр пустой, а линтер справедливо ругается на setState в эффекте.
  const [checked, setChecked] = useState(() => !session.read())
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    if (!session.read()) return
    api.get<{ name: string }>('/me')
      .then((me) => setName(me.name))
      .catch(() => session.clear())
      .finally(() => setChecked(true))
  }, [])

  if (!checked) return null
  if (!name) return <Login onDone={setName} />

  return (
    <Shell tab={tab} onTab={setTab} name={name} onLogout={() => { session.clear(); setName(null) }}>
      {tab === 'overview' && <Overview />}
      {tab === 'visits' && <Visits />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'feed' && <Feed />}
    </Shell>
  )
}

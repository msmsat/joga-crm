import { useState } from 'react'

export function useTgBot() {
  const [connected, setConnected] = useState(false)
  const [botName, setBotName]     = useState('')
  const [token, setToken]         = useState('')

  function connect(rawToken: string) {
    const name = rawToken.split(':')[0] ?? 'velora_bot'
    setBotName(name)
    setToken(rawToken)
    setConnected(true)
  }

  function disconnect() {
    setConnected(false)
    setBotName('')
    setToken('')
  }

  return { connected, botName, token, connect, disconnect }
}

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { queryClient } from './queries'
import { store } from './store'
import type { Company, User } from './types'

interface Session {
  ready: boolean
  user: User | null
  company: Company | null
  refresh: () => Promise<void>
  setCompany: (c: Company) => void
}
const SessionCtx = createContext<Session>(null as unknown as Session)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [company, setCompany] = useState<Company | null>(null)

  const refresh = useCallback(async () => {
    const u = await store.getUser()
    queryClient.clear() // never show cached data of a previous login
    setUser(u)
    setCompany(u ? await store.getCompany().catch(() => null) : null)
    setReady(true)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <SessionCtx.Provider value={{ ready, user, company, refresh, setCompany }}>{children}</SessionCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSession = () => useContext(SessionCtx)

/** Drivers can write invoices; settings, bank and corrections are for the owner. */
// eslint-disable-next-line react-refresh/only-export-components
export const useIsOwner = () => useContext(SessionCtx).company?.role !== 'driver'

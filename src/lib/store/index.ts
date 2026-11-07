import { localStore } from './local'
import { createSupabaseStore } from './supabase'
import type { Store } from './types'

declare const __DEMO_BUILD__: boolean

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Cloud mode when Supabase keys are configured, otherwise demo mode (browser storage). */
export const store: Store = !__DEMO_BUILD__ && url && key ? createSupabaseStore(url, key) : localStore

export type { Store } from './types'

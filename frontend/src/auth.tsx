import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, TOKEN_KEY } from './api/client'

export interface Usuario {
  id: number
  usuario: string
  nombre: string
  rol: 'admin' | 'planillero'
  activo: boolean
}

interface AuthCtx {
  user: Usuario | null | undefined // undefined = comprobando sesión
  esAdmin: boolean
  login: (usuario: string, password: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<Usuario | null | undefined>(undefined)

  const logout = useCallback(() => {
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* sin almacenamiento */ }
    qc.clear()
    setUser(null)
  }, [qc])

  useEffect(() => {
    let token: string | null = null
    try { token = localStorage.getItem(TOKEN_KEY) } catch { /* sin almacenamiento */ }
    if (!token) { setUser(null); return }
    api.get<Usuario>('/auth/me').then((r) => setUser(r.data)).catch(() => setUser(null))
  }, [])

  useEffect(() => {
    window.addEventListener('auth:expirada', logout)
    return () => window.removeEventListener('auth:expirada', logout)
  }, [logout])

  const login = async (usuario: string, password: string) => {
    const r = await api.post<{ token: string; usuario: Usuario }>('/auth/login', { usuario, password })
    try { localStorage.setItem(TOKEN_KEY, r.data.token) } catch { /* sin almacenamiento */ }
    setUser(r.data.usuario)
  }

  return <Ctx.Provider value={{ user, esAdmin: user?.rol === 'admin', login, logout }}>{children}</Ctx.Provider>
}

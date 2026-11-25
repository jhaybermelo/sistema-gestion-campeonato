import { useEffect, useRef } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, CalendarDays, Layers, LogOut, Settings, Shield, Trophy, UserCircle, Users } from 'lucide-react'
import clsx from 'clsx'
import { api } from './api/client'
import { useAuth } from './auth'
import type { Config } from './types'
import LoginPage from './pages/LoginPage'
import PartidosPage from './pages/PartidosPage'
import PartidoLivePage from './pages/PartidoLivePage'
import ActaPage from './pages/ActaPage'
import EquiposPage from './pages/EquiposPage'
import CategoriasPage from './pages/CategoriasPage'
import TablaPage from './pages/TablaPage'
import EstadisticasPage from './pages/EstadisticasPage'
import ConfigPage from './pages/ConfigPage'
import UsuariosPage from './pages/UsuariosPage'
import CuentaPage from './pages/CuentaPage'

// 'todos' = admin, planillero y delegado. El planillero no ve Equipos; el delegado sí (sus planillas y las de su categoría).
const TABS = [
  { to: '/partidos', label: 'Partidos', icon: CalendarDays, roles: ['admin', 'planillero', 'delegado'] },
  { to: '/categorias', label: 'Categorías', icon: Layers, roles: ['admin'] },
  { to: '/equipos', label: 'Equipos', icon: Shield, roles: ['admin', 'delegado'] },
  { to: '/tabla', label: 'Tabla', icon: Trophy, roles: ['admin', 'planillero', 'delegado'] },
  { to: '/estadisticas', label: 'Goleadores', icon: BarChart3, roles: ['admin', 'planillero', 'delegado'] },
  { to: '/usuarios', label: 'Usuarios', icon: Users, roles: ['admin'] },
  { to: '/config', label: 'Ajustes', icon: Settings, roles: ['admin'] },
]

function Layout() {
  const { user, logout } = useAuth()
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  // En móvil el menú se desliza: llevamos la pestaña activa a la vista.
  useEffect(() => {
    navRef.current?.querySelector('a[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [pathname])
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: async () => (await api.get<Config>('/config')).data })
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 px-4 pt-2 lg:py-2">
          <h1 className="order-1 min-w-0 flex-1 truncate text-base font-bold sm:text-lg">⚽ {cfg?.nombre ?? 'Campeonato'}</h1>
          <div className="order-2 flex shrink-0 items-center lg:order-3">
            <NavLink to="/cuenta" title="Mi cuenta" className={({ isActive }) => clsx('flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm', isActive ? 'bg-slate-700' : 'text-slate-300 hover:bg-slate-800')}>
              <UserCircle size={18} /> <span className="hidden max-w-[10rem] truncate sm:inline">{user?.nombre}</span>
            </NavLink>
            <button onClick={logout} title="Cerrar sesión" className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800">
              <LogOut size={18} />
            </button>
          </div>
          <nav ref={navRef} className="order-3 -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] lg:order-2 lg:mx-0 lg:w-auto lg:p-0 [&::-webkit-scrollbar]:hidden">
            {TABS.filter((t) => user && t.roles.includes(user.rol)).map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'flex min-h-10 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition',
                    isActive ? 'bg-emerald-500 text-slate-900' : 'text-slate-300 hover:bg-slate-800',
                  )
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-3 sm:p-4">
        <Outlet />
      </main>
    </div>
  )
}

/** Páginas solo para administradores: un planillero que escriba la dirección vuelve a Partidos. */
function SoloAdmin({ children }: { children: React.ReactNode }) {
  const { esAdmin } = useAuth()
  return esAdmin ? <>{children}</> : <Navigate to="/partidos" replace />
}

export default function App() {
  const { user } = useAuth()
  if (user === undefined) return <div className="p-8 text-center text-slate-500">Cargando…</div>
  if (user === null) return <LoginPage />
  return (
    <Routes>
      <Route path="/partidos/:id/acta" element={<ActaPage />} />
      <Route element={<Layout />}>
        <Route path="/partidos" element={<PartidosPage />} />
        <Route path="/partidos/:id" element={<PartidoLivePage />} />
        <Route path="/tabla" element={<TablaPage />} />
        <Route path="/estadisticas" element={<EstadisticasPage />} />
        <Route path="/cuenta" element={<CuentaPage />} />
        <Route path="/categorias" element={<SoloAdmin><CategoriasPage /></SoloAdmin>} />
        <Route path="/equipos" element={<EquiposPage />} />
        <Route path="/usuarios" element={<SoloAdmin><UsuariosPage /></SoloAdmin>} />
        <Route path="/config" element={<SoloAdmin><ConfigPage /></SoloAdmin>} />
        <Route path="*" element={<Navigate to="/partidos" replace />} />
      </Route>
    </Routes>
  )
}

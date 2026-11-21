import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'
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

const TABS = [
  { to: '/partidos', label: 'Partidos', icon: CalendarDays, admin: false },
  { to: '/categorias', label: 'Categorías', icon: Layers, admin: true },
  { to: '/equipos', label: 'Equipos', icon: Shield, admin: true },
  { to: '/tabla', label: 'Tabla', icon: Trophy, admin: false },
  { to: '/estadisticas', label: 'Goleadores', icon: BarChart3, admin: false },
  { to: '/usuarios', label: 'Usuarios', icon: Users, admin: true },
  { to: '/config', label: 'Ajustes', icon: Settings, admin: true },
]

function Layout() {
  const { user, esAdmin, logout } = useAuth()
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: async () => (await api.get<Config>('/config')).data })
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <h1 className="text-base font-bold sm:text-lg">⚽ {cfg?.nombre ?? 'Campeonato'}</h1>
          <nav className="flex flex-wrap items-center gap-1">
            {TABS.filter((t) => esAdmin || !t.admin).map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive ? 'bg-emerald-500 text-slate-900' : 'text-slate-300 hover:bg-slate-800',
                  )
                }
              >
                <Icon size={16} />
                <span className="hidden lg:inline">{label}</span>
              </NavLink>
            ))}
            <span className="mx-1 hidden h-6 w-px bg-slate-700 sm:block" />
            <NavLink to="/cuenta" title="Mi cuenta" className={({ isActive }) => clsx('flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm', isActive ? 'bg-slate-700' : 'text-slate-300 hover:bg-slate-800')}>
              <UserCircle size={16} /> <span className="hidden sm:inline">{user?.nombre}</span>
            </NavLink>
            <button onClick={logout} title="Cerrar sesión" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
              <LogOut size={16} />
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">
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
        <Route path="/equipos" element={<SoloAdmin><EquiposPage /></SoloAdmin>} />
        <Route path="/usuarios" element={<SoloAdmin><UsuariosPage /></SoloAdmin>} />
        <Route path="/config" element={<SoloAdmin><ConfigPage /></SoloAdmin>} />
        <Route path="*" element={<Navigate to="/partidos" replace />} />
      </Route>
    </Routes>
  )
}

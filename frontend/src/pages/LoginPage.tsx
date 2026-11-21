import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { errorToast } from '../api/client'
import { useAuth } from '../auth'

export default function LoginPage() {
  const { login } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    try { await login(usuario.trim(), password) } catch (err) { errorToast(err) } finally { setCargando(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="text-center">
          <div className="text-5xl">⚽</div>
          <h1 className="mt-2 text-xl font-extrabold">Campeonato de Fútbol de Salón</h1>
          <p className="text-sm text-slate-500">Inicia sesión para continuar</p>
        </div>
        <div>
          <label className="lbl">Usuario</label>
          <input className="input" autoFocus autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </div>
        <div>
          <label className="lbl">Contraseña</label>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-pri w-full !py-3" disabled={!usuario || !password || cargando}>
          <LogIn size={18} /> {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

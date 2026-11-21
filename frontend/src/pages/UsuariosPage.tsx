import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { api, errorToast } from '../api/client'
import { useAuth, type Usuario } from '../auth'

const ROL = { admin: 'Administrador', planillero: 'Planillero' } as const

export default function UsuariosPage() {
  const qc = useQueryClient()
  const { user: yo } = useAuth()
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => (await api.get<Usuario[]>('/usuarios')).data,
  })
  const [editId, setEditId] = useState<number | null>(null)
  const [usuario, setUsuario] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<Usuario['rol']>('planillero')
  const [activo, setActivo] = useState(true)
  const [password, setPassword] = useState('')

  const limpiar = () => { setEditId(null); setUsuario(''); setNombre(''); setRol('planillero'); setActivo(true); setPassword('') }
  const refrescar = () => qc.invalidateQueries({ queryKey: ['usuarios'] })

  const guardar = useMutation({
    mutationFn: async () => {
      if (editId) await api.put(`/usuarios/${editId}`, { nombre, rol, activo, password: password || null })
      else await api.post('/usuarios', { usuario, nombre, rol, password })
    },
    onSuccess: () => { toast.success(editId ? 'Usuario actualizado' : 'Usuario creado'); limpiar(); refrescar() },
    onError: errorToast,
  })
  const borrar = useMutation({
    mutationFn: (id: number) => api.delete(`/usuarios/${id}`),
    onSuccess: () => { toast.success('Usuario eliminado'); refrescar() },
    onError: errorToast,
  })

  const editar = (u: Usuario) => {
    setEditId(u.id); setUsuario(u.usuario); setNombre(u.nombre); setRol(u.rol); setActivo(u.activo); setPassword('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const valido = nombre.trim() && (editId ? !password || password.length >= 8 : /^[A-Za-z0-9._-]{3,30}$/.test(usuario) && password.length >= 8)

  return (
    <div className="grid gap-4 md:grid-cols-[360px_1fr]">
      <form className="card h-fit space-y-3" onSubmit={(e) => { e.preventDefault(); if (valido) guardar.mutate() }}>
        <h2 className="text-lg font-bold">{editId ? 'Editar usuario' : 'Nuevo usuario'}</h2>
        <div>
          <label className="lbl">Usuario (para entrar)</label>
          <input className="input" disabled={!!editId} placeholder="Ej: mesa1" autoComplete="off" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          {!editId && <p className="mt-1 text-xs text-slate-400">3 a 30 caracteres: letras, números, punto, guion.</p>}
        </div>
        <div><label className="lbl">Nombre</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <div>
          <label className="lbl">Rol</label>
          <select className="input" value={rol} onChange={(e) => setRol(e.target.value as Usuario['rol'])}>
            <option value="planillero">Planillero: opera los partidos</option>
            <option value="admin">Administrador: todo</option>
          </select>
        </div>
        <div>
          <label className="lbl">{editId ? 'Nueva contraseña (déjala vacía para no cambiarla)' : 'Contraseña (mínimo 8 caracteres)'}</label>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {editId && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Usuario activo
          </label>
        )}
        <div className="flex gap-2">
          <button className="btn btn-pri" disabled={!valido || guardar.isPending}>{editId ? 'Guardar cambios' : <><Plus size={16} /> Crear usuario</>}</button>
          {editId && <button type="button" className="btn btn-sec" onClick={limpiar}>Cancelar</button>}
        </div>
      </form>

      <div className="card">
        <h2 className="mb-3 text-lg font-bold">Usuarios ({usuarios.length})</h2>
        <div className="divide-y divide-slate-100">
          {usuarios.map((u) => (
            <div key={u.id} className={clsx('flex flex-wrap items-center gap-3 py-2.5', !u.activo && 'opacity-50')}>
              <div className="min-w-[160px] flex-1">
                <div className="font-semibold">{u.nombre} {u.id === yo?.id && <span className="text-xs font-normal text-slate-400">(tú)</span>}</div>
                <div className="text-xs text-slate-500">@{u.usuario}{!u.activo && ' · desactivado'}</div>
              </div>
              <span className={clsx('rounded-full px-3 py-1 text-xs font-semibold', u.rol === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>{ROL[u.rol]}</span>
              <button className="btn btn-sec !px-2 !py-1.5" title="Editar o restablecer contraseña" onClick={() => editar(u)}>{<Pencil size={14} />}<KeyRound size={14} /></button>
              <button className="btn btn-sec !px-2 !py-1.5" disabled={u.id === yo?.id} title="Eliminar" onClick={() => confirm(`¿Eliminar a ${u.nombre}?`) && borrar.mutate(u.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

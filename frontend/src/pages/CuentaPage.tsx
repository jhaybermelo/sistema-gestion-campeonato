import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api, errorToast } from '../api/client'
import { useAuth } from '../auth'

export default function CuentaPage() {
  const { user } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repite, setRepite] = useState('')
  const cambiar = useMutation({
    mutationFn: () => api.post('/auth/cambiar-password', { actual, nueva }),
    onSuccess: () => { toast.success('Contraseña actualizada'); setActual(''); setNueva(''); setRepite('') },
    onError: errorToast,
  })
  const valido = actual && nueva.length >= 8 && nueva === repite
  return (
    <form className="card mx-auto max-w-md space-y-3" onSubmit={(e) => { e.preventDefault(); if (valido) cambiar.mutate() }}>
      <h2 className="text-xl font-bold">Mi cuenta</h2>
      <p className="text-sm text-slate-600">
        {user?.nombre} · usuario <b>{user?.usuario}</b> · {user?.rol === 'admin' ? 'Administrador' : 'Planillero'}
      </p>
      <div><label className="lbl">Contraseña actual</label><input className="input" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} /></div>
      <div><label className="lbl">Contraseña nueva (mínimo 8 caracteres)</label><input className="input" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} /></div>
      <div>
        <label className="lbl">Repite la contraseña nueva</label>
        <input className="input" type="password" autoComplete="new-password" value={repite} onChange={(e) => setRepite(e.target.value)} />
        {repite && nueva !== repite && <p className="mt-1 text-xs text-red-600">No coinciden</p>}
      </div>
      <button className="btn btn-pri" disabled={!valido || cambiar.isPending}>Cambiar contraseña</button>
    </form>
  )
}

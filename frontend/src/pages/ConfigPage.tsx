import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, errorToast } from '../api/client'
import type { Config } from '../types'

export default function ConfigPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['config'], queryFn: async () => (await api.get<Config>('/config')).data })
  const [f, setF] = useState<Config | null>(null)
  useEffect(() => { if (data) setF(data) }, [data])
  const guardar = useMutation({
    mutationFn: () => api.put('/config', { ...f, fases: undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); toast.success('Configuración guardada') },
    onError: errorToast,
  })
  const descargar = async () => {
    try {
      const r = await api.get('/respaldo', { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(r.data)
      a.download = `respaldo-campeonato-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) { errorToast(e) }
  }
  if (!f) return null
  const num = (k: keyof Config, label: string, hint?: string) => (
    <div>
      <label className="lbl">{label}</label>
      <input className="input" type="number" min={0} value={f[k] as number} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <form className="card space-y-4" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
        <h2 className="text-xl font-bold">Ajustes del campeonato</h2>
        <div>
          <label className="lbl">Nombre del campeonato</label>
          <input className="input" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {num('duracion_min', 'Minutos por tiempo')}
          {num('num_tiempos', 'Número de tiempos')}
          {num('limite_faltas', 'Límite de faltas por tiempo')}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {num('pts_ganado', 'Puntos por ganar')}
          {num('pts_empate', 'Puntos por empatar')}
          {num('pts_perdido', 'Puntos por perder')}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {num('max_jugadores', 'Máximo de jugadores por planilla')}
          {num('min_jugadores', 'Mínimo de jugadores para jugar', '0 = sin mínimo. La AMF indica 7 inscritos.')}
          {num('descanso_min', 'Descanso entre tiempos (min)')}
          <div>
            <label className="lbl">Goleador cuenta desde</label>
            <select className="input" value={f.fase_goleador} onChange={(e) => setF({ ...f, fase_goleador: e.target.value })}>
              {f.fases.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Valla menos vencida cuenta desde</label>
            <select className="input" value={f.fase_valla} onChange={(e) => setF({ ...f, fase_valla: e.target.value })}>
              {f.fases.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          La planilla de cada equipo se cierra cuando inicia su primer partido. Los rankings cuentan los partidos de la fase elegida y de las posteriores
          (por ejemplo, «Semifinal» incluye semifinal, tercer puesto y final). La duración y el número de tiempos aplican a los partidos que crees desde ahora.
        </p>
        <button className="btn btn-pri" disabled={guardar.isPending}>Guardar</button>
      </form>
      <div className="card space-y-2">
        <h2 className="text-xl font-bold">Copia de seguridad</h2>
        <p className="text-sm text-slate-600">Toda la información se guarda en la base de datos del servidor. Además puedes descargar una copia completa en un archivo.</p>
        <button className="btn btn-sec" onClick={descargar}><Download size={16} /> Descargar respaldo (JSON)</button>
      </div>
    </div>
  )
}

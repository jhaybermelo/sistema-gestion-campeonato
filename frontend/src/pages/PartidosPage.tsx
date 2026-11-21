import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { api, errorToast, fmtFecha } from '../api/client'
import { useAuth } from '../auth'
import type { Equipo, PartidoDetalle, PartidoResumen } from '../types'

const ETIQUETA = { programado: 'Programado', en_juego: 'En juego', finalizado: 'Finalizado' } as const

function NuevoPartido({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos'],
    queryFn: async () => (await api.get<Equipo[]>('/equipos')).data,
  })
  const activos = equipos.filter((e) => e.activo)
  const [local, setLocal] = useState('')
  const catLocal = activos.find((e) => String(e.id) === local)?.categoria_id
  const [visit, setVisit] = useState('')
  const [fecha, setFecha] = useState(new Date().toLocaleDateString('en-CA'))
  const [hora, setHora] = useState('')
  const [cancha, setCancha] = useState('')
  const [jornada, setJornada] = useState('')

  const crear = useMutation({
    mutationFn: async () =>
      (
        await api.post<PartidoDetalle>('/partidos', {
          local_id: Number(local),
          visitante_id: Number(visit),
          fecha,
          hora: hora || null,
          cancha,
          jornada,
        })
      ).data,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['partidos'] })
      toast.success('Partido creado')
      nav(`/partidos/${p.id}`)
    },
    onError: errorToast,
  })

  const nJ = (id: string) => equipos.find((e) => e.id === Number(id))?.num_jugadores
  const valido = local && visit && local !== visit && fecha

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Nuevo partido</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {activos.length < 2 ? (
          <p className="text-sm text-slate-600">
            Primero registra al menos 2 equipos en la sección <Link className="font-semibold text-emerald-700 underline" to="/equipos">Equipos</Link>.
          </p>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => { e.preventDefault(); if (valido) crear.mutate() }}
          >
            <div>
              <label className="lbl">Equipo local</label>
              <select className="input" value={local} onChange={(e) => { setLocal(e.target.value); setVisit('') }} autoFocus>
                <option value="">Seleccionar…</option>
                {activos.filter((e) => String(e.id) !== visit).map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}{e.categoria ? ` — ${e.categoria}` : ''}</option>
                ))}
              </select>
              {local && <p className="mt-1 text-xs text-slate-500">{nJ(local)} jugadores se cargarán solos</p>}
            </div>
            <div>
              <label className="lbl">Equipo visitante</label>
              <select className="input" value={visit} onChange={(e) => setVisit(e.target.value)}>
                <option value="">Seleccionar…</option>
                {activos.filter((e) => String(e.id) !== local && (!local || e.categoria_id === catLocal)).map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}{e.categoria ? ` — ${e.categoria}` : ''}</option>
                ))}
              </select>
              {visit && <p className="mt-1 text-xs text-slate-500">{nJ(visit)} jugadores se cargarán solos</p>}
              {local && <p className="mt-1 text-xs text-emerald-700">Solo se muestran rivales de la misma categoría.</p>}
            </div>
            <div>
              <label className="lbl">Fecha</label>
              <input type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <label className="lbl">Hora (opcional)</label>
              <input type="time" className="input" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
            <div>
              <label className="lbl">Cancha (opcional)</label>
              <input className="input" value={cancha} onChange={(e) => setCancha(e.target.value)} />
            </div>
            <div>
              <label className="lbl">Jornada / fase (opcional)</label>
              <input className="input" placeholder="Ej: Fecha 3" value={jornada} onChange={(e) => setJornada(e.target.value)} />
            </div>
            <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="btn btn-sec" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-pri" disabled={!valido || crear.isPending}>Crear y abrir</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function Tarjeta({ p, onDelete }: { p: PartidoResumen; onDelete: () => void }) {
  const { esAdmin } = useAuth()
  return (
    <div className="card flex flex-wrap items-center gap-3">
      <Link to={`/partidos/${p.id}`} className="min-w-[240px] flex-1">
        <div className="flex items-center gap-3 text-base font-bold">
          <span className="flex-1 text-right">{p.local}</span>
          <span className={clsx('rounded-lg px-3 py-1 text-lg tabular-nums', p.estado === 'programado' ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white')}>
            {p.estado === 'programado' ? 'vs' : `${p.goles_local} - ${p.goles_visitante}`}
          </span>
          <span className="flex-1">{p.visitante}</span>
        </div>
        <div className="mt-1 text-center text-xs text-slate-500">
          {p.categoria && <b>{p.categoria} · </b>}{fmtFecha(p.fecha)} {p.hora ?? ''} {p.cancha && `· ${p.cancha}`} {p.jornada && `· ${p.jornada}`}
        </div>
      </Link>
      <span className={clsx('rounded-full px-3 py-1 text-xs font-semibold',
        p.estado === 'en_juego' ? 'bg-emerald-100 text-emerald-800' : p.estado === 'finalizado' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800')}>
        {p.estado === 'en_juego' ? `● ${p.periodo}º tiempo` : ETIQUETA[p.estado]}
      </span>
      <Link to={`/partidos/${p.id}`} className="btn btn-pri">{p.estado === 'finalizado' ? 'Ver' : p.estado === 'en_juego' ? 'Continuar' : 'Abrir'}</Link>
      {esAdmin && <button className="btn btn-sec" title="Eliminar" onClick={onDelete}><Trash2 size={16} /></button>}
    </div>
  )
}

export default function PartidosPage() {
  const qc = useQueryClient()
  const { esAdmin } = useAuth()
  const [modal, setModal] = useState(false)
  const { data: partidos = [], isLoading } = useQuery({
    queryKey: ['partidos'],
    queryFn: async () => (await api.get<PartidoResumen[]>('/partidos')).data,
    refetchInterval: 10000,
  })
  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/partidos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partidos'] }); toast.success('Partido eliminado') },
    onError: errorToast,
  })
  const borrar = (p: PartidoResumen) => {
    if (confirm(`¿Eliminar el partido ${p.local} vs ${p.visitante}? Se perderán sus eventos.`)) del.mutate(p.id)
  }

  const grupos: [string, PartidoResumen[]][] = [
    ['En juego', partidos.filter((p) => p.estado === 'en_juego')],
    ['Programados', partidos.filter((p) => p.estado === 'programado')],
    ['Finalizados', partidos.filter((p) => p.estado === 'finalizado').reverse()],
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Partidos</h2>
        {esAdmin && <button className="btn btn-pri" onClick={() => setModal(true)}><Plus size={18} /> Nuevo partido</button>}
      </div>
      {isLoading && <p className="text-slate-500">Cargando…</p>}
      {!isLoading && partidos.length === 0 && (
        <div className="card py-10 text-center text-slate-500">
          Aún no hay partidos.{esAdmin && <> Pulsa <b>Nuevo partido</b> y elige los equipos.</>}
        </div>
      )}
      {grupos.map(([titulo, lista]) =>
        lista.length ? (
          <section key={titulo} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo} ({lista.length})</h3>
            {lista.map((p) => <Tarjeta key={p.id} p={p} onDelete={() => borrar(p)} />)}
          </section>
        ) : null,
      )}
      {modal && <NuevoPartido onClose={() => setModal(false)} />}
    </div>
  )
}

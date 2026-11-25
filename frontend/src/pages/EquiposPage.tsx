import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Lock, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { api, errorToast } from '../api/client'
import { useCategorias } from '../api/hooks'
import { useAuth } from '../auth'
import type { Equipo, Jugador } from '../types'

function FilaJugador({ j, puedeEditar, onChange }: { j: Jugador; puedeEditar: boolean; onChange: () => void }) {
  const [edit, setEdit] = useState(false)
  const [numero, setNumero] = useState(String(j.numero))
  const [nombre, setNombre] = useState(j.nombre)
  const [documento, setDocumento] = useState(j.documento)
  const [anio, setAnio] = useState(j.anio_nacimiento ? String(j.anio_nacimiento) : '')
  const guardar = useMutation({
    mutationFn: () => api.put(`/jugadores/${j.id}`, { numero: Number(numero), nombre, documento, anio_nacimiento: anio ? Number(anio) : null }),
    onSuccess: () => { setEdit(false); onChange() },
    onError: errorToast,
  })
  const borrar = useMutation({
    mutationFn: () => api.delete(`/jugadores/${j.id}`),
    onSuccess: onChange,
    onError: errorToast,
  })

  if (edit)
    return (
      <tr className="bg-amber-50">
        <td colSpan={5} className="p-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-16"><label className="lbl">N°</label><input className="input" type="number" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
            <div className="min-w-[160px] flex-1"><label className="lbl">Nombre</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
            <div className="w-24"><label className="lbl">Año nac.</label><input className="input" type="number" placeholder="Año" value={anio} onChange={(e) => setAnio(e.target.value)} /></div>
            <div className="min-w-[120px] flex-1"><label className="lbl">Documento</label><input className="input" value={documento} onChange={(e) => setDocumento(e.target.value)} /></div>
            <button className="btn btn-pri btn-icon" title="Guardar" onClick={() => guardar.mutate()}><Check size={16} /></button>
            <button className="btn btn-sec btn-icon" title="Cancelar" onClick={() => setEdit(false)}><X size={16} /></button>
          </div>
        </td>
      </tr>
    )
  return (
    <tr className="border-t border-slate-100">
      <td className="p-2 text-center font-bold text-emerald-700">{j.numero}</td>
      <td className="p-2">
        {j.nombre}
        <div className="text-xs text-slate-500 sm:hidden">{j.anio_nacimiento ?? '—'}{j.documento && ` · ${j.documento}`}</div>
      </td>
      <td className="hidden p-2 text-slate-500 sm:table-cell">{j.anio_nacimiento ?? '—'}</td>
      <td className="hidden p-2 text-slate-500 sm:table-cell">{j.documento}</td>
      <td className="whitespace-nowrap p-2 text-right">
        {puedeEditar && (
          <>
            <button className="btn btn-sec btn-icon" title="Editar" onClick={() => setEdit(true)}><Pencil size={14} /></button>{' '}
            <button className="btn btn-sec btn-icon" title="Quitar" onClick={() => confirm(`¿Quitar a ${j.nombre} de la planilla?`) && borrar.mutate()}><Trash2 size={14} /></button>
          </>
        )}
      </td>
    </tr>
  )
}

function Detalle({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const qc = useQueryClient()
  const { esAdmin, esDelegado } = useAuth()
  const { data: e } = useQuery({
    queryKey: ['equipo', id],
    queryFn: async () => (await api.get<Equipo>(`/equipos/${id}`)).data,
  })
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['equipo', id] })
    qc.invalidateQueries({ queryKey: ['equipos'] })
  }
  const [numero, setNumero] = useState('')
  const [nombre, setNombre] = useState('')
  const [documento, setDocumento] = useState('')
  const [anio, setAnio] = useState('')
  const [editEq, setEditEq] = useState(false)
  const [eq, setEq] = useState({ nombre: '', delegado: '', telefono: '', categoria_id: '' })
  const { data: categorias = [] } = useCategorias()

  const addJ = useMutation({
    mutationFn: () => api.post(`/equipos/${id}/jugadores`, { numero: Number(numero === '' ? siguienteNumero : numero), nombre, documento, anio_nacimiento: anio ? Number(anio) : null }),
    onSuccess: () => { setNumero(''); setNombre(''); setDocumento(''); setAnio(''); refrescar(); document.getElementById('jug-nombre')?.focus() },
    onError: errorToast,
  })
  const saveEq = useMutation({
    mutationFn: () => api.put(`/equipos/${id}`, { ...eq, categoria_id: eq.categoria_id ? Number(eq.categoria_id) : null, activo: e?.activo ?? true }),
    onSuccess: () => { setEditEq(false); refrescar(); toast.success('Equipo actualizado') },
    onError: errorToast,
  })
  const toggleActivo = useMutation({
    mutationFn: () => api.put(`/equipos/${id}`, { nombre: e!.nombre, delegado: e!.delegado, telefono: e!.telefono, categoria_id: e!.categoria_id, activo: !e!.activo }),
    onSuccess: refrescar,
    onError: errorToast,
  })
  const delEq = useMutation({
    mutationFn: () => api.delete(`/equipos/${id}`),
    onSuccess: () => { refrescar(); onDeleted() },
    onError: errorToast,
  })

  if (!e) return <div className="card">Cargando…</div>
  const jugadores = e.jugadores ?? []
  const maximo = e.max_jugadores ?? 12
  const minimo = e.min_jugadores ?? 0
  const lleno = jugadores.length >= maximo
  const puedeEditar = !!e.puede_editar_plantel
  const siguienteNumero = Math.max(0, ...jugadores.map((j) => j.numero)) + 1

  return (
    <div className="card space-y-4">
      {editEq ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <div><label className="lbl">Nombre</label><input className="input" value={eq.nombre} onChange={(x) => setEq({ ...eq, nombre: x.target.value })} /></div>
          <div><label className="lbl">Delegado</label><input className="input" value={eq.delegado} onChange={(x) => setEq({ ...eq, delegado: x.target.value })} /></div>
          <div><label className="lbl">Teléfono</label><input className="input" value={eq.telefono} onChange={(x) => setEq({ ...eq, telefono: x.target.value })} /></div>
          <div><label className="lbl">Categoría</label>
            <select className="input" value={eq.categoria_id} onChange={(x) => setEq({ ...eq, categoria_id: x.target.value })}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn btn-pri" onClick={() => saveEq.mutate()}>Guardar</button>
            <button className="btn btn-sec" onClick={() => setEditEq(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">{e.nombre} {!e.activo && <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs">Inactivo</span>}</h2>
            <p className="text-sm text-slate-500">
              <span className="mr-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{e.categoria ?? 'Sin categoría'}</span>
              Delegado: {e.delegado || '—'}{esAdmin && ` · Tel: ${e.telefono || '—'}`}
            </p>
          </div>
          {esAdmin && (
            <div className="flex gap-2">
              <button className="btn btn-sec" onClick={() => { setEq({ nombre: e.nombre, delegado: e.delegado, telefono: e.telefono, categoria_id: e.categoria_id ? String(e.categoria_id) : '' }); setEditEq(true) }}><Pencil size={14} /> Editar</button>
              <button className="btn btn-sec" onClick={() => toggleActivo.mutate()}>{e.activo ? 'Desactivar' : 'Activar'}</button>
              <button className="btn btn-sec btn-icon" title="Eliminar equipo" onClick={() => confirm(`¿Eliminar ${e.nombre}?`) && delEq.mutate()}><Trash2 size={14} /></button>
            </div>
          )}
        </div>
      )}

      {/* Estado de la planilla */}
      <div className={clsx('flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm', e.planilla_cerrada ? 'bg-slate-100 text-slate-700' : 'bg-emerald-50 text-emerald-900')}>
        <span className="font-bold">Planilla: {jugadores.length}/{maximo} jugadores</span>
        {minimo > 0 && (
          <span className={clsx('rounded px-2 py-0.5 text-xs font-semibold', jugadores.length < minimo ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900')}>
            {jugadores.length < minimo ? `Faltan ${minimo - jugadores.length} para el mínimo (${minimo})` : `Mínimo ${minimo} cumplido`}
          </span>
        )}
        {esDelegado && !e.es_propio ? (
          <span className="flex items-center gap-1">{e.planilla_cerrada && <Lock size={14} />} Solo lectura: es un equipo rival de tu categoría{e.planilla_cerrada ? ' (planilla cerrada).' : '.'}</span>
        ) : e.planilla_cerrada ? (
          <span className="flex items-center gap-1"><Lock size={14} /> Cerrada: el equipo ya inició su primer partido{esDelegado ? ' y no puedes modificarla.' : '.'}</span>
        ) : (
          <span>Abierta: se cierra cuando el equipo inicie su primer partido.</span>
        )}
      </div>

      {puedeEditar && !lleno && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg bg-emerald-50 p-3"
          onSubmit={(ev) => { ev.preventDefault(); if (nombre) addJ.mutate() }}
        >
          <div className="w-20"><label className="lbl">N°</label>
            <input className="input" type="number" min={0} value={numero} placeholder={String(siguienteNumero)} onChange={(x) => setNumero(x.target.value)} />
          </div>
          <div className="min-w-[160px] flex-1"><label className="lbl">Nombre del jugador</label>
            <input id="jug-nombre" className="input" value={nombre} onChange={(x) => setNombre(x.target.value)} />
          </div>
          <div className="w-28"><label className="lbl">Año de nacimiento{e.limita_anio && ' *'}</label>
            <input className="input" type="number" min={1900} max={2100} placeholder={e.limita_anio ? `≤ ${e.anio_minimo}` : 'Año'} value={anio} onChange={(x) => setAnio(x.target.value)} />
          </div>
          <div className="w-36"><label className="lbl">Documento</label>
            <input className="input" value={documento} onChange={(x) => setDocumento(x.target.value)} />
          </div>
          <button className="btn btn-pri" disabled={!nombre || (e.limita_anio && !anio) || addJ.isPending}><UserPlus size={16} /> Agregar</button>
          {e.limita_anio && (
            <p className="w-full text-xs text-emerald-800">Categoría {e.categoria}: solo nacidos en <b>{e.anio_minimo}</b> o antes. El año de nacimiento es obligatorio.</p>
          )}
        </form>
      )}
      {puedeEditar && lleno && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          La planilla está completa ({maximo}/{maximo}). Para inscribir a otro jugador primero da de baja a uno.
        </p>
      )}

      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr><th className="w-16 p-2 text-center">N°</th><th className="p-2">Jugador</th><th className="hidden p-2 sm:table-cell">Año nac.</th><th className="hidden p-2 sm:table-cell">Documento</th><th /></tr>
        </thead>
        <tbody>
          {jugadores.map((j) => <FilaJugador key={j.id} j={j} puedeEditar={puedeEditar} onChange={refrescar} />)}
        </tbody>
      </table>
      {jugadores.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Este equipo aún no tiene jugadores.</p>}
    </div>
  )
}

function ItemEquipo({ e, sel, onSel }: { e: Equipo; sel: boolean; onSel: () => void }) {
  return (
    <button
      onClick={onSel}
      className={clsx('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-50', sel && '!bg-emerald-50 ring-1 ring-emerald-300', !e.activo && 'opacity-50')}
    >
      <span>
        <span className="font-medium">{e.nombre}</span>
        <span className="block text-xs text-slate-400">{e.categoria ?? 'Sin categoría'}</span>
      </span>
      <span className="flex items-center gap-1 text-xs text-slate-500">
        {e.planilla_cerrada && <Lock size={12} />}
        {e.num_jugadores}/{e.max_jugadores ?? 12}
      </span>
    </button>
  )
}

export default function EquiposPage() {
  const qc = useQueryClient()
  const { esAdmin, esDelegado } = useAuth()
  const [sel, setSel] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [delegado, setDelegado] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const { data: categorias = [] } = useCategorias()
  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos'],
    queryFn: async () => (await api.get<Equipo[]>('/equipos')).data,
  })
  const crear = useMutation({
    mutationFn: async () => (await api.post<Equipo>('/equipos', { nombre, delegado, categoria_id: categoriaId ? Number(categoriaId) : null })).data,
    onSuccess: (e) => { qc.invalidateQueries({ queryKey: ['equipos'] }); setNombre(''); setDelegado(''); setCategoriaId(''); setSel(e.id); toast.success('Equipo creado. Ahora agrega sus jugadores.') },
    onError: errorToast,
  })

  const mios = equipos.filter((e) => e.es_propio)
  const otros = equipos.filter((e) => !e.es_propio)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3">
        {esAdmin && (
          <form className="card space-y-2" onSubmit={(e) => { e.preventDefault(); if (nombre) crear.mutate() }}>
            <h2 className="font-bold">Nuevo equipo</h2>
            <input className="input" placeholder="Nombre del equipo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <input className="input" placeholder="Delegado (opcional)" value={delegado} onChange={(e) => setDelegado(e.target.value)} />
            <div>
              <label className="lbl">Categoría</label>
              <select className="input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">{categorias.length ? 'Seleccionar categoría…' : 'Sin categorías creadas'}</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.limita_anio ? ` (desde ${c.anio_minimo})` : ''}</option>)}
              </select>
              <Link to="/categorias" className="mt-1 inline-block py-2 text-sm font-medium text-emerald-700 underline">+ Crear o editar categorías</Link>
            </div>
            <button className="btn btn-pri w-full" disabled={!nombre || (categorias.length > 0 && !categoriaId) || crear.isPending}><Plus size={16} /> Registrar equipo</button>
          </form>
        )}
        <div className="card !p-2">
          {esDelegado ? (
            <>
              <h2 className="p-2 font-bold">Mis equipos ({mios.length})</h2>
              {mios.map((e) => <ItemEquipo key={e.id} e={e} sel={sel === e.id} onSel={() => setSel(e.id)} />)}
              {mios.length === 0 && <p className="p-3 text-sm text-slate-500">Aún no tienes equipos asignados. Pídele al administrador que te asigne uno.</p>}
              <h2 className="mt-2 border-t border-slate-100 p-2 pt-3 font-bold">Otros equipos de mis categorías ({otros.length})</h2>
              {otros.map((e) => <ItemEquipo key={e.id} e={e} sel={sel === e.id} onSel={() => setSel(e.id)} />)}
            </>
          ) : (
            <>
              <h2 className="p-2 font-bold">Equipos ({equipos.length})</h2>
              {equipos.map((e) => <ItemEquipo key={e.id} e={e} sel={sel === e.id} onSel={() => setSel(e.id)} />)}
              {equipos.length === 0 && <p className="p-3 text-sm text-slate-500">Aún no hay equipos.</p>}
            </>
          )}
        </div>
      </div>
      {sel ? (
        <Detalle key={sel} id={sel} onDeleted={() => setSel(null)} />
      ) : (
        <div className="card flex items-center justify-center py-16 text-center text-slate-500">
          {esDelegado ? 'Selecciona un equipo para ver o inscribir su planilla' : 'Selecciona un equipo para ver y registrar sus jugadores'}
        </div>
      )}
    </div>
  )
}

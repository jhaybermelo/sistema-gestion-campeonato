import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, errorToast } from '../api/client'
import { useCategorias } from '../api/hooks'
import type { Categoria } from '../types'

export default function CategoriasPage() {
  const qc = useQueryClient()
  const { data: categorias = [] } = useCategorias()
  const [editId, setEditId] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [limita, setLimita] = useState(false)
  const [anio, setAnio] = useState('')

  const limpiar = () => { setEditId(null); setNombre(''); setLimita(false); setAnio('') }
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['categorias'] }); qc.invalidateQueries({ queryKey: ['equipos'] }) }

  const guardar = useMutation({
    mutationFn: () => {
      const body = { nombre, limita_anio: limita, anio_minimo: limita ? Number(anio) : anio ? Number(anio) : null }
      return editId ? api.put(`/categorias/${editId}`, body) : api.post('/categorias', body)
    },
    onSuccess: () => { toast.success(editId ? 'Categoría actualizada' : 'Categoría creada'); limpiar(); refrescar() },
    onError: errorToast,
  })
  const borrar = useMutation({
    mutationFn: (id: number) => api.delete(`/categorias/${id}`),
    onSuccess: () => { toast.success('Categoría eliminada'); refrescar() },
    onError: errorToast,
  })

  const editar = (c: Categoria) => {
    setEditId(c.id); setNombre(c.nombre); setLimita(c.limita_anio); setAnio(c.anio_minimo ? String(c.anio_minimo) : '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const valido = nombre.trim() && (!limita || Number(anio) >= 1900)

  return (
    <div className="grid gap-4 md:grid-cols-[360px_1fr]">
      <form className="card h-fit space-y-3" onSubmit={(e) => { e.preventDefault(); if (valido) guardar.mutate() }}>
        <h2 className="text-lg font-bold">{editId ? 'Editar categoría' : 'Nueva categoría'}</h2>
        <div>
          <label className="lbl">Nombre</label>
          <input className="input" placeholder="Ej: Máster, Libre, Sub-15" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={limita} onChange={(e) => setLimita(e.target.checked)} />
          <span>
            <b>Tiene año mínimo de competencia</b>
            <span className="block text-xs text-slate-500">Al registrar jugadores se validará su año de nacimiento.</span>
          </span>
        </label>
        {limita && (
          <div>
            <label className="lbl">Año mínimo</label>
            <input className="input" type="number" min={1900} max={2100} placeholder="Ej: 1980" value={anio} onChange={(e) => setAnio(e.target.value)} />
            {Number(anio) >= 1900 && (
              <p className="mt-1 text-xs text-emerald-700">Solo podrán jugar los nacidos en <b>{anio}</b> o antes.</p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn btn-pri" disabled={!valido || guardar.isPending}>
            {editId ? 'Guardar cambios' : <><Plus size={16} /> Crear categoría</>}
          </button>
          {editId && <button type="button" className="btn btn-sec" onClick={limpiar}>Cancelar</button>}
        </div>
      </form>

      <div className="card">
        <h2 className="mb-3 text-lg font-bold">Categorías ({categorias.length})</h2>
        {categorias.length === 0 && <p className="py-6 text-center text-slate-500">Aún no hay categorías. Crea la primera para poder asignarla a los equipos.</p>}
        <div className="divide-y divide-slate-100">
          {categorias.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-[160px] flex-1">
                <div className="font-semibold">{c.nombre}</div>
                <div className="text-xs text-slate-500">
                  {c.limita_anio ? `Nacidos en ${c.anio_minimo} o antes` : 'Sin restricción de edad'} · {c.num_equipos} equipo{c.num_equipos === 1 ? '' : 's'}
                </div>
              </div>
              {c.limita_anio && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">≤ {c.anio_minimo}</span>}
              <button className="btn btn-sec btn-icon" onClick={() => editar(c)}><Pencil size={14} /></button>
              <button className="btn btn-sec btn-icon" onClick={() => confirm(`¿Eliminar la categoría ${c.nombre}?`) && borrar.mutate(c.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

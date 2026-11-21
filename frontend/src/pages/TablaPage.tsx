import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useCategorias } from '../api/hooks'
import type { FilaTabla } from '../types'

export default function TablaPage() {
  const [cat, setCat] = useState('')
  const { data: categorias = [] } = useCategorias()
  const { data = [] } = useQuery({
    queryKey: ['tabla', cat],
    queryFn: async () => (await api.get<FilaTabla[]>('/tabla', { params: cat ? { categoria_id: cat } : {} })).data,
  })
  const th = 'p-2 text-center'
  return (
    <div className="card overflow-x-auto">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Tabla de posiciones</h2>
        <select className="input !w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className={th}>#</th><th className="p-2 text-left">Equipo</th>
            <th className={th}>PJ</th><th className={th}>PG</th><th className={th}>PE</th><th className={th}>PP</th>
            <th className={th}>GF</th><th className={th}>GC</th><th className={th}>DG</th><th className={th}>Pts</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={r.equipo_id} className="border-t border-slate-100">
              <td className="p-2 text-center font-bold text-slate-400">{i + 1}</td>
              <td className="p-2 font-semibold">{r.equipo}</td>
              <td className="p-2 text-center">{r.pj}</td><td className="p-2 text-center">{r.pg}</td>
              <td className="p-2 text-center">{r.pe}</td><td className="p-2 text-center">{r.pp}</td>
              <td className="p-2 text-center">{r.gf}</td><td className="p-2 text-center">{r.gc}</td>
              <td className="p-2 text-center">{r.dg > 0 ? `+${r.dg}` : r.dg}</td>
              <td className="p-2 text-center text-base font-extrabold text-emerald-700">{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && <p className="py-6 text-center text-slate-500">Registra equipos para ver la tabla.</p>}
      <p className="mt-3 text-xs text-slate-500">Solo cuentan los partidos finalizados. Desempate: diferencia de gol, luego goles a favor.</p>
    </div>
  )
}

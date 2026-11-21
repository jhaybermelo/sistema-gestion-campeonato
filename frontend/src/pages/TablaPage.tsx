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
  // En móvil se ocultan PG, PE y PP para que el equipo y los puntos siempre se vean.
  const num = 'px-1.5 py-2 text-center sm:px-2'
  const extra = `${num} hidden sm:table-cell`
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Tabla de posiciones</h2>
        <select className="input !w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className={num}>#</th><th className="px-1.5 py-2 text-left sm:px-2">Equipo</th>
              <th className={num}>PJ</th><th className={extra}>PG</th><th className={extra}>PE</th><th className={extra}>PP</th>
              <th className={num}>GF</th><th className={num}>GC</th><th className={num}>DG</th><th className={num}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.equipo_id} className="border-t border-slate-100">
                <td className={`${num} font-bold text-slate-400`}>{i + 1}</td>
                <td className="px-1.5 py-2 font-semibold sm:px-2">{r.equipo}</td>
                <td className={num}>{r.pj}</td><td className={extra}>{r.pg}</td><td className={extra}>{r.pe}</td><td className={extra}>{r.pp}</td>
                <td className={num}>{r.gf}</td><td className={num}>{r.gc}</td>
                <td className={num}>{r.dg > 0 ? `+${r.dg}` : r.dg}</td>
                <td className={`${num} text-base font-extrabold text-emerald-700`}>{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length === 0 && <p className="py-6 text-center text-slate-500">Registra equipos para ver la tabla.</p>}
      <p className="mt-3 text-xs text-slate-500">Solo cuentan los partidos finalizados. Desempate: diferencia de gol, luego goles a favor. En pantalla ancha se muestran también PG, PE y PP.</p>
    </div>
  )
}

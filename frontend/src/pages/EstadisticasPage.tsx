import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useCategorias } from '../api/hooks'
import type { FilaJugadorStats } from '../types'

export default function EstadisticasPage() {
  const [cat, setCat] = useState('')
  const { data: categorias = [] } = useCategorias()
  const { data } = useQuery({
    queryKey: ['estadisticas', cat],
    queryFn: async () =>
      (await api.get<{ goleadores: FilaJugadorStats[]; tarjetas: FilaJugadorStats[] }>('/estadisticas', { params: cat ? { categoria_id: cat } : {} })).data,
  })
  const goleadores = data?.goleadores ?? []
  const tarjetas = data?.tarjetas ?? []
  return (
    <div className="space-y-4">
    <select className="input !w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
      <option value="">Todas las categorías</option>
      {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
    </select>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h2 className="mb-3 text-xl font-bold">⚽ Goleadores</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500"><tr><th className="p-2">#</th><th className="p-2">Jugador</th><th className="p-2">Equipo</th><th className="p-2 text-center">Goles</th></tr></thead>
          <tbody>
            {goleadores.map((r, i) => (
              <tr key={r.jugador_id} className="border-t border-slate-100">
                <td className="p-2 text-slate-400">{i + 1}</td>
                <td className="p-2 font-medium">#{r.numero} {r.nombre}</td>
                <td className="p-2 text-slate-500">{r.equipo}</td>
                <td className="p-2 text-center text-base font-extrabold">{r.goles}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {goleadores.length === 0 && <p className="py-6 text-center text-slate-500">Aún no hay goles.</p>}
      </div>
      <div className="card">
        <h2 className="mb-3 text-xl font-bold">Tarjetas</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500"><tr><th className="p-2">Jugador</th><th className="p-2">Equipo</th><th className="p-2 text-center">🟨</th><th className="p-2 text-center">🟦</th><th className="p-2 text-center">🟥</th></tr></thead>
          <tbody>
            {tarjetas.map((r) => (
              <tr key={r.jugador_id} className="border-t border-slate-100">
                <td className="p-2 font-medium">#{r.numero} {r.nombre}</td>
                <td className="p-2 text-slate-500">{r.equipo}</td>
                <td className="p-2 text-center">{r.amarillas || ''}</td>
                <td className="p-2 text-center">{r.azules || ''}</td>
                <td className="p-2 text-center">{r.rojas || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tarjetas.length === 0 && <p className="py-6 text-center text-slate-500">Aún no hay tarjetas.</p>}
      </div>
    </div>
    </div>
  )
}

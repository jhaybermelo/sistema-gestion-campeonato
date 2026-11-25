import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useCategorias } from '../api/hooks'
import { useAuth } from '../auth'
import type { Estadisticas } from '../types'

const prom = (n: number) => n.toFixed(2)

export default function EstadisticasPage() {
  const { esDelegado } = useAuth()
  const [cat, setCat] = useState('')
  const { data: categorias = [] } = useCategorias()
  // Un delegado siempre ve una categoría concreta: mezclar categorías no tiene sentido en un ranking.
  useEffect(() => {
    if (esDelegado && !cat && categorias.length) setCat(String(categorias[0].id))
  }, [esDelegado, cat, categorias])

  const { data } = useQuery({
    queryKey: ['estadisticas', cat],
    queryFn: async () => (await api.get<Estadisticas>('/estadisticas', { params: cat ? { categoria_id: cat } : {} })).data,
    enabled: !esDelegado || !!cat,
  })
  const goleadores = data?.goleadores ?? []
  const valla = data?.valla ?? []
  const tarjetas = data?.tarjetas ?? []
  const th = 'p-2 text-center'

  return (
    <div className="space-y-4">
      <select className="input !w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
        {!esDelegado && <option value="">Todas las categorías</option>}
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-xl font-bold">⚽ Goleadores</h2>
          <p className="mb-3 text-xs text-slate-500">
            Promedio = goles ÷ partidos de su equipo. Cuenta desde: <b>{data?.reglas.fase_goleador ?? '…'}</b>.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr><th className="p-2">#</th><th className="p-2">Jugador</th><th className="hidden p-2 sm:table-cell">Equipo</th><th className={th}>Goles</th><th className={th}>PJ</th><th className={th}>Prom.</th></tr>
            </thead>
            <tbody>
              {goleadores.map((r, i) => (
                <tr key={r.jugador_id} className="border-t border-slate-100">
                  <td className="p-2 text-slate-400">{i + 1}</td>
                  <td className="p-2 font-medium">#{r.numero} {r.nombre}<div className="text-xs font-normal text-slate-500 sm:hidden">{r.equipo}</div></td>
                  <td className="hidden p-2 text-slate-500 sm:table-cell">{r.equipo}</td>
                  <td className="p-2 text-center">{r.goles}</td>
                  <td className="p-2 text-center">{r.pj}</td>
                  <td className="p-2 text-center text-base font-extrabold text-emerald-700">{prom(r.promedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {goleadores.length === 0 && <p className="py-6 text-center text-slate-500">Aún no hay goles en esta fase.</p>}
        </div>

        <div className="card">
          <h2 className="text-xl font-bold">🧤 Valla menos vencida</h2>
          <p className="mb-3 text-xs text-slate-500">
            Promedio = goles en contra ÷ partidos. Cuenta desde: <b>{data?.reglas.fase_valla ?? '…'}</b>. Gana el menor promedio.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr><th className="p-2">#</th><th className="p-2">Equipo</th><th className={th}>PJ</th><th className={th}>GC</th><th className={th}>Prom.</th></tr>
            </thead>
            <tbody>
              {valla.map((r, i) => (
                <tr key={r.equipo_id} className="border-t border-slate-100">
                  <td className="p-2 text-slate-400">{i + 1}</td>
                  <td className="p-2 font-medium">{r.equipo}</td>
                  <td className="p-2 text-center">{r.pj}</td>
                  <td className="p-2 text-center">{r.gc}</td>
                  <td className="p-2 text-center text-base font-extrabold text-emerald-700">{prom(r.promedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {valla.length === 0 && <p className="py-6 text-center text-slate-500">Todavía no hay partidos finalizados desde esta fase.</p>}
        </div>

        <div className="card lg:col-span-2">
          <h2 className="mb-3 text-xl font-bold">Tarjetas</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="p-2">Jugador</th><th className="hidden p-2 sm:table-cell">Equipo</th><th className={th}>🟨</th><th className={th}>🟦</th><th className={th}>🟥</th></tr></thead>
            <tbody>
              {tarjetas.map((r) => (
                <tr key={r.jugador_id} className="border-t border-slate-100">
                  <td className="p-2 font-medium">#{r.numero} {r.nombre}<div className="text-xs font-normal text-slate-500 sm:hidden">{r.equipo}</div></td>
                  <td className="hidden p-2 text-slate-500 sm:table-cell">{r.equipo}</td>
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

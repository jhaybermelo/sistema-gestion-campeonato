import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { api, fmtFecha, fmtTiempo } from '../api/client'
import { EVENTO } from '../eventos'
import type { LadoPartido, PartidoDetalle } from '../types'

function Planilla({ lado, p }: { lado: LadoPartido; p: PartidoDetalle }) {
  const jug = lado.jugadores.filter((j) => j.convocado)
  const celda = 'border border-black px-2 py-1'
  return (
    <section className="mb-5 break-inside-avoid">
      <h3 className="mb-1 font-bold">{lado.nombre} <span className="font-normal">— Delegado: {lado.delegado || '________________'}</span></h3>
      <div className="overflow-x-auto"><table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className={celda}>N°</th><th className={`${celda} text-left`}>Jugador</th><th className={`${celda} text-left`}>Documento</th>
            <th className={celda}>Goles</th><th className={celda}>🟨</th><th className={celda}>🟦</th><th className={celda}>🟥</th><th className={celda}>Faltas</th>
            <th className={`${celda} w-32`}>Firma</th>
          </tr>
        </thead>
        <tbody>
          {jug.map((j) => (
            <tr key={j.id}>
              <td className={`${celda} text-center`}>{j.numero}</td><td className={celda}>{j.nombre}</td><td className={celda}>{j.documento}</td>
              <td className={`${celda} text-center`}>{j.goles || ''}</td><td className={`${celda} text-center`}>{j.amarillas || ''}</td>
              <td className={`${celda} text-center`}>{j.azules || ''}</td><td className={`${celda} text-center`}>{j.rojas || ''}</td>
              <td className={`${celda} text-center`}>{j.faltas || ''}</td><td className={celda} />
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="mt-1 text-xs">
        Faltas por tiempo: {Array.from({ length: p.num_tiempos }, (_, i) => `${i + 1}º T: ${lado.faltas[String(i + 1)] ?? 0}`).join('  ·  ')}
      </p>
    </section>
  )
}

export default function ActaPage() {
  const id = Number(useParams().id)
  const { data: p } = useQuery({ queryKey: ['partido', id], queryFn: async () => (await api.get<PartidoDetalle>(`/partidos/${id}`)).data })
  if (!p) return <p className="p-6">Cargando acta…</p>
  const celda = 'border border-black px-2 py-1'
  return (
    <div className="mx-auto max-w-4xl bg-white p-6 text-black">
      <div className="mb-4 flex justify-end print:hidden">
        <button className="btn btn-pri" onClick={() => window.print()}><Printer size={16} /> Imprimir / Guardar PDF</button>
      </div>
      <h1 className="text-center text-xl font-bold uppercase">{p.nombre_campeonato}</h1>
      <h2 className="mb-2 text-center text-lg font-semibold">Acta de juego</h2>
      <p className="mb-1 text-center text-sm">
        Categoría: {p.categoria ?? '—'} · Fase: {p.fase_nombre} · Fecha: {fmtFecha(p.fecha)} · Hora: {p.hora ?? '—'} · Cancha: {p.cancha || '—'} · Jornada: {p.jornada || '—'}
      </p>
      <p className="my-3 text-center text-2xl font-extrabold">
        {p.local.nombre} {p.goles_local} - {p.goles_visitante} {p.visitante.nombre}
      </p>
      <Planilla lado={p.local} p={p} />
      <Planilla lado={p.visitante} p={p} />

      <section className="mb-6 break-inside-avoid">
        <h3 className="mb-1 font-bold">Eventos</h3>
        <div className="overflow-x-auto"><table className="w-full border-collapse text-xs">
          <thead><tr className="bg-slate-100"><th className={celda}>Tiempo</th><th className={`${celda} text-left`}>Evento</th><th className={`${celda} text-left`}>Jugador</th><th className={`${celda} text-left`}>Equipo</th></tr></thead>
          <tbody>
            {p.eventos.map((ev) => (
              <tr key={ev.id}>
                <td className={`${celda} text-center`}>{ev.periodo}T {fmtTiempo(ev.segundo)}</td>
                <td className={celda}>{EVENTO[ev.tipo].icono} {EVENTO[ev.tipo].nombre}</td>
                <td className={celda}>{ev.nombre ? `#${ev.numero} ${ev.nombre}` : ''}</td>
                <td className={celda}>{ev.equipo_id === p.local.id ? p.local.nombre : p.visitante.nombre}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>

      <div className="mt-12 grid grid-cols-3 gap-8 text-center text-xs">
        {['Árbitro', 'Planillero / Vocal', 'Observaciones'].map((t) => (
          <div key={t}><div className="border-t border-black pt-1">{t}</div></div>
        ))}
      </div>
    </div>
  )
}

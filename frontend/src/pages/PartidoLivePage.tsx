import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Flag, Pause, Play, Printer, RotateCcw, SkipForward, Timer, UserPlus, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { api, errorToast, fmtFecha, fmtTiempo } from '../api/client'
import { useAuth } from '../auth'
import { EVENTO } from '../eventos'
import type { JugadorPlanilla, LadoPartido, PartidoDetalle, TipoEvento } from '../types'

function pitido() {
  try {
    const c = new AudioContext()
    const o = c.createOscillator()
    o.connect(c.destination)
    o.frequency.value = 880
    o.start()
    setTimeout(() => { o.stop(); c.close() }, 1200)
  } catch { /* sin audio */ }
}

/** Cronómetro local sincronizado con el servidor: cuenta cada 200 ms entre cargas. */
function useReloj(p: PartidoDetalle | undefined, alAgotar: () => void) {
  const [anchor, setAnchor] = useState({ restante: 0, at: performance.now(), corriendo: false })
  const [now, setNow] = useState(performance.now())
  const avisado = useRef(false)

  useEffect(() => {
    if (!p) return
    setAnchor({ restante: p.restante_seg, at: performance.now(), corriendo: p.corriendo })
    setNow(performance.now())
    avisado.current = false
  }, [p])

  useEffect(() => {
    if (!anchor.corriendo) return
    const t = setInterval(() => setNow(performance.now()), 200)
    return () => clearInterval(t)
  }, [anchor])

  const restante = anchor.corriendo ? Math.max(0, anchor.restante - (now - anchor.at) / 1000) : anchor.restante
  useEffect(() => {
    if (anchor.corriendo && restante <= 0 && !avisado.current) {
      avisado.current = true
      pitido()
      alAgotar()
    }
  })
  return restante
}

function Chip({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={clsx('rounded px-1.5 py-0.5 text-xs font-bold', className)}>{children}</span>
}

function FormJugador({ lado, onAdd, onClose }: { lado: LadoPartido; onAdd: (d: object) => void; onClose: () => void }) {
  const [numero, setNumero] = useState('')
  const [nombre, setNombre] = useState('')
  const [documento, setDocumento] = useState('')
  const [anio, setAnio] = useState('')
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-amber-50 p-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (nombre && numero !== '' && (!lado.limita_anio || anio)) { onAdd({ equipo_id: lado.id, numero: Number(numero), nombre, documento, anio_nacimiento: anio ? Number(anio) : null }); onClose() }
      }}
    >
      <input className="input !w-16" type="number" min={0} placeholder="N°" value={numero} onChange={(e) => setNumero(e.target.value)} />
      <input className="input !w-40 flex-1" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      <input className="input !w-28" type="number" placeholder={lado.limita_anio ? `Año ≤ ${lado.anio_minimo}` : 'Año nac.'} value={anio} onChange={(e) => setAnio(e.target.value)} />
      <input className="input !w-28" placeholder="Documento" value={documento} onChange={(e) => setDocumento(e.target.value)} />
      <button className="btn btn-pri !py-1.5">Agregar</button>
      <button type="button" className="btn btn-sec !py-1.5" onClick={onClose}>Cancelar</button>
    </form>
  )
}

interface PanelProps {
  p: PartidoDetalle
  lado: LadoPartido
  activo: boolean
  onEvento: (tipo: TipoEvento, equipoId: number, j: JugadorPlanilla | null) => void
  onConvocar: (pjId: number, v: boolean) => void
  onAgregar: (d: object) => void
}

function PanelEquipo({ p, lado, activo, onEvento, onConvocar, onAgregar }: PanelProps) {
  const [editando, setEditando] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  const faltas = lado.faltas[String(p.periodo)] ?? 0
  const limite = faltas >= p.limite_faltas
  const lista = editando ? lado.jugadores : lado.jugadores.filter((j) => j.convocado)
  const btn = 'flex h-9 min-w-9 items-center justify-center rounded-md px-1.5 text-sm font-bold transition active:scale-90 disabled:opacity-25'

  return (
    <div className="card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{lado.nombre}</h3>
        <div className={clsx('rounded-lg px-3 py-1 text-sm font-semibold', limite ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600')}>
          Faltas {p.periodo}º T: {faltas}/{p.limite_faltas} {limite && '⚠'}
        </div>
      </div>

      <div className="space-y-1">
        {lista.map((j) => (
          <div key={j.id} className={clsx('flex flex-wrap items-center gap-1.5 rounded-lg border-b border-slate-100 px-1 py-1.5', j.expulsado && 'bg-red-50', !j.convocado && 'opacity-50')}>
            {editando && (
              <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={j.convocado} onChange={(e) => onConvocar(j.id, e.target.checked)} />
            )}
            <span className="w-8 text-center text-lg font-extrabold text-emerald-700">{j.numero}</span>
            <span className={clsx('min-w-[100px] flex-1 font-medium', j.expulsado && 'text-slate-400 line-through')}>
              {j.nombre}
              <span className="ml-1 inline-flex gap-1 align-middle">
                {j.goles > 0 && <Chip className="bg-slate-900 text-white">⚽{j.goles}</Chip>}
                {j.amarillas > 0 && <Chip className="bg-yellow-300 text-yellow-900">{j.amarillas}</Chip>}
                {j.azules > 0 && <Chip className="bg-blue-500 text-white">{j.azules}</Chip>}
                {j.rojas > 0 && <Chip className="bg-red-600 text-white">{j.rojas}</Chip>}
                {j.faltas > 0 && <Chip className="bg-slate-200 text-slate-700">F{j.faltas}</Chip>}
              </span>
            </span>
            {!editando && (
              <div className="flex gap-1">
                <button disabled={!activo} title="Gol" className={clsx(btn, 'bg-slate-900 text-white')} onClick={() => onEvento('gol', lado.id, j)}>⚽</button>
                <button disabled={!activo} title="Falta" className={clsx(btn, 'bg-slate-200 text-slate-700')} onClick={() => onEvento('falta', lado.id, j)}>F</button>
                <button disabled={!activo} title="Tarjeta amarilla" className={clsx(btn, 'bg-yellow-300 text-yellow-900')} onClick={() => onEvento('amarilla', lado.id, j)}>A</button>
                <button disabled={!activo} title="Tarjeta azul" className={clsx(btn, 'bg-blue-500 text-white')} onClick={() => onEvento('azul', lado.id, j)}>Az</button>
                <button disabled={!activo} title="Tarjeta roja" className={clsx(btn, 'bg-red-600 text-white')} onClick={() => onEvento('roja', lado.id, j)}>R</button>
                <button disabled={!activo} title="Autogol" className={clsx(btn, 'bg-white text-slate-500 ring-1 ring-slate-300 !text-xs')} onClick={() => onEvento('autogol', lado.id, j)}>AG</button>
              </div>
            )}
          </div>
        ))}
        {lista.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">
            {lado.jugadores.length ? 'Ningún jugador convocado.' : 'Este equipo no tiene jugadores registrados.'}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!editando && (
          <button disabled={!activo} className="btn btn-sec !py-1.5" onClick={() => onEvento('falta', lado.id, null)}>
            + Falta del equipo
          </button>
        )}
        <button className="btn btn-sec !py-1.5" onClick={() => setEditando(!editando)}>
          <Users size={14} /> {editando ? 'Listo' : 'Editar planilla'}
        </button>
        {editando && (
          <button className="btn btn-sec !py-1.5" onClick={() => setNuevo(true)}><UserPlus size={14} /> Jugador nuevo</button>
        )}
      </div>
      {editando && <p className="mt-1 text-xs text-slate-500">Marca solo a los jugadores que asistieron al partido.</p>}
      {nuevo && <FormJugador lado={lado} onAdd={onAgregar} onClose={() => setNuevo(false)} />}
    </div>
  )
}

export default function PartidoLivePage() {
  const id = Number(useParams().id)
  const { esAdmin } = useAuth()
  const qc = useQueryClient()
  const key = ['partido', id]
  const { data: p, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<PartidoDetalle>(`/partidos/${id}`)).data,
    refetchInterval: 5000,
  })

  const restante = useReloj(p, () => qc.invalidateQueries({ queryKey: key }))

  const alExito = (d: PartidoDetalle) => {
    qc.setQueryData(key, d)
    qc.invalidateQueries({ queryKey: ['partidos'] })
    qc.invalidateQueries({ queryKey: ['tabla'] })
    qc.invalidateQueries({ queryKey: ['estadisticas'] })
  }
  const accion = useMutation({
    mutationFn: async ({ ruta, body }: { ruta: string; body?: object }) =>
      (await api.post<PartidoDetalle>(`/partidos/${id}/${ruta}`, body)).data,
    onSuccess: alExito,
    onError: errorToast,
  })
  const deshacer = useMutation({
    mutationFn: async (evId: number) => (await api.delete<PartidoDetalle>(`/partidos/${id}/eventos/${evId}`)).data,
    onSuccess: alExito,
    onError: errorToast,
  })
  const convocar = useMutation({
    mutationFn: async ({ pjId, v }: { pjId: number; v: boolean }) =>
      (await api.patch<PartidoDetalle>(`/partidos/${id}/planilla/${pjId}`, { convocado: v })).data,
    onSuccess: alExito,
    onError: errorToast,
  })

  const evento = useMutation({
    mutationFn: async (v: { tipo: TipoEvento; equipoId: number; j: JugadorPlanilla | null }) =>
      (await api.post<PartidoDetalle>(`/partidos/${id}/eventos`, { tipo: v.tipo, equipo_id: v.equipoId, pj_id: v.j?.id ?? null })).data,
    onSuccess: (d, v) => {
      alExito(d)
      const ult = d.eventos[d.eventos.length - 1]
      toast.custom(
        (t) => (
          <div className={clsx('flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-2 text-white shadow-lg', t.visible ? 'animate-pulse' : '')}>
            <span>{EVENTO[v.tipo].icono} {EVENTO[v.tipo].nombre}{v.j ? ` — #${v.j.numero} ${v.j.nombre}` : ''} ({fmtTiempo(ult.segundo)})</span>
            <button className="rounded bg-white/20 px-2 py-0.5 text-sm font-semibold hover:bg-white/30" onClick={() => { deshacer.mutate(ult.id); toast.dismiss(t.id) }}>Deshacer</button>
          </div>
        ),
        { duration: 4000 },
      )
    },
    onError: errorToast,
  })

  const agregar = useMutation({
    mutationFn: async (d: object) => (await api.post<PartidoDetalle>(`/partidos/${id}/planilla`, d)).data,
    onSuccess: (d) => { alExito(d); qc.invalidateQueries({ queryKey: ['equipos'] }); toast.success('Jugador agregado al equipo y a la planilla') },
    onError: errorToast,
  })

  if (isLoading) return <p className="text-slate-500">Cargando partido…</p>
  if (isError || !p) return <p className="text-red-600">No se encontró el partido. <Link className="underline" to="/partidos">Volver</Link></p>

  const enJuego = p.estado === 'en_juego'
  const fin = p.estado === 'finalizado'
  const sinTiempo = restante <= 0
  const ultimoTiempo = p.periodo >= p.num_tiempos
  const pendiente = accion.isPending || evento.isPending

  const registrar = (tipo: TipoEvento, equipoId: number, j: JugadorPlanilla | null) => {
    if (j?.expulsado && tipo !== 'autogol' && !confirm(`${j.nombre} ya está expulsado. ¿Registrar de todas formas?`)) return
    evento.mutate({ tipo, equipoId, j }, {
      onSuccess: (d) => {
        if (!j) return
        const nj = [...d.local.jugadores, ...d.visitante.jugadores].find((x) => x.id === j.id)
        if (nj?.expulsado && !j.expulsado) toast(`⚠ ${j.nombre} queda expulsado`, { icon: '🟥' })
      },
    })
    if (tipo === 'falta') {
      const lado = equipoId === p.local.id ? p.local : p.visitante
      if ((lado.faltas[String(p.periodo)] ?? 0) + 1 === p.limite_faltas) toast(`${lado.nombre} alcanzó el límite de faltas`, { icon: '⚠️', duration: 5000 })
    }
  }

  const ajustar = () => {
    const s = prompt('Tiempo restante del periodo (mm:ss):', fmtTiempo(restante))
    if (s === null) return
    const [m, sec = '0'] = s.split(':')
    const total = Number(m) * 60 + Number(sec)
    if (Number.isNaN(total) || total < 0) return toast.error('Formato inválido. Usa mm:ss')
    accion.mutate({ ruta: 'ajustar', body: { restante_seg: total } })
  }

  const etiquetaPeriodo = p.estado === 'programado' ? 'Sin iniciar' : fin ? 'Partido finalizado' : `${p.periodo}º TIEMPO de ${p.num_tiempos}`

  return (
    <div className="space-y-4">
      <Link to="/partidos" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft size={16} /> Partidos</Link>

      {/* Marcador y cronómetro */}
      <div className="rounded-2xl bg-slate-900 p-4 text-white shadow-lg sm:p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center sm:gap-6">
          <div className="text-lg font-bold sm:text-2xl">{p.local.nombre}</div>
          <div className="text-5xl font-extrabold tabular-nums sm:text-7xl">{p.goles_local} - {p.goles_visitante}</div>
          <div className="text-lg font-bold sm:text-2xl">{p.visitante.nombre}</div>
        </div>
        <div className="mt-2 text-center text-xs text-slate-400">
          {p.categoria && <b>{p.categoria} · </b>}{fmtFecha(p.fecha)} {p.hora ?? ''} {p.cancha && `· ${p.cancha}`} {p.jornada && `· ${p.jornada}`}
        </div>
        <div className="mt-3 text-center text-sm font-semibold tracking-widest text-emerald-400">{etiquetaPeriodo}</div>
        <div className={clsx('text-center font-mono text-7xl font-extrabold tabular-nums sm:text-8xl', p.corriendo ? 'text-emerald-400' : sinTiempo && enJuego ? 'text-red-500' : 'text-white')}>
          {fmtTiempo(restante)}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {p.estado === 'programado' && (
            <button className="btn btn-pri !px-8 !py-3 !text-lg" disabled={pendiente} onClick={() => accion.mutate({ ruta: 'iniciar' })}><Play size={22} /> Iniciar partido</button>
          )}
          {enJuego && p.corriendo && (
            <button className="btn btn-del !px-8 !py-3 !text-lg" disabled={pendiente} onClick={() => accion.mutate({ ruta: 'pausar' })}><Pause size={22} /> Parar</button>
          )}
          {enJuego && !p.corriendo && !sinTiempo && (
            <button className="btn btn-pri !px-8 !py-3 !text-lg" disabled={pendiente} onClick={() => accion.mutate({ ruta: 'iniciar' })}><Play size={22} /> Reanudar</button>
          )}
          {enJuego && !p.corriendo && !ultimoTiempo && (
            <button className={clsx('btn !py-3', sinTiempo ? 'btn-pri !px-6 !text-lg' : 'bg-white/10 text-white hover:bg-white/20')} disabled={pendiente}
              onClick={() => (sinTiempo || confirm('Aún queda tiempo en este periodo. ¿Pasar al siguiente tiempo?')) && accion.mutate({ ruta: 'siguiente-tiempo' })}>
              <SkipForward size={18} /> Pasar al {p.periodo + 1}º tiempo
            </button>
          )}
          {enJuego && !p.corriendo && (
            <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={ajustar}><Timer size={16} /> Ajustar tiempo</button>
          )}
          {enJuego && (
            <button className={clsx('btn', sinTiempo && ultimoTiempo ? 'btn-pri !px-6 !py-3 !text-lg' : 'bg-white/10 text-white hover:bg-white/20')} disabled={pendiente}
              onClick={() => confirm('¿Finalizar el partido? El resultado se sumará a la tabla de posiciones.') && accion.mutate({ ruta: 'finalizar' })}>
              <Flag size={16} /> Finalizar partido
            </button>
          )}
          {fin && esAdmin && (
            <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={() => accion.mutate({ ruta: 'reabrir' })}><RotateCcw size={16} /> Reabrir para corregir</button>
          )}
          {p.estado !== 'programado' && (
            <Link to={`/partidos/${p.id}/acta`} target="_blank" className="btn bg-white/10 text-white hover:bg-white/20"><Printer size={16} /> Acta</Link>
          )}
        </div>
        {p.estado === 'programado' && <p className="mt-3 text-center text-sm text-slate-400">Revisa la planilla y pulsa <b>Iniciar partido</b>. Los goles, tarjetas y faltas se habilitan al iniciar.</p>}
      </div>

      {/* Planillas */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[p.local, p.visitante].map((l) => (
          <PanelEquipo
            key={l.id} p={p} lado={l} activo={enJuego}
            onEvento={registrar}
            onConvocar={(pjId, v) => convocar.mutate({ pjId, v })}
            onAgregar={(d) => agregar.mutate(d)}
          />
        ))}
      </div>

      {/* Eventos */}
      <div className="card">
        <h3 className="mb-2 text-lg font-bold">Eventos del partido</h3>
        {p.eventos.length === 0 && <p className="py-3 text-center text-sm text-slate-500">Todavía no hay eventos.</p>}
        <div className="divide-y divide-slate-100">
          {[...p.eventos].reverse().map((ev) => {
            const equipo = ev.equipo_id === p.local.id ? p.local.nombre : p.visitante.nombre
            return (
              <div key={ev.id} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="w-20 font-mono text-slate-500">{ev.periodo}T {fmtTiempo(ev.segundo)}</span>
                <span className="w-40 font-medium">{EVENTO[ev.tipo].icono} {EVENTO[ev.tipo].nombre}</span>
                <span className="flex-1">{ev.nombre ? `#${ev.numero} ${ev.nombre}` : '(equipo)'} <span className="text-slate-400">— {equipo}</span></span>
                {!fin && (
                  <button title="Eliminar evento" className="rounded p-1 text-red-500 hover:bg-red-50"
                    onClick={() => confirm('¿Eliminar este evento?') && deshacer.mutate(ev.id)}><X size={16} /></button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

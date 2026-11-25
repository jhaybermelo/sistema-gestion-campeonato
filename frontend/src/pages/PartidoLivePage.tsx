import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Flag, Pause, Play, Printer, RotateCcw, SkipForward, Timer, UserPlus, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { api, errorToast, fmtFecha, fmtTiempo } from '../api/client'
import { useAuth } from '../auth'
import { EVENTO, MOTIVO } from '../eventos'
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

/** Cuenta regresiva local (descanso, tiempo muerto) anclada al valor que informa el servidor. */
function useCuenta(inicial: number | null | undefined, clave: unknown) {
  const [anchor, setAnchor] = useState({ v: 0, at: performance.now() })
  const [now, setNow] = useState(performance.now())
  const activo = inicial != null
  useEffect(() => {
    setAnchor({ v: inicial ?? 0, at: performance.now() })
    setNow(performance.now())
  }, [inicial, clave])
  useEffect(() => {
    if (!activo) return
    const t = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(t)
  }, [activo])
  const restante = activo ? Math.max(0, anchor.v - (now - anchor.at) / 1000) : null
  // Pitido una sola vez cuando la cuenta llega a 0 (no al cargar la página con la cuenta ya terminada).
  const previo = useRef<number | null>(null)
  useEffect(() => {
    if (previo.current !== null && previo.current > 0 && restante === 0) pitido()
    previo.current = restante
  }, [restante])
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
      <button type="button" className="btn btn-sec !py-2.5 sm:!py-1.5" onClick={onClose}>Cancelar</button>
    </form>
  )
}

interface PanelProps {
  p: PartidoDetalle
  lado: LadoPartido
  activo: boolean
  lectura: boolean // el delegado solo consulta
  tmUsado: boolean // ya usó su tiempo muerto en este periodo
  onTiempoMuerto: () => void
  onEvento: (tipo: TipoEvento, equipoId: number, j: JugadorPlanilla | null) => void
  onConvocar: (pjId: number, v: boolean) => void
  onAgregar: (d: object) => void
}

function PanelEquipo({ p, lado, activo, lectura, tmUsado, onTiempoMuerto, onEvento, onConvocar, onAgregar }: PanelProps) {
  const [editando, setEditando] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  const faltas = lado.faltas[String(p.periodo)] ?? 0
  const limite = faltas >= p.limite_faltas
  const lista = editando ? lado.jugadores : lado.jugadores.filter((j) => j.convocado)
  const btn = 'flex h-11 w-full items-center justify-center rounded-md text-sm font-bold transition active:scale-90 disabled:opacity-25 sm:h-9 sm:w-9'

  return (
    <div className="card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{lado.nombre}</h3>
        <div className={clsx('rounded-lg px-3 py-1 text-sm font-semibold', limite ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600')}>
          Faltas {p.periodo}º T: {faltas}/{p.limite_faltas}
          {faltas > p.limite_faltas ? ' · sin barrera 🚫' : limite ? ' · la próxima: sin barrera ⚠' : ''}
        </div>
      </div>

      <div className="space-y-1">
        {lista.map((j) => (
          <div key={j.id} className={clsx('flex flex-wrap items-center gap-1.5 rounded-lg border-b border-slate-100 px-1 py-1.5', j.fuera && 'bg-red-50', !j.convocado && 'opacity-50')}>
            {editando && (
              <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={j.convocado} onChange={(e) => onConvocar(j.id, e.target.checked)} />
            )}
            <span className="w-8 text-center text-lg font-extrabold text-emerald-700">{j.numero}</span>
            <span className={clsx('min-w-[100px] flex-1 font-medium', j.fuera && 'text-slate-400 line-through')}>
              {j.nombre}
              <span className="ml-1 inline-flex gap-1 align-middle">
                {j.goles > 0 && <Chip className="bg-slate-900 text-white">⚽{j.goles}</Chip>}
                {j.amarillas > 0 && <Chip className="bg-yellow-300 text-yellow-900">{j.amarillas}</Chip>}
                {j.azules > 0 && <Chip className="bg-blue-500 text-white">{j.azules}</Chip>}
                {j.rojas > 0 && <Chip className="bg-red-600 text-white">{j.rojas}</Chip>}
                {j.faltas > 0 && <Chip className={j.faltas >= 4 ? 'bg-amber-300 text-amber-900' : 'bg-slate-200 text-slate-700'}>F{j.faltas}</Chip>}
                {j.fuera && <Chip className="bg-red-600 text-white">FUERA</Chip>}
              </span>
            </span>
            {!editando && !lectura && (
              <div className="grid w-full grid-cols-6 gap-1.5 sm:flex sm:w-auto sm:gap-1">
                <button disabled={!activo || j.fuera} title="Gol" className={clsx(btn, 'bg-slate-900 text-white')} onClick={() => onEvento('gol', lado.id, j)}>⚽</button>
                <button disabled={!activo || j.fuera} title="Falta" className={clsx(btn, 'bg-slate-200 text-slate-700')} onClick={() => onEvento('falta', lado.id, j)}>F</button>
                <button disabled={!activo || j.fuera} title="Tarjeta amarilla" className={clsx(btn, 'bg-yellow-300 text-yellow-900')} onClick={() => onEvento('amarilla', lado.id, j)}>A</button>
                <button disabled={!activo || j.fuera} title="Tarjeta azul" className={clsx(btn, 'bg-blue-500 text-white')} onClick={() => onEvento('azul', lado.id, j)}>Az</button>
                <button disabled={!activo || j.fuera} title="Tarjeta roja" className={clsx(btn, 'bg-red-600 text-white')} onClick={() => onEvento('roja', lado.id, j)}>R</button>
                <button disabled={!activo || j.fuera} title="Autogol" className={clsx(btn, 'bg-white text-slate-500 ring-1 ring-slate-300 !text-xs')} onClick={() => onEvento('autogol', lado.id, j)}>AG</button>
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

      {!lectura && <div className="mt-3 flex flex-wrap gap-2">
        {!editando && (
          <button disabled={!activo} className="btn btn-sec !py-2.5 sm:!py-1.5" onClick={() => onEvento('falta', lado.id, null)}>
            + Falta del equipo
          </button>
        )}
        {!editando && (
          <button disabled={!activo || tmUsado} className="btn btn-sec !py-2.5 sm:!py-1.5" onClick={onTiempoMuerto}>
            ⏱ Tiempo muerto{tmUsado ? ' (usado)' : ''}
          </button>
        )}
        <button className="btn btn-sec !py-2.5 sm:!py-1.5" onClick={() => setEditando(!editando)}>
          <Users size={14} /> {editando ? 'Listo' : 'Editar planilla'}
        </button>
        {editando && (
          <button className="btn btn-sec !py-2.5 sm:!py-1.5" onClick={() => setNuevo(true)}><UserPlus size={14} /> Jugador nuevo</button>
        )}
      </div>}
      {editando && <p className="mt-1 text-xs text-slate-500">Marca solo a los jugadores que asistieron al partido.</p>}
      {nuevo && <FormJugador lado={lado} onAdd={onAgregar} onClose={() => setNuevo(false)} />}
    </div>
  )
}

export default function PartidoLivePage() {
  const id = Number(useParams().id)
  const { esAdmin, puedeOperar } = useAuth()
  const qc = useQueryClient()
  const key = ['partido', id]
  const { data: p, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<PartidoDetalle>(`/partidos/${id}`)).data,
    refetchInterval: 5000,
  })

  const restante = useReloj(p, () => qc.invalidateQueries({ queryKey: key }))
  const descansoRest = useCuenta(p?.descanso?.restante_seg, p?.descanso ? p.periodo : null)
  const tmRest = useCuenta(p?.tiempo_muerto?.restante_seg, p?.tiempo_muerto?.equipo_id)

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
      const ult = [...d.eventos].reverse().find((e) => !e.motivo) ?? d.eventos[d.eventos.length - 1]
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

  // Reglas AMF: el servidor genera la azul automática (5.ª falta, 2.ª amarilla) y bloquea al jugador fuera;
  // aquí solo avisamos al planillero de lo que acaba de pasar.
  const registrar = (tipo: TipoEvento, equipoId: number, j: JugadorPlanilla | null) => {
    evento.mutate({ tipo, equipoId, j }, {
      onSuccess: (d) => {
        const nj = j ? [...d.local.jugadores, ...d.visitante.jugadores].find((x) => x.id === j.id) : undefined
        if (j && nj) {
          if (nj.fuera && !j.fuera) {
            const porque = tipo === 'falta' ? '5.ª falta personal: tarjeta azul' : tipo === 'amarilla' ? '2.ª amarilla: tarjeta azul' : tipo === 'roja' ? 'tarjeta roja' : 'tarjeta azul'
            toast(`#${j.numero} ${j.nombre} sale del partido (${porque}).${tipo === 'roja' ? '' : ' Sustitución obligatoria.'}`, { icon: '🟦', duration: 8000 })
          } else if (tipo === 'falta' && nj.faltas === 4) {
            toast(`#${j.numero} ${j.nombre} lleva 4 faltas: la próxima es azul y sale del partido`, { icon: '⚠️', duration: 6000 })
          }
        }
        if (tipo === 'falta') {
          const lado = equipoId === d.local.id ? d.local : d.visitante
          const n = lado.faltas[String(d.periodo)] ?? 0
          if (n === d.limite_faltas) toast(`${lado.nombre} llegó a ${n} faltas en este tiempo: la próxima es tiro libre sin barrera`, { icon: '⚠️', duration: 7000 })
          else if (n > d.limite_faltas) toast(`Falta ${n} de ${lado.nombre}: tiro libre sin barrera`, { icon: '🚫', duration: 7000 })
        }
      },
    })
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
      <Link to="/partidos" className="inline-flex items-center gap-1 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft size={16} /> Partidos</Link>

      {/* Marcador y cronómetro */}
      <div className="rounded-2xl bg-slate-900 p-4 text-white shadow-lg sm:p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center sm:gap-6">
          <div className="text-lg font-bold sm:text-2xl">{p.local.nombre}</div>
          <div className="text-5xl font-extrabold tabular-nums sm:text-7xl">{p.goles_local} - {p.goles_visitante}</div>
          <div className="text-lg font-bold sm:text-2xl">{p.visitante.nombre}</div>
        </div>
        <div className="mt-2 text-center text-xs text-slate-400">
          {p.categoria && <b>{p.categoria} · </b>}<b>{p.fase_nombre} · </b>{fmtFecha(p.fecha)} {p.hora ?? ''} {p.cancha && `· ${p.cancha}`} {p.jornada && `· ${p.jornada}`}
        </div>
        <div className="mt-3 text-center text-sm font-semibold tracking-widest text-emerald-400">{etiquetaPeriodo}</div>
        <div className={clsx('text-center font-mono text-7xl font-extrabold tabular-nums sm:text-8xl', p.corriendo ? 'text-emerald-400' : sinTiempo && enJuego ? 'text-red-500' : 'text-white')}>
          {fmtTiempo(restante)}
        </div>

        {p.descanso && enJuego && (
          <div className="mt-3 rounded-xl bg-amber-400/15 p-3 text-center ring-1 ring-amber-400/40">
            <div className="text-xs font-bold tracking-widest text-amber-300">DESCANSO</div>
            <div className="font-mono text-5xl font-extrabold tabular-nums text-amber-300">{fmtTiempo(descansoRest ?? 0)}</div>
            <div className="text-xs text-amber-200/80">
              {(descansoRest ?? 0) <= 0 ? 'Descanso terminado: inicia el siguiente tiempo' : 'Los equipos cambian de mitad de campo'}
            </div>
          </div>
        )}
        {p.tiempo_muerto && (
          <div className="mt-3 rounded-xl bg-sky-400/15 p-3 text-center ring-1 ring-sky-400/40">
            <div className="text-xs font-bold tracking-widest text-sky-300">
              ⏱ TIEMPO MUERTO · {(p.tiempo_muerto.equipo_id === p.local.id ? p.local : p.visitante).nombre}
            </div>
            <div className="font-mono text-5xl font-extrabold tabular-nums text-sky-300">{fmtTiempo(tmRest ?? 0)}</div>
            <div className="text-xs text-sky-200/80">
              {(tmRest ?? 0) <= 0 ? 'Tiempo muerto terminado: reanuda el juego' : 'El cronómetro está detenido'}
            </div>
            {puedeOperar && (
              <button className="btn mt-2 bg-white/10 text-white hover:bg-white/20" onClick={() => accion.mutate({ ruta: 'tiempo-muerto/terminar' })}>
                Terminar tiempo muerto
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {puedeOperar && p.estado === 'programado' && (
            <button className="btn btn-pri !px-8 !py-3 !text-lg" disabled={pendiente} onClick={() => accion.mutate({ ruta: 'iniciar' })}><Play size={22} /> Iniciar partido</button>
          )}
          {puedeOperar && enJuego && p.corriendo && (
            <button className="btn btn-del !px-8 !py-3 !text-lg" disabled={pendiente} onClick={() => accion.mutate({ ruta: 'pausar' })}><Pause size={22} /> Parar</button>
          )}
          {puedeOperar && enJuego && !p.corriendo && !sinTiempo && (
            <button className="btn btn-pri !px-8 !py-3 !text-lg" disabled={pendiente} onClick={() => accion.mutate({ ruta: 'iniciar' })}><Play size={22} /> Reanudar</button>
          )}
          {puedeOperar && enJuego && !p.corriendo && !ultimoTiempo && sinTiempo && !p.descanso && (
            <button className="btn bg-white/10 text-white hover:bg-white/20" disabled={pendiente} onClick={() => accion.mutate({ ruta: 'descanso' })}>Iniciar descanso</button>
          )}
          {puedeOperar && enJuego && !p.corriendo && !ultimoTiempo && (
            <button className={clsx('btn !py-3', sinTiempo ? 'btn-pri !px-6 !text-lg' : 'bg-white/10 text-white hover:bg-white/20')} disabled={pendiente}
              onClick={() => (sinTiempo || confirm('Aún queda tiempo en este periodo. ¿Pasar al siguiente tiempo?')) && accion.mutate({ ruta: 'siguiente-tiempo' })}>
              <SkipForward size={18} /> Pasar al {p.periodo + 1}º tiempo
            </button>
          )}
          {puedeOperar && enJuego && !p.corriendo && (
            <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={ajustar}><Timer size={16} /> Ajustar tiempo</button>
          )}
          {puedeOperar && enJuego && (
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
        {!puedeOperar && <p className="mt-3 text-center text-sm text-slate-400">Vista de solo lectura.</p>}
        {puedeOperar && p.estado === 'programado' && <p className="mt-3 text-center text-sm text-slate-400">Revisa la planilla y pulsa <b>Iniciar partido</b>. Los goles, tarjetas y faltas se habilitan al iniciar.</p>}
      </div>

      {/* Planillas */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[p.local, p.visitante].map((l) => (
          <PanelEquipo
            key={l.id} p={p} lado={l} activo={enJuego && puedeOperar} lectura={!puedeOperar}
            tmUsado={!!l.tiempos_muertos[String(p.periodo)]} onTiempoMuerto={() => registrar('tiempo_muerto', l.id, null)}
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
              <div key={ev.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                <span className="w-20 shrink-0 font-mono text-slate-500">{ev.periodo}T {fmtTiempo(ev.segundo)}</span>
                <span className="font-medium sm:w-56">{EVENTO[ev.tipo].icono} {EVENTO[ev.tipo].nombre}{ev.motivo && <span className="ml-1 text-xs font-normal text-slate-500">({MOTIVO[ev.motivo]})</span>}</span>
                <span className="order-3 basis-full sm:order-none sm:basis-auto sm:flex-1">{ev.nombre ? `#${ev.numero} ${ev.nombre}` : '(equipo)'} <span className="text-slate-400">— {equipo}</span></span>
                {!fin && puedeOperar && !ev.motivo && (
                  <button title="Eliminar evento" className="order-2 ml-auto flex h-10 w-10 items-center justify-center rounded text-red-500 hover:bg-red-50 sm:order-none sm:h-8 sm:w-8"
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

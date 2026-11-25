export type Estado = 'programado' | 'en_juego' | 'finalizado'
export type TipoEvento = 'gol' | 'autogol' | 'amarilla' | 'azul' | 'roja' | 'falta' | 'tiempo_muerto'

export interface Config {
  nombre: string
  duracion_min: number
  num_tiempos: number
  limite_faltas: number
  pts_ganado: number
  pts_empate: number
  pts_perdido: number
  max_jugadores: number
  descanso_min: number
  fase_goleador: string
  fase_valla: string
  fases: { id: string; nombre: string }[]
}

export interface Categoria {
  id: number
  nombre: string
  limita_anio: boolean
  anio_minimo: number | null
  num_equipos: number
}

export interface Jugador {
  id: number
  equipo_id: number
  numero: number
  nombre: string
  documento: string
  anio_nacimiento: number | null
}

export interface Equipo {
  id: number
  nombre: string
  delegado: string
  telefono: string
  activo: boolean
  categoria_id: number | null
  categoria: string | null
  limita_anio: boolean
  anio_minimo: number | null
  num_jugadores: number
  es_propio?: boolean
  planilla_cerrada?: boolean
  max_jugadores?: number
  puede_editar_plantel?: boolean
  jugadores?: Jugador[]
}

export interface PartidoResumen {
  id: number
  estado: Estado
  fecha: string
  hora: string | null
  cancha: string
  jornada: string
  periodo: number
  fase: string
  fase_nombre: string
  categoria_id: number | null
  categoria: string | null
  local_id: number
  local: string
  visitante_id: number
  visitante: string
  goles_local: number
  goles_visitante: number
}

export interface JugadorPlanilla {
  id: number // id en la planilla (partido_jugadores)
  jugador_id: number
  numero: number
  nombre: string
  documento: string
  convocado: boolean
  goles: number
  autogoles: number
  amarillas: number
  azules: number
  rojas: number
  faltas: number
  expulsado: boolean // roja
  fuera: boolean // roja o azul: no puede volver a actuar
  salida: 'roja' | 'azul' | null
}

export interface LadoPartido {
  id: number
  nombre: string
  delegado: string
  faltas: Record<string, number>
  tiempos_muertos: Record<string, boolean>
  limita_anio: boolean
  anio_minimo: number | null
  jugadores: JugadorPlanilla[]
}

export interface EventoPartido {
  id: number
  tipo: TipoEvento
  equipo_id: number
  lado: 'local' | 'visitante' | null
  pj_id: number | null
  numero: number | null
  nombre: string | null
  periodo: number
  segundo: number
  motivo: 'quinta_falta' | 'doble_amarilla' | null
}

export interface PartidoDetalle {
  id: number
  estado: Estado
  fecha: string
  hora: string | null
  cancha: string
  jornada: string
  fase: string
  fase_nombre: string
  categoria: string | null
  periodo: number
  num_tiempos: number
  duracion_seg: number
  restante_seg: number
  corriendo: boolean
  limite_faltas: number
  descanso: { restante_seg: number; duracion_seg: number; terminado: boolean } | null
  tiempo_muerto: { equipo_id: number; restante_seg: number; terminado: boolean } | null
  nombre_campeonato: string
  goles_local: number
  goles_visitante: number
  local: LadoPartido
  visitante: LadoPartido
  eventos: EventoPartido[]
}

export interface FilaTabla {
  equipo_id: number
  equipo: string
  pj: number
  pg: number
  pe: number
  pp: number
  gf: number
  gc: number
  dg: number
  pts: number
}

export interface FilaJugadorStats {
  jugador_id: number
  numero: number
  nombre: string
  equipo: string
  goles: number
  pj: number
  promedio: number
  amarillas: number
  azules: number
  rojas: number
}

export interface FilaValla {
  equipo_id: number
  equipo: string
  pj: number
  gc: number
  promedio: number
}

export interface Estadisticas {
  goleadores: FilaJugadorStats[]
  valla: FilaValla[]
  tarjetas: FilaJugadorStats[]
  reglas: { fase_goleador: string; fase_valla: string }
}

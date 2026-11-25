import type { TipoEvento } from './types'

export const EVENTO: Record<TipoEvento, { icono: string; nombre: string }> = {
  gol: { icono: '⚽', nombre: 'Gol' },
  autogol: { icono: '⚽', nombre: 'Autogol' },
  amarilla: { icono: '🟨', nombre: 'Tarjeta amarilla' },
  azul: { icono: '🟦', nombre: 'Tarjeta azul' },
  roja: { icono: '🟥', nombre: 'Tarjeta roja' },
  falta: { icono: '🚫', nombre: 'Falta' },
  tiempo_muerto: { icono: '⏱', nombre: 'Tiempo muerto' },
}

/** Por qué se generó una tarjeta automática (reglas AMF). */
export const MOTIVO: Record<string, string> = {
  quinta_falta: '5.ª falta personal',
  doble_amarilla: '2.ª amarilla',
}

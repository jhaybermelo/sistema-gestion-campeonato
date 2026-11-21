import type { TipoEvento } from './types'

export const EVENTO: Record<TipoEvento, { icono: string; nombre: string }> = {
  gol: { icono: '⚽', nombre: 'Gol' },
  autogol: { icono: '⚽', nombre: 'Autogol' },
  amarilla: { icono: '🟨', nombre: 'Tarjeta amarilla' },
  azul: { icono: '🟦', nombre: 'Tarjeta azul' },
  roja: { icono: '🟥', nombre: 'Tarjeta roja' },
  falta: { icono: '🚫', nombre: 'Falta' },
}

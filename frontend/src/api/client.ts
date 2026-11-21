import axios from 'axios'
import toast from 'react-hot-toast'

export const TOKEN_KEY = 'pitazo_token'

export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((cfg) => {
  try {
    const t = localStorage.getItem(TOKEN_KEY)
    if (t) cfg.headers.Authorization = `Bearer ${t}`
  } catch { /* sin almacenamiento */ }
  return cfg
})

// Si el servidor dice que la sesión venció, volvemos a la pantalla de login.
api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (axios.isAxiosError(e) && e.response?.status === 401 && !e.config?.url?.includes('/auth/login')) {
      window.dispatchEvent(new Event('auth:expirada'))
    }
    return Promise.reject(e)
  },
)

export function mensajeError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data?.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d[0]?.msg) return d[0].msg
    if (!e.response) return 'No hay conexión con el servidor'
  }
  return 'Ocurrió un error inesperado'
}

export const errorToast = (e: unknown) => toast.error(mensajeError(e))

export function fmtTiempo(seg: number): string {
  const s = Math.max(0, Math.ceil(seg))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

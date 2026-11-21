import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = 'http://localhost:8001'
const API = 'http://127.0.0.1:8001/api'
const CLAVE = process.env.ADMIN_PASSWORD
const OUT = 'shots'
fs.mkdirSync(OUT, { recursive: true })

const llamar = async (m, p, b, t) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })
  if (!r.ok) throw new Error(m + ' ' + p + ' ' + r.status + ' ' + (await r.text()))
  return r.status === 204 ? null : r.json()
}

// ---------- datos de prueba (con nombres largos para estresar el diseño) ----------
const token = (await llamar('POST', '/auth/login', { usuario: 'admin', password: CLAVE })).token
const cat = await llamar('POST', '/categorias', { nombre: 'Máster Libre Veteranos', limita_anio: true, anio_minimo: 1980 }, token)
const eqA = await llamar('POST', '/equipos', { nombre: 'Deportivo Los Halcones del Norte', categoria_id: cat.id, delegado: 'Carlos Alberto Rodríguez' }, token)
const eqB = await llamar('POST', '/equipos', { nombre: 'Atlético Tigres Unidos FC', categoria_id: cat.id }, token)
const eqC = await llamar('POST', '/equipos', { nombre: 'Cóndores', categoria_id: cat.id }, token)
const nombres = ['Juan Sebastián Valencia Ramírez', 'Ana', 'Pedro Pablo Martínez', 'Luis Fernando Gómez', 'Carlos Andrés Ruiz', 'Diego', 'Mateo Alejandro', 'Santiago Herrera', 'Camilo Torres', 'Andrés Felipe Castro']
for (const [eq, pre] of [[eqA, 'A'], [eqB, 'B'], [eqC, 'C']]) {
  for (let i = 0; i < nombres.length; i++) await llamar('POST', `/equipos/${eq.id}/jugadores`, { numero: i + 1, nombre: pre === 'A' ? nombres[i] : nombres[i] + ' ' + pre, anio_nacimiento: 1970 + i, documento: '10' + i + '2345678' }, token)
}
const live = await llamar('POST', '/partidos', { local_id: eqA.id, visitante_id: eqB.id, fecha: '2026-11-21', hora: '15:30', cancha: 'Coliseo Municipal Cubierto', jornada: 'Fecha 3 - Cuartos de final' }, token)
const prog = await llamar('POST', '/partidos', { local_id: eqB.id, visitante_id: eqC.id, fecha: '2026-11-22', hora: '09:00' }, token)
const fin = await llamar('POST', '/partidos', { local_id: eqC.id, visitante_id: eqA.id, fecha: '2026-11-20' }, token)
await llamar('POST', `/partidos/${live.id}/iniciar`, null, token)
const dl = await llamar('GET', `/partidos/${live.id}`, null, token)
const A = dl.local.jugadores, B = dl.visitante.jugadores
for (const [t, eq, j] of [['gol', eqA.id, A[0].id], ['gol', eqA.id, A[0].id], ['gol', eqB.id, B[1].id], ['amarilla', eqA.id, A[2].id], ['amarilla', eqA.id, A[2].id], ['azul', eqB.id, B[3].id], ['roja', eqB.id, B[4].id], ['falta', eqA.id, null], ['falta', eqA.id, A[3].id], ['falta', eqB.id, null]])
  await llamar('POST', `/partidos/${live.id}/eventos`, { tipo: t, equipo_id: eq, pj_id: j }, token)
await llamar('POST', `/partidos/${live.id}/pausar`, null, token)
await llamar('POST', `/partidos/${fin.id}/iniciar`, null, token)
const df = await llamar('GET', `/partidos/${fin.id}`, null, token)
await llamar('POST', `/partidos/${fin.id}/eventos`, { tipo: 'gol', equipo_id: eqC.id, pj_id: df.local.jugadores[0].id }, token)
await llamar('POST', `/partidos/${fin.id}/finalizar`, null, token)
await llamar('POST', '/usuarios', { usuario: 'mesa1', nombre: 'Mesa de Control Uno', password: 'clave-mesa-1', rol: 'planillero' }, token)

// ---------- recorrido ----------
const VIEWPORTS = [
  { nombre: 'movil360', width: 360, height: 740 },
  { nombre: 'movil390', width: 390, height: 844 },
  { nombre: 'tablet768', width: 768, height: 1024 },
]
const RUTAS = [
  ['partidos', '/partidos'],
  ['live', `/partidos/${live.id}`],
  ['programado', `/partidos/${prog.id}`],
  ['finalizado', `/partidos/${fin.id}`],
  ['acta', `/partidos/${live.id}/acta`],
  ['equipos', '/equipos'],
  ['categorias', '/categorias'],
  ['tabla', '/tabla'],
  ['estadisticas', '/estadisticas'],
  ['usuarios', '/usuarios'],
  ['config', '/config'],
  ['cuenta', '/cuenta'],
]

const medir = () => {
  const W = document.documentElement.clientWidth
  const out = []
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    if (r.right > W + 1 || r.left < -1) {
      // ignorar si un ancestro hace scroll horizontal (overflow-x auto/scroll)
      let p = el.parentElement, scroll = false
      while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') { scroll = true; break } p = p.parentElement }
      if (!scroll) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} der=${Math.round(r.right)} "${(el.textContent || '').trim().slice(0, 25)}"`)
    }
  }
  // objetivos táctiles pequeños (botones/enlaces interactivos visibles)
  const chicos = []
  for (const el of document.querySelectorAll('button, a[href], select, input:not([type=checkbox])')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.height < 36 || r.width < 36) chicos.push(`${el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || el.title || el.placeholder || '').trim().slice(0, 18)}"`)
  }
  const zoomIOS = []
  for (const el of document.querySelectorAll('input:not([type=checkbox]), select, textarea')) {
    const r = el.getBoundingClientRect()
    if (r.width && parseFloat(getComputedStyle(el).fontSize) < 16) zoomIOS.push(el.tagName.toLowerCase() + ' ' + (el.placeholder || el.type || ''))
  }
  return { scrollW: document.documentElement.scrollWidth, W, fuera: out.slice(0, 6), chicos: [...new Set(chicos)].slice(0, 6), zoomIOS: [...new Set(zoomIOS)].slice(0, 4) }
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const problemas = []
const errores = []

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 600, hasTouch: true, deviceScaleFactor: 2 })
  await ctx.addInitScript((t) => localStorage.setItem('pitazo_token', t), token)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errores.push(`${vp.nombre}: ${e.message}`))

  const revisar = async (nombre) => {
    await page.waitForTimeout(700)
    const m = await page.evaluate(medir)
    const desborde = m.scrollW > m.W + 1
    await page.screenshot({ path: `${OUT}/${vp.nombre}-${nombre}.png`, fullPage: true })
    const resumen = `${desborde || m.fuera.length ? 'PROBLEMA' : 'ok      '} ${vp.nombre.padEnd(9)} ${nombre.padEnd(22)} ancho=${m.scrollW}/${m.W}`
    console.log(resumen)
    if (desborde || m.fuera.length) { console.log('   fuera de pantalla:', m.fuera.join(' | ')); problemas.push(`${vp.nombre}/${nombre}`) }
    if (m.zoomIOS.length && vp.width < 600) console.log('   ZOOM iOS (letra <16px):', m.zoomIOS.join(' | '))
    if (m.chicos.length && vp.width < 600) console.log('   táctiles pequeños:', m.chicos.join(' | '))
  }

  for (const [nombre, ruta] of RUTAS) {
    await page.goto(BASE + ruta)
    await revisar(nombre)
  }

  // estados interactivos
  await page.goto(BASE + '/partidos'); await page.getByRole('button', { name: /Nuevo partido/ }).click(); await page.locator('.fixed select').first().waitFor()
  await revisar('modal-nuevo-partido')
  await page.goto(BASE + `/partidos/${live.id}`); await page.getByRole('button', { name: /Editar planilla/ }).first().click(); await page.getByRole('button', { name: /Jugador nuevo/ }).first().click()
  await revisar('live-editar-planilla')
  await page.goto(BASE + '/equipos'); await page.getByText('Deportivo Los Halcones del Norte').first().click(); await page.getByRole('heading', { name: 'Deportivo Los Halcones del Norte' }).waitFor()
  await revisar('equipo-detalle')
  await page.getByRole('button', { name: /Editar/ }).first().click()
  await revisar('equipo-editar')
  await ctx.close()

  // login sin sesión
  const ctx2 = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 600, hasTouch: true, deviceScaleFactor: 2 })
  const p2 = await ctx2.newPage(); await p2.goto(BASE + '/partidos'); await p2.getByRole('button', { name: /Entrar/ }).waitFor()
  const m = await p2.evaluate(medir); await p2.screenshot({ path: `${OUT}/${vp.nombre}-login.png`, fullPage: true })
  console.log(`${m.scrollW > m.W + 1 ? 'PROBLEMA' : 'ok      '} ${vp.nombre.padEnd(9)} ${'login'.padEnd(22)} ancho=${m.scrollW}/${m.W}`)
  await ctx2.close()
}
await browser.close()
console.log('\nERRORES JS:', errores.length ? errores.join(' | ') : 'ninguno')
console.log('RESUMEN: vistas con problemas de ancho =', problemas.length, problemas.join(', '))

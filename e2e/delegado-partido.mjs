import { chromium } from 'playwright-core'

const BASE = 'http://localhost:8001'
const API = 'http://127.0.0.1:8001/api'
const CLAVE = process.env.ADMIN_PASSWORD
const ok = (c, msg) => { console.log(c ? 'OK   ' : 'FALLA', msg); if (!c) process.exitCode = 1 }
const llamar = async (m, p, b, t, crudo) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })
  if (crudo) return r
  if (!r.ok) throw new Error(m + ' ' + p + ' ' + r.status + ' ' + (await r.text()))
  return r.status === 204 ? null : r.json()
}

// ---------- datos ----------
const T = (await llamar('POST', '/auth/login', { usuario: 'admin', password: CLAVE })).token
const catX = await llamar('POST', '/categorias', { nombre: 'Libre' }, T)
const catY = await llamar('POST', '/categorias', { nombre: 'Sub15' }, T)
const mk = (n, c) => llamar('POST', '/equipos', { nombre: n, categoria_id: c.id }, T)
const A = await mk('Halcones', catX), B = await mk('Tigres', catX), C = await mk('Cóndores', catX)
const D = await mk('Lobos', catY), E = await mk('Osos', catY)
for (const [e, p] of [[A, 'Hal'], [B, 'Tig'], [C, 'Con'], [D, 'Lob'], [E, 'Oso']])
  for (let i = 1; i <= 3; i++) await llamar('POST', `/equipos/${e.id}/jugadores`, { numero: i, nombre: `${p}${i}` }, T)
await llamar('POST', '/usuarios', { usuario: 'del1', nombre: 'Delegado Halcones', password: 'clave-del-1', rol: 'delegado', equipo_ids: [A.id] }, T)
const dT = (await llamar('POST', '/auth/login', { usuario: 'del1', password: 'clave-del-1' })).token
const crear = (l, v, f) => llamar('POST', '/partidos', { local_id: l.id, visitante_id: v.id, fecha: f }, T)
const m1 = await crear(A, B, '2026-12-01')      // partido de SU equipo
const m2 = await crear(C, B, '2026-12-02')      // otro partido de su categoría
const m3 = await crear(D, E, '2026-12-03')      // OTRA categoría
await llamar('POST', `/partidos/${m1.id}/iniciar`, null, T)   // en juego, cronómetro corriendo

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errores = []
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
await ctx.addInitScript((t) => localStorage.setItem('pitazo_token', t), dT)
const page = await ctx.newPage()
page.on('pageerror', (e) => errores.push(e.message))

// ---------- lista de partidos ----------
await page.goto(BASE + '/partidos')
await page.getByText(/Mis partidos \(1\)/).waitFor()
ok(true, 'el delegado ve la sección "Mis partidos" arriba')
ok(await page.getByText('TU EQUIPO', { exact: true }).count() === 1, 'su partido lleva la etiqueta "TU EQUIPO"')
ok(await page.getByRole('link', { name: 'Ver en vivo' }).count() === 1, 'el botón del partido en juego dice "Ver en vivo"')
ok(await page.getByText(/Programados de mi categoría \(1\)/).count() === 1, 'los demás partidos de su categoría aparecen aparte')
ok((await page.getByText('Lobos').count()) === 0 && (await page.getByText('Osos').count()) === 0, 'NO ve el partido de otra categoría (Sub15)')
await page.screenshot({ path: 'del-partidos.png', fullPage: true })

// ---------- vista del partido: solo lectura ----------
await page.getByRole('link', { name: 'Ver en vivo' }).click()
await page.getByText('Vista de solo lectura.').waitFor()
await page.getByText('1º TIEMPO de 2').waitFor()
const prohibidos = /Iniciar partido|Parar|Reanudar|Pasar al|Ajustar tiempo|Finalizar partido|Reabrir|Tiempo muerto|Falta del equipo|Editar planilla|Jugador nuevo/
ok((await page.getByRole('button', { name: prohibidos }).count()) === 0, 'no hay NINGÚN botón de acción: ni cronómetro, ni tiempo muerto, ni planilla')
ok((await page.getByTitle('Gol').count()) === 0 && (await page.getByTitle('Tarjeta amarilla').count()) === 0 && (await page.getByTitle('Tarjeta roja').count()) === 0 && (await page.getByTitle('Falta').count()) === 0,
   'no hay botones de gol, tarjetas ni faltas en los jugadores')
ok(await page.getByText('Hal1').count() > 0 && await page.getByText('Tig1').count() > 0, 've las planillas de los dos equipos')
ok(await page.getByRole('link', { name: /Acta/ }).count() === 1, 'puede abrir el acta')

// el cronómetro corre solo
const reloj = () => page.locator('.font-mono').first().innerText()
const t1 = await reloj(); await page.waitForTimeout(2300); const t2 = await reloj()
ok(t1 !== t2, `el cronómetro se mueve en su pantalla (${t1} → ${t2})`)

// ---------- el administrador opera; el delegado ve los cambios sin recargar ----------
const d = await llamar('GET', `/partidos/${m1.id}`, null, T)
await llamar('POST', `/partidos/${m1.id}/eventos`, { tipo: 'gol', equipo_id: A.id, pj_id: d.local.jugadores[0].id }, T)
await llamar('POST', `/partidos/${m1.id}/eventos`, { tipo: 'amarilla', equipo_id: B.id, pj_id: d.visitante.jugadores[1].id }, T)
await page.getByText('1 - 0').first().waitFor({ timeout: 9000 })
ok(true, 'el gol que registra el administrador aparece en su pantalla (marcador 1 - 0) sin recargar')
await page.getByText('Tarjeta amarilla').first().waitFor({ timeout: 9000 })
ok(true, 'la tarjeta amarilla también aparece en los eventos')

await llamar('POST', `/partidos/${m1.id}/eventos`, { tipo: 'tiempo_muerto', equipo_id: A.id }, T)
await page.getByText(/TIEMPO MUERTO · Halcones/).waitFor({ timeout: 9000 })
ok((await page.getByRole('button', { name: /Terminar tiempo muerto/ }).count()) === 0, 've el tiempo muerto de su equipo con el contador, pero sin el botón para terminarlo')
await llamar('POST', `/partidos/${m1.id}/tiempo-muerto/terminar`, null, T)
await llamar('POST', `/partidos/${m1.id}/pausar`, null, T)
await llamar('POST', `/partidos/${m1.id}/ajustar`, { restante_seg: 0 }, T)
await page.getByText('DESCANSO', { exact: true }).waitFor({ timeout: 9000 })
ok((await page.getByRole('button', { name: /Pasar al/ }).count()) === 0, 've el descanso con su cronómetro, sin controles')
await page.screenshot({ path: 'del-partido.png', fullPage: true })

// ---------- la API también lo impide ----------
const prueba = async (m, ruta, cuerpo) => (await llamar(m, ruta, cuerpo, dT, true)).status
ok(await prueba('POST', `/partidos/${m1.id}/pausar`) === 403, 'por la API: pausar el cronómetro -> 403')
ok(await prueba('POST', `/partidos/${m1.id}/iniciar`) === 403, 'por la API: iniciar/reanudar -> 403')
ok(await prueba('POST', `/partidos/${m1.id}/eventos`, { tipo: 'gol', equipo_id: A.id, pj_id: d.local.jugadores[0].id }) === 403, 'por la API: registrar un gol -> 403')
ok(await prueba('POST', `/partidos/${m1.id}/eventos`, { tipo: 'roja', equipo_id: B.id, pj_id: d.visitante.jugadores[0].id }) === 403, 'por la API: registrar una tarjeta -> 403')
ok(await prueba('POST', `/partidos/${m1.id}/finalizar`) === 403, 'por la API: finalizar -> 403')
ok(await prueba('GET', `/partidos/${m1.id}`) === 200, 'pero consultar su partido -> 200')
ok(await prueba('GET', `/partidos/${m2.id}`) === 200, 'y consultar otro partido de su categoría -> 200')
ok(await prueba('GET', `/partidos/${m3.id}`) === 403, 'y uno de OTRA categoría -> 403')

// ---------- partido de otra categoría y acta ----------
await page.goto(BASE + `/partidos/${m3.id}`)
await page.getByText(/No se encontró el partido/).waitFor()
ok(true, 'abrir por URL el partido de otra categoría no muestra nada')
await page.goto(BASE + `/partidos/${m1.id}/acta`)
await page.getByText('Acta de juego').waitFor()
ok(true, 'el acta de su partido se puede ver')

// ---------- móvil ----------
{
  const c2 = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await c2.addInitScript((t) => localStorage.setItem('pitazo_token', t), dT)
  const p2 = await c2.newPage()
  await p2.goto(BASE + `/partidos/${m1.id}`)
  await p2.getByText('Vista de solo lectura.').waitFor()
  const w = await p2.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  ok(w[0] <= w[1] + 1, `móvil 360 px: sin desborde (${w[0]}/${w[1]})`)
  await p2.screenshot({ path: 'del-partido-movil.png', fullPage: true })
  await c2.close()
}
ok(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''))
await browser.close()

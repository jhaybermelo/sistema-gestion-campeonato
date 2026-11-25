import { chromium } from 'playwright-core'

const BASE = 'http://localhost:8001'
const API = 'http://127.0.0.1:8001/api'
const CLAVE = process.env.ADMIN_PASSWORD
const ok = (c, msg) => { console.log(c ? 'OK   ' : 'FALLA', msg); if (!c) process.exitCode = 1 }

const llamar = async (m, p, b, t) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })
  if (!r.ok) throw new Error(m + ' ' + p + ' ' + r.status + ' ' + (await r.text()))
  return r.status === 204 ? null : r.json()
}

// ---------- datos ----------
const T = (await llamar('POST', '/auth/login', { usuario: 'admin', password: CLAVE })).token
const master = await llamar('POST', '/categorias', { nombre: 'Máster', limita_anio: true, anio_minimo: 1980 }, T)
const libre = await llamar('POST', '/categorias', { nombre: 'Libre' }, T)
const mk = (n, c) => llamar('POST', '/equipos', { nombre: n, categoria_id: c.id }, T)
const a1 = await mk('Halcones', master), a2 = await mk('Tigres', master), b3 = await mk('Cóndores', master)
const l1 = await mk('Libres FC', libre), otra = await llamar('POST', '/categorias', { nombre: 'Sub15' }, T)
const s1 = await mk('Cachorros', otra)
for (const [e, nombre] of [[a2, 'Rival Uno'], [b3, 'Cóndor Uno']]) await llamar('POST', `/equipos/${e.id}/jugadores`, { numero: 1, nombre, anio_nacimiento: 1970 }, T)
await llamar('POST', `/equipos/${s1.id}/jugadores`, { numero: 1, nombre: 'Intruso Sub15' }, T)
await llamar('POST', '/usuarios', { usuario: 'del1', nombre: 'Delegado Uno', password: 'clave-del-1', rol: 'delegado', equipo_ids: [a1.id, l1.id] }, T)
// un partido en semifinal ya jugado para tener rankings
const jugarSemi = async () => {
  await llamar('POST', `/equipos/${a1.id}/jugadores`, { numero: 99, nombre: 'Base Halcones', anio_nacimiento: 1970 }, T)
  const m = await llamar('POST', '/partidos', { local_id: a2.id, visitante_id: b3.id, fecha: '2026-12-02', fase: 'semifinal' }, T)
  await llamar('POST', `/partidos/${m.id}/iniciar`, null, T)
  const d = await llamar('GET', `/partidos/${m.id}`, null, T)
  for (let i = 0; i < 2; i++) await llamar('POST', `/partidos/${m.id}/eventos`, { tipo: 'gol', equipo_id: a2.id, pj_id: d.local.jugadores[0].id }, T)
  await llamar('POST', `/partidos/${m.id}/finalizar`, null, T)
}
await jugarSemi()
await llamar('POST', '/partidos', { local_id: a1.id, visitante_id: a2.id, fecha: '2026-12-10', fase: 'grupos' }, T)
const dToken = (await llamar('POST', '/auth/login', { usuario: 'del1', password: 'clave-del-1' })).token

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errores = []

// ---------- el delegado, por pantalla ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript((t) => localStorage.setItem('pitazo_token', t), dToken)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errores.push(e.message))

  await page.goto(BASE + '/partidos')
  await page.getByText('Delegado Uno').first().waitFor()
  const menu = await page.locator('header nav a').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
  ok(JSON.stringify(menu) === JSON.stringify(['/partidos', '/equipos', '/tabla', '/estadisticas']), `menú del delegado: ${menu.join(', ')} (sin Categorías, Usuarios ni Ajustes)`)
  ok((await page.getByText('Nuevo partido').count()) === 0, 'no ve "Nuevo partido"')
  ok((await page.getByText('Cachorros').count()) === 0, 'no ve los partidos/equipos de otra categoría (Sub15)')

  // equipos
  await page.goto(BASE + '/equipos')
  await page.getByText('Mis equipos (2)').waitFor()
  ok(await page.getByText(/Otros equipos de mis categorías \(2\)/).count() === 1, 'separa "Mis equipos" de "Otros equipos de mis categorías"')
  ok((await page.getByText('Cachorros').count()) === 0 && (await page.getByText('Nuevo equipo').count()) === 0, 'no ve equipos de Sub15 ni el formulario "Nuevo equipo"')

  // abrir su equipo y completar 12 jugadores
  await page.getByRole('button', { name: /Halcones/ }).first().click()
  await page.getByText(/Planilla: \d+\/12 jugadores/).waitFor()
  const agregar = async (n, nombre, anio) => {
    await page.locator('#jug-nombre').fill(nombre)
    await page.getByPlaceholder('≤ 1980').fill(String(anio))
    await page.getByRole('button', { name: /^Agregar$/ }).click({ timeout: 6000 }).catch(async (e) => {
      const vals = await page.locator('form input').evaluateAll((els) => els.map((x) => `${x.placeholder || x.id || x.type}=[${x.value}]`))
      console.log(`DIAGNÓSTICO al agregar #${n} "${nombre}" año ${anio}: campos ->`, vals.join(' '), '| contador:', await page.getByText(/Planilla: \d+\/12/).first().innerText())
      await page.screenshot({ path: 'fallo.png', fullPage: true })
      throw e
    })
  }
  await agregar(0, 'Muy Joven', 1995)
  await page.getByText(/No cumple la edad/).waitFor({ timeout: 4000 })
  ok(true, 'por pantalla: un jugador de 1995 en Máster (≤1980) es rechazado con el motivo')
  for (let i = 1; i <= 11; i++) { await agregar(i, `Jugador ${i}`, 1970 + (i % 9)); await page.getByText(`Planilla: ${i + 1}/12 jugadores`).waitFor({ timeout: 8000 }).catch(async (e) => { await page.screenshot({ path: 'fallo.png', fullPage: true }); throw e }) }
  await page.getByText('Planilla: 12/12 jugadores').waitFor()
  await page.getByText(/La planilla está completa \(12\/12\)/).waitFor()
  ok((await page.locator('#jug-nombre').count()) === 0, 'con 12/12 desaparece el formulario y avisa que está completa')

  // dar de baja uno y reemplazarlo
  page.once('dialog', (d) => d.accept())
  await page.getByTitle('Quitar').first().click()
  await page.getByText('Planilla: 11/12 jugadores').waitFor()
  await agregar(50, 'Reemplazo', 1972)
  await page.getByText('Planilla: 12/12 jugadores').waitFor()
  ok(true, 'da de baja a uno y lo reemplaza (vuelve a 12/12)')

  // rival: solo lectura
  await page.getByRole('button', { name: /Tigres/ }).first().click()
  await page.getByText(/Solo lectura/).waitFor()
  ok((await page.getByTitle('Editar').count()) === 0 && (await page.locator('#jug-nombre').count()) === 0, 'la planilla del equipo rival es de solo lectura (ve a "Rival Uno")')
  ok(await page.getByText('Rival Uno').count() > 0, 've los jugadores del rival de su categoría')

  // el administrador inicia el partido de Halcones -> se cierra la planilla
  const part = (await llamar('GET', '/partidos', null, T)).find((p) => p.fase === 'grupos')
  await llamar('POST', `/partidos/${part.id}/iniciar`, null, T)
  await page.goto(BASE + '/equipos')
  await page.getByRole('button', { name: /Halcones/ }).first().click()
  await page.getByText(/Cerrada: el equipo ya inició su primer partido y no puedes modificarla/).waitFor()
  ok((await page.locator('#jug-nombre').count()) === 0 && (await page.getByTitle('Quitar').count()) === 0, 'al iniciar su primer partido la planilla queda CERRADA (sin formulario ni botones)')
  // su otro equipo sigue abierto
  await page.getByRole('button', { name: /Libres FC/ }).first().click()
  await page.getByText(/Abierta/).waitFor()
  ok(await page.locator('#jug-nombre').count() === 1, 'su equipo de otra categoría (sin partidos) sigue abierto')

  // partido: solo lectura
  await page.goto(BASE + `/partidos/${part.id}`)
  await page.getByText('Vista de solo lectura.').waitFor()
  ok((await page.getByRole('button', { name: /Parar|Reanudar|Finalizar|Iniciar/ }).count()) === 0 && (await page.getByTitle('Gol').count()) === 0, 'el partido en vivo es de solo lectura: sin cronómetro ni botones de gol/tarjeta')

  // tabla + estadísticas
  await page.goto(BASE + '/tabla')
  await page.getByRole('heading', { name: 'Tabla de posiciones' }).waitFor()
  await page.locator('select option').nth(1).waitFor({ state: 'attached' })
  ok(await page.locator('select option').count() === 2 && (await page.locator('select option').allInnerTexts()).join() === 'Libre,Máster', 'la tabla solo ofrece SUS categorías (sin "Todas")')
  await page.locator('select').selectOption({ label: 'Máster' })
  await page.getByText('Halcones').first().waitFor()
  await page.goto(BASE + '/estadisticas')
  await page.getByText('Valla menos vencida').first().waitFor()
  await page.getByText('Cuenta desde:').first().waitFor()
  await page.locator('select option').nth(1).waitFor({ state: 'attached' })
  await page.locator('select').selectOption({ label: 'Máster' })
  await page.getByText('Rival Uno').first().waitFor()
  await page.waitForTimeout(400)
  const txt = await page.locator('main').innerText()
  ok(txt.includes('Goleadores') && txt.includes('Valla menos vencida') && txt.includes('Semifinal'), 've Goleadores (con promedio) y Valla menos vencida, y la fase desde la que cuentan')
  ok(txt.includes('Rival Uno') && txt.includes('2.00') && txt.includes('0.00'), 'goleador "Rival Uno" (2 goles / 1 partido = 2.00) y valla de Tigres (0 goles en contra = 0.00)')
  ok(!txt.includes('Intruso Sub15'), 'no ve goleadores de otras categorías')

  // acciones prohibidas por la URL
  await page.goto(BASE + '/usuarios'); await page.waitForURL('**/partidos')
  ok(true, 'escribir /usuarios a mano lo devuelve a Partidos')
  await ctx.close()
}

// ---------- el admin crea un delegado desde la pantalla ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript((t) => localStorage.setItem('pitazo_token', t), T)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto(BASE + '/usuarios')
  await page.getByPlaceholder('Ej: mesa1').fill('del2')
  await page.locator('input').nth(1).fill('Delegado Dos')
  await page.locator('form select').first().selectOption('delegado')
  await page.getByText('Equipos que representa').waitFor()
  ok(await page.getByRole('button', { name: /Crear usuario/ }).isDisabled(), 'un delegado sin equipos no se puede crear (botón deshabilitado)')
  await page.getByLabel('Cóndores').check()
  await page.getByLabel('Libres FC').check()
  await page.locator('input[type=password]').fill('clave-del-2')
  await page.getByRole('button', { name: /Crear usuario/ }).click()
  await page.getByText('@del2').waitFor()
  ok(await page.getByText('Cóndores · Libres FC').count() + await page.getByText('Libres FC · Cóndores').count() > 0, 'el delegado queda creado mostrando sus equipos (de dos categorías)')

  await page.goto(BASE + '/config')
  await page.getByText('Jugadores por planilla').waitFor()
  ok((await page.locator('select').count()) === 2, 'Ajustes: elegir desde qué fase cuentan goleador y valla')
  await page.locator('select').nth(1).selectOption('final')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.getByText('Configuración guardada').waitFor()
  const c2 = await llamar('GET', '/config', null, T)
  ok(c2.fase_valla === 'final', 'cambiar la fase de la valla en Ajustes se guarda')
  await ctx.close()
}

ok(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''))
await browser.close()

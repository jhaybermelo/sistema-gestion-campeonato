import { chromium } from 'playwright-core'

const BASE = 'http://localhost:8001'
const CLAVE = process.env.ADMIN_PASSWORD
const ok = (c, msg) => { console.log(c ? 'OK   ' : 'FALLA', msg); if (!c) process.exitCode = 1 }

const llamar = async (m, p, b, token) => {
  const r = await fetch(BASE.replace('localhost','127.0.0.1') + '/api' + p, {
    method: m,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  })
  return r.status === 204 ? null : r.json()
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errores = []
page.on('pageerror', (e) => errores.push(e.message))

const entrar = async (u, p) => {
  await page.locator('input').first().fill(u)
  await page.locator('input[type=password]').fill(p)
  await page.getByRole('button', { name: /Entrar/ }).click()
}

// A) sin sesión -> login
await page.goto(BASE + '/partidos')
await page.getByRole('button', { name: /Entrar/ }).waitFor()
ok(true, 'sin sesión se muestra la pantalla de login (no se ve ningún dato)')
ok((await page.content()).includes('Campeonato de Fútbol de Salón') && !(await page.getByText('Nuevo partido').count()), 'el login no filtra pantallas internas')
await page.goto(BASE + '/equipos')
await page.getByRole('button', { name: /Entrar/ }).waitFor()
ok(true, 'abrir /equipos sin sesión también pide login')

await entrar('admin', 'clave-equivocada')
await page.getByText('Usuario o contraseña incorrectos').waitFor({ timeout: 4000 })
ok(true, 'clave incorrecta muestra el mensaje de error')

// B) admin entra y crea un planillero desde la pantalla
await entrar('admin', CLAVE)
await page.getByRole('link', { name: /Usuarios/ }).waitFor()
ok(true, 'admin entra y ve el menú completo (Usuarios, Ajustes…)')
await page.goto(BASE + '/usuarios')
await page.getByPlaceholder('Ej: mesa1').fill('mesa1')
await page.locator('input').nth(1).fill('Mesa Uno')
await page.locator('input[type=password]').fill('clave-mesa-1')
await page.getByRole('button', { name: /Crear usuario/ }).click()
await page.getByText('@mesa1').waitFor()
ok(true, 'admin crea el usuario "mesa1" (planillero) desde la pantalla')

// datos de prueba por API (como admin)
const tokenAdmin = (await llamar('POST', '/auth/login', { usuario: 'admin', password: CLAVE })).token
const a = await llamar('POST', '/equipos', { nombre: 'Halcones' }, tokenAdmin)
const b = await llamar('POST', '/equipos', { nombre: 'Tigres' }, tokenAdmin)
await llamar('POST', `/equipos/${a.id}/jugadores`, { numero: 7, nombre: 'Ana' }, tokenAdmin)
await llamar('POST', `/equipos/${b.id}/jugadores`, { numero: 9, nombre: 'Beto' }, tokenAdmin)
const p = await llamar('POST', '/partidos', { local_id: a.id, visitante_id: b.id, fecha: '2026-11-21' }, tokenAdmin)

// sesión persiste al recargar
await page.reload()
await page.getByRole('link', { name: /Usuarios/ }).waitFor()
ok(true, 'al recargar la página la sesión sigue activa')

// cerrar sesión
await page.getByTitle('Cerrar sesión').click()
await page.getByRole('button', { name: /Entrar/ }).waitFor()
ok(true, 'cerrar sesión vuelve al login')
await page.reload()
await page.getByRole('button', { name: /Entrar/ }).waitFor()
ok(true, 'tras cerrar sesión, recargar no la recupera')

// C) planillero
await entrar('mesa1', 'clave-mesa-1')
await page.getByText('Mesa Uno').first().waitFor()
const menu = await page.locator('header nav a').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
ok(!menu.includes('/usuarios') && !menu.includes('/equipos') && !menu.includes('/config') && !menu.includes('/categorias'), `menú del planillero sin pantallas de administración (${menu.join(', ')})`)
ok(menu.includes('/partidos') && menu.includes('/tabla'), 've Partidos y Tabla')
ok((await page.getByText('Nuevo partido').count()) === 0, 'no ve el botón "Nuevo partido"')
await page.goto(BASE + '/usuarios')
await page.waitForURL('**/partidos')
ok(true, 'escribir /usuarios a mano lo devuelve a Partidos')

// planillero opera el partido
await page.getByRole('link', { name: /Abrir/ }).first().click()
await page.getByRole('button', { name: /Iniciar partido/ }).click()
await page.getByRole('button', { name: /Parar/ }).waitFor()
await page.getByTitle('Gol').first().click()
await page.waitForTimeout(500)
ok((await page.locator('.text-5xl').first().innerText()).includes('1 - 0'), 'planillero inicia el partido y registra un gol (1 - 0)')
await page.getByRole('button', { name: /Parar/ }).click()
page.once('dialog', (d) => d.accept())
await page.getByRole('button', { name: /Finalizar partido/ }).click()
await page.getByText('Partido finalizado').waitFor()
ok((await page.getByRole('button', { name: /Reabrir/ }).count()) === 0, 'planillero NO ve "Reabrir" en un partido finalizado')

// la API también lo bloquea (aunque se salten la pantalla)
const tokenPla = (await llamar('POST', '/auth/login', { usuario: 'mesa1', password: 'clave-mesa-1' })).token
const r = await fetch(BASE.replace('localhost','127.0.0.1') + '/api/equipos', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + tokenPla }, body: JSON.stringify({ nombre: 'Intruso' }) })
ok(r.status === 403, 'el servidor rechaza (403) que el planillero cree equipos por la API')

ok(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''))
await page.screenshot({ path: 'login.png' })
await browser.close()


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

const T = (await llamar('POST', '/auth/login', { usuario: 'admin', password: CLAVE })).token
const H = await llamar('POST', '/equipos', { nombre: 'Halcones' }, T)
const G = await llamar('POST', '/equipos', { nombre: 'Tigres' }, T)
for (let i = 1; i <= 6; i++) {
  await llamar('POST', `/equipos/${H.id}/jugadores`, { numero: i, nombre: `Hal${i}` }, T)
  await llamar('POST', `/equipos/${G.id}/jugadores`, { numero: i, nombre: `Tig${i}` }, T)
}
const m = await llamar('POST', '/partidos', { local_id: H.id, visitante_id: G.id, fecha: '2026-12-01' }, T)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errores = []
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
await ctx.addInitScript((t) => localStorage.setItem('pitazo_token', t), T)
const page = await ctx.newPage()
page.on('pageerror', (e) => errores.push(e.message))

await page.goto(BASE + `/partidos/${m.id}`)
await page.getByRole('button', { name: /Iniciar partido/ }).click()
await page.getByRole('button', { name: /Parar/ }).waitFor()

// ---------- tiempo muerto ----------
const tmBtn = page.getByRole('button', { name: /Tiempo muerto/ })
await tmBtn.first().click()
await page.getByText(/TIEMPO MUERTO · Halcones/).waitFor()
ok(true, 'tiempo muerto de Halcones: aparece el banner con el contador de 1 minuto')
ok((await page.locator('.font-mono').first().innerText()) !== '', 'el banner muestra el contador')
await page.getByRole('button', { name: /Reanudar/ }).waitFor()
ok(true, 'el cronómetro quedó detenido (se ofrece "Reanudar")')
ok(await tmBtn.first().isDisabled() && /usado/.test(await tmBtn.first().innerText()), 'el botón de Halcones queda deshabilitado "(usado)": solo 1 por tiempo')
ok(await tmBtn.nth(1).isEnabled(), 'el botón de Tigres sigue disponible')
await page.getByRole('button', { name: /Terminar tiempo muerto/ }).click()
await page.getByText(/TIEMPO MUERTO ·/).waitFor({ state: 'detached' })
ok(true, '"Terminar tiempo muerto" cierra el banner')
await page.getByRole('button', { name: /Reanudar/ }).click()
await page.getByRole('button', { name: /Parar/ }).waitFor()

// ---------- 5 faltas personales = azul ----------
const falta = page.getByTitle('Falta').first() // Hal1
for (let i = 1; i <= 3; i++) await falta.click()
await page.waitForTimeout(500)
await falta.click()
await page.getByText(/lleva 4 faltas: la próxima es azul/).waitFor({ timeout: 5000 })
ok(true, 'a la 4.ª falta del jugador avisa: "la próxima es azul"')
await falta.click()
await page.getByText(/sale del partido \(5\.ª falta personal: tarjeta azul\)\. Sustitución obligatoria/).waitFor({ timeout: 5000 })
ok(true, 'a la 5.ª falta: tarjeta azul automática y "Sustitución obligatoria"')
await page.getByText('FUERA', { exact: true }).first().waitFor()
ok(await falta.isDisabled(), 'el jugador queda FUERA: sus botones se deshabilitan')
ok(await page.getByText('Tarjeta azul').count() > 0 && await page.getByText('(5.ª falta personal)').count() > 0, 'la lista de eventos muestra la tarjeta azul "(5.ª falta personal)"')
const filaAzul = page.locator('div.flex.flex-wrap', { hasText: 'Tarjeta azul' }).filter({ hasText: '5.ª falta personal' }).first()
ok((await filaAzul.getByTitle('Eliminar evento').count()) === 0, 'la azul automática no tiene botón de eliminar')

// ---------- faltas del equipo: 5 y la 6.ª sin barrera ----------
await page.getByText(/la próxima: sin barrera/).first().waitFor()
ok(true, 'con 5 faltas del equipo el panel indica "la próxima: sin barrera"')
await page.getByTitle('Falta').nth(1).click() // Hal2: 6.ª del equipo
await page.getByText(/Falta 6 de Halcones: tiro libre sin barrera/).waitFor({ timeout: 5000 })
ok(true, 'la 6.ª falta del equipo: aviso "tiro libre sin barrera"')
await page.getByText(/sin barrera 🚫/).first().waitFor()

// ---------- descanso ----------
await page.getByRole('button', { name: /Parar/ }).click()
await page.getByRole('button', { name: /Reanudar/ }).waitFor()
await llamar('POST', `/partidos/${m.id}/ajustar`, { restante_seg: 0 }, T)   // el 1.er tiempo termina
await page.reload()
await page.getByText('DESCANSO', { exact: true }).waitFor()
const txtDesc = await page.locator('.text-amber-300.font-mono').innerText()
ok(/^(09:5\d|10:00)$/.test(txtDesc.trim()), `al terminar el 1.er tiempo se muestra el DESCANSO de 10 minutos (${txtDesc.trim()})`)
ok(/Los equipos cambian de mitad de campo/.test(await page.locator('main').innerText()), 'indica el cambio de mitad de campo')
await page.screenshot({ path: 'amf-descanso.png' })
await page.getByRole('button', { name: /Pasar al 2º tiempo/ }).click()
await page.getByText('2º TIEMPO de 2').waitFor()
ok((await page.getByText('DESCANSO', { exact: true }).count()) === 0, 'al pasar al 2.º tiempo el descanso termina y el reloj vuelve a 20:00')
ok(/20:00/.test(await page.locator('main').innerText()), 'reloj en 20:00')

// ---------- 2.º tiempo: tiempo muerto otra vez y faltas del jugador acumuladas ----------
await page.getByRole('button', { name: /Tiempo muerto/ }).first().click()
await page.getByText(/TIEMPO MUERTO · Halcones/).waitFor()
ok(true, 'en el 2.º tiempo Halcones puede pedir su segundo tiempo muerto')
const d = await llamar('GET', `/partidos/${m.id}`, null, T)
ok(JSON.stringify(d.local.tiempos_muertos) === JSON.stringify({ '1': true, '2': true }), 'quedó registrado uno por tiempo')
ok(d.local.faltas['1'] === 6 && !d.local.faltas['2'], 'las faltas del EQUIPO se reinician: 6 en el 1.er tiempo, 0 en el 2.º')
await page.screenshot({ path: 'amf-tm.png' })

// ---------- móvil ----------
{
  const c2 = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await c2.addInitScript((t) => localStorage.setItem('pitazo_token', t), T)
  const p2 = await c2.newPage()
  await p2.goto(BASE + `/partidos/${m.id}`)
  await p2.getByText(/TIEMPO MUERTO · Halcones/).waitFor()
  const w = await p2.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  ok(w[0] <= w[1] + 1, `móvil 360 px con tiempo muerto activo: sin desborde (${w[0]}/${w[1]})`)
  await p2.screenshot({ path: 'amf-movil.png', fullPage: true })
  await c2.close()
}

ok(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''))
await browser.close()

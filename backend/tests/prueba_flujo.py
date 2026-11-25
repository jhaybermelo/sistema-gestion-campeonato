"""Prueba de humo del backend. Ejecutar desde backend/:
    DATABASE_URL=sqlite+aiosqlite:///./data/prueba.db venv/Scripts/python tests/prueba_flujo.py
"""
import os
import sys
import time

sys.path.insert(0, os.getcwd())
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def ok(cond, msg):
    print(("OK   " if cond else "FALLA"), msg)
    if not cond:
        sys.exit(1)


with TestClient(app) as c:
    c.headers['Authorization'] = 'Bearer ' + c.post('/api/auth/login', json={'usuario': 'admin', 'password': os.environ['ADMIN_PASSWORD']}).json()['token']
    a = c.post("/api/equipos", json={"nombre": "Halcones"}).json()
    b = c.post("/api/equipos", json={"nombre": "Tigres"}).json()
    ok(c.post("/api/equipos", json={"nombre": "halcones"}).status_code == 409, "nombre de equipo duplicado rechazado")
    for i, n in enumerate(["Ana", "Beto", "Carlos"], start=1):
        c.post(f"/api/equipos/{a['id']}/jugadores", json={"numero": i, "nombre": n})
        c.post(f"/api/equipos/{b['id']}/jugadores", json={"numero": i, "nombre": n + " T"})
    ok(c.post(f"/api/equipos/{a['id']}/jugadores", json={"numero": 1, "nombre": "X"}).status_code == 409, "número repetido rechazado")

    r = c.post("/api/partidos", json={"local_id": a["id"], "visitante_id": b["id"], "fecha": "2026-11-21", "hora": "15:00"})
    ok(r.status_code == 201, "partido creado")
    p = r.json()
    pid = p["id"]
    ok(len(p["local"]["jugadores"]) == 3 and len(p["visitante"]["jugadores"]) == 3, "planilla cargada automáticamente (3+3)")
    ok(c.post(f"/api/partidos/{pid}/eventos", json={"tipo": "gol", "equipo_id": a["id"], "pj_id": p["local"]["jugadores"][0]["id"]}).status_code == 400,
       "no se registran eventos antes de iniciar")

    p = c.post(f"/api/partidos/{pid}/iniciar").json()
    ok(p["estado"] == "en_juego" and p["corriendo"], "partido iniciado, cronómetro corriendo")
    time.sleep(1.2)
    p = c.get(f"/api/partidos/{pid}").json()
    ok(p["restante_seg"] < 1200 - 1, f"cuenta regresiva avanza ({p['restante_seg']})")
    p = c.post(f"/api/partidos/{pid}/pausar").json()
    r1 = p["restante_seg"]
    time.sleep(0.6)
    ok(c.get(f"/api/partidos/{pid}").json()["restante_seg"] == r1, "cronómetro detenido al pausar")

    j1 = p["local"]["jugadores"][0]["id"]
    j2 = p["visitante"]["jugadores"][1]["id"]
    ev = lambda tipo, eq, pj=None: c.post(f"/api/partidos/{pid}/eventos", json={"tipo": tipo, "equipo_id": eq, "pj_id": pj}).json()
    ev("gol", a["id"], j1)
    ev("gol", a["id"], j1)
    ev("gol", b["id"], j2)
    p = ev("autogol", b["id"], j2)  # autogol de Tigres => gol para Halcones
    ok((p["goles_local"], p["goles_visitante"]) == (3, 1), f"marcador 3-1 ({p['goles_local']}-{p['goles_visitante']})")
    ev("amarilla", b["id"], j2)
    p = ev("amarilla", b["id"], j2)
    ok([x for x in p["visitante"]["jugadores"] if x["id"] == j2][0]["fuera"], "2 amarillas => azul automática y jugador fuera (AMF)")
    for _ in range(3):
        p = ev("falta", a["id"])
    ok(p["local"]["faltas"].get("1") == 3, "faltas contadas por periodo")
    ok(c.post(f"/api/partidos/{pid}/eventos", json={"tipo": "roja", "equipo_id": a["id"]}).status_code == 400, "roja exige jugador")

    ult = p["eventos"][-1]["id"]
    p = c.delete(f"/api/partidos/{pid}/eventos/{ult}").json()
    ok(p["local"]["faltas"].get("1") == 2, "evento eliminado (deshacer)")

    p = c.post(f"/api/partidos/{pid}/ajustar", json={"restante_seg": 0}).json()
    p = c.post(f"/api/partidos/{pid}/siguiente-tiempo").json()
    ok(p["periodo"] == 2 and p["restante_seg"] == 1200, "segundo tiempo con reloj reiniciado")
    j3 = p["visitante"]["jugadores"][0]["id"]  # j2 ya está fuera (doble amarilla): gol de otro jugador
    p = ev("gol", b["id"], j3)
    ok(p["eventos"][-1]["periodo"] == 2, "evento guardado en el 2º tiempo")

    nuevo = c.post(f"/api/partidos/{pid}/planilla", json={"equipo_id": a["id"], "numero": 9, "nombre": "Nuevo"}).json()
    ok(len(nuevo["local"]["jugadores"]) == 4, "jugador agregado desde el partido")
    ok(len(c.get(f"/api/equipos/{a['id']}").json()["jugadores"]) == 4, "...y queda registrado en el equipo")

    p = c.post(f"/api/partidos/{pid}/finalizar").json()
    ok(p["estado"] == "finalizado" and not p["corriendo"], "partido finalizado")
    t = c.get("/api/tabla").json()
    ok(t[0]["equipo"] == "Halcones" and t[0]["pts"] == 3 and t[0]["gf"] == 3 and t[0]["gc"] == 2, f"tabla: {t[0]}")
    s = c.get("/api/estadisticas").json()
    ok(s["goleadores"][0]["nombre"] == "Ana" and s["goleadores"][0]["goles"] == 2, "goleador Ana (2)")
    ok(len(s["tarjetas"]) == 1 and s["tarjetas"][0]["amarillas"] == 2, "tarjetas registradas")
    ok(c.delete(f"/api/equipos/{a['id']}").status_code == 409, "no se borra equipo con partidos")
    ok(c.get("/api/respaldo").status_code == 200, "respaldo descargable")
    ok(c.put("/api/config", json={"nombre": "Copa X", "duracion_min": 25, "num_tiempos": 2, "limite_faltas": 5,
                                   "pts_ganado": 3, "pts_empate": 1, "pts_perdido": 0}).status_code == 200, "config guardada")
    print("\nTODO OK")

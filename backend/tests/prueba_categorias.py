"""Prueba de categorías y validación del año de nacimiento. Ejecutar desde backend/ con una DB temporal."""
import os
import sys

sys.path.insert(0, os.getcwd())
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def ok(cond, msg):
    print(("OK   " if cond else "FALLA"), msg)
    if not cond:
        sys.exit(1)


with TestClient(app) as c:
    c.headers['Authorization'] = 'Bearer ' + c.post('/api/auth/login', json={'usuario': 'admin', 'password': os.environ['ADMIN_PASSWORD']}).json()['token']
    # categoría con año mínimo marcado
    r = c.post("/api/categorias", json={"nombre": "Máster", "limita_anio": True, "anio_minimo": 1980})
    ok(r.status_code == 201, "categoría Máster (1980) creada")
    master = r.json()
    ok(c.post("/api/categorias", json={"nombre": "X", "limita_anio": True}).status_code == 422, "marcar la opción exige el año")
    libre = c.post("/api/categorias", json={"nombre": "Libre"}).json()
    ok(c.post("/api/categorias", json={"nombre": "máster"}).status_code == 409, "nombre de categoría duplicado rechazado")

    ea = c.post("/api/equipos", json={"nombre": "Veteranos", "categoria_id": master["id"]}).json()
    eb = c.post("/api/equipos", json={"nombre": "Clásicos", "categoria_id": master["id"]}).json()
    el = c.post("/api/equipos", json={"nombre": "Jóvenes", "categoria_id": libre["id"]}).json()
    ok(ea["categoria"] == "Máster" and ea["limita_anio"] and ea["anio_minimo"] == 1980, "equipo creado con categoría")

    jug = lambda eid, n, anio: c.post(f"/api/equipos/{eid}/jugadores", json={"numero": n, "nombre": f"J{n}", "anio_nacimiento": anio})
    ok(jug(ea["id"], 1, 1975).status_code == 201, "1975 cumple (Máster 1980)")
    ok(jug(ea["id"], 2, 1980).status_code == 201, "1980 cumple (límite exacto)")
    r = jug(ea["id"], 3, 1985)
    ok(r.status_code == 400 and "No cumple la edad" in r.json()["detail"], f"1985 rechazado: {r.json()['detail']}")
    r = jug(ea["id"], 4, None)
    ok(r.status_code == 400 and "exige el año" in r.json()["detail"], "sin año rechazado en categoría con regla")
    ok(jug(el["id"], 1, None).status_code == 201, "categoría SIN la opción marcada no valida (sin año OK)")
    ok(jug(el["id"], 2, 2005).status_code == 201, "categoría SIN la opción marcada acepta cualquier año")

    # editar jugador también valida
    j1 = c.get(f"/api/equipos/{ea['id']}").json()["jugadores"][0]
    ok(c.put(f"/api/jugadores/{j1['id']}", json={"numero": 1, "nombre": "J1", "anio_nacimiento": 1999}).status_code == 400, "editar a año inválido rechazado")

    # jugador nuevo desde el partido también valida
    jug(eb["id"], 1, 1970)
    p = c.post("/api/partidos", json={"local_id": ea["id"], "visitante_id": eb["id"], "fecha": "2026-11-21"})
    ok(p.status_code == 201, "partido entre equipos de la misma categoría")
    pid = p.json()["id"]
    ok(c.post("/api/partidos", json={"local_id": ea["id"], "visitante_id": el["id"], "fecha": "2026-11-21"}).status_code == 400,
       "partido entre categorías distintas rechazado")
    r = c.post(f"/api/partidos/{pid}/planilla", json={"equipo_id": ea["id"], "numero": 9, "nombre": "Nuevo", "anio_nacimiento": 1990})
    ok(r.status_code == 400, "jugador nuevo desde el partido con año inválido rechazado")
    r = c.post(f"/api/partidos/{pid}/planilla", json={"equipo_id": ea["id"], "numero": 9, "nombre": "Nuevo", "anio_nacimiento": 1979})
    ok(r.status_code == 201 and r.json()["local"]["limita_anio"], "jugador nuevo desde el partido válido")

    # regla nueva sobre jugadores existentes
    r = c.put(f"/api/categorias/{libre['id']}", json={"nombre": "Libre", "limita_anio": True, "anio_minimo": 2000})
    ok(r.status_code == 409, f"no se activa la regla si hay jugadores que no cumplen: {r.json()['detail'][:70]}…")
    # cambiar equipo con jugadores a categoría con regla
    r = c.put(f"/api/equipos/{el['id']}", json={"nombre": "Jóvenes", "categoria_id": master["id"]})
    ok(r.status_code == 409, "cambio de equipo a categoría que sus jugadores no cumplen, rechazado")
    ok(c.delete(f"/api/categorias/{master['id']}").status_code == 409, "no se borra categoría con equipos")

    # filtros
    ok(len(c.get(f"/api/tabla?categoria_id={master['id']}").json()) == 2, "tabla filtrada por categoría (2 equipos)")
    ok(len(c.get("/api/tabla").json()) == 3, "tabla sin filtro (3 equipos)")
    ok(c.get(f"/api/estadisticas?categoria_id={master['id']}").status_code == 200, "estadísticas con filtro")
    lst = c.get("/api/partidos").json()
    ok(lst[0]["categoria"] == "Máster", "el partido muestra su categoría")
    print("\nTODO OK")

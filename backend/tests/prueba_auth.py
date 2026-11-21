"""Prueba de login, roles y permisos. Ejecutar desde backend/ con DB temporal y ADMIN_PASSWORD definido."""
import os
import sys

sys.path.insert(0, os.getcwd())
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

CLAVE = os.environ["ADMIN_PASSWORD"]


def ok(cond, msg):
    print(("OK   " if cond else "FALLA"), msg)
    if not cond:
        sys.exit(1)


def entrar(c, usuario, clave):
    return c.post("/api/auth/login", json={"usuario": usuario, "password": clave})


with TestClient(app) as c:
    # sin sesión, todo cerrado
    for ruta in ("/api/equipos", "/api/partidos", "/api/tabla", "/api/config", "/api/usuarios", "/api/respaldo"):
        ok(c.get(ruta).status_code == 401, f"sin sesión {ruta} -> 401")
    ok(c.get("/api/equipos", headers={"Authorization": "Bearer basura"}).status_code == 401, "token falso rechazado")

    # login
    ok(entrar(c, "admin", "mala-clave-1").status_code == 401, "clave incorrecta rechazada")
    r = entrar(c, "ADMIN", CLAVE)
    ok(r.status_code == 200 and r.json()["usuario"]["rol"] == "admin", "admin entra (usuario no distingue mayúsculas)")
    adm = {"Authorization": "Bearer " + r.json()["token"]}
    ok(c.get("/api/auth/me", headers=adm).json()["usuario"] == "admin", "/auth/me responde")

    # el admin crea un planillero
    r = c.post("/api/usuarios", headers=adm, json={"usuario": "mesa1", "nombre": "Mesa Uno", "password": "clave-mesa-1", "rol": "planillero"})
    ok(r.status_code == 201 and "password_hash" not in r.text, "admin crea planillero (sin exponer el hash)")
    ok(c.post("/api/usuarios", headers=adm, json={"usuario": "MESA1", "nombre": "x", "password": "otraclave123"}).status_code == 409, "usuario duplicado rechazado")
    ok(c.post("/api/usuarios", headers=adm, json={"usuario": "corta", "nombre": "x", "password": "123"}).status_code == 422, "contraseña corta rechazada")
    pid_user = r.json()["id"]

    r = entrar(c, "mesa1", "clave-mesa-1")
    pla = {"Authorization": "Bearer " + r.json()["token"]}
    ok(r.status_code == 200 and r.json()["usuario"]["rol"] == "planillero", "planillero entra")

    # permisos del planillero
    ok(c.get("/api/equipos", headers=pla).status_code == 200, "planillero puede consultar equipos")
    ok(c.get("/api/tabla", headers=pla).status_code == 200, "planillero puede ver la tabla")
    ok(c.get("/api/usuarios", headers=pla).status_code == 403, "planillero NO ve usuarios")
    ok(c.post("/api/equipos", headers=pla, json={"nombre": "X"}).status_code == 403, "planillero NO crea equipos")
    ok(c.post("/api/categorias", headers=pla, json={"nombre": "X"}).status_code == 403, "planillero NO crea categorías")
    ok(c.put("/api/config", headers=pla, json={"nombre": "X", "duracion_min": 1, "num_tiempos": 1, "limite_faltas": 1, "pts_ganado": 1, "pts_empate": 1, "pts_perdido": 1}).status_code == 403, "planillero NO cambia ajustes")
    ok(c.get("/api/respaldo", headers=pla).status_code == 403, "planillero NO descarga respaldo")

    # el planillero sí opera un partido que crea el admin
    a = c.post("/api/equipos", headers=adm, json={"nombre": "A"}).json()
    b = c.post("/api/equipos", headers=adm, json={"nombre": "B"}).json()
    c.post(f"/api/equipos/{a['id']}/jugadores", headers=adm, json={"numero": 1, "nombre": "Ja"})
    p = c.post("/api/partidos", headers=adm, json={"local_id": a["id"], "visitante_id": b["id"], "fecha": "2026-11-21"}).json()
    ok(c.post("/api/partidos", headers=pla, json={"local_id": a["id"], "visitante_id": b["id"], "fecha": "2026-11-21"}).status_code == 403, "planillero NO crea partidos")
    ok(c.delete(f"/api/partidos/{p['id']}", headers=pla).status_code == 403, "planillero NO elimina partidos")
    ok(c.post(f"/api/partidos/{p['id']}/iniciar", headers=pla).status_code == 200, "planillero inicia el cronómetro")
    pj = p["local"]["jugadores"][0]["id"]
    ok(c.post(f"/api/partidos/{p['id']}/eventos", headers=pla, json={"tipo": "gol", "equipo_id": a["id"], "pj_id": pj}).status_code == 201, "planillero registra un gol")
    ok(c.post(f"/api/partidos/{p['id']}/finalizar", headers=pla).status_code == 200, "planillero finaliza el partido")
    ok(c.post(f"/api/partidos/{p['id']}/reabrir", headers=pla).status_code == 403, "planillero NO reabre un partido finalizado")
    ok(c.post(f"/api/partidos/{p['id']}/reabrir", headers=adm).status_code == 200, "admin sí puede reabrirlo")

    # cambio de contraseña
    ok(c.post("/api/auth/cambiar-password", headers=pla, json={"actual": "equivocada", "nueva": "nueva-clave-99"}).status_code == 400, "cambio con clave actual errónea rechazado")
    ok(c.post("/api/auth/cambiar-password", headers=pla, json={"actual": "clave-mesa-1", "nueva": "nueva-clave-99"}).status_code == 204, "planillero cambia su contraseña")
    ok(entrar(c, "mesa1", "clave-mesa-1").status_code == 401 and entrar(c, "mesa1", "nueva-clave-99").status_code == 200, "la clave vieja ya no sirve, la nueva sí")

    # protecciones del admin
    yo = c.get("/api/auth/me", headers=adm).json()
    ok(c.delete(f"/api/usuarios/{yo['id']}", headers=adm).status_code == 400, "admin no puede eliminarse a sí mismo")
    ok(c.put(f"/api/usuarios/{yo['id']}", headers=adm, json={"nombre": "Administrador", "rol": "planillero", "activo": True}).status_code == 400, "no se puede quitar al último administrador")

    # desactivar usuario corta su sesión
    ok(c.put(f"/api/usuarios/{pid_user}", headers=adm, json={"nombre": "Mesa Uno", "rol": "planillero", "activo": False}).status_code == 200, "admin desactiva al planillero")
    ok(c.get("/api/equipos", headers=pla).status_code == 401, "su sesión deja de funcionar al instante")
    ok(entrar(c, "mesa1", "nueva-clave-99").status_code == 401, "y no puede volver a entrar")
    ok(c.put(f"/api/usuarios/{pid_user}", headers=adm, json={"nombre": "Mesa Uno", "rol": "planillero", "activo": True, "password": "restablecida-1"}).status_code == 200, "admin lo reactiva y restablece su clave")
    ok(entrar(c, "mesa1", "restablecida-1").status_code == 200, "entra con la clave restablecida")

    # freno de fuerza bruta
    codigos = [entrar(c, "victima", f"intento-{i}").status_code for i in range(7)]
    ok(codigos[:5] == [401] * 5 and codigos[5] == 429, f"tras 5 fallos se bloquea ({codigos})")
    print("\nTODO OK")

"""Rol delegado, planilla de 12, cierre al primer partido, fases y rankings (goleador / valla).
Ejecutar desde backend/ con una DB nueva y ADMIN_PASSWORD definido."""
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


def token(c, u, p):
    return {"Authorization": "Bearer " + c.post("/api/auth/login", json={"usuario": u, "password": p}).json()["token"]}


with TestClient(app) as c:
    adm = token(c, "admin", CLAVE)
    A = lambda m, p, **k: c.request(m, "/api" + p, headers=adm, **k)  # admin

    # ---------- configuración nueva ----------
    cfg = A("GET", "/config").json()
    ok(cfg["max_jugadores"] == 12 and cfg["fase_valla"] == "semifinal" and cfg["fase_goleador"] == "grupos",
       "config por defecto: planilla de 12, valla desde semifinal, goleador desde grupos")
    ok([f["id"] for f in cfg["fases"]] == ["grupos", "octavos", "cuartos", "semifinal", "tercer_puesto", "final"], "lista de fases en orden")

    # ---------- datos base ----------
    master = A("POST", "/categorias", json={"nombre": "Máster", "limita_anio": True, "anio_minimo": 1980}).json()
    libre = A("POST", "/categorias", json={"nombre": "Libre"}).json()
    sub15 = A("POST", "/categorias", json={"nombre": "Sub15"}).json()
    eq = lambda n, cat: A("POST", "/equipos", json={"nombre": n, "categoria_id": cat["id"]}).json()
    a1, a2, b3 = eq("A1", master), eq("A2", master), eq("B3", master)
    l1, l2 = eq("L1", libre), eq("L2", libre)
    s1 = eq("S1", sub15)
    jug = lambda e, n, nombre, anio=1975: A("POST", f"/equipos/{e['id']}/jugadores", json={"numero": n, "nombre": nombre, "anio_nacimiento": anio})
    for e in (a2, b3):
        ok(jug(e, 1, f"Base {e['nombre']}").status_code == 201, f"jugador base de {e['nombre']}")
    jug(l2, 1, "Base L2", None); jug(s1, 1, "Base S1", None)

    # ---------- crear delegado ----------
    ok(A("POST", "/usuarios", json={"usuario": "del1", "nombre": "Delegado", "password": "clave-del-1", "rol": "delegado"}).status_code == 422,
       "un delegado sin equipos es rechazado")
    ok(A("POST", "/usuarios", json={"usuario": "del1", "nombre": "Delegado", "password": "clave-del-1", "rol": "delegado", "equipo_ids": [9999]}).status_code == 400,
       "equipo inexistente rechazado")
    r = A("POST", "/usuarios", json={"usuario": "del1", "nombre": "Delegado Uno", "password": "clave-del-1", "rol": "delegado", "equipo_ids": [a1["id"], l1["id"]]})
    ok(r.status_code == 201 and sorted(r.json()["equipo_ids"]) == sorted([a1["id"], l1["id"]]), "delegado con equipos de DOS categorías (Máster y Libre)")
    D = token(c, "del1", "clave-del-1")
    d = lambda m, p, **k: c.request(m, "/api" + p, headers=D, **k)  # delegado
    ok(sorted(d("GET", "/auth/me").json()["equipo_ids"]) == sorted([a1["id"], l1["id"]]), "/auth/me informa sus equipos")

    # ---------- visibilidad ----------
    nombres = sorted(e["nombre"] for e in d("GET", "/equipos").json())
    ok(nombres == ["A1", "A2", "B3", "L1", "L2"], f"ve los equipos de SUS categorías y ninguno más ({nombres})")
    ok(d("GET", f"/equipos/{s1['id']}").status_code == 403, "no ve el detalle de un equipo de otra categoría")
    ok(d("GET", f"/equipos/{a2['id']}").status_code == 200, "sí ve la planilla de un rival de su categoría")
    ok(sorted(x["nombre"] for x in d("GET", "/categorias").json()) == ["Libre", "Máster"], "solo ve sus categorías")
    ok(d("GET", f"/equipos/{a2['id']}").json()["puede_editar_plantel"] is False, "la planilla del rival es solo de lectura")
    ok(d("GET", f"/equipos/{a1['id']}").json()["puede_editar_plantel"] is True, "la de su equipo sí es editable (aún abierta)")

    # ---------- inscribir jugadores: reglas ----------
    dj = lambda e, n, nombre, anio=1970: d("POST", f"/equipos/{e['id']}/jugadores", json={"numero": n, "nombre": nombre, "anio_nacimiento": anio})
    ok(dj(a2, 5, "Intruso").status_code == 403, "NO puede inscribir jugadores en un equipo ajeno")
    ok(d("POST", "/equipos", json={"nombre": "Nuevo"}).status_code == 403, "NO puede crear equipos")
    r = dj(a1, 1, "Muy joven", 1990)
    ok(r.status_code == 400 and "No cumple la edad" in r.json()["detail"], "se aplica la validación del año de nacimiento de la categoría")
    for i in range(1, 13):
        r = dj(a1, i, f"P{i}")
        if r.status_code != 201:
            ok(False, f"inscribir jugador {i}: {r.text}")
    ok(len(d("GET", f"/equipos/{a1['id']}").json()["jugadores"]) == 12, "inscribe 12 jugadores")
    r = dj(a1, 13, "Sobra")
    ok(r.status_code == 409 and "12 jugadores" in r.json()["detail"], f"el jugador 13 se rechaza: {r.json()['detail']}")
    ok(dj(l1, 1, "Libre 1", 1999).status_code == 201, "en su otra categoría (Libre, sin límite de año) inscribe sin año máximo")

    # editar / dar de baja mientras está abierta
    a1j = d("GET", f"/equipos/{a1['id']}").json()["jugadores"]
    p1, p2 = a1j[0], a1j[1]
    ok(d("PUT", f"/jugadores/{p2['id']}", json={"numero": 2, "nombre": "P2 corregido", "anio_nacimiento": 1971}).status_code == 200, "edita un jugador de su equipo")
    ok(d("DELETE", f"/jugadores/{p2['id']}").status_code == 204, "da de baja a un jugador")
    ok(dj(a1, 20, "Reemplazo P2").status_code == 201, "inscribe al reemplazo (vuelve a 12)")

    # ---------- no opera partidos ----------
    m0 = A("POST", "/partidos", json={"local_id": a1["id"], "visitante_id": a2["id"], "fecha": "2026-12-01", "fase": "grupos"}).json()
    ok(m0["fase"] == "grupos" and m0["fase_nombre"] == "Fase de grupos", "el partido guarda su fase")
    ok(d("POST", "/partidos", json={"local_id": a1["id"], "visitante_id": a2["id"], "fecha": "2026-12-01"}).status_code == 403, "NO crea partidos")
    ok(d("POST", f"/partidos/{m0['id']}/iniciar").status_code == 403, "NO inicia partidos")
    ok(d("POST", f"/partidos/{m0['id']}/eventos", json={"tipo": "gol", "equipo_id": a1["id"]}).status_code == 403, "NO registra eventos")
    ok(d("POST", f"/partidos/{m0['id']}/finalizar").status_code == 403, "NO finaliza")
    ok(d("PUT", "/config", json={}).status_code in (403, 422), "NO cambia ajustes")
    ok(d("GET", "/usuarios").status_code == 403 and d("GET", "/respaldo").status_code == 403, "NO ve usuarios ni respaldo")

    # ---------- visibilidad de partidos ----------
    mS = A("POST", "/partidos", json={"local_id": s1["id"], "visitante_id": s1["id"] + 0, "fecha": "2026-12-01"})  # inválido (mismo equipo)
    ok(mS.status_code == 400, "no se crea un partido de un equipo contra sí mismo")
    s2 = eq("S2", sub15); jug(s2, 1, "Base S2", None)
    mS = A("POST", "/partidos", json={"local_id": s1["id"], "visitante_id": s2["id"], "fecha": "2026-12-01"}).json()
    vistos = [p["id"] for p in d("GET", "/partidos").json()]
    ok(m0["id"] in vistos and mS["id"] not in vistos, "ve los partidos de sus categorías y no los de Sub15")
    ok(d("GET", f"/partidos/{m0['id']}").status_code == 200 and d("GET", f"/partidos/{mS['id']}").status_code == 403, "detalle de partido: solo de su categoría")

    # ---------- la planilla del partido se actualiza hasta que inicia ----------
    pl = d("GET", f"/partidos/{m0['id']}").json()
    nombres_pl = sorted(j["nombre"] for j in pl["local"]["jugadores"] if j["convocado"])
    ok("Reemplazo P2" in nombres_pl and "P2 corregido" not in nombres_pl and len(nombres_pl) == 12,
       "la planilla del partido refleja al reemplazo y no al jugador dado de baja (12 convocados)")

    # ---------- cierre al primer partido ----------
    ok(A("POST", f"/partidos/{m0['id']}/iniciar").status_code == 200, "el administrador inicia el partido")
    eq_a1 = d("GET", f"/equipos/{a1['id']}").json()
    ok(eq_a1["planilla_cerrada"] is True and eq_a1["puede_editar_plantel"] is False, "la planilla de A1 queda CERRADA")
    ok(dj(a1, 30, "Tarde").status_code == 403 and "cerrada" in dj(a1, 30, "Tarde").json()["detail"], "ya no puede inscribir")
    ok(d("PUT", f"/jugadores/{p1['id']}", json={"numero": 1, "nombre": "X", "anio_nacimiento": 1970}).status_code == 403, "ya no puede editar")
    ok(d("DELETE", f"/jugadores/{p1['id']}").status_code == 403, "ya no puede dar de baja")
    ok(dj(l1, 2, "Libre 2", 2000).status_code == 201, "pero la planilla de su OTRO equipo (L1, sin partidos) sigue abierta")
    ok(A("POST", f"/equipos/{a1['id']}/jugadores", json={"numero": 30, "nombre": "Admin lo agrega", "anio_nacimiento": 1970}).status_code == 409,
       "(el administrador igual respeta el máximo de 12)")
    A("POST", f"/partidos/{m0['id']}/pausar")

    # ---------- RANKINGS con fases ----------
    # Escenario sobre la categoría Máster (resultados calculados a mano):
    #   M1 grupos      A1 3-1 A2 : A1 {p1 x3}, A2 {z x1}
    #   M2 grupos      A1 1-0 B3 : A1 {p1 x1}
    #   M3 semifinal   A2 2-0 B3 : A2 {z x2}
    #   M4 final       A1 1-1 A2 : A1 {p1 x1}, A2 {z x1}
    A("POST", f"/partidos/{m0['id']}/finalizar"); A("DELETE", f"/partidos/{m0['id']}", )  # se reemplaza por el escenario limpio
    pA1 = A("POST", f"/equipos/{a2['id']}/jugadores", json={"numero": 9, "nombre": "Z", "anio_nacimiento": 1970}).json()  # z (A2)
    ok(pA1.get("id") is not None, "jugador Z de A2")
    # A1 ya tiene 12 jugadores (cerrada); usamos a "P1" como goleador de A1
    def jugar(fase, loc, vis, goles_loc, goles_vis):
        m = A("POST", "/partidos", json={"local_id": loc["id"], "visitante_id": vis["id"], "fecha": "2026-12-05", "fase": fase}).json()
        A("POST", f"/partidos/{m['id']}/iniciar")
        det = A("GET", f"/partidos/{m['id']}").json()
        pj = lambda lado, nombre: next(j["id"] for j in det[lado]["jugadores"] if j["nombre"] == nombre)
        quien = {"A1": "P1", "A2": "Z", "B3": "Base B3"}
        for _ in range(goles_loc):
            A("POST", f"/partidos/{m['id']}/eventos", json={"tipo": "gol", "equipo_id": loc["id"], "pj_id": pj("local", quien[loc["nombre"]])})
        for _ in range(goles_vis):
            A("POST", f"/partidos/{m['id']}/eventos", json={"tipo": "gol", "equipo_id": vis["id"], "pj_id": pj("visitante", quien[vis["nombre"]])})
        A("POST", f"/partidos/{m['id']}/finalizar")
        return m
    jugar("grupos", a1, a2, 3, 1)
    jugar("grupos", a1, b3, 1, 0)
    jugar("semifinal", a2, b3, 2, 0)
    jugar("final", a1, a2, 1, 1)

    st = d("GET", f"/estadisticas?categoria_id={master['id']}").json()
    g = {x["nombre"]: x for x in st["goleadores"]}
    ok(st["reglas"]["fase_valla"] == "Semifinal" and st["reglas"]["fase_goleador"] == "Fase de grupos", "el sistema informa desde qué fase cuenta cada ranking")
    ok(g["P1"]["goles"] == 5 and g["P1"]["pj"] == 3 and g["P1"]["promedio"] == 1.67, f"goleador P1: 5 goles / 3 partidos = 1.67 ({g['P1']['promedio']})")
    ok(g["Z"]["goles"] == 4 and g["Z"]["pj"] == 3 and g["Z"]["promedio"] == 1.33, f"goleador Z: 4 goles / 3 partidos = 1.33 ({g['Z']['promedio']})")
    ok(st["goleadores"][0]["nombre"] == "P1", "el ranking de goleadores ordena por PROMEDIO")
    v = {x["equipo"]: x for x in st["valla"]}
    ok(list(v) == ["A2", "A1", "B3"], f"valla (desde semifinal) ordenada de menos a más vencida: {list(v)}")
    ok((v["A2"]["pj"], v["A2"]["gc"], v["A2"]["promedio"]) == (2, 1, 0.5), "valla A2: 1 gol en 2 partidos = 0.50 (solo semifinal y final)")
    ok((v["A1"]["pj"], v["A1"]["gc"], v["A1"]["promedio"]) == (1, 1, 1.0), "valla A1: solo cuenta la final (1 gol en 1 partido)")
    ok((v["B3"]["pj"], v["B3"]["gc"], v["B3"]["promedio"]) == (1, 2, 2.0), "valla B3: solo cuenta la semifinal (2 goles en 1 partido)")

    # cambiar la fase en Ajustes cambia el ranking
    cfg2 = A("GET", "/config").json(); cfg2.pop("fases"); cfg2["fase_valla"] = "grupos"
    ok(A("PUT", "/config", json=cfg2).status_code == 200, "el administrador cambia la fase de la valla a 'Fase de grupos'")
    v2 = {x["equipo"]: x for x in d("GET", f"/estadisticas?categoria_id={master['id']}").json()["valla"]}
    ok(list(v2) == ["A1", "A2", "B3"] and v2["A1"]["promedio"] == 0.67 and v2["A2"]["promedio"] == 1.33 and v2["B3"]["promedio"] == 1.5,
       f"con todas las fases: A1 0.67 · A2 1.33 · B3 1.5 ({ {k: x['promedio'] for k, x in v2.items()} })")
    cfg2["fase_valla"] = "final"; cfg2["fase_goleador"] = "semifinal"; A("PUT", "/config", json=cfg2)
    st3 = d("GET", f"/estadisticas?categoria_id={master['id']}").json()
    ok([x["equipo"] for x in st3["valla"]] == ["A1", "A2"], "desde la final: solo cuentan A1 y A2")
    gz = {x["nombre"]: x for x in st3["goleadores"]}
    ok(gz["Z"]["goles"] == 3 and gz["Z"]["pj"] == 2 and gz["Z"]["promedio"] == 1.5, "goleador desde semifinal: Z 3 goles / 2 partidos = 1.5")
    ok(gz["P1"]["goles"] == 1 and gz["P1"]["pj"] == 1, "goleador desde semifinal: P1 solo cuenta la final (1 gol / 1 partido)")
    cfg2["fase_valla"] = "semifinal"; cfg2["fase_goleador"] = "grupos"; A("PUT", "/config", json=cfg2)

    # alcance por categoría en rankings y tabla
    ok(d("GET", f"/estadisticas?categoria_id={sub15['id']}").json()["goleadores"] == [] and d("GET", f"/tabla?categoria_id={sub15['id']}").json() == [],
       "el delegado no obtiene datos de una categoría ajena (Sub15)")
    ok(sorted(x["equipo"] for x in d("GET", f"/tabla?categoria_id={master['id']}").json()) == ["A1", "A2", "B3"], "tabla de su categoría")
    sin_filtro = {x["equipo"] for x in d("GET", "/tabla").json()}
    ok("S1" not in sin_filtro and "A1" in sin_filtro and "L1" in sin_filtro, "sin filtro, la tabla del delegado solo incluye sus categorías")

    # ---------- administración del delegado ----------
    ok(A("PUT", f"/usuarios/{d('GET', '/auth/me').json()['id']}", json={"nombre": "Delegado Uno", "rol": "delegado", "equipo_ids": [l1["id"]]}).status_code == 200,
       "el admin le quita el equipo Máster")
    ok(sorted(x["nombre"] for x in d("GET", "/equipos").json()) == ["L1", "L2"], "su alcance se actualiza al instante (solo Libre)")
    ok(A("PUT", f"/usuarios/{d('GET', '/auth/me').json()['id']}", json={"nombre": "Ahora admin", "rol": "planillero"}).status_code == 200
       and A("GET", "/usuarios").json()[0] is not None, "cambiar un delegado a planillero lo permite")
    resp = A("GET", "/respaldo")
    ok(resp.status_code == 200 and "password_hash" not in resp.text and "usuario_equipos" in resp.text, "el respaldo NO incluye contraseñas")
    print("\nTODO OK")

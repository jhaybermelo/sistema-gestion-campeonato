"""Reglas AMF: tiempo muerto, descanso automático y faltas personales (5 = azul), azul/roja/doble amarilla.
Ejecutar desde backend/ con una DB nueva y ADMIN_PASSWORD definido.
Referencia: Reglas de Juego Fútbol de Salón AMF (FECOLFUTSALON, actualizado 2016), Reglas 6, 9 y 10."""
import os
import sys
import time

sys.path.insert(0, os.getcwd())
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

CLAVE = os.environ["ADMIN_PASSWORD"]


def ok(cond, msg):
    print(("OK   " if cond else "FALLA"), msg)
    if not cond:
        sys.exit(1)


with TestClient(app) as c:
    H = {"Authorization": "Bearer " + c.post("/api/auth/login", json={"usuario": "admin", "password": CLAVE}).json()["token"]}
    A_ = lambda m, p, **k: c.request(m, "/api" + p, headers=H, **k)

    A = A_("POST", "/equipos", json={"nombre": "A"}).json()
    B = A_("POST", "/equipos", json={"nombre": "B"}).json()
    for e in (A, B):
        for n in range(1, 5):
            A_("POST", f"/equipos/{e['id']}/jugadores", json={"numero": n, "nombre": f"{e['nombre']}{n}"})

    def nuevo_partido():
        m = A_("POST", "/partidos", json={"local_id": A["id"], "visitante_id": B["id"], "fecha": "2026-12-01"}).json()
        A_("POST", f"/partidos/{m['id']}/iniciar")
        return m["id"]

    def det(pid):
        return A_("GET", f"/partidos/{pid}").json()

    ev = lambda pid, tipo, eq, pj=None: A_("POST", f"/partidos/{pid}/eventos", json={"tipo": tipo, "equipo_id": eq, "pj_id": pj})

    # ================= TIEMPO MUERTO (Regla 6) =================
    pid = nuevo_partido()
    r = ev(pid, "tiempo_muerto", A["id"])
    d = r.json()
    ok(r.status_code == 201 and d["tiempo_muerto"]["equipo_id"] == A["id"] and 58 <= d["tiempo_muerto"]["restante_seg"] <= 60,
       "tiempo muerto de A: arranca un contador de 1 minuto")
    ok(d["corriendo"] is False, "el tiempo muerto DETIENE el cronómetro")
    ok(d["local"]["tiempos_muertos"] == {"1": True}, "queda marcado como usado en el 1.er tiempo")
    r = ev(pid, "tiempo_muerto", A["id"])
    ok(r.status_code == 409 and "solo hay uno por periodo" in r.json()["detail"], "un 2.º tiempo muerto en el mismo periodo se rechaza")
    ok(ev(pid, "tiempo_muerto", B["id"]).status_code == 201, "el rival sí tiene el suyo")
    ok(ev(pid, "tiempo_muerto", B["id"], det(pid)["visitante"]["jugadores"][0]["id"]).status_code in (400, 409), "el tiempo muerto no se asigna a un jugador")
    d = A_("POST", f"/partidos/{pid}/iniciar").json()
    ok(d["tiempo_muerto"] is None and d["corriendo"], "al reanudar el juego termina el tiempo muerto")
    A_("POST", f"/partidos/{pid}/pausar")
    # segundo periodo
    A_("POST", f"/partidos/{pid}/ajustar", json={"restante_seg": 0})
    d = A_("POST", f"/partidos/{pid}/siguiente-tiempo").json()
    ok(d["periodo"] == 2, "pasa al 2.º tiempo")
    ok(ev(pid, "tiempo_muerto", A["id"]).status_code == 201, "en el 2.º tiempo A puede pedir otro")
    ok(ev(pid, "tiempo_muerto", A["id"]).status_code == 409, "y solo uno: 1 por periodo")
    A_("POST", f"/partidos/{pid}/iniciar")
    ok(det(pid)["local"]["tiempos_muertos"] == {"1": True, "2": True}, "A usó uno en cada periodo")

    # no acumulable: si no lo usa en el 1.º, en el 2.º sigue teniendo uno solo
    pid2 = nuevo_partido()
    A_("POST", f"/partidos/{pid2}/pausar"); A_("POST", f"/partidos/{pid2}/ajustar", json={"restante_seg": 0})
    A_("POST", f"/partidos/{pid2}/siguiente-tiempo")
    ok(ev(pid2, "tiempo_muerto", A["id"]).status_code == 201 and ev(pid2, "tiempo_muerto", A["id"]).status_code == 409,
       "NO es acumulable: sin usar el del 1.er tiempo, en el 2.º solo dispone de uno")
    # deshacer libera el tiempo muerto
    d = det(pid2)
    tm_id = next(e["id"] for e in d["eventos"] if e["tipo"] == "tiempo_muerto")
    A_("DELETE", f"/partidos/{pid2}/eventos/{tm_id}")
    ok(ev(pid2, "tiempo_muerto", A["id"]).status_code == 201, "si se registró por error y se elimina, se puede volver a pedir")

    # ================= DESCANSO (Regla 6) =================
    pid3 = nuevo_partido()
    d = det(pid3)
    ok(d["descanso"] is None, "durante el 1.er tiempo no hay descanso")
    A_("POST", f"/partidos/{pid3}/pausar")
    A_("POST", f"/partidos/{pid3}/ajustar", json={"restante_seg": 1})
    A_("POST", f"/partidos/{pid3}/iniciar")
    time.sleep(1.5)
    d = det(pid3)
    ok(d["corriendo"] is False and d["restante_seg"] == 0, "el reloj se detiene solo en 0:00")
    ok(d["descanso"] is not None and d["descanso"]["duracion_seg"] == 600 and 597 <= d["descanso"]["restante_seg"] < 600,
       f"AL TERMINAR EL 1.er TIEMPO ARRANCA SOLO EL DESCANSO DE 10 MINUTOS ({d['descanso']['restante_seg']}s restantes)")
    ok(d["periodo"] == 1, "el 2.º tiempo NO arranca solo: espera al planillero")
    time.sleep(1)
    d2 = det(pid3)
    ok(d2["descanso"]["restante_seg"] < d["descanso"]["restante_seg"], "el descanso sigue corriendo en el servidor")
    d = A_("POST", f"/partidos/{pid3}/siguiente-tiempo").json()
    ok(d["periodo"] == 2 and d["descanso"] is None and d["restante_seg"] == 1200, "al pasar al 2.º tiempo el descanso termina y el reloj vuelve a 20:00")
    # fin del último periodo: no hay descanso
    A_("POST", f"/partidos/{pid3}/ajustar", json={"restante_seg": 1}); A_("POST", f"/partidos/{pid3}/iniciar"); time.sleep(1.5)
    ok(det(pid3)["descanso"] is None, "al terminar el último periodo no hay descanso")
    # 'ajustar' a 0 también cierra el periodo
    pid4 = nuevo_partido(); A_("POST", f"/partidos/{pid4}/pausar")
    ok(A_("POST", f"/partidos/{pid4}/ajustar", json={"restante_seg": 0}).json()["descanso"] is not None, "poner el reloj en 0 también inicia el descanso")
    # duración configurable
    cfg = A_("GET", "/config").json(); cfg.pop("fases")
    ok(cfg["descanso_min"] == 10, "descanso por defecto: 10 minutos (AMF)")
    cfg["descanso_min"] = 5
    A_("PUT", "/config", json=cfg)
    pid5 = nuevo_partido(); A_("POST", f"/partidos/{pid5}/pausar")
    ok(A_("POST", f"/partidos/{pid5}/ajustar", json={"restante_seg": 0}).json()["descanso"]["duracion_seg"] == 300, "si se configura 5 minutos, el partido nuevo usa 5")
    cfg["descanso_min"] = 10; A_("PUT", "/config", json=cfg)

    # ================= FALTAS PERSONALES (Regla 9 y 10) =================
    pid6 = nuevo_partido()
    d = det(pid6)
    a1, a2, a3 = (d["local"]["jugadores"][i]["id"] for i in range(3))
    b1 = d["visitante"]["jugadores"][0]["id"]
    for _ in range(3):
        ev(pid6, "falta", A["id"], a1)
    d = det(pid6)
    ok(d["local"]["faltas"] == {"1": 3}, "faltas del EQUIPO: 3 en el 1.er tiempo")
    A_("POST", f"/partidos/{pid6}/pausar"); A_("POST", f"/partidos/{pid6}/ajustar", json={"restante_seg": 0})
    A_("POST", f"/partidos/{pid6}/siguiente-tiempo")
    ev(pid6, "falta", A["id"], a1)
    d = det(pid6)
    j = next(x for x in d["local"]["jugadores"] if x["id"] == a1)
    ok(j["faltas"] == 4 and not j["fuera"], "las faltas del JUGADOR se acumulan entre los dos tiempos (3 + 1 = 4) y aún juega")
    ok(d["local"]["faltas"] == {"1": 3, "2": 1}, "pero las del EQUIPO van separadas por tiempo (3 y 1)")
    ok(not any(e["tipo"] == "azul" for e in d["eventos"]), "con 4 faltas todavía no hay tarjeta")
    ev(pid6, "falta", A["id"], a1)
    d = det(pid6)
    j = next(x for x in d["local"]["jugadores"] if x["id"] == a1)
    azul = [e for e in d["eventos"] if e["tipo"] == "azul"]
    ok(len(azul) == 1 and azul[0]["motivo"] == "quinta_falta" and azul[0]["pj_id"] == a1, "LA 5.ª FALTA PERSONAL GENERA UNA TARJETA AZUL AUTOMÁTICA")
    ok(j["fuera"] and j["salida"] == "azul" and j["azules"] == 1, "el jugador queda fuera del partido (sustitución obligatoria)")
    r = ev(pid6, "falta", A["id"], a1)
    ok(r.status_code == 409 and "ya está fuera" in r.json()["detail"], "un jugador fuera no puede registrar más acciones")
    ok(ev(pid6, "gol", A["id"], a1).status_code == 409, "tampoco goles")
    ok(ev(pid6, "gol", A["id"], a2).status_code == 201, "sus compañeros siguen jugando (el equipo puede sustituirlo: sin inferioridad)")
    ok(A_("DELETE", f"/partidos/{pid6}/eventos/{azul[0]['id']}").status_code == 400, "la azul automática no se borra directamente")
    # deshacer una de las faltas quita la azul automática
    f_ids = [e["id"] for e in det(pid6)["eventos"] if e["tipo"] == "falta" and e["pj_id"] == a1]
    A_("DELETE", f"/partidos/{pid6}/eventos/{f_ids[2]}")
    d = det(pid6)
    j = next(x for x in d["local"]["jugadores"] if x["id"] == a1)
    ok(not any(e["tipo"] == "azul" for e in d["eventos"]) and not j["fuera"] and j["faltas"] == 4, "al eliminar una falta (4 quedan) desaparece la azul automática y vuelve a jugar")
    ev(pid6, "falta", A["id"], a1)
    ok(sum(1 for e in det(pid6)["eventos"] if e["tipo"] == "azul") == 1, "si vuelve a sumar la 5.ª, la azul reaparece (una sola)")

    # ================= DOBLE AMARILLA, ROJA, AZUL DIRECTA =================
    ev(pid6, "amarilla", A["id"], a2)
    d = det(pid6)
    ok(not next(x for x in d["local"]["jugadores"] if x["id"] == a2)["fuera"], "con una amarilla el jugador sigue en el partido")
    ev(pid6, "amarilla", A["id"], a2)
    d = det(pid6)
    j2 = next(x for x in d["local"]["jugadores"] if x["id"] == a2)
    auto = [e for e in d["eventos"] if e["motivo"] == "doble_amarilla"]
    ok(len(auto) == 1 and j2["fuera"] and j2["amarillas"] == 2 and j2["azules"] == 1, "LA 2.ª AMARILLA GENERA UNA AZUL AUTOMÁTICA y el jugador queda fuera")
    am = [e["id"] for e in d["eventos"] if e["tipo"] == "amarilla" and e["pj_id"] == a2]
    A_("DELETE", f"/partidos/{pid6}/eventos/{am[1]}")
    ok(not any(e["motivo"] == "doble_amarilla" for e in det(pid6)["eventos"]), "si se elimina la 2.ª amarilla, desaparece la azul automática")

    ev(pid6, "roja", A["id"], a3)
    j3 = next(x for x in det(pid6)["local"]["jugadores"] if x["id"] == a3)
    ok(j3["fuera"] and j3["salida"] == "roja" and j3["expulsado"], "la roja saca al jugador (expulsado)")
    ok(ev(pid6, "amarilla", A["id"], a3).status_code == 409, "un expulsado no puede recibir más tarjetas")
    ev(pid6, "azul", B["id"], b1)
    ok(next(x for x in det(pid6)["visitante"]["jugadores"] if x["id"] == b1)["fuera"], "la azul directa también deja al jugador fuera")

    # ================= ESTADÍSTICAS Y PERMISOS =================
    A_("POST", f"/partidos/{pid6}/pausar"); A_("POST", f"/partidos/{pid6}/finalizar")
    tarj = {t["nombre"]: t for t in A_("GET", "/estadisticas").json()["tarjetas"]}
    ok(tarj["A1"]["azules"] == 1, "la azul por 5 faltas SÍ cuenta en la tabla de tarjetas (decisión del administrador)")
    A_("POST", "/usuarios", json={"usuario": "del1", "nombre": "Del", "password": "clave-del-1", "rol": "delegado", "equipo_ids": [A["id"]]})
    D = {"Authorization": "Bearer " + c.post("/api/auth/login", json={"usuario": "del1", "password": "clave-del-1"}).json()["token"]}
    pid7 = nuevo_partido()
    ok(c.post(f"/api/partidos/{pid7}/eventos", headers=D, json={"tipo": "tiempo_muerto", "equipo_id": A["id"]}).status_code == 403, "un delegado no puede pedir tiempos muertos")
    ok(c.post(f"/api/partidos/{pid7}/descanso", headers=D).status_code == 403, "ni manejar el descanso")
    # ================= MÍNIMO DE JUGADORES (configurable por el administrador) =================
    Cc = A_("POST", "/equipos", json={"nombre": "C"}).json()
    for n in (1, 2):
        A_("POST", f"/equipos/{Cc['id']}/jugadores", json={"numero": n, "nombre": f"C{n}"})
    crear = lambda: A_("POST", "/partidos", json={"local_id": A["id"], "visitante_id": Cc["id"], "fecha": "2026-12-03"}).json()["id"]
    ma, mb = crear(), crear()
    cfg = A_("GET", "/config").json(); cfg.pop("fases")
    ok(cfg["min_jugadores"] == 0 and cfg["max_jugadores"] == 12, "por defecto: máximo 12 y SIN mínimo (0): no bloquea nada")
    cfg["min_jugadores"] = 3
    ok(A_("PUT", "/config", json=cfg).status_code == 200, "el administrador define un mínimo de 3")
    r = A_("POST", f"/partidos/{ma}/iniciar")
    ok(r.status_code == 400 and "C tiene 2 jugadores convocados y el mínimo para jugar es 3" in r.json()["detail"], f"no se inicia con menos del mínimo: {r.json()['detail'][:70]}…")
    A_("POST", f"/equipos/{Cc['id']}/jugadores", json={"numero": 3, "nombre": "C3"})
    ok(A_("POST", f"/partidos/{ma}/iniciar").status_code == 200, "al inscribir al tercero, el partido sí inicia")
    cfg["min_jugadores"] = 0
    A_("PUT", "/config", json=cfg)
    ok(A_("POST", f"/partidos/{mb}/iniciar").status_code == 200, "con el mínimo en 0 no se exige nada")
    cfg["min_jugadores"] = 20
    ok(A_("PUT", "/config", json=cfg).status_code == 422, "el mínimo no puede superar el máximo de la planilla")
    cfg["min_jugadores"] = 0; cfg["max_jugadores"] = 12; A_("PUT", "/config", json=cfg)

    print("\nTODO OK")

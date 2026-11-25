from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import reloj
from app.database import get_db
from app.deps import ambito_actual, operador, solo_admin
from app.fases import NOMBRE
from app.models import Categoria, Config, Equipo, Evento, Jugador, Partido, PartidoJugador
from app.routers.equipos import validar_jugador_nuevo
from app.schemas import AjusteIn, ConvocadoIn, EventoIn, PartidoEdit, PartidoIn, PlanillaJugadorIn

router = APIRouter(tags=["partidos"])


async def _get(db: AsyncSession, partido_id: int) -> Partido:
    p = await db.get(Partido, partido_id)
    if not p:
        raise HTTPException(404, "Partido no encontrado")
    reloj.normalizar(p)
    return p


def goles_por_equipo(eventos: list[Evento], local_id: int, visitante_id: int) -> tuple[int, int]:
    gl = gv = 0
    for ev in eventos:
        if ev.tipo == "gol":
            if ev.equipo_id == local_id:
                gl += 1
            elif ev.equipo_id == visitante_id:
                gv += 1
        elif ev.tipo == "autogol":
            if ev.equipo_id == local_id:
                gv += 1
            elif ev.equipo_id == visitante_id:
                gl += 1
    return gl, gv


async def detalle(db: AsyncSession, p: Partido) -> dict:
    cfg = await db.get(Config, 1)
    equipos = {e.id: e for e in (await db.execute(
        select(Equipo).where(Equipo.id.in_([p.local_id, p.visitante_id])))).scalars()}
    pjs = list((await db.execute(
        select(PartidoJugador).where(PartidoJugador.partido_id == p.id).order_by(PartidoJugador.numero))).scalars())
    evs = list((await db.execute(
        select(Evento).where(Evento.partido_id == p.id).order_by(Evento.id))).scalars())

    cont: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    faltas: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for ev in evs:
        if ev.pj_id:
            cont[ev.pj_id][ev.tipo] += 1
        if ev.tipo == "falta":
            faltas[ev.equipo_id][str(ev.periodo)] += 1
    pj_by_id = {x.id: x for x in pjs}
    # Tiempos muertos usados: {equipo_id: {periodo: True}} (AMF: 1 por periodo, no acumulable)
    tm_usados: dict[int, dict[str, bool]] = defaultdict(dict)
    for ev in evs:
        if ev.tipo == "tiempo_muerto":
            tm_usados[ev.equipo_id][str(ev.periodo)] = True
    cats = {c.id: c for c in (await db.execute(select(Categoria))).scalars()}

    def lado(eid: int) -> dict:
        e = equipos[eid]
        jug = []
        for x in pjs:
            if x.equipo_id != eid:
                continue
            c = cont[x.id]
            jug.append({
                "id": x.id, "jugador_id": x.jugador_id, "numero": x.numero, "nombre": x.nombre,
                "documento": x.documento, "convocado": x.convocado,
                "goles": c["gol"], "autogoles": c["autogol"], "amarillas": c["amarilla"],
                "azules": c["azul"], "rojas": c["roja"], "faltas": c["falta"],
                # Fuera del partido: roja (expulsión) o azul (sustitución obligatoria: 5.ª falta, doble amarilla
                # o azul directa). En ambos casos el jugador no puede volver a actuar.
                "expulsado": c["roja"] > 0,
                "fuera": c["roja"] > 0 or c["azul"] > 0,
                "salida": "roja" if c["roja"] > 0 else ("azul" if c["azul"] > 0 else None),
            })
        cat = cats.get(e.categoria_id)
        return {
            "id": e.id, "nombre": e.nombre, "delegado": e.delegado,
            "faltas": dict(faltas[eid]), "tiempos_muertos": dict(tm_usados[eid]), "jugadores": jug,
            "limita_anio": bool(cat and cat.limita_anio and cat.anio_minimo),
            "anio_minimo": cat.anio_minimo if cat and cat.limita_anio else None,
        }

    gl, gv = goles_por_equipo(evs, p.local_id, p.visitante_id)
    lado_de = {p.local_id: "local", p.visitante_id: "visitante"}
    return {
        "id": p.id, "estado": p.estado, "fecha": p.fecha.isoformat(),
        "hora": p.hora.strftime("%H:%M") if p.hora else None,
        "cancha": p.cancha, "jornada": p.jornada,
        "fase": p.fase, "fase_nombre": NOMBRE.get(p.fase, p.fase),
        "categoria": cats[equipos[p.local_id].categoria_id].nombre if equipos[p.local_id].categoria_id in cats else None,
        "periodo": p.periodo, "num_tiempos": p.num_tiempos, "duracion_seg": p.duracion_seg,
        "restante_seg": round(reloj.restante(p), 2), "corriendo": p.corriendo,
        "limite_faltas": cfg.limite_faltas,
        "descanso": reloj.estado_descanso(p),
        "tiempo_muerto": reloj.estado_tiempo_muerto(p),
        "nombre_campeonato": cfg.nombre,
        "goles_local": gl, "goles_visitante": gv,
        "local": lado(p.local_id), "visitante": lado(p.visitante_id),
        "eventos": [{
            "id": ev.id, "tipo": ev.tipo, "equipo_id": ev.equipo_id, "lado": lado_de.get(ev.equipo_id),
            "pj_id": ev.pj_id,
            "numero": pj_by_id[ev.pj_id].numero if ev.pj_id in pj_by_id else None,
            "nombre": pj_by_id[ev.pj_id].nombre if ev.pj_id in pj_by_id else None,
            "periodo": ev.periodo, "segundo": ev.segundo, "motivo": ev.motivo,
        } for ev in evs],
    }


async def aplicar_reglas(db: AsyncSession, p: Partido, pj_id: int | None) -> None:
    """Reglas automáticas de la AMF para un jugador (idempotente: deja el estado correcto
    tanto al agregar como al quitar eventos):
      - 5.ª falta personal  -> tarjeta azul (sustitución obligatoria). Las faltas se acumulan en todo el partido.
      - 2.ª amarilla        -> tarjeta azul (la doble amonestación es descalificación con sustitución).
    Si el evento que la originó se elimina, la azul automática también desaparece."""
    if pj_id is None:
        return
    evs = list((await db.execute(
        select(Evento).where(Evento.partido_id == p.id, Evento.pj_id == pj_id).order_by(Evento.id)
    )).scalars())
    for motivo, tipo, n in (("quinta_falta", "falta", 5), ("doble_amarilla", "amarilla", 2)):
        base = [e for e in evs if e.tipo == tipo]
        auto = [e for e in evs if e.tipo == "azul" and e.motivo == motivo]
        if len(base) >= n and not auto:
            origen = base[n - 1]
            db.add(Evento(
                partido_id=p.id, tipo="azul", motivo=motivo, equipo_id=origen.equipo_id, pj_id=pj_id,
                periodo=origen.periodo, segundo=origen.segundo,
            ))
        elif len(base) < n:
            for e in auto:
                await db.delete(e)


def _verificar_ambito(amb: set[int] | None, p: Partido) -> None:
    """Un delegado solo puede ver los partidos de los equipos de sus categorías."""
    if amb is not None and p.local_id not in amb and p.visitante_id not in amb:
        raise HTTPException(403, "Este partido no es de tus categorías")


async def sincronizar_planilla(db: AsyncSession, p: Partido) -> None:
    """Antes de jugarse, la planilla del partido refleja los jugadores inscritos por el delegado:
    agrega los nuevos, actualiza datos corregidos y des-convoca a los dados de baja."""
    pjs = list((await db.execute(select(PartidoJugador).where(PartidoJugador.partido_id == p.id))).scalars())
    por_jugador = {(x.equipo_id, x.jugador_id): x for x in pjs}
    activos = list((await db.execute(
        select(Jugador).where(Jugador.equipo_id.in_([p.local_id, p.visitante_id]), Jugador.activo)
    )).scalars())
    vigentes = set()
    for j in activos:
        vigentes.add((j.equipo_id, j.id))
        x = por_jugador.get((j.equipo_id, j.id))
        if x is None:
            db.add(PartidoJugador(
                partido_id=p.id, equipo_id=j.equipo_id, jugador_id=j.id,
                numero=j.numero, nombre=j.nombre, documento=j.documento,
            ))
        else:
            x.numero, x.nombre, x.documento = j.numero, j.nombre, j.documento
    for clave, x in por_jugador.items():
        if clave not in vigentes:
            x.convocado = False


async def _responder(db: AsyncSession, p: Partido) -> dict:
    await db.commit()
    return await detalle(db, p)


# ---------- listado / CRUD ----------

@router.get("/partidos")
async def listar_partidos(db: AsyncSession = Depends(get_db), amb: set[int] | None = Depends(ambito_actual)):
    partidos = list((await db.execute(select(Partido).order_by(Partido.fecha, Partido.hora, Partido.id))).scalars())
    todos = {e.id: e for e in (await db.execute(select(Equipo))).scalars()}
    nombres = {i: e.nombre for i, e in todos.items()}
    cats = {c.id: c.nombre for c in (await db.execute(select(Categoria))).scalars()}
    evs = defaultdict(list)
    for ev in (await db.execute(select(Evento).where(Evento.tipo.in_(["gol", "autogol"])))).scalars():
        evs[ev.partido_id].append(ev)
    out = []
    for p in partidos:
        if amb is not None and p.local_id not in amb and p.visitante_id not in amb:
            continue
        reloj.normalizar(p)
        gl, gv = goles_por_equipo(evs[p.id], p.local_id, p.visitante_id)
        out.append({
            "id": p.id, "estado": p.estado, "fecha": p.fecha.isoformat(),
            "hora": p.hora.strftime("%H:%M") if p.hora else None,
            "cancha": p.cancha, "jornada": p.jornada, "periodo": p.periodo,
            "fase": p.fase, "fase_nombre": NOMBRE.get(p.fase, p.fase),
            "categoria_id": todos[p.local_id].categoria_id if p.local_id in todos else None,
            "categoria": cats.get(todos[p.local_id].categoria_id) if p.local_id in todos else None,
            "local_id": p.local_id, "local": nombres.get(p.local_id),
            "visitante_id": p.visitante_id, "visitante": nombres.get(p.visitante_id),
            "goles_local": gl, "goles_visitante": gv,
        })
    await db.commit()
    return out


@router.post("/partidos", status_code=201, dependencies=[Depends(solo_admin)])
async def crear_partido(data: PartidoIn, db: AsyncSession = Depends(get_db)):
    if data.local_id == data.visitante_id:
        raise HTTPException(400, "El equipo local y el visitante deben ser distintos")
    eqs = []
    for eid in (data.local_id, data.visitante_id):
        e = await db.get(Equipo, eid)
        if not e or not e.activo:
            raise HTTPException(400, "Equipo no válido")
        eqs.append(e)
    if eqs[0].categoria_id != eqs[1].categoria_id:
        raise HTTPException(400, "Los dos equipos deben ser de la misma categoría")
    cfg = await db.get(Config, 1)
    p = Partido(
        **data.model_dump(), estado="programado", periodo=1,
        duracion_seg=cfg.duracion_min * 60, num_tiempos=cfg.num_tiempos,
        restante_seg=cfg.duracion_min * 60, corriendo=False, descanso_seg=cfg.descanso_min * 60,
    )
    db.add(p)
    await db.flush()
    # La planilla se carga sola con los jugadores ya registrados de cada equipo.
    jugadores = (await db.execute(
        select(Jugador).where(Jugador.equipo_id.in_([data.local_id, data.visitante_id]), Jugador.activo)
    )).scalars()
    for j in jugadores:
        db.add(PartidoJugador(
            partido_id=p.id, equipo_id=j.equipo_id, jugador_id=j.id,
            numero=j.numero, nombre=j.nombre, documento=j.documento,
        ))
    await db.commit()
    return await detalle(db, p)


@router.get("/partidos/{partido_id}")
async def obtener_partido(
    partido_id: int, db: AsyncSession = Depends(get_db), amb: set[int] | None = Depends(ambito_actual)
):
    p = await _get(db, partido_id)
    _verificar_ambito(amb, p)
    if p.estado == "programado":
        await sincronizar_planilla(db, p)
    return await _responder(db, p)


@router.put("/partidos/{partido_id}", dependencies=[Depends(solo_admin)])
async def editar_partido(partido_id: int, data: PartidoEdit, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    for k, v in data.model_dump().items():
        setattr(p, k, v)
    return await _responder(db, p)


@router.delete("/partidos/{partido_id}", status_code=204, dependencies=[Depends(solo_admin)])
async def eliminar_partido(partido_id: int, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    await db.execute(delete(Evento).where(Evento.partido_id == partido_id))
    await db.execute(delete(PartidoJugador).where(PartidoJugador.partido_id == partido_id))
    await db.delete(p)
    await db.commit()


# ---------- cronómetro ----------

@router.post("/partidos/{partido_id}/iniciar", dependencies=[Depends(operador)])
async def iniciar(partido_id: int, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    if p.estado == "finalizado":
        raise HTTPException(400, "El partido ya finalizó")
    if p.corriendo:
        return await _responder(db, p)
    if p.estado == "programado":
        await sincronizar_planilla(db, p)
        p.estado = "en_juego"
        p.periodo = 1
        p.restante_seg = p.duracion_seg
    if p.restante_seg <= 0:
        raise HTTPException(400, "El tiempo terminó. Pasa al siguiente tiempo o finaliza el partido.")
    p.corriendo = True
    p.corriendo_desde = reloj.ahora()
    p.tm_desde = p.tm_equipo_id = None  # al reanudar el juego termina el tiempo muerto
    return await _responder(db, p)


@router.post("/partidos/{partido_id}/pausar", dependencies=[Depends(operador)])
async def pausar(partido_id: int, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    reloj.congelar(p)
    return await _responder(db, p)


@router.post("/partidos/{partido_id}/siguiente-tiempo", dependencies=[Depends(operador)])
async def siguiente_tiempo(partido_id: int, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    if p.estado != "en_juego":
        raise HTTPException(400, "El partido no está en juego")
    if p.corriendo:
        raise HTTPException(400, "Pausa el cronómetro primero")
    if p.periodo >= p.num_tiempos:
        raise HTTPException(400, "Ya estás en el último tiempo")
    p.periodo += 1
    p.restante_seg = p.duracion_seg
    p.descanso_desde = p.tm_desde = p.tm_equipo_id = None  # termina el descanso
    return await _responder(db, p)


@router.post("/partidos/{partido_id}/ajustar", dependencies=[Depends(operador)])
async def ajustar(partido_id: int, data: AjusteIn, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    if p.corriendo:
        raise HTTPException(400, "Pausa el cronómetro para ajustar el tiempo")
    if p.estado == "finalizado":
        raise HTTPException(400, "El partido ya finalizó")
    p.restante_seg = min(data.restante_seg, p.duracion_seg)
    if p.restante_seg <= 0:
        reloj.iniciar_descanso(p)  # el periodo se da por terminado: arranca el descanso
    else:
        p.descanso_desde = None
    return await _responder(db, p)


@router.post("/partidos/{partido_id}/descanso", dependencies=[Depends(operador)])
async def iniciar_descanso(partido_id: int, db: AsyncSession = Depends(get_db)):
    """Arranca (o reinicia) el descanso a mano. Normalmente arranca solo al terminar el periodo."""
    p = await _get(db, partido_id)
    if p.estado != "en_juego" or p.corriendo:
        raise HTTPException(400, "El descanso solo se puede iniciar con el partido en juego y el cronómetro detenido")
    if p.periodo >= p.num_tiempos:
        raise HTTPException(400, "Ya estás en el último tiempo: no hay descanso")
    reloj.iniciar_descanso(p)
    return await _responder(db, p)


@router.post("/partidos/{partido_id}/tiempo-muerto/terminar", dependencies=[Depends(operador)])
async def terminar_tiempo_muerto(partido_id: int, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    p.tm_desde = p.tm_equipo_id = None
    return await _responder(db, p)


@router.post("/partidos/{partido_id}/finalizar", dependencies=[Depends(operador)])
async def finalizar(partido_id: int, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    if p.estado == "programado":
        raise HTTPException(400, "El partido aún no se ha iniciado")
    reloj.congelar(p)
    p.estado = "finalizado"
    p.descanso_desde = p.tm_desde = p.tm_equipo_id = None
    return await _responder(db, p)


@router.post("/partidos/{partido_id}/reabrir", dependencies=[Depends(solo_admin)])
async def reabrir(partido_id: int, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    if p.estado == "finalizado":
        p.estado = "en_juego"
    return await _responder(db, p)


# ---------- planilla ----------

@router.patch("/partidos/{partido_id}/planilla/{pj_id}", dependencies=[Depends(operador)])
async def convocar(partido_id: int, pj_id: int, data: ConvocadoIn, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    pj = await db.get(PartidoJugador, pj_id)
    if not pj or pj.partido_id != partido_id:
        raise HTTPException(404, "Jugador no está en la planilla")
    pj.convocado = data.convocado
    return await _responder(db, p)


@router.post("/partidos/{partido_id}/planilla", status_code=201, dependencies=[Depends(operador)])
async def agregar_jugador(partido_id: int, data: PlanillaJugadorIn, db: AsyncSession = Depends(get_db)):
    """Registra un jugador nuevo en el equipo y lo agrega a la planilla de este partido."""
    p = await _get(db, partido_id)
    if data.equipo_id not in (p.local_id, p.visitante_id):
        raise HTTPException(400, "El equipo no juega este partido")
    await validar_jugador_nuevo(db, await db.get(Equipo, data.equipo_id), data)
    j = Jugador(equipo_id=data.equipo_id, numero=data.numero, nombre=data.nombre,
                documento=data.documento, anio_nacimiento=data.anio_nacimiento)
    db.add(j)
    await db.flush()
    db.add(PartidoJugador(
        partido_id=partido_id, equipo_id=data.equipo_id, jugador_id=j.id,
        numero=j.numero, nombre=j.nombre, documento=j.documento,
    ))
    return await _responder(db, p)


# ---------- eventos ----------

@router.post("/partidos/{partido_id}/eventos", status_code=201, dependencies=[Depends(operador)])
async def registrar_evento(partido_id: int, data: EventoIn, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    if p.estado == "programado":
        raise HTTPException(400, "Inicia el partido con el cronómetro antes de registrar eventos")
    if p.estado == "finalizado":
        raise HTTPException(400, "El partido ya finalizó. Reábrelo para corregir eventos.")
    if data.equipo_id not in (p.local_id, p.visitante_id):
        raise HTTPException(400, "El equipo no juega este partido")
    if data.pj_id is not None:
        pj = await db.get(PartidoJugador, data.pj_id)
        if not pj or pj.partido_id != partido_id or pj.equipo_id != data.equipo_id:
            raise HTTPException(400, "Jugador no válido para este equipo")
        if not pj.convocado:
            raise HTTPException(400, "El jugador no está convocado en la planilla")
    elif data.tipo in ("amarilla", "azul", "roja", "autogol"):
        raise HTTPException(400, "Este evento requiere un jugador")

    if data.tipo == "tiempo_muerto":
        # AMF, Regla 6: un (1) minuto por equipo y por periodo; si no se usa en el primero no se acumula.
        if data.pj_id is not None:
            raise HTTPException(400, "El tiempo muerto es del equipo, no de un jugador")
        if p.periodo > p.num_tiempos or reloj.restante(p) <= 0:
            raise HTTPException(400, "El periodo terminó: no se puede pedir tiempo muerto")
        usado = (await db.execute(
            select(Evento.id).where(
                Evento.partido_id == partido_id, Evento.tipo == "tiempo_muerto",
                Evento.equipo_id == data.equipo_id, Evento.periodo == p.periodo,
            ).limit(1)
        )).first()
        if usado:
            raise HTTPException(409, f"Este equipo ya usó su tiempo muerto del {p.periodo}º tiempo (solo hay uno por periodo)")
        reloj.congelar(p)  # el tiempo muerto detiene el cronómetro
        p.tm_equipo_id, p.tm_desde = data.equipo_id, reloj.ahora()
    elif data.pj_id is not None:
        previos = (await db.execute(
            select(Evento.tipo).where(Evento.partido_id == partido_id, Evento.pj_id == data.pj_id,
                                      Evento.tipo.in_(["roja", "azul"]))
        )).scalars().all()
        if previos:
            raise HTTPException(
                409, f"{pj.nombre} ya está fuera del partido (tarjeta {'roja' if 'roja' in previos else 'azul'}). "
                     "No puede registrar más acciones.")

    transcurrido = max(0, int(p.duracion_seg - reloj.restante(p)))
    db.add(Evento(
        partido_id=partido_id, tipo=data.tipo, equipo_id=data.equipo_id, pj_id=data.pj_id,
        periodo=p.periodo, segundo=transcurrido,
    ))
    await db.flush()
    await aplicar_reglas(db, p, data.pj_id)
    return await _responder(db, p)


@router.delete("/partidos/{partido_id}/eventos/{evento_id}", dependencies=[Depends(operador)])
async def eliminar_evento(partido_id: int, evento_id: int, db: AsyncSession = Depends(get_db)):
    p = await _get(db, partido_id)
    ev = await db.get(Evento, evento_id)
    if not ev or ev.partido_id != partido_id:
        raise HTTPException(404, "Evento no encontrado")
    if ev.motivo:
        raise HTTPException(
            400, "Esta tarjeta es automática: para quitarla elimina la falta o la amarilla que la originó")
    pj_id, tipo, equipo_id = ev.pj_id, ev.tipo, ev.equipo_id
    await db.delete(ev)
    await db.flush()
    await aplicar_reglas(db, p, pj_id)
    if tipo == "tiempo_muerto" and p.tm_equipo_id == equipo_id:
        p.tm_desde = p.tm_equipo_id = None
    return await _responder(db, p)

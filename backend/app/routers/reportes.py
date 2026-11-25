import json
from collections import Counter, defaultdict
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ambito_actual, solo_admin
from app.fases import FASES, NOMBRE, desde
from app.models import Base, Config, Equipo, Evento, Jugador, Partido, PartidoJugador
from app.routers.partidos import goles_por_equipo
from app.schemas import ConfigIn

router = APIRouter(tags=["reportes"])


@router.get("/config")
async def obtener_config(db: AsyncSession = Depends(get_db)):
    c = await db.get(Config, 1)
    out = {k: getattr(c, k) for k in ConfigIn.model_fields}
    out["fases"] = [{"id": k, "nombre": n} for k, n in FASES]
    return out


@router.put("/config", dependencies=[Depends(solo_admin)])
async def guardar_config(data: ConfigIn, db: AsyncSession = Depends(get_db)):
    c = await db.get(Config, 1)
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    await db.commit()
    return data


async def _equipos_en_alcance(db: AsyncSession, amb: set[int] | None, categoria_id: int | None) -> dict[int, str]:
    q = select(Equipo.id, Equipo.nombre).where(Equipo.activo)
    if categoria_id is not None:
        q = q.where(Equipo.categoria_id == categoria_id)
    if amb is not None:
        q = q.where(Equipo.id.in_(amb))
    return {i: n for i, n in (await db.execute(q)).all()}


@router.get("/tabla")
async def tabla_posiciones(
    categoria_id: int | None = None, db: AsyncSession = Depends(get_db), amb: set[int] | None = Depends(ambito_actual)
):
    cfg = await db.get(Config, 1)
    equipos = await _equipos_en_alcance(db, amb, categoria_id)
    t = {i: dict(equipo_id=i, equipo=n, pj=0, pg=0, pe=0, pp=0, gf=0, gc=0, dg=0, pts=0) for i, n in equipos.items()}
    finalizados = list((await db.execute(select(Partido).where(Partido.estado == "finalizado"))).scalars())
    evs = defaultdict(list)
    ids = [p.id for p in finalizados]
    if ids:
        q = select(Evento).where(Evento.partido_id.in_(ids), Evento.tipo.in_(["gol", "autogol"]))
        for ev in (await db.execute(q)).scalars():
            evs[ev.partido_id].append(ev)
    for p in finalizados:
        if p.local_id not in t or p.visitante_id not in t:
            continue
        a, b = goles_por_equipo(evs[p.id], p.local_id, p.visitante_id)
        L, V = t[p.local_id], t[p.visitante_id]
        L["pj"] += 1; V["pj"] += 1
        L["gf"] += a; L["gc"] += b; V["gf"] += b; V["gc"] += a
        if a > b:
            L["pg"] += 1; V["pp"] += 1; L["pts"] += cfg.pts_ganado; V["pts"] += cfg.pts_perdido
        elif a < b:
            V["pg"] += 1; L["pp"] += 1; V["pts"] += cfg.pts_ganado; L["pts"] += cfg.pts_perdido
        else:
            L["pe"] += 1; V["pe"] += 1; L["pts"] += cfg.pts_empate; V["pts"] += cfg.pts_empate
    for r in t.values():
        r["dg"] = r["gf"] - r["gc"]
    return sorted(t.values(), key=lambda r: (-r["pts"], -r["dg"], -r["gf"], r["equipo"]))


@router.get("/estadisticas")
async def estadisticas(
    categoria_id: int | None = None, db: AsyncSession = Depends(get_db), amb: set[int] | None = Depends(ambito_actual)
):
    """Goleadores y valla menos vencida (promedios por partido, desde la fase configurada) y tarjetas."""
    cfg = await db.get(Config, 1)
    equipos = await _equipos_en_alcance(db, amb, categoria_id)
    ids_eq = list(equipos)
    jugadores = (
        {j.id: j for j in (await db.execute(select(Jugador).where(Jugador.equipo_id.in_(ids_eq)))).scalars()}
        if ids_eq else {}
    )

    # --- tarjetas: todos los partidos de los equipos en alcance
    tarjetas_por_jugador: dict[int, dict] = {}
    if ids_eq:
        q = (
            select(Evento.tipo, PartidoJugador.jugador_id, PartidoJugador.equipo_id)
            .join(PartidoJugador, PartidoJugador.id == Evento.pj_id)
            .where(Evento.tipo.in_(["amarilla", "azul", "roja"]), PartidoJugador.equipo_id.in_(ids_eq))
        )
        clave = {"amarilla": "amarillas", "azul": "azules", "roja": "rojas"}
        for tipo, jid, eid in (await db.execute(q)).all():
            j = jugadores.get(jid)
            if not j:
                continue
            r = tarjetas_por_jugador.setdefault(jid, dict(
                jugador_id=jid, numero=j.numero, nombre=j.nombre, equipo=equipos.get(eid, ""),
                amarillas=0, azules=0, rojas=0))
            r[clave[tipo]] += 1
    tarjetas = sorted(
        tarjetas_por_jugador.values(), key=lambda r: (-r["rojas"], -r["amarillas"], -r["azules"], r["nombre"])
    )

    # --- partidos finalizados entre equipos en alcance
    partidos = []
    if ids_eq:
        partidos = list((await db.execute(
            select(Partido).where(
                Partido.estado == "finalizado", Partido.local_id.in_(ids_eq), Partido.visitante_id.in_(ids_eq)
            )
        )).scalars())
    por_partido = defaultdict(list)
    pj_map: dict[int, tuple[int, int]] = {}  # id en planilla -> (jugador_id, equipo_id)
    if partidos:
        pids = [p.id for p in partidos]
        for ev in (await db.execute(
            select(Evento).where(Evento.partido_id.in_(pids), Evento.tipo.in_(["gol", "autogol"]))
        )).scalars():
            por_partido[ev.partido_id].append(ev)
        for x in (await db.execute(select(PartidoJugador).where(PartidoJugador.partido_id.in_(pids)))).scalars():
            pj_map[x.id] = (x.jugador_id, x.equipo_id)

    # --- goleadores: goles ÷ partidos finalizados de su equipo (desde la fase configurada)
    partidos_g = [p for p in partidos if desde(p.fase, cfg.fase_goleador)]
    pj_equipo: Counter = Counter()
    for p in partidos_g:
        pj_equipo[p.local_id] += 1
        pj_equipo[p.visitante_id] += 1
    goles: Counter = Counter()
    equipo_de_jugador: dict[int, int] = {}
    for p in partidos_g:
        for ev in por_partido[p.id]:
            if ev.tipo == "gol" and ev.pj_id in pj_map:
                jid, eid = pj_map[ev.pj_id]
                goles[jid] += 1
                equipo_de_jugador[jid] = eid
    goleadores = []
    for jid, g in goles.items():
        j = jugadores.get(jid)
        eid = equipo_de_jugador[jid]
        pj = pj_equipo[eid]
        if not j or not pj:
            continue
        goleadores.append(dict(
            jugador_id=jid, numero=j.numero, nombre=j.nombre, equipo=equipos.get(eid, ""),
            goles=g, pj=pj, promedio=round(g / pj, 2),
        ))
    goleadores.sort(key=lambda r: (-r["promedio"], -r["goles"], r["nombre"]))

    # --- valla menos vencida: goles en contra ÷ partidos del equipo (desde la fase configurada)
    pj_v: Counter = Counter()
    gc: Counter = Counter()
    for p in [p for p in partidos if desde(p.fase, cfg.fase_valla)]:
        a, b = goles_por_equipo(por_partido[p.id], p.local_id, p.visitante_id)
        pj_v[p.local_id] += 1
        pj_v[p.visitante_id] += 1
        gc[p.local_id] += b
        gc[p.visitante_id] += a
    valla = [
        dict(equipo_id=eid, equipo=equipos[eid], pj=pj, gc=gc[eid], promedio=round(gc[eid] / pj, 2))
        for eid, pj in pj_v.items()
    ]
    valla.sort(key=lambda r: (r["promedio"], r["gc"], -r["pj"], r["equipo"]))

    return {
        "goleadores": goleadores,
        "valla": valla,
        "tarjetas": tarjetas,
        "reglas": {"fase_goleador": NOMBRE[cfg.fase_goleador], "fase_valla": NOMBRE[cfg.fase_valla]},
    }


def _json_default(o):
    if isinstance(o, (date, datetime, time)):
        return o.isoformat()
    raise TypeError


@router.get("/respaldo", dependencies=[Depends(solo_admin)])
async def respaldo(db: AsyncSession = Depends(get_db)):
    """Descarga todos los datos en un JSON (copia de seguridad). Nunca incluye contraseñas."""
    out = {}
    for table in Base.metadata.sorted_tables:
        rows = (await db.execute(select(table))).mappings().all()
        out[table.name] = [{k: v for k, v in dict(r).items() if k != "password_hash"} for r in rows]
    body = json.dumps(out, default=_json_default, ensure_ascii=False, indent=1)
    fname = f"respaldo-campeonato-{date.today().isoformat()}.json"
    return Response(body, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})

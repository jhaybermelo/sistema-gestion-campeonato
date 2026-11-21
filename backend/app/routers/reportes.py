import json
from collections import defaultdict
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import solo_admin
from app.models import Base, Config, Equipo, Evento, Jugador, Partido, PartidoJugador
from app.routers.partidos import goles_por_equipo
from app.schemas import ConfigIn

router = APIRouter(tags=["reportes"])


@router.get("/config")
async def obtener_config(db: AsyncSession = Depends(get_db)):
    c = await db.get(Config, 1)
    return {k: getattr(c, k) for k in ConfigIn.model_fields}


@router.put("/config", dependencies=[Depends(solo_admin)])
async def guardar_config(data: ConfigIn, db: AsyncSession = Depends(get_db)):
    c = await db.get(Config, 1)
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    await db.commit()
    return data


@router.get("/tabla")
async def tabla_posiciones(categoria_id: int | None = None, db: AsyncSession = Depends(get_db)):
    cfg = await db.get(Config, 1)
    q_eq = select(Equipo).where(Equipo.activo)
    if categoria_id is not None:
        q_eq = q_eq.where(Equipo.categoria_id == categoria_id)
    equipos = list((await db.execute(q_eq)).scalars())
    t = {e.id: dict(equipo_id=e.id, equipo=e.nombre, pj=0, pg=0, pe=0, pp=0, gf=0, gc=0, dg=0, pts=0) for e in equipos}
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
async def estadisticas(categoria_id: int | None = None, db: AsyncSession = Depends(get_db)):
    nombres_eq = {e.id: e.nombre for e in (await db.execute(select(Equipo))).scalars()}
    jugadores = {j.id: j for j in (await db.execute(select(Jugador))).scalars()}
    q = (
        select(Evento.tipo, PartidoJugador.jugador_id, PartidoJugador.equipo_id)
        .join(PartidoJugador, PartidoJugador.id == Evento.pj_id)
        .where(Evento.tipo.in_(["gol", "amarilla", "azul", "roja"]))
    )
    if categoria_id is not None:
        q = q.join(Equipo, Equipo.id == PartidoJugador.equipo_id).where(Equipo.categoria_id == categoria_id)
    rows = (await db.execute(q)).all()
    acc: dict[int, dict] = {}
    for tipo, jid, eid in rows:
        j = jugadores.get(jid)
        if not j:
            continue
        r = acc.setdefault(jid, dict(
            jugador_id=jid, numero=j.numero, nombre=j.nombre, equipo=nombres_eq.get(eid, ""),
            goles=0, amarillas=0, azules=0, rojas=0))
        r[{"gol": "goles", "amarilla": "amarillas", "azul": "azules", "roja": "rojas"}[tipo]] += 1
    todos = list(acc.values())
    return {
        "goleadores": sorted([r for r in todos if r["goles"]], key=lambda r: (-r["goles"], r["nombre"])),
        "tarjetas": sorted(
            [r for r in todos if r["amarillas"] or r["azules"] or r["rojas"]],
            key=lambda r: (-r["rojas"], -r["amarillas"], -r["azules"], r["nombre"]),
        ),
    }


def _json_default(o):
    if isinstance(o, (date, datetime, time)):
        return o.isoformat()
    raise TypeError


@router.get("/respaldo", dependencies=[Depends(solo_admin)])
async def respaldo(db: AsyncSession = Depends(get_db)):
    """Descarga todos los datos en un JSON (copia de seguridad)."""
    out = {}
    for table in Base.metadata.sorted_tables:
        rows = (await db.execute(select(table))).mappings().all()
        out[table.name] = [dict(r) for r in rows]
    body = json.dumps(out, default=_json_default, ensure_ascii=False, indent=1)
    fname = f"respaldo-campeonato-{date.today().isoformat()}.json"
    return Response(body, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ambito_actual, equipos_de, solo_admin, usuario_actual
from app.models import Categoria, Config, Equipo, Jugador, Partido, PartidoJugador, Usuario
from app.routers.categorias import incumplen, validar_anio
from app.schemas import EquipoIn, JugadorIn

router = APIRouter(tags=["equipos"])

ESTADOS_INICIADO = ("en_juego", "finalizado")


# ---------- reglas de la planilla ----------

async def planilla_cerrada(db: AsyncSession, equipo_id: int) -> bool:
    """La planilla de un equipo se cierra cuando inicia su primer partido."""
    q = select(Partido.id).where(
        (Partido.local_id == equipo_id) | (Partido.visitante_id == equipo_id), Partido.estado.in_(ESTADOS_INICIADO)
    ).limit(1)
    return (await db.execute(q)).first() is not None


async def equipos_con_planilla_cerrada(db: AsyncSession) -> set[int]:
    q = select(Partido.local_id, Partido.visitante_id).where(Partido.estado.in_(ESTADOS_INICIADO))
    return {x for fila in (await db.execute(q)).all() for x in fila}


async def autorizar_plantel(db: AsyncSession, u: Usuario, equipo_id: int) -> None:
    """Quién puede inscribir, editar o dar de baja jugadores de un equipo."""
    if u.rol == "admin":
        return
    if u.rol == "delegado":
        if equipo_id not in await equipos_de(db, u.id):
            raise HTTPException(403, "Solo puedes gestionar los jugadores de tus equipos")
        if await planilla_cerrada(db, equipo_id):
            raise HTTPException(403, "La planilla está cerrada: tu equipo ya inició su primer partido")
        return
    raise HTTPException(403, "No tienes permiso para gestionar jugadores")


# ---------- serialización ----------

def _jugador(j: Jugador) -> dict:
    return {
        "id": j.id, "equipo_id": j.equipo_id, "numero": j.numero, "nombre": j.nombre,
        "documento": j.documento, "anio_nacimiento": j.anio_nacimiento,
    }


def _equipo(e: Equipo, cat: Categoria | None, n: int = 0, jugadores: list[Jugador] | None = None, **extra) -> dict:
    d = {
        "id": e.id, "nombre": e.nombre, "delegado": e.delegado, "telefono": e.telefono, "activo": e.activo,
        "categoria_id": e.categoria_id,
        "categoria": cat.nombre if cat else None,
        "limita_anio": bool(cat and cat.limita_anio and cat.anio_minimo),
        "anio_minimo": cat.anio_minimo if cat and cat.limita_anio else None,
        "num_jugadores": len(jugadores) if jugadores is not None else n,
        **extra,
    }
    if jugadores is not None:
        d["jugadores"] = [_jugador(j) for j in jugadores]
    return d


async def _get_equipo(db: AsyncSession, equipo_id: int) -> Equipo:
    e = await db.get(Equipo, equipo_id)
    if not e:
        raise HTTPException(404, "Equipo no encontrado")
    return e


async def _categoria(db: AsyncSession, categoria_id: int | None) -> Categoria | None:
    if categoria_id is None:
        return None
    c = await db.get(Categoria, categoria_id)
    if not c:
        raise HTTPException(400, "Categoría no válida")
    return c


async def _jugadores_activos(db: AsyncSession, equipo_id: int) -> list[Jugador]:
    r = await db.execute(
        select(Jugador).where(Jugador.equipo_id == equipo_id, Jugador.activo).order_by(Jugador.numero)
    )
    return list(r.scalars())


async def _validar_numero(db: AsyncSession, equipo_id: int, numero: int, excepto: int | None = None):
    q = select(Jugador.id).where(Jugador.equipo_id == equipo_id, Jugador.numero == numero, Jugador.activo)
    if excepto:
        q = q.where(Jugador.id != excepto)
    if (await db.execute(q)).first():
        raise HTTPException(409, f"El número {numero} ya está en uso en este equipo")


async def validar_jugador_nuevo(
    db: AsyncSession, equipo: Equipo, data: JugadorIn, excepto: int | None = None, contar: bool = True
):
    """Número libre, planilla no llena y año de nacimiento acorde a la categoría (si la regla está marcada)."""
    await _validar_numero(db, equipo.id, data.numero, excepto)
    if contar:
        maximo = (await db.get(Config, 1)).max_jugadores
        actuales = (await db.execute(
            select(func.count()).select_from(Jugador).where(Jugador.equipo_id == equipo.id, Jugador.activo)
        )).scalar_one()
        if actuales >= maximo:
            raise HTTPException(409, f"La planilla es de {maximo} jugadores y ya está completa")
    validar_anio(await _categoria(db, equipo.categoria_id), data.anio_nacimiento)


# ---------- equipos ----------

@router.get("/equipos")
async def listar_equipos(
    db: AsyncSession = Depends(get_db), u: Usuario = Depends(usuario_actual), amb: set[int] | None = Depends(ambito_actual)
):
    cuentas = dict(
        (await db.execute(
            select(Jugador.equipo_id, func.count()).where(Jugador.activo).group_by(Jugador.equipo_id)
        )).all()
    )
    cats = {c.id: c for c in (await db.execute(select(Categoria))).scalars()}
    cerradas = await equipos_con_planilla_cerrada(db)
    propios = await equipos_de(db, u.id) if u.rol == "delegado" else set()
    cfg = await db.get(Config, 1)
    q = select(Equipo).order_by(Equipo.nombre)
    if amb is not None:
        q = q.where(Equipo.id.in_(amb))
    return [
        _equipo(
            e, cats.get(e.categoria_id), n=cuentas.get(e.id, 0),
            es_propio=e.id in propios, planilla_cerrada=e.id in cerradas, max_jugadores=cfg.max_jugadores,
            min_jugadores=cfg.min_jugadores,
        )
        for e in (await db.execute(q)).scalars()
    ]


@router.post("/equipos", status_code=201, dependencies=[Depends(solo_admin)])
async def crear_equipo(data: EquipoIn, db: AsyncSession = Depends(get_db)):
    cat = await _categoria(db, data.categoria_id)
    existe = await db.execute(select(Equipo.id).where(func.lower(Equipo.nombre) == data.nombre.lower()))
    if existe.first():
        raise HTTPException(409, "Ya existe un equipo con ese nombre")
    e = Equipo(**data.model_dump())
    db.add(e)
    await db.commit()
    return _equipo(e, cat, jugadores=[])


@router.get("/equipos/{equipo_id}")
async def obtener_equipo(
    equipo_id: int, db: AsyncSession = Depends(get_db), u: Usuario = Depends(usuario_actual),
    amb: set[int] | None = Depends(ambito_actual),
):
    e = await _get_equipo(db, equipo_id)
    if amb is not None and equipo_id not in amb:
        raise HTTPException(403, "Este equipo no es de tus categorías")
    cerrada = await planilla_cerrada(db, equipo_id)
    es_propio = equipo_id in await equipos_de(db, u.id) if u.rol == "delegado" else False
    cfg = await db.get(Config, 1)
    puede_editar = u.rol == "admin" or (u.rol == "delegado" and es_propio and not cerrada)
    return _equipo(
        e, await _categoria(db, e.categoria_id), jugadores=await _jugadores_activos(db, equipo_id),
        es_propio=es_propio, planilla_cerrada=cerrada, max_jugadores=cfg.max_jugadores,
        min_jugadores=cfg.min_jugadores, puede_editar_plantel=puede_editar,
    )


@router.put("/equipos/{equipo_id}", dependencies=[Depends(solo_admin)])
async def editar_equipo(equipo_id: int, data: EquipoIn, db: AsyncSession = Depends(get_db)):
    e = await _get_equipo(db, equipo_id)
    cat = await _categoria(db, data.categoria_id)
    dup = await db.execute(
        select(Equipo.id).where(func.lower(Equipo.nombre) == data.nombre.lower(), Equipo.id != equipo_id)
    )
    if dup.first():
        raise HTTPException(409, "Ya existe un equipo con ese nombre")
    if cat and data.categoria_id != e.categoria_id:
        if (await db.execute(
            select(Partido.id).where((Partido.local_id == equipo_id) | (Partido.visitante_id == equipo_id)).limit(1)
        )).first():
            raise HTTPException(409, "El equipo ya tiene partidos: no se puede cambiar de categoría.")
        malos = await incumplen(db, cat, equipo_id=equipo_id)
        if malos:
            raise HTTPException(
                409, f"Jugadores que no cumplen la categoría {cat.nombre}: " + "; ".join(malos[:5])
            )
    for k, v in data.model_dump().items():
        setattr(e, k, v)
    await db.commit()
    return _equipo(e, cat, jugadores=await _jugadores_activos(db, equipo_id))


@router.delete("/equipos/{equipo_id}", status_code=204, dependencies=[Depends(solo_admin)])
async def eliminar_equipo(equipo_id: int, db: AsyncSession = Depends(get_db)):
    from app.models import UsuarioEquipo

    e = await _get_equipo(db, equipo_id)
    usado = await db.execute(
        select(Partido.id).where((Partido.local_id == equipo_id) | (Partido.visitante_id == equipo_id)).limit(1)
    )
    if usado.first():
        raise HTTPException(409, "El equipo tiene partidos registrados. Márcalo como inactivo en lugar de eliminarlo.")
    await db.execute(delete(UsuarioEquipo).where(UsuarioEquipo.equipo_id == equipo_id))
    await db.execute(delete(Jugador).where(Jugador.equipo_id == equipo_id))
    await db.delete(e)
    await db.commit()


# ---------- jugadores (admin, o el delegado del equipo mientras la planilla esté abierta) ----------

@router.post("/equipos/{equipo_id}/jugadores", status_code=201)
async def crear_jugador(
    equipo_id: int, data: JugadorIn, db: AsyncSession = Depends(get_db), u: Usuario = Depends(usuario_actual)
):
    e = await _get_equipo(db, equipo_id)
    await autorizar_plantel(db, u, equipo_id)
    await validar_jugador_nuevo(db, e, data)
    j = Jugador(equipo_id=equipo_id, **data.model_dump())
    db.add(j)
    await db.commit()
    return _jugador(j)


@router.put("/jugadores/{jugador_id}")
async def editar_jugador(
    jugador_id: int, data: JugadorIn, db: AsyncSession = Depends(get_db), u: Usuario = Depends(usuario_actual)
):
    j = await db.get(Jugador, jugador_id)
    if not j or not j.activo:
        raise HTTPException(404, "Jugador no encontrado")
    await autorizar_plantel(db, u, j.equipo_id)
    await validar_jugador_nuevo(db, await _get_equipo(db, j.equipo_id), data, excepto=j.id, contar=False)
    for k, v in data.model_dump().items():
        setattr(j, k, v)
    await db.commit()
    return _jugador(j)


@router.delete("/jugadores/{jugador_id}", status_code=204)
async def eliminar_jugador(
    jugador_id: int, db: AsyncSession = Depends(get_db), u: Usuario = Depends(usuario_actual)
):
    """Si el jugador ya aparece en alguna planilla de partido se desactiva (conserva el historial)."""
    j = await db.get(Jugador, jugador_id)
    if not j:
        raise HTTPException(404, "Jugador no encontrado")
    await autorizar_plantel(db, u, j.equipo_id)
    usado = await db.execute(select(PartidoJugador.id).where(PartidoJugador.jugador_id == jugador_id).limit(1))
    if usado.first():
        j.activo = False
    else:
        await db.delete(j)
    await db.commit()

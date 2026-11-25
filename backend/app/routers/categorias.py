from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ambito_actual
from app.deps import solo_admin
from app.models import Categoria, Equipo, Jugador
from app.schemas import CategoriaIn

router = APIRouter(tags=["categorias"])


def regla_activa(cat: Categoria | None) -> bool:
    return bool(cat and cat.limita_anio and cat.anio_minimo)


def validar_anio(cat: Categoria | None, anio: int | None) -> None:
    """Solo valida si la categoría tiene marcada la opción de año mínimo."""
    if not regla_activa(cat):
        return
    if anio is None:
        raise HTTPException(
            400, f"La categoría {cat.nombre} exige el año de nacimiento (nacidos en {cat.anio_minimo} o antes)"
        )
    if anio > cat.anio_minimo:
        raise HTTPException(
            400,
            f"No cumple la edad: la categoría {cat.nombre} es para nacidos en {cat.anio_minimo} o antes "
            f"(el jugador nació en {anio})",
        )


async def incumplen(db: AsyncSession, cat: Categoria, equipo_id: int | None = None) -> list[str]:
    """Jugadores activos de la categoría (o de un equipo) que no cumplirían la regla del año."""
    if not regla_activa(cat):
        return []
    q = select(Jugador.nombre, Jugador.anio_nacimiento, Equipo.nombre).join(Equipo, Equipo.id == Jugador.equipo_id).where(
        Jugador.activo, (Jugador.anio_nacimiento.is_(None)) | (Jugador.anio_nacimiento > cat.anio_minimo)
    )
    q = q.where(Equipo.id == equipo_id) if equipo_id else q.where(Equipo.categoria_id == cat.id)
    return [
        f"{n} ({e}) — {a if a else 'sin año'}" for n, a, e in (await db.execute(q)).all()
    ]


def _cat(c: Categoria, n: int = 0) -> dict:
    return {"id": c.id, "nombre": c.nombre, "limita_anio": c.limita_anio, "anio_minimo": c.anio_minimo, "num_equipos": n}


async def _get(db: AsyncSession, cid: int) -> Categoria:
    c = await db.get(Categoria, cid)
    if not c:
        raise HTTPException(404, "Categoría no encontrada")
    return c


async def _nombre_libre(db: AsyncSession, nombre: str, excepto: int | None = None):
    q = select(Categoria.id).where(func.lower(Categoria.nombre) == nombre.lower())
    if excepto:
        q = q.where(Categoria.id != excepto)
    if (await db.execute(q)).first():
        raise HTTPException(409, "Ya existe una categoría con ese nombre")


@router.get("/categorias")
async def listar(db: AsyncSession = Depends(get_db), amb: set[int] | None = Depends(ambito_actual)):
    cuentas = dict((await db.execute(
        select(Equipo.categoria_id, func.count()).where(Equipo.categoria_id.is_not(None)).group_by(Equipo.categoria_id)
    )).all())
    q = select(Categoria).order_by(Categoria.nombre)
    if amb is not None:
        q = q.where(Categoria.id.in_(select(Equipo.categoria_id).where(Equipo.id.in_(amb))))
    return [_cat(c, cuentas.get(c.id, 0)) for c in (await db.execute(q)).scalars()]


@router.post("/categorias", status_code=201, dependencies=[Depends(solo_admin)])
async def crear(data: CategoriaIn, db: AsyncSession = Depends(get_db)):
    await _nombre_libre(db, data.nombre)
    c = Categoria(**data.model_dump())
    db.add(c)
    await db.commit()
    return _cat(c)


@router.put("/categorias/{cid}", dependencies=[Depends(solo_admin)])
async def editar(cid: int, data: CategoriaIn, db: AsyncSession = Depends(get_db)):
    c = await _get(db, cid)
    await _nombre_libre(db, data.nombre, excepto=cid)
    c.nombre, c.limita_anio, c.anio_minimo = data.nombre, data.limita_anio, data.anio_minimo
    malos = await incumplen(db, c)
    if malos:
        extra = f" y {len(malos) - 5} más" if len(malos) > 5 else ""
        raise HTTPException(
            409,
            "Hay jugadores que no cumplirían esta regla: " + "; ".join(malos[:5]) + extra
            + ". Corrige su año de nacimiento primero.",
        )
    await db.commit()
    return _cat(c)


@router.delete("/categorias/{cid}", status_code=204, dependencies=[Depends(solo_admin)])
async def eliminar(cid: int, db: AsyncSession = Depends(get_db)):
    c = await _get(db, cid)
    if (await db.execute(select(Equipo.id).where(Equipo.categoria_id == cid).limit(1))).first():
        raise HTTPException(409, "La categoría tiene equipos asignados. Cámbialos de categoría primero.")
    await db.delete(c)
    await db.commit()

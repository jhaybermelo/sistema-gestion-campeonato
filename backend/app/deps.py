from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Equipo, Usuario, UsuarioEquipo
from app.security import leer_token

_bearer = HTTPBearer(auto_error=False)


async def usuario_actual(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer), db: AsyncSession = Depends(get_db)
) -> Usuario:
    uid = leer_token(cred.credentials) if cred else None
    u = await db.get(Usuario, uid) if uid else None
    if not u or not u.activo:
        raise HTTPException(401, "Sesión no válida o vencida. Inicia sesión de nuevo.")
    return u


async def solo_admin(u: Usuario = Depends(usuario_actual)) -> Usuario:
    if u.rol != "admin":
        raise HTTPException(403, "Esta acción es solo para administradores")
    return u


async def operador(u: Usuario = Depends(usuario_actual)) -> Usuario:
    """Quien puede operar un partido (cronómetro, eventos, planilla del partido): admin y planillero."""
    if u.rol == "delegado":
        raise HTTPException(403, "Los delegados no pueden operar partidos")
    return u


async def equipos_de(db: AsyncSession, usuario_id: int) -> set[int]:
    r = await db.execute(select(UsuarioEquipo.equipo_id).where(UsuarioEquipo.usuario_id == usuario_id))
    return set(r.scalars())


async def equipos_visibles(db: AsyncSession, u: Usuario) -> set[int] | None:
    """Equipos que el usuario puede ver. None = sin restricción (admin y planillero).
    Un delegado ve sus equipos y los demás equipos de las categorías de sus equipos."""
    if u.rol != "delegado":
        return None
    propios = await equipos_de(db, u.id)
    if not propios:
        return set()
    cats = set((await db.execute(
        select(Equipo.categoria_id).where(Equipo.id.in_(propios), Equipo.categoria_id.is_not(None))
    )).scalars())
    q = select(Equipo.id).where(Equipo.id.in_(propios))
    if cats:
        q = select(Equipo.id).where(Equipo.id.in_(propios) | Equipo.categoria_id.in_(cats))
    return set((await db.execute(q)).scalars())


async def ambito_actual(u: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)) -> set[int] | None:
    return await equipos_visibles(db, u)

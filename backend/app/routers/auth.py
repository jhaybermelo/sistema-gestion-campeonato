import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import usuario_actual
from app.models import Usuario, UsuarioEquipo
from app.schemas import In
from app.security import HASH_RELLENO, crear_token, hash_password, verificar_password

router = APIRouter(prefix="/auth", tags=["auth"])

# Freno contra adivinar claves: 5 fallos por usuario+IP cada 5 minutos.
_fallos: dict[str, list[float]] = {}
MAX_FALLOS, VENTANA = 5, 300


class LoginIn(In):
    usuario: str = Field(min_length=1, max_length=30)
    password: str = Field(min_length=1, max_length=72)


class CambioPassword(In):
    actual: str = Field(min_length=1, max_length=72)
    nueva: str = Field(min_length=8, max_length=72)


async def perfiles(db: AsyncSession, usuarios: list[Usuario]) -> list[dict]:
    """Datos públicos de usuarios (nunca el hash), con los equipos que representa cada delegado."""
    ids = [u.id for u in usuarios]
    equipos: dict[int, list[int]] = defaultdict(list)
    if ids:
        q = select(UsuarioEquipo.usuario_id, UsuarioEquipo.equipo_id).where(UsuarioEquipo.usuario_id.in_(ids))
        for uid, eid in (await db.execute(q)).all():
            equipos[uid].append(eid)
    return [
        {"id": u.id, "usuario": u.usuario, "nombre": u.nombre, "rol": u.rol, "activo": u.activo,
         "equipo_ids": sorted(equipos[u.id])}
        for u in usuarios
    ]


async def perfil(db: AsyncSession, u: Usuario) -> dict:
    return (await perfiles(db, [u]))[0]


@router.post("/login")
async def login(data: LoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    clave = f"{data.usuario.lower()}|{request.client.host if request.client else '?'}"
    ahora = time.time()
    recientes = [t for t in _fallos.get(clave, []) if ahora - t < VENTANA]
    if len(recientes) >= MAX_FALLOS:
        raise HTTPException(429, "Demasiados intentos fallidos. Espera 5 minutos e inténtalo de nuevo.")
    u = (await db.execute(select(Usuario).where(Usuario.usuario == data.usuario.lower()))).scalar_one_or_none()
    ok = await run_in_threadpool(verificar_password, data.password, u.password_hash if u else HASH_RELLENO)
    if not (u and ok and u.activo):
        recientes.append(ahora)
        _fallos[clave] = recientes
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    _fallos.pop(clave, None)
    return {"token": crear_token(u.id), "usuario": await perfil(db, u)}


@router.get("/me")
async def me(u: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)):
    return await perfil(db, u)


@router.post("/cambiar-password", status_code=204)
async def cambiar_password(
    data: CambioPassword, u: Usuario = Depends(usuario_actual), db: AsyncSession = Depends(get_db)
):
    if not await run_in_threadpool(verificar_password, data.actual, u.password_hash):
        raise HTTPException(400, "La contraseña actual no es correcta")
    u.password_hash = await run_in_threadpool(hash_password, data.nueva)
    await db.commit()

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import solo_admin
from app.models import Usuario
from app.routers.auth import perfil
from app.schemas import In
from app.security import hash_password

router = APIRouter(prefix="/usuarios", tags=["usuarios"], dependencies=[Depends(solo_admin)])

Rol = Literal["admin", "planillero"]


class UsuarioNuevo(In):
    usuario: str = Field(pattern=r"^[A-Za-z0-9._-]{3,30}$")
    nombre: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=72)
    rol: Rol = "planillero"


class UsuarioEdit(In):
    nombre: str = Field(min_length=1, max_length=100)
    rol: Rol
    activo: bool = True
    password: str | None = Field(None, min_length=8, max_length=72)  # solo si se quiere restablecer


async def _otros_admins(db: AsyncSession, excepto: int) -> int:
    q = select(func.count()).select_from(Usuario).where(Usuario.rol == "admin", Usuario.activo, Usuario.id != excepto)
    return (await db.execute(q)).scalar_one()


@router.get("")
async def listar(db: AsyncSession = Depends(get_db)):
    return [perfil(u) for u in (await db.execute(select(Usuario).order_by(Usuario.nombre))).scalars()]


@router.post("", status_code=201)
async def crear(data: UsuarioNuevo, db: AsyncSession = Depends(get_db)):
    nombre_usuario = data.usuario.lower()
    if (await db.execute(select(Usuario.id).where(Usuario.usuario == nombre_usuario))).first():
        raise HTTPException(409, "Ya existe un usuario con ese nombre de acceso")
    u = Usuario(
        usuario=nombre_usuario, nombre=data.nombre, rol=data.rol,
        password_hash=await run_in_threadpool(hash_password, data.password),
    )
    db.add(u)
    await db.commit()
    return perfil(u)


@router.put("/{uid}")
async def editar(uid: int, data: UsuarioEdit, yo: Usuario = Depends(solo_admin), db: AsyncSession = Depends(get_db)):
    u = await db.get(Usuario, uid)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    pierde_admin = u.rol == "admin" and u.activo and (data.rol != "admin" or not data.activo)
    if pierde_admin and await _otros_admins(db, uid) == 0:
        raise HTTPException(400, "Debe quedar al menos un administrador activo")
    if u.id == yo.id and not data.activo:
        raise HTTPException(400, "No puedes desactivar tu propio usuario")
    u.nombre, u.rol, u.activo = data.nombre, data.rol, data.activo
    if data.password:
        u.password_hash = await run_in_threadpool(hash_password, data.password)
    await db.commit()
    return perfil(u)


@router.delete("/{uid}", status_code=204)
async def eliminar(uid: int, yo: Usuario = Depends(solo_admin), db: AsyncSession = Depends(get_db)):
    u = await db.get(Usuario, uid)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    if u.id == yo.id:
        raise HTTPException(400, "No puedes eliminar tu propio usuario")
    if u.rol == "admin" and u.activo and await _otros_admins(db, uid) == 0:
        raise HTTPException(400, "Debe quedar al menos un administrador activo")
    await db.delete(u)
    await db.commit()

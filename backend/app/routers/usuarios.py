from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import Field, model_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import solo_admin
from app.models import Equipo, Usuario, UsuarioEquipo
from app.routers.auth import perfil, perfiles
from app.schemas import In
from app.security import hash_password

router = APIRouter(prefix="/usuarios", tags=["usuarios"], dependencies=[Depends(solo_admin)])

Rol = Literal["admin", "planillero", "delegado"]


class _ConEquipos(In):
    rol: Rol = "planillero"
    equipo_ids: list[int] = []

    @model_validator(mode="after")
    def _delegado_necesita_equipos(self):
        if self.rol == "delegado" and not self.equipo_ids:
            raise ValueError("Un delegado debe tener al menos un equipo asignado")
        return self


class UsuarioNuevo(_ConEquipos):
    usuario: str = Field(pattern=r"^[A-Za-z0-9._-]{3,30}$")
    nombre: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=72)


class UsuarioEdit(_ConEquipos):
    nombre: str = Field(min_length=1, max_length=100)
    activo: bool = True
    password: str | None = Field(None, min_length=8, max_length=72)  # solo si se quiere restablecer


async def _otros_admins(db: AsyncSession, excepto: int) -> int:
    q = select(func.count()).select_from(Usuario).where(Usuario.rol == "admin", Usuario.activo, Usuario.id != excepto)
    return (await db.execute(q)).scalar_one()


async def _asignar_equipos(db: AsyncSession, usuario_id: int, rol: str, equipo_ids: list[int]):
    """Reemplaza los equipos del usuario. Solo los delegados tienen equipos."""
    await db.execute(delete(UsuarioEquipo).where(UsuarioEquipo.usuario_id == usuario_id))
    if rol != "delegado":
        return
    ids = sorted(set(equipo_ids))
    existentes = set((await db.execute(select(Equipo.id).where(Equipo.id.in_(ids)))).scalars())
    if existentes != set(ids):
        raise HTTPException(400, "Alguno de los equipos seleccionados no existe")
    for eid in ids:
        db.add(UsuarioEquipo(usuario_id=usuario_id, equipo_id=eid))


@router.get("")
async def listar(db: AsyncSession = Depends(get_db)):
    usuarios = list((await db.execute(select(Usuario).order_by(Usuario.nombre))).scalars())
    return await perfiles(db, usuarios)


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
    await db.flush()
    await _asignar_equipos(db, u.id, data.rol, data.equipo_ids)
    await db.commit()
    return await perfil(db, u)


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
    await _asignar_equipos(db, uid, data.rol, data.equipo_ids)
    await db.commit()
    return await perfil(db, u)


@router.delete("/{uid}", status_code=204)
async def eliminar(uid: int, yo: Usuario = Depends(solo_admin), db: AsyncSession = Depends(get_db)):
    u = await db.get(Usuario, uid)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    if u.id == yo.id:
        raise HTTPException(400, "No puedes eliminar tu propio usuario")
    if u.rol == "admin" and u.activo and await _otros_admins(db, uid) == 0:
        raise HTTPException(400, "Debe quedar al menos un administrador activo")
    await db.execute(delete(UsuarioEquipo).where(UsuarioEquipo.usuario_id == uid))
    await db.delete(u)
    await db.commit()

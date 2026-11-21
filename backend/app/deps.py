from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Usuario
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

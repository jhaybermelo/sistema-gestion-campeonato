import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import jwt

from app.config import settings

ALGORITMO = "HS256"


def _clave_secreta() -> str:
    if settings.SECRET_KEY:
        return settings.SECRET_KEY
    f = Path("data") / "secret.key"
    if not f.exists():
        f.parent.mkdir(exist_ok=True)
        f.write_text(secrets.token_urlsafe(48))
    return f.read_text().strip()


SECRET = _clave_secreta()

# Hash de relleno: se compara siempre, exista o no el usuario, para no revelar cuáles existen.
HASH_RELLENO = bcrypt.hashpw(b"relleno", bcrypt.gensalt()).decode()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verificar_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def crear_token(usuario_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.TOKEN_HORAS)
    return jwt.encode({"sub": str(usuario_id), "exp": exp}, SECRET, algorithm=ALGORITMO)


def leer_token(token: str) -> int | None:
    try:
        return int(jwt.decode(token, SECRET, algorithms=[ALGORITMO])["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None

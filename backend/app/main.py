import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from sqlalchemy import inspect, text
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import AsyncSessionLocal, Base, engine
from app.deps import usuario_actual
from app.models import Config, Usuario
from app.routers import auth, usuarios
from app.security import hash_password
import secrets
from app.routers import categorias, equipos, partidos, reportes


def _migrar(conn):
    """Agrega columnas nuevas a bases de datos ya creadas (sin perder datos)."""
    insp = inspect(conn)
    nuevas = {
        "equipos": [("categoria_id", "INTEGER REFERENCES categorias(id)")],
        "jugadores": [("anio_nacimiento", "INTEGER")],
        "partidos": [
            ("fase", "VARCHAR(20) NOT NULL DEFAULT 'grupos'"),
            ("descanso_seg", "INTEGER NOT NULL DEFAULT 600"),
            ("descanso_desde", "TIMESTAMP"),
            ("tm_equipo_id", "INTEGER"),
            ("tm_desde", "TIMESTAMP"),
        ],
        "eventos": [("motivo", "VARCHAR(20)")],
        "config": [
            ("max_jugadores", "INTEGER NOT NULL DEFAULT 12"),
            ("min_jugadores", "INTEGER NOT NULL DEFAULT 0"),
            ("fase_goleador", "VARCHAR(20) NOT NULL DEFAULT 'grupos'"),
            ("fase_valla", "VARCHAR(20) NOT NULL DEFAULT 'semifinal'"),
            ("descanso_min", "INTEGER NOT NULL DEFAULT 10"),
        ],
    }
    for tabla, cols in nuevas.items():
        existentes = {c["name"] for c in insp.get_columns(tabla)}
        for nombre, ddl in cols:
            if nombre not in existentes:
                conn.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {ddl}"))


async def _crear_admin_inicial(db):
    """Si no hay usuarios, crea el administrador inicial."""
    from sqlalchemy import func, select
    if (await db.execute(select(func.count()).select_from(Usuario))).scalar_one():
        return
    clave = settings.ADMIN_PASSWORD or secrets.token_urlsafe(9)
    db.add(Usuario(usuario=settings.ADMIN_USER.lower(), nombre="Administrador", rol="admin",
                   password_hash=hash_password(clave)))
    await db.commit()
    print("=" * 60)
    print(f" ADMINISTRADOR INICIAL CREADO  usuario: {settings.ADMIN_USER.lower()}")
    if not settings.ADMIN_PASSWORD:
        print(f" contraseña generada: {clave}")
        print(" (cámbiala desde 'Mi cuenta' después de entrar)")
    print("=" * 60, flush=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.DATABASE_URL.startswith("sqlite"):
        os.makedirs("data", exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrar)
    async with AsyncSessionLocal() as db:
        if not await db.get(Config, 1):
            db.add(Config(id=1))
            await db.commit()
        await _crear_admin_inicial(db)
    yield


app = FastAPI(title="Sistema de Campeonato de Fútbol de Salón", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"]
)

app.include_router(auth.router, prefix="/api")
app.include_router(usuarios.router, prefix="/api")  # ya exige administrador
for r in (categorias.router, equipos.router, partidos.router, reportes.router):
    app.include_router(r, prefix="/api", dependencies=[Depends(usuario_actual)])

# Si el frontend ya fue compilado (frontend/dist), el mismo servidor lo entrega.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{ruta:path}", include_in_schema=False)
    async def spa(ruta: str):
        f = DIST / ruta
        return FileResponse(f if ruta and f.is_file() else DIST / "index.html")

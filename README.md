# Sistema de Gestión de Campeonato (Fútbol de Salón)

Registro de categorías, equipos y jugadores; partidos con cronómetro en vivo, planilla de juego,
goles, tarjetas (amarilla, azul, roja) y faltas; tabla de posiciones, goleadores y acta imprimible.

- **Backend:** Python, FastAPI, SQLAlchemy (async). SQLite por defecto, PostgreSQL opcional.
- **Frontend:** React, TypeScript, Vite, Tailwind, TanStack Query.

## Roles
| Rol | Puede |
|---|---|
| **Administrador** | Todo: categorías, equipos, jugadores, partidos, ajustes, usuarios, respaldo. |
| **Planillero** | Consultar y operar partidos (cronómetro, planilla, eventos). No crea ni borra datos maestros. |

Todo el sistema exige iniciar sesión.

## Ejecutar en local

```bash
# 1) Backend
cd backend
python -m venv venv
venv/Scripts/pip install -r requirements.txt      # Linux/Mac: venv/bin/pip
venv/Scripts/python -m uvicorn app.main:app --port 8000

# 2) Frontend (para desarrollo con recarga en caliente)
cd frontend
npm install
npm run dev            # http://localhost:5173  (usa el backend en :8000)

# o compilar y que el backend lo sirva todo en http://localhost:8000
npm run build
```

La **primera vez** que arranca sin usuarios crea el administrador inicial:
usuario `admin` y una contraseña aleatoria que se imprime en la consola del servidor
(o la que definas en `ADMIN_PASSWORD`). Cámbiala desde *Mi cuenta*.

## Configuración (variables de entorno)

| Variable | Por defecto | Descripción |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/campeonato.db` | Ej. PostgreSQL: `postgresql+asyncpg://user:clave@host:5432/campeonato` |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / aleatoria | Solo se usan si no existe ningún usuario. |
| `SECRET_KEY` | se genera en `data/secret.key` | Firma de sesiones. |
| `TOKEN_HORAS` | `12` | Duración de la sesión. |

## Pruebas del backend

```bash
cd backend
export ADMIN_PASSWORD=Prueba-1234
DATABASE_URL=sqlite+aiosqlite:///./data/prueba.db venv/Scripts/python tests/prueba_flujo.py
# también: tests/prueba_categorias.py, tests/prueba_auth.py (usar una base nueva en cada ejecución)
```

## Datos
La base de datos vive en `backend/data/` y **no se versiona**. Haz copias con el botón
*Ajustes → Descargar respaldo* (JSON).

`prototipo-anterior.html` es el primer prototipo de una sola página, conservado solo como referencia.

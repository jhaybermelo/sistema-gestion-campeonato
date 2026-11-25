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
| **Delegado** | Representa a uno o varios equipos (pueden ser de distintas categorías). Inscribe a los jugadores de **su** equipo; ve las planillas de los demás equipos de sus categorías, los partidos, la tabla, los goleadores y la valla menos vencida. No opera partidos. |

Todo el sistema exige iniciar sesión. Un delegado solo ve datos de las categorías de sus equipos.

## Planilla de jugadores
- Cada equipo inscribe como máximo **12 jugadores** (se cambia en *Ajustes → Máximo de jugadores por planilla*).
- El **mínimo de jugadores para jugar** también es configurable en *Ajustes* (0 = sin mínimo; la AMF indica 7). Si no se cumple, el partido no se puede iniciar.
- La planilla **se cierra cuando el equipo inicia su primer partido**: desde ahí el delegado ya no puede inscribir, editar ni dar de baja. El administrador sí puede corregirla (respetando el máximo).
- Antes de que un partido inicie, su planilla se sincroniza con los jugadores inscritos (altas, bajas y correcciones).
- Si la categoría tiene *año mínimo de competencia*, se valida el año de nacimiento al inscribir.

## Reglas de juego AMF
Basadas en las [Reglas de Juego de Fútbol de Salón AMF (FECOLFUTSALON, actualizado 2016)](https://www.favafutsal.com/galeria/REGLAS%20DE%20JUEGO%20ACTUALIZADAS%20AMF%202016-1.pdf).
Si tu liga usa otra versión, conviene contrastarla.

| Regla | Qué hace el sistema |
|---|---|
| **Tiempo muerto** (Regla 6) | 1 minuto, **1 por equipo y por tiempo**, no se acumula. Detiene el cronómetro y muestra un contador de 60 s. |
| **Descanso** (Regla 6) | Al terminar el 1.er tiempo arranca **solo** el descanso de 10 min (configurable). El 2.º tiempo lo inicia el planillero. |
| **Faltas del equipo** (Regla 10) | 5 por tiempo, se reinician en el 2.º. Desde la 6.ª: tiro libre sin barrera (avisa en la 5.ª y la 6.ª). |
| **Faltas del jugador** (Regla 9) | Se acumulan en todo el partido. Aviso en la 4.ª; **la 5.ª genera una tarjeta azul automática** (sustitución obligatoria: no vuelve a jugar). Cuenta en la tabla de tarjetas. |
| **Doble amarilla** (Regla 9) | La 2.ª amarilla genera una **azul automática** (descalificación con sustitución). |
| **Azul y roja** | El jugador queda *fuera* del partido y no puede registrar más acciones. El equipo puede sustituirlo (sin inferioridad numérica). |

Las tarjetas automáticas no se borran sueltas: se eliminan quitando la falta o la amarilla que las originó.

## Fases y rankings
Cada partido tiene una **fase**: Fase de grupos, Octavos, Cuartos, Semifinal, Tercer puesto o Final.
En *Ajustes* se elige desde qué fase cuenta cada ranking; cuenta esa fase y las posteriores
(«Semifinal» incluye semifinal, tercer puesto y final).

| Ranking | Cálculo | Por defecto |
|---|---|---|
| **Goleador** | goles ÷ partidos finalizados de su equipo (mayor promedio primero) | desde la fase de grupos |
| **Valla menos vencida** | goles en contra ÷ partidos del equipo (menor promedio primero) | desde la semifinal |

La tabla de posiciones y las tarjetas cuentan todos los partidos.

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
# también: tests/prueba_categorias.py, tests/prueba_auth.py, tests/prueba_delegado.py, tests/prueba_amf.py
# (usar una base nueva en cada ejecución)
```

## Datos
La base de datos vive en `backend/data/` y **no se versiona**. Haz copias con el botón
*Ajustes → Descargar respaldo* (JSON).

`prototipo-anterior.html` es el primer prototipo de una sola página, conservado solo como referencia.

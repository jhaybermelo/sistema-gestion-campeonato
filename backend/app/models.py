from __future__ import annotations

from datetime import date, datetime, time, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Usuario(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    usuario: Mapped[str] = mapped_column(String(30), unique=True)  # siempre en minúsculas
    nombre: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(100))
    rol: Mapped[str] = mapped_column(String(15), default="planillero")  # admin | planillero | delegado
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class UsuarioEquipo(Base):
    """Equipos que representa un delegado (puede tener varios, de distintas categorías)."""

    __tablename__ = "usuario_equipos"
    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), index=True)
    equipo_id: Mapped[int] = mapped_column(ForeignKey("equipos.id"), index=True)


class Config(Base):
    __tablename__ = "config"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150), default="Campeonato de Fútbol de Salón")
    duracion_min: Mapped[int] = mapped_column(Integer, default=20)
    num_tiempos: Mapped[int] = mapped_column(Integer, default=2)
    limite_faltas: Mapped[int] = mapped_column(Integer, default=5)
    pts_ganado: Mapped[int] = mapped_column(Integer, default=3)
    pts_empate: Mapped[int] = mapped_column(Integer, default=1)
    pts_perdido: Mapped[int] = mapped_column(Integer, default=0)
    max_jugadores: Mapped[int] = mapped_column(Integer, default=12)  # tamaño de la planilla de cada equipo
    fase_goleador: Mapped[str] = mapped_column(String(20), default="grupos")  # el ranking cuenta desde esta fase
    fase_valla: Mapped[str] = mapped_column(String(20), default="semifinal")
    descanso_min: Mapped[int] = mapped_column(Integer, default=10)  # descanso entre periodos (AMF: 10 min)


class Categoria(Base):
    __tablename__ = "categorias"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80), unique=True)
    # Si limita_anio está marcado, solo pueden jugar quienes nacieron en anio_minimo o antes.
    limita_anio: Mapped[bool] = mapped_column(Boolean, default=False)
    anio_minimo: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Equipo(Base):
    __tablename__ = "equipos"
    id: Mapped[int] = mapped_column(primary_key=True)
    categoria_id: Mapped[int | None] = mapped_column(ForeignKey("categorias.id"), nullable=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True)
    delegado: Mapped[str] = mapped_column(String(100), default="")
    telefono: Mapped[str] = mapped_column(String(40), default="")
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Jugador(Base):
    __tablename__ = "jugadores"
    id: Mapped[int] = mapped_column(primary_key=True)
    equipo_id: Mapped[int] = mapped_column(ForeignKey("equipos.id"), index=True)
    numero: Mapped[int] = mapped_column(Integer)
    nombre: Mapped[str] = mapped_column(String(120))
    documento: Mapped[str] = mapped_column(String(40), default="")
    anio_nacimiento: Mapped[int | None] = mapped_column(Integer, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Partido(Base):
    __tablename__ = "partidos"
    id: Mapped[int] = mapped_column(primary_key=True)
    local_id: Mapped[int] = mapped_column(ForeignKey("equipos.id"))
    visitante_id: Mapped[int] = mapped_column(ForeignKey("equipos.id"))
    fecha: Mapped[date] = mapped_column(Date)
    hora: Mapped[time | None] = mapped_column(Time, nullable=True)
    cancha: Mapped[str] = mapped_column(String(80), default="")
    jornada: Mapped[str] = mapped_column(String(80), default="")
    fase: Mapped[str] = mapped_column(String(20), default="grupos")
    estado: Mapped[str] = mapped_column(String(15), default="programado")  # programado|en_juego|finalizado
    # Cronómetro (cuenta regresiva). La fuente de verdad es el servidor.
    duracion_seg: Mapped[int] = mapped_column(Integer)
    num_tiempos: Mapped[int] = mapped_column(Integer)
    periodo: Mapped[int] = mapped_column(Integer, default=1)
    restante_seg: Mapped[float] = mapped_column(Float)  # restante al momento de corriendo_desde
    corriendo: Mapped[bool] = mapped_column(Boolean, default=False)
    corriendo_desde: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Descanso entre periodos: arranca solo cuando el reloj llega a 0 (instante exacto en descanso_desde).
    descanso_seg: Mapped[int] = mapped_column(Integer, default=600)
    descanso_desde: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Tiempo muerto en curso (1 minuto); se limpia al reanudar el juego.
    tm_equipo_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tm_desde: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PartidoJugador(Base):
    """Planilla de juego: copia de los jugadores del equipo al crear el partido."""

    __tablename__ = "partido_jugadores"
    id: Mapped[int] = mapped_column(primary_key=True)
    partido_id: Mapped[int] = mapped_column(ForeignKey("partidos.id"), index=True)
    equipo_id: Mapped[int] = mapped_column(ForeignKey("equipos.id"))
    jugador_id: Mapped[int] = mapped_column(ForeignKey("jugadores.id"))
    numero: Mapped[int] = mapped_column(Integer)
    nombre: Mapped[str] = mapped_column(String(120))
    documento: Mapped[str] = mapped_column(String(40), default="")
    convocado: Mapped[bool] = mapped_column(Boolean, default=True)


class Evento(Base):
    __tablename__ = "eventos"
    id: Mapped[int] = mapped_column(primary_key=True)
    partido_id: Mapped[int] = mapped_column(ForeignKey("partidos.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(14))  # gol|autogol|amarilla|azul|roja|falta|tiempo_muerto
    # Eventos automáticos de las reglas AMF: azul por 5.ª falta personal o por doble amarilla.
    motivo: Mapped[str | None] = mapped_column(String(20), nullable=True)  # quinta_falta | doble_amarilla
    equipo_id: Mapped[int] = mapped_column(ForeignKey("equipos.id"))
    pj_id: Mapped[int | None] = mapped_column(ForeignKey("partido_jugadores.id"), nullable=True)
    periodo: Mapped[int] = mapped_column(Integer)
    segundo: Mapped[int] = mapped_column(Integer)  # segundos transcurridos dentro del periodo
    creado: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

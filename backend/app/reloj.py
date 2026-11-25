"""Lógica del cronómetro (cuenta regresiva), del descanso y del tiempo muerto.
El servidor es la fuente de verdad: así el reloj sigue igual si se recarga la página o se mira desde otro equipo."""
from datetime import datetime, timedelta, timezone

from app.models import Partido

TIEMPO_MUERTO_SEG = 60  # AMF, Regla 6: tiempo muerto de un (1) minuto


def ahora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def restante(p: Partido) -> float:
    if p.corriendo and p.corriendo_desde:
        return max(0.0, p.restante_seg - (ahora() - p.corriendo_desde).total_seconds())
    return float(p.restante_seg)


def congelar(p: Partido) -> None:
    p.restante_seg = restante(p)
    p.corriendo = False
    p.corriendo_desde = None


def iniciar_descanso(p: Partido, desde: datetime | None = None) -> None:
    """Arranca el descanso entre periodos (solo si aún queda otro periodo por jugar)."""
    if p.estado == "en_juego" and p.periodo < p.num_tiempos:
        p.descanso_desde = desde or ahora()


def normalizar(p: Partido) -> None:
    """Si el tiempo se agotó mientras corría, detiene el reloj en 0 y arranca el descanso
    en el instante exacto en que terminó el periodo (aunque nadie estuviera mirando)."""
    if p.corriendo and restante(p) <= 0:
        fin = (p.corriendo_desde or ahora()) + timedelta(seconds=p.restante_seg)
        congelar(p)
        iniciar_descanso(p, fin)


def estado_descanso(p: Partido) -> dict | None:
    if not p.descanso_desde or p.estado != "en_juego":
        return None
    rest = max(0.0, p.descanso_seg - (ahora() - p.descanso_desde).total_seconds())
    return {"restante_seg": round(rest, 2), "duracion_seg": p.descanso_seg, "terminado": rest <= 0}


def estado_tiempo_muerto(p: Partido) -> dict | None:
    if not p.tm_desde or not p.tm_equipo_id:
        return None
    rest = max(0.0, TIEMPO_MUERTO_SEG - (ahora() - p.tm_desde).total_seconds())
    return {"equipo_id": p.tm_equipo_id, "restante_seg": round(rest, 2), "terminado": rest <= 0}

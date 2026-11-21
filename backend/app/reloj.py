"""Lógica del cronómetro (cuenta regresiva). El servidor es la fuente de verdad."""
from datetime import datetime, timezone

from app.models import Partido


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


def normalizar(p: Partido) -> None:
    """Si el tiempo se agotó mientras corría, detiene el reloj en 0."""
    if p.corriendo and restante(p) <= 0:
        congelar(p)

from datetime import date, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class In(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class ConfigIn(In):
    nombre: str = Field(min_length=1, max_length=150)
    duracion_min: int = Field(ge=1, le=90)
    num_tiempos: int = Field(ge=1, le=4)
    limite_faltas: int = Field(ge=1, le=50)
    pts_ganado: int = Field(ge=0, le=10)
    pts_empate: int = Field(ge=0, le=10)
    pts_perdido: int = Field(ge=0, le=10)


class CategoriaIn(In):
    nombre: str = Field(min_length=1, max_length=80)
    limita_anio: bool = False
    anio_minimo: int | None = Field(None, ge=1900, le=2100)

    @model_validator(mode="after")
    def _exige_anio(self):
        if self.limita_anio and not self.anio_minimo:
            raise ValueError("Indica el año mínimo de la categoría")
        return self


class EquipoIn(In):
    nombre: str = Field(min_length=1, max_length=100)
    categoria_id: int | None = None
    delegado: str = Field("", max_length=100)
    telefono: str = Field("", max_length=40)
    activo: bool = True


class JugadorIn(In):
    numero: int = Field(ge=0, le=999)
    nombre: str = Field(min_length=1, max_length=120)
    documento: str = Field("", max_length=40)
    anio_nacimiento: int | None = Field(None, ge=1900, le=2100)


class PartidoIn(In):
    local_id: int
    visitante_id: int
    fecha: date
    hora: time | None = None
    cancha: str = Field("", max_length=80)
    jornada: str = Field("", max_length=80)


class PartidoEdit(In):
    fecha: date
    hora: time | None = None
    cancha: str = Field("", max_length=80)
    jornada: str = Field("", max_length=80)


class EventoIn(In):
    tipo: Literal["gol", "autogol", "amarilla", "azul", "roja", "falta"]
    equipo_id: int
    pj_id: int | None = None


class AjusteIn(In):
    restante_seg: int = Field(ge=0, le=60 * 90)


class ConvocadoIn(In):
    convocado: bool


class PlanillaJugadorIn(JugadorIn):
    equipo_id: int

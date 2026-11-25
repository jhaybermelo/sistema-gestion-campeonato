"""Fases de un campeonato, en orden. Un ranking configurado "desde la semifinal" cuenta
la semifinal, el tercer puesto y la final."""

FASES = [
    ("grupos", "Fase de grupos"),
    ("octavos", "Octavos de final"),
    ("cuartos", "Cuartos de final"),
    ("semifinal", "Semifinal"),
    ("tercer_puesto", "Tercer puesto"),
    ("final", "Final"),
]
ORDEN = {clave: i for i, (clave, _) in enumerate(FASES)}
NOMBRE = dict(FASES)


def desde(fase_partido: str, fase_minima: str) -> bool:
    """True si el partido es de la fase mínima o de una posterior."""
    return ORDEN.get(fase_partido, 0) >= ORDEN.get(fase_minima, 0)

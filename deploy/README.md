# Despliegue en el droplet (pitazo.duckdns.org)

El sistema corre en un contenedor (`pitazo-app`) dentro de `/opt/pitazo`, **sin Caddy propio**:
lo atiende el Caddy del sistema de inventario (`/opt/Sistema-Inventario`), que ya ocupa los puertos 80/443.

## Actualizar a una versión nueva (desde el equipo de desarrollo)

```bash
cd frontend && npm run build              # el servidor tiene 1 GB: el frontend se compila aquí
# armar el paquete: deploy/Dockerfile, deploy/docker-compose.yml, backend/requirements.txt,
# backend/app (sin __pycache__) y frontend/dist, y subirlo a /opt/pitazo
ssh -i ~/.ssh/<clave-del-droplet> root@<IP-del-droplet> \
  "cd /opt/pitazo && docker compose up -d --build"
```

Los datos viven en el volumen Docker `pitazo_data` (SQLite) y **no se pierden** al actualizar.
Si una versión agrega columnas o tablas, el servidor las migra solo al arrancar (probado contra una base de la versión anterior).

## Antes de actualizar: respaldo y punto de retorno (el campeonato tiene datos reales)

```bash
# Copia consistente de la base (usa la API de respaldo de SQLite; la base está en modo WAL)
docker exec pitazo-app python -c "import sqlite3; o=sqlite3.connect('/srv/backend/data/campeonato.db'); d=sqlite3.connect('/srv/backend/data/_tmp.db'); o.backup(d); d.close()"
docker cp pitazo-app:/srv/backend/data/_tmp.db /opt/pitazo/backups/campeonato-$(date +%Y%m%d-%H%M).db
docker exec pitazo-app rm -f /srv/backend/data/_tmp.db
docker tag pitazo-pitazo-app:latest pitazo-pitazo-app:anterior      # imagen a la que volver
```

**Volver a la versión anterior** si algo falla:

```bash
cd /opt/pitazo && docker tag pitazo-pitazo-app:anterior pitazo-pitazo-app:latest
docker compose up -d --no-build
# si además hay que restaurar los datos: parar el contenedor y reemplazar campeonato.db del volumen
# pitazo_data por el respaldo de /opt/pitazo/backups
```

## Una sola vez: bloque en el Caddyfile del inventario

Se agregó al final de `/opt/Sistema-Inventario/Caddyfile` (con copia `Caddyfile.bak-*` al lado):

```
pitazo.duckdns.org {
	encode gzip
	reverse_proxy pitazo-app:8000
}
```

Recargar sin cortar el servicio (validar primero):

```bash
docker exec sistema-inventario-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec sistema-inventario-caddy-1 caddy reload   --config /etc/caddy/Caddyfile --adapter caddyfile
```

> No editar el Caddyfile con `sed -i` ni reemplazando el archivo: es un montaje de un solo archivo
> y cambiarle el inodo rompe el montaje. Usar `>>` (añadir al final).

## Deshacer

```bash
cp /opt/Sistema-Inventario/Caddyfile.bak-ANTES-DE-PITAZO /opt/Sistema-Inventario/Caddyfile   # (mismo inodo: usar cat >, no mv)
docker exec sistema-inventario-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
cd /opt/pitazo && docker compose down        # (agregar -v solo si se quieren borrar los datos)
```

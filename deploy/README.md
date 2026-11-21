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

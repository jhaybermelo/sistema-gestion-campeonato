# Pruebas de navegador (Playwright)

Usan el Microsoft Edge instalado en el equipo (`channel: 'msedge'`), no descargan navegadores.

```bash
# 1) Compilar el frontend (el backend lo sirve)
cd frontend && npm run build

# 2) Levantar el backend con una base TEMPORAL en el puerto 8001
cd backend
DATABASE_URL=sqlite+aiosqlite:///./data/e2e.db ADMIN_PASSWORD=Prueba-1234 \
  venv/Scripts/python -m uvicorn app.main:app --port 8001

# 3) Ejecutar (otra terminal)
cd e2e && npm install
ADMIN_PASSWORD=Prueba-1234 node movil.mjs   # 17 vistas x 3 tamaños: desbordes, botones táctiles, zoom iOS
ADMIN_PASSWORD=Prueba-1234 node login.mjs   # login, roles y permisos
```

Cada ejecución crea datos de prueba: **borra `backend/data/e2e.db*` antes de repetir**.
`movil.mjs` guarda capturas en `e2e/shots/`.

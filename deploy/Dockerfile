# Imagen de producción: el frontend ya viene compilado (frontend/dist), así no se necesita
# Node ni memoria extra en el servidor. Contexto de construcción: la carpeta del paquete.
FROM python:3.12-slim
WORKDIR /srv/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY frontend/dist /srv/frontend/dist
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]

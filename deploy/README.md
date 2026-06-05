# Runbook de Despliegue en VPS

Una instancia por cliente en un solo VPS con Docker + Caddy (HTTPS automático).
PostgreSQL corre en el mismo VPS: un servidor compartido con una base de datos
por cliente.

## Arquitectura

```
                 ┌─ Caddy (HTTPS :443) ─┐
cliente1.tudominio.com ─→ contenedor cliente1:3000 ─┐
cliente2.tudominio.com ─→ contenedor cliente2:3000 ─┼─→ postgres:5432
                                                     │   (cliente1_db, cliente2_db)
```

Un contenedor por cliente, cada uno con su propio archivo de entorno y su propia
base de datos en el Postgres compartido. Solo Caddy queda expuesto a internet;
los contenedores de la app y la base solo se ven en la red interna de Docker (por
eso la conexión a la base no necesita TLS).

---

## 1. DNS (una vez)

Apuntá tu dominio y un comodín a la IP pública del VPS:

| Tipo | Nombre            | Valor      |
| ---- | ----------------- | ---------- |
| A    | `tudominio.com`   | `IP_VPS`   |
| A    | `*.tudominio.com` | `IP_VPS`   |

El comodín hace que un cliente nuevo NO necesite ningún cambio de DNS: basta con
un subdominio nuevo en el Caddyfile. Caddy obtiene un certificado por subdominio
mediante el desafío HTTP.

## 2. Preparación base del VPS (una vez)

```bash
# Como root o con sudo, en Ubuntu/Debian
apt update && apt upgrade -y

# Firewall: solo SSH + HTTP + HTTPS
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# Docker + plugin de compose
curl -fsSL https://get.docker.com | sh
```

## 3. Obtener el código y construir la imagen (una vez por release)

```bash
git clone <url-de-tu-repo> agente && cd agente
docker build -t agente-facturacion:latest .
```

Reconstruí con este mismo comando después de cada actualización de código, y
luego recreá los contenedores (paso 6).

## 4. Base de datos y cada cliente

**Una vez:** definí la clave de Postgres en `deploy/.env` (está en .gitignore) y
levantá la base:

```bash
echo 'POSTGRES_PASSWORD=una-clave-fuerte' > deploy/.env
cd deploy && docker compose up -d postgres
```

**Por cada cliente,** dentro de la carpeta `deploy/`:

1. Copiá la plantilla desde la raíz: `cp ../.env.example .env.clienteN`
2. Completá sus valores reales (su token de WABA, su `AUTHORIZED_NUMBERS`, su
   `BUSINESS_NAME`...). El `DATABASE_URL` apunta al Postgres interno:
   ```env
   DATABASE_URL=postgresql://clienteN:clave-del-cliente@postgres:5432/clienteN_db
   ```
   Los archivos `.env.*` están en .gitignore.
3. Creá su base de datos y su rol:
   ```bash
   docker compose exec postgres psql -U postgres <<'SQL'
   CREATE DATABASE clienteN_db;
   CREATE USER clienteN WITH PASSWORD 'clave-del-cliente';
   GRANT ALL PRIVILEGES ON DATABASE clienteN_db TO clienteN;
   SQL
   docker compose exec postgres psql -U postgres -d clienteN_db -c "GRANT ALL ON SCHEMA public TO clienteN;"
   ```
4. Corré las migraciones desde un contenedor (el host `postgres` solo resuelve en
   la red de Docker):
   ```bash
   docker compose run --rm clienteN node scripts/setup-db.js --migrate-only
   ```
5. Agregá un bloque de servicio en `docker-compose.yml` (copiá `cliente1`,
   renombralo y apuntá `env_file` a `.env.clienteN`).
6. Agregá un bloque de sitio en `Caddyfile`:
   ```
   clienteN.tudominio.com {
       reverse_proxy clienteN:3000
   }
   ```

## 5. Levantar todo

```bash
cd deploy
docker compose up -d
```

Caddy aprovisiona el HTTPS automáticamente en la primera petición a cada
subdominio.

## 6. Actualizar tras un cambio de código

```bash
git pull
docker build -t agente-facturacion:latest .
cd deploy && docker compose up -d   # recrea los contenedores con la imagen nueva
```

## 7. Configurar el webhook de Meta (por cliente)

En la app de Meta del cliente → WhatsApp → Configuración:

- URL de callback: `https://clienteN.tudominio.com/webhook`
- Token de verificación: el `VERIFY_TOKEN` del archivo de entorno de ese cliente
- Suscribite al campo `messages`

## 8. Verificar

```bash
curl https://clienteN.tudominio.com/health        # -> {"status":"ok"}
docker compose logs -f clienteN                    # ver los logs
```

Después enviá un mensaje real de WhatsApp desde un número autorizado y confirmá
que el agente responde y que llega el PDF de la REMISIÓN.

---

## Backups (CRÍTICO)

La base vive en el VPS, así que los backups son TU responsabilidad. Sin esto, si
el VPS muere, perdés los datos de todos tus clientes.

```bash
# crontab -e  → dump de TODAS las bases a las 3 AM, comprimido
0 3 * * * cd /ruta/a/deploy && docker compose exec -T postgres pg_dumpall -U postgres | gzip > /root/backups/pg-$(date +\%F).sql.gz
```

**Copiá los backups OFF-SITE** (rclone a un bucket S3/Backblaze, o scp a otra
máquina). Un backup que vive solo en el VPS muere con el VPS.

Restore:
```bash
gunzip < pg-FECHA.sql.gz | docker compose exec -T postgres psql -U postgres
```

## Comandos útiles de operación

```bash
docker compose ps                 # estado de todas las instancias
docker compose logs -f clienteN   # ver logs de un cliente
docker compose restart clienteN   # reiniciar un cliente
docker compose up -d clienteN     # agregar/recrear un solo cliente
docker stats                      # CPU/RAM en vivo por contenedor
```

## Notas

- `restart: unless-stopped` levanta los contenedores tras un crash o reinicio del VPS.
- Caddy guarda los certificados emitidos en el volumen `caddy_data`; sobreviven a los reinicios.
- Configurá un límite de gasto mensual por cada key de OpenAI como red de seguridad
  adicional al DAILY_MESSAGE_CAP.
- Este VPS corre cómodamente 30–50 contenedores de este tipo; el cuello de botella
  es el costo de OpenAI, no la CPU/RAM.

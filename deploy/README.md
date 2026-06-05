# VPS Deployment Runbook

Instance-per-tenant on a single VPS with Docker + Caddy (automatic HTTPS).
Database is external (one Supabase project per client).

## Architecture

```
                 ┌─ Caddy (HTTPS :443) ─┐
cliente1.tudominio.com ─→ container cliente1:3000  (.env.cliente1)
cliente2.tudominio.com ─→ container cliente2:3000  (.env.cliente2)
```

One container per client, each with its own env file. Only Caddy is exposed to
the internet; app containers are reachable only on the internal Docker network.

---

## 1. DNS (once)

Point your domain and a wildcard at the VPS public IP:

| Type | Name             | Value         |
| ---- | ---------------- | ------------- |
| A    | `tudominio.com`  | `VPS_IP`      |
| A    | `*.tudominio.com`| `VPS_IP`      |

The wildcard means new clients need NO DNS change — just a new subdomain in the
Caddyfile. Caddy gets a cert per subdomain via the HTTP challenge.

## 2. VPS base setup (once)

```bash
# As root or with sudo, on Ubuntu/Debian
apt update && apt upgrade -y

# Firewall: only SSH + HTTP + HTTPS
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
```

## 3. Get the code and build the image (once per release)

```bash
git clone <your-repo-url> agente && cd agente
docker build -t agente-facturacion:latest .
```

Rebuild with this same command after every code update, then recreate the
containers (step 6).

## 4. Configure each client

For every client, in the `deploy/` folder:

1. Copy the template: `cp .env.cliente1.example .env.clienteN`
2. Fill its real values (its WABA token, its Supabase URL, its AUTHORIZED_NUMBERS,
   its BUSINESS_NAME...). The `.env.*` files are gitignored.
3. Add a service block in `docker-compose.yml` (copy `cliente1`, rename, point
   `env_file` to `.env.clienteN`).
4. Add a site block in `Caddyfile`:
   ```
   clienteN.tudominio.com {
       reverse_proxy clienteN:3000
   }
   ```

> Migrations: run once per client against its Supabase DB before first start:
> `DATABASE_URL=... node scripts/setup-db.js --migrate-only`

## 5. Start everything

```bash
cd deploy
docker compose up -d
```

Caddy provisions HTTPS automatically on first request to each subdomain.

## 6. Update after a code change

```bash
git pull
docker build -t agente-facturacion:latest .
cd deploy && docker compose up -d   # recreates containers with the new image
```

## 7. Configure the Meta webhook (per client)

In the client's Meta App → WhatsApp → Configuration:

- Callback URL: `https://clienteN.tudominio.com/webhook`
- Verify token: the `VERIFY_TOKEN` from that client's env file
- Subscribe to the `messages` field

## 8. Verify

```bash
curl https://clienteN.tudominio.com/health        # -> {"status":"ok"}
docker compose logs -f clienteN                    # watch logs
```

Then send a real WhatsApp message from an authorized number and confirm the
agent replies and a REMISIÓN PDF is delivered.

---

## Operations cheat sheet

```bash
docker compose ps                 # status of all instances
docker compose logs -f clienteN   # tail one client's logs
docker compose restart clienteN   # restart one client
docker compose up -d clienteN     # add/recreate a single client
docker stats                      # live CPU/RAM per container
```

## Notes

- `restart: unless-stopped` brings containers back after a crash or VPS reboot.
- Caddy stores issued certs in the `caddy_data` volume — they survive restarts.
- Set a hard monthly spend limit per OpenAI key as a backstop beyond DAILY_MESSAGE_CAP.
- This VPS comfortably runs 30–50 such containers; the bottleneck is OpenAI cost,
  not CPU/RAM.

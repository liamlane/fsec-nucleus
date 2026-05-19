# Nucleus — Deployment Guide

## Architecture Overview

```
TrueNAS Host
└── Docker Network: nucleus-net
    ├── nginx:alpine          → :8080 (public entry point)
    ├── nucleus-frontend      ← ghcr.io/YOU/nucleus-frontend:latest
    ├── nucleus-backend       ← ghcr.io/YOU/nucleus-backend:latest
    └── postgres:16-alpine    ← persistent ZFS volume
```

GitHub Actions builds and pushes images to GHCR on every push to `main`.  
TrueNAS pulls those images and runs them via docker-compose.

---

## Step 1 — Prerequisites

### On your dev machine
- Git + GitHub CLI (`gh`) installed
- Docker Desktop (for local testing, optional)

### On TrueNAS
- TrueNAS SCALE (or CORE with Docker support)
- Docker + docker-compose available via SSH
- A ZFS pool (e.g. `tank` or `data`)

---

## Step 2 — Create GitHub Repository

```bash
cd /path/to/nucleus   # wherever you have this project

git init
git add .
git commit -m "feat: initial Nucleus commit"

# Create private repo on GitHub
gh repo create nucleus --private --source=. --push

# Verify
git remote -v
```

> **Visibility note:** The repo can be private. GHCR packages inherit repo visibility by default — you'll authenticate on TrueNAS to pull them (Step 6).

---

## Step 3 — Trigger First Build

Push to `main` automatically triggers `.github/workflows/build.yml`.

```bash
# Check it's running
gh run list --repo $(gh repo view --json nameWithOwner -q .nameWithOwner)

# Watch live
gh run watch
```

Wait for both `build-backend` and `build-frontend` jobs to show ✅.

Images will be at:
- `ghcr.io/YOURUSERNAME/nucleus-backend:latest`
- `ghcr.io/YOURUSERNAME/nucleus-frontend:latest`

---

## Step 4 — TrueNAS: Create ZFS Dataset

SSH into TrueNAS:

```bash
ssh admin@TRUENAS-IP

# Create dataset (adjust pool name to yours)
zfs create tank/nucleus

# Create subdirectories
mkdir -p /mnt/tank/nucleus/{postgres,config}

# Verify
ls /mnt/tank/nucleus/
```

---

## Step 5 — TrueNAS: Copy Config Files

From your dev machine, copy the three config files TrueNAS needs:

```bash
# Copy docker-compose (rename from truenas variant)
scp docker-compose.truenas.yml admin@TRUENAS-IP:/mnt/tank/nucleus/docker-compose.yml

# Copy DB init script (runs once on first postgres start)
scp backend/src/db/init.sql admin@TRUENAS-IP:/mnt/tank/nucleus/init.sql

# Copy nginx reverse proxy config
scp nginx/nginx.conf admin@TRUENAS-IP:/mnt/tank/nucleus/nginx.conf

# Copy env template
scp .env.example admin@TRUENAS-IP:/mnt/tank/nucleus/.env
```

---

## Step 6 — TrueNAS: Configure .env

SSH back into TrueNAS and edit the env file:

```bash
nano /mnt/tank/nucleus/.env
```

Fill in every value:

```env
# Database
POSTGRES_DB=nucleus
POSTGRES_USER=nucleus
POSTGRES_PASSWORD=CHANGE_THIS_STRONG_PASSWORD

# JWT — generate with: openssl rand -hex 32
JWT_SECRET=CHANGE_THIS_JWT_SECRET

# PIN hash — see below for how to generate
PIN_HASH=GENERATED_BCRYPT_HASH

# Port Nucleus will be accessible on
APP_PORT=8080
```

**Generating your PIN hash** (choose any numeric PIN, e.g. 1234):

```bash
docker run --rm node:20-alpine node -e \
  "const b=require('bcryptjs');console.log(b.hashSync('YOUR_PIN',10))" 2>/dev/null || \
docker run --rm node:20-alpine sh -c \
  "npm install -g bcryptjs 2>/dev/null; node -e \"const b=require('bcryptjs');console.log(b.hashSync('YOUR_PIN',10))\""
```

Paste the `$2a$10$...` output as `PIN_HASH=` in your `.env`.

**Edit docker-compose.yml** — replace the placeholder paths:

```bash
# Replace YOURGITHUBUSER with your actual GitHub username
sed -i 's/YOURGITHUBUSER/your_actual_github_username/g' /mnt/tank/nucleus/docker-compose.yml

# Replace /mnt/yourpool/ with your actual pool path
sed -i 's|/mnt/yourpool/|/mnt/tank/|g' /mnt/tank/nucleus/docker-compose.yml
```

---

## Step 7 — TrueNAS: Authenticate with GHCR

Generate a GitHub Personal Access Token (PAT):
1. GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained
2. Permissions: `read:packages`
3. Copy the token

```bash
# On TrueNAS
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

Expected output: `Login Succeeded`

---

## Step 8 — TrueNAS: Launch Nucleus

```bash
cd /mnt/tank/nucleus

# Pull latest images
docker compose pull

# Start all services (detached)
docker compose up -d

# Watch startup logs
docker compose logs -f --tail=50
```

Wait for: `Nucleus API running on :3001` in backend logs.

Access Nucleus at: **http://TRUENAS-IP:8080**

---

## Step 9 — Verify Everything

```bash
# Check all 4 containers are running
docker compose ps

# Test backend health directly
curl http://localhost:3001/health

# Check postgres is healthy
docker compose exec postgres pg_isready -U nucleus
```

---

## Updating Nucleus (Future)

Whenever you push changes to `main`, GitHub Actions rebuilds the images. To deploy:

```bash
# On TrueNAS
cd /mnt/tank/nucleus
docker compose pull          # pulls new :latest images
docker compose up -d         # rolling restart (zero-downtime for stateless services)
docker image prune -f        # clean up old layers
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `postgres` not healthy | Check `POSTGRES_PASSWORD` in `.env` |
| Backend crashes on start | Check `DATABASE_URL` — ensure postgres is healthy first |
| Can't pull GHCR images | Re-run `docker login ghcr.io` with valid PAT |
| Init SQL not running | Only runs on first DB init — `docker compose down -v` to reset |
| Port 8080 unreachable | Check TrueNAS firewall, confirm `APP_PORT` in `.env` |
| Login fails | Regenerate `PIN_HASH` — bcrypt hash must match your PIN exactly |

---

## Backup

```bash
# Dump postgres to file
docker compose exec postgres pg_dump -U nucleus nucleus > nucleus_backup_$(date +%Y%m%d).sql

# Restore
cat nucleus_backup_20260101.sql | docker compose exec -T postgres psql -U nucleus nucleus
```

For full dataset backup, snapshot your ZFS dataset:
```bash
zfs snapshot tank/nucleus@$(date +%Y%m%d)
```

---

## Modules

| Module | URL path | Description |
|--------|----------|-------------|
| Dashboard | `/` | Overview with analytics |
| Finance | `/finance` | Accounts, transactions, budgets, goals |
| Goals | `/goals` | Life areas, OKRs, milestones |
| Habits | `/habits` | Daily tracking, streaks, heatmap |
| Notes | `/notes` | Notebooks, tags, autosave |
| Calendar | `/calendar` | Month view, events |
| Journal | `/journal` | Mood, energy, gratitude, trends |
| Time Tracking | `/time` | Projects, live timer, reports |


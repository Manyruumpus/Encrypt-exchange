# Encrypt_Exchange — Private Lab

> A local-only, zero-knowledge encrypted file-sharing application built for cybersecurity study and controlled experimentation.

## Overview

This project is a local deployment of **Encrypt_exchange**, adapted as a personal cybersecurity lab. Files are encrypted in the browser before upload. The application stores encrypted file objects in a locally running MinIO instance and upload metadata in a locally running PostgreSQL database.

The project is designed to run only on the local machine. It does not require AWS S3, cloud databases, or external storage accounts.

## Features

- Browser-side file encryption before upload
- Local S3-compatible encrypted object storage through MinIO
- Local PostgreSQL database for upload metadata
- Private MinIO bucket with short-lived signed upload/download URLs
- Configurable upload size, expiry, and download limits
- Shareable download links
- Docker Compose based local infrastructure
- Next.js 14 + TypeScript frontend and API routes

## Local Architecture

```text
Browser
  │
  │ http://localhost:3000
  ▼
Encrypt_exchange / Next.js application
  ├── PostgreSQL: 127.0.0.1:5432
  │     └── Stores metadata, upload records, expiry and download controls
  │
  └── MinIO: 127.0.0.1:9000
        └── Stores encrypted file objects only

MinIO Console: http://127.0.0.1:9001
```

All Docker ports are bound to `127.0.0.1`, so the services are reachable only from the local computer.

## Tech Stack

| Component | Technology |
|---|---|
| Application | Next.js 14, React, TypeScript |
| Styling | Tailwind CSS |
| File encryption | `uppy-encrypt`, libsodium |
| Object storage | MinIO, S3-compatible API |
| Database | PostgreSQL 16 |
| ORM / migrations | Drizzle ORM / Drizzle Kit |
| Local services | Docker Desktop and Docker Compose |

## Prerequisites

Install the following before running the project:

- Node.js 18 or newer
- npm
- Docker Desktop with the WSL 2 backend enabled
- Git (optional, recommended for tracking modifications)

Verify Docker is running:

```powershell
docker info
docker compose version
```

## Setup

### 1. Clone or copy the project

Keep the project outside of cloud-synced folders such as OneDrive if the goal is a fully local setup.

Example local directory:

```text
C:\LocalProjects\Encrypt_exchange
```

### 2. Start local PostgreSQL and MinIO

Create `docker-compose.yml` in the project root:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: Encrypt_exchange-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: Encrypt_exchange
      POSTGRES_PASSWORD: ChangeThisPostgresPassword123
      POSTGRES_DB: Encrypt_exchange
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  minio:
    image: minio/minio:latest
    container_name: Encrypt_exchange-minio
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: Encrypt_exchangeminio
      MINIO_ROOT_PASSWORD: ChangeThisMinioPassword123
    command: server /data --console-address ":9001"
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  minio_data:
```

Start the services:

```powershell
docker compose up -d
docker compose ps
```

Expected containers:

```text
Encrypt_exchange-postgres
Encrypt_exchange-minio
```

### 3. Create the MinIO bucket

1. Open `http://127.0.0.1:9001` in a browser.
2. Sign in with the `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` configured in `docker-compose.yml`.
3. Create a private bucket named:

```text
Encrypt_exchange
```

Do not make the bucket public.

### 4. Configure environment variables

Copy the template:

```powershell
Copy-Item .env.example .env.local
Copy-Item .env.local .env
```

Update `.env.local` with local values. Keep `.env` identical because Drizzle migration tooling loads it.

```env
NEXT_PUBLIC_ORGANIZATION_NAME="Local Encrypt_exchange"
NEXT_PUBLIC_ORGANIZATION_CONTACT="local@localhost"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

DATABASE_URL="postgresql://Encrypt_exchange:ChangeThisPostgresPassword123@127.0.0.1:5432/Encrypt_exchange"
CRON_SECRET="replace-with-a-long-random-local-secret"

S3_ENDPOINT="http://127.0.0.1:9000"
S3_REGION="us-east-1"
S3_BUCKET="Encrypt_exchange"
S3_PREFIX="/"
S3_KEY_ID="Encrypt_exchangeminio"
S3_SECRET_KEY="ChangeThisMinioPassword123"
S3_URL_EXPIRE_TIME="900"
```

> Never commit `.env` or `.env.local`. Change placeholder passwords before exposing the app to any network.

### 5. Enable MinIO path-style URLs

Update `lib/s3.ts` to include `forcePathStyle: true`:

```ts
import { S3Client } from '@aws-sdk/client-s3';

export const bucket = process.env.S3_BUCKET ?? '';
export const prefix = process.env.S3_PREFIX ?? '';
export const expiresIn = parseInt(process.env.S3_URL_EXPIRE_TIME ?? '900', 10);

export const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
});
```

### 6. Install dependencies

```powershell
npm install
npm install dotenv --save-dev
```

If a libsodium module-resolution error occurs, pin a compatible pair:

```powershell
npm install --save-exact libsodium-wrappers-sumo@0.7.14 libsodium-sumo@0.7.14
```

### 7. Apply database migrations

```powershell
npx drizzle-kit migrate
```

### 8. Run the application

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

Upload a small test file first. Verify that an encrypted object appears in the private `Encrypt_exchange` bucket through the MinIO console.

## Daily Usage

Start infrastructure and the app:

```powershell
cd C:\LocalProjects\Encrypt_exchange
docker compose start
npm run dev
```

Stop the app with `Ctrl+C`, then stop local services:

```powershell
docker compose stop
```

## Useful Commands

```powershell
# Display service status
docker compose ps

# Follow infrastructure logs
docker compose logs -f

# Start stopped containers
docker compose start

# Stop containers while preserving all files and database data
docker compose stop

# Remove containers but preserve named volumes
docker compose down

# DANGER: permanently remove local database and MinIO upload data
docker compose down -v
```

## Security Model

### Assets

- Original plaintext files
- Encrypted file objects
- File encryption/decryption keys
- Share URLs
- PostgreSQL upload metadata
- MinIO access credentials

### Trust boundaries

- The browser handles file encryption before upload.
- MinIO stores encrypted file objects locally.
- PostgreSQL stores metadata locally.
- Signed S3 URLs provide short-lived access to a specific object operation.

### Limitations

This is a learning project and must not be treated as a production-ready secure file-sharing service without a thorough review.

- Anyone who obtains a valid share URL may be able to access its corresponding file while the link remains valid.
- A user who already downloaded a plaintext file cannot be forced to delete it.
- Local services are private only while ports remain bound to `127.0.0.1` and the machine itself is secure.
- Secrets must not be committed to Git or shared publicly.
- Dependency warnings and known vulnerabilities must be assessed before any production-like use.

## Planned Enhancements

- [ ] Immutable, tamper-evident audit log
- [ ] Merkle-tree integrity validation for file chunks
- [ ] Per-recipient wrapped encryption keys
- [ ] File versioning and secure revocation workflow
- [ ] Password-protected share links
- [ ] Two-factor authentication for the local administrator console
- [ ] Security event dashboard
- [ ] Threat-model document and formal attack evaluation
- [ ] Automated unit, integration, and adversarial tests

## Development Workflow

Use local Git commits to track each tested modification:

```powershell
git init
git add .
git commit -m "Set up local-only Encrypt_exchange lab"
```

Before committing, verify `.gitignore` excludes at least:

```text
.env
.env.local
node_modules
.next
```

Make one change at a time, test upload and download behavior, then commit the working state.

## License and Attribution

This project began as a local study adaptation of the public `0sumcode/Encrypt_exchange` repository. Retain the upstream license and give appropriate attribution when redistributing or publishing derivative work.

# LMS St. Louis 2 — Engineering Runbook

Tanggal pemeriksaan: 17 Oktober 2026. Baseline aplikasi: `fa4c971`; tooling setup mengikuti versi dokumen ini.
Target pembaca: engineer instalasi, integrasi, deployment, dan operasi.
Bahasa command utama: **Bash**. Jalankan dari root repository kecuali dinyatakan lain.

> **[PERHATIAN]** Dokumen ini memuat prosedur dan template konfigurasi. Deployment systemd/Nginx dan backup/restore **belum dieksekusi dalam sesi penyusunan ini**. Bootstrap dan migrasi instalasi kosong diuji terpisah menggunakan database disposable; hasil dicatat pada [Install Verification](INSTALL-VERIFICATION.md). Uji di staging sebelum produksi.

## Daftar isi

1. [Arsitektur dan dependensi](#1-arsitektur-dan-dependensi)
2. [Persiapan host dan source](#2-persiapan-host-dan-source)
3. [Konfigurasi environment](#3-konfigurasi-environment)
4. [Setup database](#4-setup-database)
5. [Bootstrap master data dan admin](#5-bootstrap-master-data-dan-admin)
6. [Integrasi Ollama](#6-integrasi-ollama)
7. [Integrasi OpenAI dan migrasi Supabase](#7-integrasi-openai-dan-migrasi-supabase)
8. [Menjalankan dan memverifikasi aplikasi](#8-menjalankan-dan-memverifikasi-aplikasi)
9. [Deployment Linux](#9-deployment-linux)
10. [Administrasi aplikasi](#10-administrasi-aplikasi)
11. [Operasi dan monitoring](#11-operasi-dan-monitoring)
12. [Backup, restore, dan pemindahan host](#12-backup-restore-dan-pemindahan-host)
13. [Update dan rollback](#13-update-dan-rollback)
14. [Testing dan CI](#14-testing-dan-ci)
15. [Troubleshooting](#15-troubleshooting)
16. [Batasan dan acceptance checklist](#16-batasan-dan-acceptance-checklist)
17. [Peta source dan referensi](#17-peta-source-dan-referensi)

## 1. Arsitektur dan dependensi

```text
Browser -- HTTPS --> reverse proxy -- HTTP --> Next.js / Node.js
                                                 |
                         +-----------------------+------------------+
                         |                       |                  |
                     LMS Postgres          AUX Postgres       AI provider
                     Prisma + SQL          pg + pgvector      Ollama / OpenAI
                         |                       |                  |
                  users, classes,          jobs, results,      inference,
                  courses, submissions     config, vectors    embeddings

Next.js -- filesystem --> public/uploads/  [persistent storage]
Next.js -- filesystem --> prompts/         [versioned input]
```

| Komponen | Implementasi / kebutuhan |
|---|---|
| Web/API | Next.js 15.2.3 App Router, React 19, TypeScript |
| Runtime | Gunakan **Node.js 24.x** untuk host baru; `pdfjs-dist` terpasang mensyaratkan `>=22.13.0 || >=24` |
| Package manager | npm; instalasi deterministik melalui `package-lock.json` |
| LMS database | PostgreSQL; schema di `prisma/`, diakses melalui Prisma dan raw SQL |
| AUX database | PostgreSQL dengan `vector` dan `pgcrypto`; schema di `db/ai-db/` |
| Local AI | Ollama HTTP API; chat dan embedding adalah dua model berbeda |
| Cloud AI | OpenAI SDK; API key dari admin database atau env |
| Authentication | NextAuth credentials + JWT; password bcrypt; session maksimum 24 jam |
| Upload | File lokal pada `public/uploads/`; bukan object storage otomatis |
| Pengujian | Jest; Playwright membutuhkan database lokal disposable dan Chromium |

**Baseline deployment:** satu instance aplikasi, disk persisten, dua database terpisah. Dua database boleh berada di satu PostgreSQL server. Pemisahan penting karena migrasi dan data lifecycle berbeda.

**Kapasitas awal untuk Ollama:** GPU 16 GB VRAM atau mesin unified-memory sekelas referensi 24 GB adalah acuan perencanaan, bukan jaminan throughput. Ukur model, context, concurrency, dan jumlah jawaban pada hardware target. Mode OpenAI tidak membutuhkan GPU lokal.

### 1.1 Port dan konektivitas

| Arah | Port default | Pemakaian |
|---|---:|---|
| Browser → proxy | 443 | Aplikasi produksi |
| Proxy → Next.js | 3000 | Bind loopback pada satu host |
| Aplikasi → PostgreSQL | 5432 | LMS dan AUX |
| Aplikasi → Ollama | 11434 | Local inference |
| Playwright → aplikasi test | 3100 | E2E |
| Build → internet | 443 | npm/Prisma artifacts; Google Fonts saat `next build` |
| Aplikasi → OpenAI | 443 | Hanya ketika provider OpenAI digunakan |

> **[PERHATIAN]** Jangan expose PostgreSQL atau Ollama langsung ke internet. Jika berbeda host, gunakan jaringan privat dan firewall. Client Ollama saat ini tidak mengirim token autentikasi.

### 1.2 Data yang tidak dibawa Git

- `.env`, `.env.local`, backup env dan credential.
- `public/uploads/`, backup database, `node_modules/`, `.next/`.
- Seluruh `docs/`, termasuk dataset/hasil validasi penelitian.
- Folder tooling AI dan instruksi agent yang tercantum di `.gitignore`.

Clone membawa kode, migrasi, prompt, dan template env. Clone **tidak** membawa akun, kelas, submission, file materi, atau corpus dari instalasi lama.

## 2. Persiapan host dan source

### 2.1 Tool wajib

Instal melalui mekanisme OS yang dikelola engineer:

- Git; Node.js 24.x dan npm.
- PostgreSQL client: `psql`, `pg_dump`, `pg_restore`, `pg_isready`.
- PostgreSQL server dengan pgvector; contoh prosedur menggunakan PostgreSQL 17.
- Ollama jika menggunakan `AI_PROVIDER=local`.
- `curl`, `openssl`, `tar`; Bash untuk command dokumentasi dan Playwright wrapper.
- Linux produksi: systemd dan reverse proxy, contoh Nginx.

```bash
node --version
npm --version
git --version
psql --version
pg_dump --version
```

Node major juga ditetapkan melalui `package.json#engines` dan `.nvmrc`. Jika memakai nvm, jalankan `nvm install` lalu `nvm use` di root project.

Gunakan `pg_dump` dengan major version yang mendukung server sumber; jangan memakai client lebih tua untuk dump server yang lebih baru. Untuk perpindahan lintas major, lakukan rehearsal restore.

### 2.2 Checkout dan dependency

```bash
git clone <REPOSITORY_URL> lms
cd lms
git checkout <RELEASE_TAG_OR_COMMIT>
git status --short
npm ci
```

`<...>` adalah placeholder dan wajib diganti. Pilih commit/tag yang sudah disetujui; jangan mengandalkan nama branch dari runbook hardware lama.

`npm ci` menjalankan `postinstall` → `prisma generate`. Jangan menjalankan `npm ci --omit=dev` untuk tahap build: TypeScript, Prisma CLI, dan tool verifikasi memerlukan development dependencies.

**Kriteria:** instalasi exit 0; Prisma Client terbentuk. Belum membutuhkan database yang terisi pada tahap generate.

### 2.3 Layout yang harus tersedia

```text
.env.example                  template, versioned
.env.local                    konfigurasi host, private
prisma/schema.prisma          schema LMS
prisma/migrations/            migrasi LMS
db/ai-db/                       migrasi AUX + runner
prompts/                      prompt grading
public/uploads/               data runtime, persistent
ops/                          dokumentasi operasional, versioned
```

## 3. Konfigurasi environment

### 3.1 Membuat konfigurasi host

```bash
umask 077
cp .env.example .env.local
chmod 600 .env.local
openssl rand -base64 32
```

Simpan hasil generator sebagai `NEXTAUTH_SECRET`. Edit `.env.local` menggunakan editor atau secret deployment mechanism; jangan menyalin credential ke tiket, log, atau README.

**Instalasi baru:** cukup gunakan `.env.local`. File `.env` tidak wajib. **Instalasi existing:** `.env` dan `.env.local` sama-sama dapat aktif; audit keduanya sebelum menghapus atau mengonsolidasikan.

### 3.2 Prioritas dan perbedaan loader

| Konsumen | Perilaku |
|---|---|
| Next.js | process env → `.env.<mode>.local` → `.env.local` → `.env.<mode>` → `.env`; `.env.local` dilewati pada test mode |
| Prisma melalui `npm run db:*` | Wrapper memakai loader Next.js sebelum menjalankan Prisma; process env selalu menang |
| AUX runner `db/ai-db/migrate.mjs` | Shared loader Next.js; process env → mode.local → local → mode → base |
| Supabase migration script | Shared loader Next.js; process env selalu menang |
| `psql`, `pg_dump` | Tidak membaca file dotenv aplikasi; gunakan libpq service / `.pgpass` atau env shell eksplisit |
| Validation scripts | Benchmark dan setup-v3 memakai shared loader; script lain dapat dijalankan dengan `npm run env:run -- scripts/validation/NAMA_SCRIPT.mjs` |

**Shared loader:** `scripts/lib/load-env.cjs` menggunakan `@next/env` versi yang sama dengan Next.js. Quoting, komentar, ekspansi variable, test mode, dan prioritas file mengikuti Next.js. Default mode CLI adalah development; set `NODE_ENV=production` saat menargetkan file production. File dotenv tidak menimpa nilai process env.

```bash
npm run db:migrate
npm run db:status
npm run db:generate
```

**[PERHATIAN — TARGET DATABASE]** Periksa host/nama database sebelum command migrasi. Process env dapat mengalihkan target meskipun `.env.local` menunjuk database lain. `psql` tetap memakai mekanisme libpq sendiri; shared loader tidak mengubah perilakunya.

Jangan `source .env.local` tanpa audit: format dotenv tidak identik dengan shell, dan shell akan mengeksekusi ekspresi tertentu.

### 3.3 Konfigurasi inti

| Variable | Wajib / fungsi | Aturan |
|---|---|---|
| `DATABASE_URL` | Wajib untuk Prisma dan login API alternatif | URL database LMS |
| `LMS_POSTGRES_URL` | LMS raw helper; fallback ke `DATABASE_URL` | Arahkan ke LMS yang sama |
| `AUX_POSTGRES_URL` | Wajib untuk konfigurasi dan fitur AI | URL database AUX |
| `POSTGRES_HOST` | Login NextAuth | Host database LMS |
| `POSTGRES_PORT` | Login NextAuth; default 5432 | Port database LMS |
| `POSTGRES_DATABASE` | Login NextAuth | Nama database LMS |
| `POSTGRES_USER` | Login NextAuth | User database LMS |
| `POSTGRES_PASSWORD` | Login NextAuth | Password database LMS |
| `POSTGRES_SSL` | TLS untuk helper yang menggunakan `lib/pg-ssl.ts` | `false` untuk PostgreSQL lokal tanpa TLS |
| `NEXTAUTH_URL` | URL aplikasi | URL yang digunakan browser; HTTPS di produksi |
| `NEXTAUTH_SECRET` | Wajib untuk session | Stabil, random, private |
| `CREDENTIAL_ENCRYPTION_SECRET` | Opsional | Fallback ke `NEXTAUTH_SECRET`; jangan menggantinya tanpa prosedur migrasi credential |
| `AI_PROVIDER` | `local` atau `openai` | Default kode `openai`; isi eksplisit |

**Dua konfigurasi LMS wajib konsisten:** URL Prisma dan `POSTGRES_*`. Mengisi `DATABASE_URL` saja tidak mengonfigurasi login NextAuth.

`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` adalah fallback `lib/database.ts` jika kedua URL LMS tidak tersedia. Pada konfigurasi berbasis URL, field ini tidak menentukan koneksi helper tersebut.

> **[PERHATIAN — TLS]** Dukungan TLS tidak seragam: `lib/db.ts`, `lib/lms-db.ts`, dan `lib/aux-db.ts` memakai resolver TLS; `lib/database.ts` menetapkan `ssl: false`, sedangkan script migrasi memiliki perilaku sendiri. `POSTGRES_SSL=true` pada resolver saat ini memakai `rejectUnauthorized: false`. Jangan menganggap konfigurasi ini sudah memberikan validasi sertifikat database. Integrasi managed DB/TLS harus diuji per client dan URL.

### 3.4 Contoh konfigurasi lokal

Isi nilai yang sama pada URL LMS dan field login; contoh bukan credential siap pakai:

```dotenv
DATABASE_URL=postgresql://lms:URL_ENCODED_PASSWORD@127.0.0.1:5432/lms_main
LMS_POSTGRES_URL=postgresql://lms:URL_ENCODED_PASSWORD@127.0.0.1:5432/lms_main
AUX_POSTGRES_URL=postgresql://lms:URL_ENCODED_PASSWORD@127.0.0.1:5432/lms_aux
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DATABASE=lms_main
POSTGRES_USER=lms
POSTGRES_PASSWORD=RAW_PASSWORD
POSTGRES_SSL=false
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=GENERATE_RANDOM_SECRET
AI_PROVIDER=local
LOCAL_SYSTEM_PROMPT_FILE=prompts/grading-system-prompt-local-v2.txt
OLLAMA_THINK=false
```

Password di URL harus di-percent-encode; `POSTGRES_PASSWORD` menggunakan password asli sesuai aturan quoting dotenv. Jangan menaruh komentar inline pada nilai AUX URL: loader AUX sederhana tidak memproses seluruh sintaks dotenv.

`NEXT_PUBLIC_APP_URL`, `SUPABASE_ANON_KEY`, dan `BLOB_READ_WRITE_TOKEN` bukan syarat startup utama berdasarkan pembacaan kode saat dokumentasi disusun. Kehadiran variable dalam env lama tidak membuktikan adanya integrasi aktif. Jangan menganggap token Blob membuat upload otomatis tersimpan di cloud.

## 4. Setup database

### 4.1 PostgreSQL server

Gunakan PostgreSQL 17 dengan pgvector sebagai baseline prosedur. Instalasi package OS mengikuti kebijakan host. Untuk workstation terisolasi, contoh alternatif Docker:

```bash
# Buat /path/private/postgres-password.txt dengan password; chmod 600.
docker run -d --name lms-postgres \
  -p 127.0.0.1:5432:5432 \
  --mount type=bind,src=/path/private/postgres-password.txt,dst=/run/secrets/postgres-password,readonly \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password \
  -v lms-postgres-data:/var/lib/postgresql/data \
  pgvector/pgvector:pg17
```

Contoh ini bukan konfigurasi HA atau backup. Simpan password file di luar repo. Pastikan tool PostgreSQL client tersedia di host jika memakai command host di bawah.

```bash
pg_isready -h 127.0.0.1 -p 5432
```

### 4.2 Role, database, extension

Masuk menggunakan PostgreSQL administrator melalui koneksi host yang sesuai:

```bash
psql -h 127.0.0.1 -U postgres -d postgres -W
```

Jalankan dalam session `psql`:

```sql
CREATE ROLE lms LOGIN;
\password lms
CREATE DATABASE lms_main OWNER lms;
CREATE DATABASE lms_aux OWNER lms;
\connect lms_aux
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'pgcrypto');
```

Gunakan administrator untuk extension jika role aplikasi tidak berwenang. pgvector harus tersedia di server, bukan hanya di mesin aplikasi. HNSW pada migrasi lokal memerlukan pgvector >=0.5.0.

### 4.3 Service libpq untuk command operasional

Contoh `~/.pg_service.conf` pada akun engineer; file ini tidak berisi password:

```ini
[lms]
host=127.0.0.1
port=5432
dbname=lms_main
user=lms

[lms_aux]
host=127.0.0.1
port=5432
dbname=lms_aux
user=lms
```

Gunakan `.pgpass` berpermission `600` atau password prompt. `.pgpass` menyimpan secret; jangan commit. Nama service ini digunakan untuk command migrasi SQL, bootstrap, dan backup.

```bash
psql 'service=lms' -X -c 'SELECT current_database(), current_user;'
psql 'service=lms_aux' -X -c 'SELECT current_database(), current_user;'
```

**Kriteria:** database pertama `lms_main`, database kedua `lms_aux`; user sesuai deployment. Samakan dengan `.env.local`.

### 4.4 Migrasi LMS

```bash
npm run db:migrate
npm run db:status
```

`migrate deploy` menerapkan migrasi versioned, bukan membuat akun atau master data. Jangan menggunakan `db push`, `migrate reset`, atau E2E seed untuk inisialisasi produksi.

### 4.5 Migrasi AUX — database kosong

Gunakan command khusus database baru:

```bash
npm run db2:init
npm run db2:migrate -- --status
```

`db2:init` menerapkan tujuh SQL legacy dan migrasi local berurutan, mencatat checksum setiap file. Setiap file dijalankan dalam transaksi. Guard menolak schema public non-kosong tanpa ledger AUX, agar database existing tidak diasumsikan instalasi baru. Pengulangan pada AUX yang sudah tercatat tetap memverifikasi checksum dan melewati file yang sudah diterapkan.

**Kriteria:** 12 migrasi baseline berstatus `applied`, tanpa `PENDING`/`DRIFTED`. Jangan memakai `--baseline` untuk instalasi kosong: flag itu hanya mencatat file legacy tanpa mengeksekusinya.

### 4.6 Migrasi AUX — database existing

1. Backup AUX.
2. Identifikasi apakah tujuh schema legacy sudah lengkap.
3. Jika schema lengkap tetapi belum memiliki ledger, jalankan `--baseline` sekali.
4. Jika ledger tersedia, jalankan:

```bash
npm run db2:migrate -- --dry-run
npm run db2:migrate
npm run db2:migrate -- --status
```

`--dry-run` dan `--status` tetap melakukan koneksi; runner juga menjalankan `CREATE TABLE IF NOT EXISTS schema_migrations_aux`. Keduanya bukan command offline/read-only mutlak. Status mencetak `DRIFTED`, tetapi jangan hanya mengandalkan exit code status sebagai gate.

Jangan edit migrasi yang sudah diterapkan. Tambahkan file migrasi lokal bernomor baru; checksum drift harus ditelusuri, bukan dihapus dari ledger.

### 4.7 Verifikasi schema

```bash
psql 'service=lms' -X -c '\dt'
psql 'service=lms_aux' -X -c '\dt'
psql 'service=lms_aux' -X -c 'SELECT id, model FROM ai_config;'
psql 'service=lms_aux' -X -c 'SELECT id, chat_model, embed_model, embed_dims FROM local_ai_config;'
```

Schema AUX meliputi `acs_*`, `pds_*`, `acs_local_*`, `pds_local_*`, `rag_*`, `ai_config`, `local_ai_config`, `api_credential`, `feature_access`, `audit_log`.

## 5. Bootstrap master data dan admin

Gunakan bootstrap untuk instalasi kosong setelah migrasi LMS. Untuk restore instalasi existing, ikuti bagian 12; jangan membuat ulang akun tanpa kebutuhan.

> **[BAHAYA]** `tests/e2e/support/seed.ts` melakukan TRUNCATE dan membuat akun tes. Jangan gunakan untuk database operasional.

### 5.1 Command bootstrap

Bash, dari root project:

```bash
read -r -s -p 'Password admin pertama: ' BOOTSTRAP_PASSWORD
printf '\n'
printf '%s' "$BOOTSTRAP_PASSWORD" | npm run db:bootstrap -- \
  --username initial_admin \
  --email admin@example.invalid \
  --name 'System Administrator' \
  --code ADM-INITIAL \
  --password-stdin
unset BOOTSTRAP_PASSWORD
```

Ganti email placeholder dan username sesuai deployment. Password hanya diterima melalui stdin, tidak melalui argumen CLI. Minimal 12 karakter, maksimum 72 byte UTF-8 sesuai batas bcrypt; hash menggunakan cost 12. Jalankan shell tanpa `set -x` agar password tidak tercatat di log.

```bash
npm run db:bootstrap -- --help
```

Target berasal dari `DATABASE_URL` setelah shared loader dijalankan. Command mencetak hostname/port/database tanpa credential.

### 5.2 Data yang dibuat

| Category | Record |
|---|---|
| `ROLE` | `STUDENT=1`, `TEACHER=2`, `ADMIN=3` |
| `ASSIGNMENT_TYPE` | `QUIZ`, `ESSAY` |
| `QUESTION_TYPE` | `MULTIPLE CHOICE`, `TRUE FALSE`, `ESSAY`, `FILE_UPLOAD` |
| `SUBMISSION_STATUS` | `IN PROGRESS`, `SUBMITTED`, `PARTIALLY GRADED`, `GRADED` |
| Akun | Satu `app_user`, satu role admin aktif, satu `admin_details` |

Ini baseline minimum, bukan seed seluruh data sekolah. Tahun ajaran, kelas, course, teacher/student, offering dan enrollment tetap dikelola melalui aplikasi.

### 5.3 Guard dan pengulangan

- Satu transaksi untuk master data dan akun; kegagalan menggulung balik row yang ditulis.
- Advisory lock mencegah dua bootstrap berjalan bersamaan pada database yang sama.
- Role ID bertabrakan atau role wajib inactive → gagal; tidak me-rename role existing.
- Master wajib inactive → gagal; engineer harus meninjau penyebabnya.
- Username/email bertabrakan dengan akun lain atau profil/role tidak sesuai → gagal; tidak menimpa akun.
- Rerun dengan username, email dan kode admin yang sama → idempotent; password lama **tidak di-reset**, meskipun stdin berisi password baru.
- Sequence dapat tetap maju akibat mekanisme PostgreSQL walaupun transaksi rollback; ini tidak mengubah akun existing.

**[PERHATIAN — ROLE ID]** Kode User Management masih memakai STUDENT=1, TEACHER=2, ADMIN=3. Database existing dengan mapping berbeda harus dikoreksi melalui rencana perubahan kode/data, bukan dipaksa oleh bootstrap. Category role adalah `ROLE`, bukan category fixture E2E `USER_ROLE`.

### 5.4 Verifikasi

```sql
SELECT id, category, name, is_active
FROM enumeration WHERE category = 'ROLE' ORDER BY id;

SELECT u.id, u.user_name, u.is_active, u.is_deleted, e.name, r.is_active AS role_active
FROM app_user u
JOIN app_user_role r ON r.user_id = u.id
JOIN enumeration e ON e.id = r.role_id
WHERE u.user_name = 'initial_admin';
```

Harus ada satu akun aktif/non-deleted dengan satu role ADMIN aktif. Uji login sebelum menyerahkan host. Hindari multi-role per akun: pemilihan role login belum deterministik untuk kasus tersebut.

## 6. Integrasi Ollama

### 6.1 Server dan model

Instal Ollama melalui installer resmi OS. Jalankan service, lalu:

```bash
ollama --version
ollama pull qwen2.5:14b-instruct-q4_K_M
ollama pull bge-m3
ollama list
curl --fail --silent --show-error http://127.0.0.1:11434/api/tags
```

Jika service belum berjalan, jalankan `ollama serve` pada terminal/service khusus. Jangan menjalankan dua server pada port yang sama.

### 6.2 Konfigurasi aplikasi

| Variable | Default kode | Fungsi |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Alamat dari perspektif proses Next.js |
| `OLLAMA_CHAT_MODEL` | `qwen2.5:14b-instruct-q4_K_M` | Model grading |
| `OLLAMA_EMBED_MODEL` | `bge-m3` | Model embedding |
| `OLLAMA_EMBED_DIMS` | `1024` | Harus sesuai model dan schema |
| `OLLAMA_NUM_CTX` | `8192` | Context window |
| `OLLAMA_NUM_PREDICT` | `1536` | Output budget |
| `OLLAMA_KEEP_ALIVE` | `30m` | Residency request |
| `LOCAL_RAG_TOP_K` | `6` | Chunk retrieval |
| `LOCAL_LLM_CONCURRENCY` | `1` | Concurrency pemanggilan LLM |
| `LOCAL_EMBED_CONCURRENCY` | `2` | Concurrency embedding |
| `LOCAL_SCORING_MODE` | `holistic` | `holistic` atau `analytic` |
| `OLLAMA_THINK` | Unset → tanpa flag | `true`/`false`; env contoh memakai `false` |
| `LOCAL_SYSTEM_PROMPT_FILE` | Unset → prompt umum | Override prompt khusus local |
| `GRADING_PROMPT_FILE` | Unset | Override kedua provider; local-specific menang pada local |

Urutan local config: **env → `local_ai_config` → default kode**. Parameter concurrency, scoring mode, dan think adalah env-only. Config database di-cache sekitar 30 detik; pemeriksaan admin health memaksa refresh.

> **[PERHATIAN — EMBEDDING]** Schema local menyimpan vector 1024 dimensi; OpenAI PDS menyimpan 384. Mengganti env dimensi/model saja tidak memigrasikan vector. Perubahan embedding memerlukan desain migrasi dan reindex corpus pada environment terisolasi. Jangan mencampur embedding model berbeda meskipun dimensinya sama.

### 6.3 Server settings dan performa

Untuk deployment GPU, pertimbangkan pada **proses Ollama**, bukan sekadar env aplikasi:

```ini
OLLAMA_MAX_LOADED_MODELS=2
OLLAMA_NUM_PARALLEL=1
OLLAMA_FLASH_ATTENTION=1
OLLAMA_KEEP_ALIVE=30m
```

Contoh systemd override Ollama:

```ini
[Service]
Environment="OLLAMA_MAX_LOADED_MODELS=2"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KEEP_ALIVE=30m"
```

```bash
sudo systemctl edit ollama
sudo systemctl daemon-reload
sudo systemctl restart ollama
ollama run qwen2.5:14b-instruct-q4_K_M 'Say OK'
ollama ps
```

`ollama ps` menunjukkan residency dan pemakaian processor. Untuk NVIDIA, gunakan `nvidia-smi` dan log Ollama untuk memeriksa offload GPU. Detail estimasi VRAM dan benchmark: [RTX runbook](rtx-runbook.md).

Model di host lain: set `OLLAMA_BASE_URL` ke alamat privat. `localhost` di container menunjuk container itu sendiri. Aplikasi saat ini tidak mengirim Authorization header ke Ollama; jika menambahkan auth proxy, integrasi client perlu disesuaikan.

### 6.4 Verifikasi fungsional

1. Login sebagai admin.
2. Buka `/api/admin/ai/local-health`.
3. Periksa `data.provider`, `data.ready`, `data.reachable`, `data.missingModels`.
4. `data.ready=true` hanya memastikan Ollama reachable dan model tersedia; belum membuktikan database, inference, corpus, atau grading sukses.
5. Buat satu tugas dan materi teks; jalankan satu penilaian, periksa hasil dan citation.

Timeout client: embedding 120 detik, chat 300 detik per request. Nilai ini konstanta source, bukan env `OLLAMA_TIMEOUT_MS`. Retry dibatasi; memperbesar timeout reverse proxy tidak mengubah timeout client Ollama.

## 7. Integrasi OpenAI dan migrasi Supabase

### 7.1 OpenAI

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=FILL_PRIVATELY
```

API key diambil dari `api_credential` admin jika tersedia; env menjadi fallback. Atur melalui `/admin/ai` → Credentials. Key database dienkripsi menggunakan `CREDENTIAL_ENCRYPTION_SECRET`, atau `NEXTAUTH_SECRET` jika dedicated secret tidak terisi.

Parameter model grading berasal dari `ai_config`; fallback kode `gpt-4o-mini`, temperature `0.2`. Embedding PDS menggunakan `text-embedding-3-small`, 384 dimensi. Setup materi OpenAI menggunakan file/vector store. Pastikan project API memiliki akses dan billing yang sesuai sebelum functional test.

> **[PERHATIAN]** Grading OpenAI mengirim data yang diproses ke layanan eksternal dan dapat menghasilkan biaya. Sepakati penggunaan data sekolah dan budget sebelum mengaktifkan provider. Tes satu tugas kecil sebelum batch.

Mengubah `AI_PROVIDER` membutuhkan restart aplikasi. Tabel local dan OpenAI terpisah; perubahan provider tidak memindahkan hasil, corpus, atau job. Buat ulang setup materi sesuai provider target.

### 7.2 Supabase — migrasi opsional

Supabase bukan requirement startup normal. Script `scripts/migrate-db2-from-supabase.mjs` memindahkan tabel legacy ACS/PDS ke AUX PostgreSQL:

```dotenv
SUPABASE_URL=FILL_PRIVATELY
SUPABASE_SERVICE_ROLE_KEY=FILL_PRIVATELY
AUX_POSTGRES_URL=TARGET_AUX_DATABASE_URL
```

```bash
npm run db2:migrate-supabase
```

**Sebelum menjalankan:** backup target; schema target harus tersedia; cek env loader dan TLS script. Script menggunakan `ON CONFLICT (id) DO NOTHING`, bukan full synchronization; record existing tidak diperbarui. Migrasi tidak mencakup seluruh LMS, seluruh konfigurasi admin, local RAG, atau file upload. Proses tidak merupakan satu transaksi global; kegagalan bisa meninggalkan sebagian tabel terisi.

Sesudah migrasi: bandingkan count per tabel, foreign-key integrity, sampel hasil grading, dan credential. Cabut service role dari host jika tidak lagi diperlukan.

## 8. Menjalankan dan memverifikasi aplikasi

### 8.1 Development

```bash
npm run dev
```

Akses `http://localhost:3000/login`. Mode ini menggunakan Turbopack/HMR.

> **[PERHATIAN]** Gunakan development untuk edit UI/API. Grading batch dan benchmark harus memakai production build; HMR/restart proses dapat menghentikan pekerjaan.

### 8.2 Production lokal

```bash
npm run build
npm start
```

Port/hostname eksplisit:

```bash
npm start -- --hostname 127.0.0.1 --port 3000
```

Jalankan dari root project: prompt, upload, dan loader menggunakan working directory. `next start` membutuhkan output `.next` dari build sukses. Build memakai Google Fonts dari `app/layout.tsx`; jaringan build harus mengizinkan download font atau engineer perlu menyediakan strategi font lokal melalui perubahan kode tersendiri.

### 8.3 Smoke test wajib

| Tahap | Cara | Hasil yang diharapkan |
|---|---|---|
| HTTP | `curl -I http://127.0.0.1:3000/login` | HTTP 200 saat aplikasi ready |
| Session | Login admin di browser | Login sukses, role admin |
| Roles | Buka User Management / roles API dengan session | ADMIN, TEACHER, STUDENT tersedia |
| Akademik | Buat tahun ajaran, kelas, course, offering | Record tersimpan dan terbaca |
| Enrollment | Enroll satu student pada offering | Course terlihat oleh student tersebut |
| Upload | Upload PDF/DOCX kecil dan unduh kembali | File tersimpan dan bisa dibuka |
| Local AI | Admin local-health | `data.ready=true` |
| Grading | Satu tugas esai dengan materi dan rubric | Job selesai, skor/citation tersedia |
| Otorisasi | Teacher kelas lain mengakses tugas | Ditolak; tidak mendapat submission/key |
| Persistensi | Restart saat tidak ada job, login dan buka upload | Data dan file tetap tersedia |

Health HTTP `/login` bukan readiness menyeluruh. Jangan menganggap login page HTTP 200 membuktikan PostgreSQL atau AI sudah siap.

## 9. Deployment Linux

Contoh berikut adalah **template single-host**, bukan file konfigurasi yang sudah dipasang. Sesuaikan path, user, domain, Node binary, dan TLS.

### 9.1 Filesystem dan permission

```text
/srv/lms/app/                 checkout + node_modules + .next + prompts
/srv/lms/shared/uploads/      data upload persisten
/srv/lms/app/public/uploads   symlink ke shared/uploads
/srv/lms-backups/             backup; akses terbatas
```

Gunakan akun service non-root, misalnya `lmsapp`. Berikan read pada source/config dan write pada `.next` serta shared upload. `.env.local` dimiliki akun service, mode `600`.

Pada instalasi baru yang belum memiliki upload:

```bash
sudo install -d -o lmsapp -g lmsapp -m 750 /srv/lms/shared/uploads
ln -s /srv/lms/shared/uploads /srv/lms/app/public/uploads
```

**Jika `public/uploads` sudah berisi data:** hentikan writer, pindahkan data dan verifikasi jumlah/checksum sebelum menggantinya dengan symlink. Jangan menimpa atau menghapus direktori existing.

### 9.2 Service systemd

Buat `/etc/systemd/system/lms.service` setelah mengganti Node path dengan binary Node 24 yang benar. Jangan menunjuk executable NVM yang hanya tersedia di interactive shell.

```ini
[Unit]
Description=LMS St Louis 2
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=lmsapp
Group=lmsapp
WorkingDirectory=/srv/lms/app
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart=/usr/bin/node /srv/lms/app/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
Restart=on-failure
RestartSec=5
TimeoutStopSec=300
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Next membaca `.env.local` dari working directory. Jangan menambahkan `EnvironmentFile` berisi dotenv tanpa memeriksa sintaks/interpolasinya. Pastikan service dapat membaca secret dan model endpoint sebelum enable.

```bash
sudo systemd-analyze verify /etc/systemd/system/lms.service
sudo systemctl daemon-reload
sudo systemctl enable --now lms
sudo systemctl status lms
journalctl -u lms -n 100 --no-pager
```

`TimeoutStopSec=300` bukan jaminan durable job atau automatic resume. Drain pekerjaan sebelum restart.

### 9.3 Reverse proxy dan HTTPS

Template location pada server block Nginx yang sudah memiliki domain dan sertifikat TLS:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 12m;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
}
```

Batas proxy 12 MB memberi ruang multipart; endpoint upload tetap membatasi file 10 MB. Timeout 600 detik adalah contoh awal untuk proses panjang, bukan SLA; ukur kebutuhan aktual. Jangan menambahkan cache bersama untuk response authenticated atau `/api/`.

Set `NEXTAUTH_URL=https://DOMAIN_APLIKASI`, build/restart bila diperlukan, lalu:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://DOMAIN_APLIKASI/login
```

> **[PERHATIAN — UPLOAD]** Jangan membuat Nginx `alias` publik ke shared upload tanpa evaluasi akses. File berada di bawah `public/uploads` dan sebagian route memiliki model akses berbeda; anggap materi sensitif perlu evaluasi otorisasi end-to-end sebelum expose publik. Reverse proxy tidak memperbaiki aturan akses aplikasi secara otomatis.

### 9.4 Topologi yang belum didukung sebagai prosedur siap pakai

- Serverless/ephemeral disk: file upload dan background job tidak otomatis durable.
- Multi-replica: local filesystem, cache, dan concurrency per proses perlu desain koordinasi.
- `next build` pada folder `.next` yang sedang disajikan: gunakan release directory terpisah atau maintenance window.
- Docker production image: belum disediakan repository; contoh Docker PostgreSQL tidak berarti app sudah containerized.

## 10. Administrasi aplikasi

### 10.1 Urutan provisioning akademik

1. Buat tahun ajaran dan tentukan status aktif.
2. Buat user teacher/student; gunakan role canonical `TEACHER`, `STUDENT`; admin `ADMIN`.
3. Buat kelas dan course.
4. Buat **class offering** (`class_courses`): gabungkan kelas, course, teacher, periode.
5. Enroll student pada offering.
6. Buat session pada offering.
7. Upload resources dan buat assignment/question/option.
8. Publish tugas setelah memeriksa jadwal, attempt limit, dan rubric.
9. Aktifkan fitur AI untuk course jika diperlukan.

Course code dapat dipakai oleh beberapa offering. Assignment, materi, teacher ownership, dan enrollment dibatasi pada offering yang sesuai. Teacher kelas lain tidak otomatis mendapat akses karena course code sama.

### 10.2 Halaman dan API operasional

| Keperluan | Halaman / API |
|---|---|
| User management | `/user`; API `/api/admin/users` |
| Course management | `/admin/courses`; API `/api/admin/courses` |
| Class management | `/admin/classes`; API `/api/admin/classes` |
| Tahun ajaran | API `/api/admin/academic-years` |
| Enrollment | API `/api/admin/enrollments` |
| Session | `/schedule`; API `/api/admin/session` |
| AI config, credential, akses, audit | `/admin/ai` |
| Local model settings | `/api/admin/ai/local-config` |
| Local health | `/api/admin/ai/local-health` |
| Feature access | `/api/admin/access-control` |
| Audit | `/api/admin/audit-logs` |

API admin memerlukan session admin; jangan menambahkan bearer token dummy ke curl dan menganggapnya autentikasi. Untuk pemeriksaan manual, gunakan browser authenticated atau request automation yang melakukan login NextAuth dengan benar.

### 10.3 Feature access AI

Default akses course adalah disabled sampai diaktifkan. Di `/admin/ai`, aktifkan `ai_grading` dan/atau `plagiarism` per course.

Kontrak PUT access-control:

```json
{"course_id":"50","feature":"ai_grading","enabled":true}
```

`course_id` adalah ID course dalam bentuk string, bukan ID class offering atau course code. Contoh ID 50 bukan ID yang wajib tersedia. Mengaktifkan fitur course tidak mengganti pemeriksaan kepemilikan tugas.

### 10.4 Alur grading dan plagiarism

**Grading:** teacher pemilik/admin → pilih assignment dan pertanyaan → pilih materi → rubric → setup corpus/vector store → jalankan grading → pantau job → review hasil sesuai workflow aplikasi.

Picker materi menggunakan `assignmentId`; hasilnya hanya materi dari offering assignment, termasuk saat dipanggil admin. Pemilihan resource kelas lain ditolak pada setup.

**Plagiarism:** aktifkan akses course → pilih assignment/submission → jalankan detect → pantau detection → review comparison/evidence → adjudikasi flag. Flag diotorisasi dari submission yang tersimpan, bukan course ID kiriman caller.

Endpoint status yang relevan:

- `/api/ai-grading/status`, `/api/ai-grading/status/latest/[assignmentId]`.
- `/api/ai-grading/results/[assignmentId]`.
- `/api/plagiarism/status/[detectionId]`, `/api/plagiarism/status/latest/[assignmentId]`.
- `/api/plagiarism/results/[assignmentId]`.

### 10.5 Format materi

| Aspek | Dukungan saat ini |
|---|---|
| Upload umum | PDF, DOC, DOCX, JPG/JPEG, PNG, GIF; file <=10 MB; signature dan tipe diperiksa |
| Parser RAG local | PDF teks, DOCX, PPTX, TXT, MD |
| OCR | Tidak tersedia |
| DOC lama | Bisa lolos upload umum, tetapi tidak didukung parser RAG local |
| PPTX/TXT/MD | Didukung parser, tetapi tidak diterima endpoint upload umum saat ini |

Gunakan **PDF dengan text layer atau DOCX** untuk workflow UI paling langsung. Konversi DOC lama ke DOCX/PDF teks. PDF scan perlu OCR di luar aplikasi. Jangan menganggap file berhasil di-upload berarti berhasil diindeks.

## 11. Operasi dan monitoring

### 11.1 Pemeriksaan rutin

| Frekuensi awal | Pemeriksaan |
|---|---|
| Harian | HTTP/login, service uptime, backup sukses, kapasitas disk upload/DB, error aplikasi |
| Saat AI digunakan | Job/detection pending/running, Ollama residency, GPU/RAM, latency, hasil gagal/null |
| Setiap release | Migration status, unit test/coverage, typecheck, lint, build, staging smoke/E2E |
| Berkala sesuai SLA | Restore drill, credential/access review, dependency review, kapasitas DB/vector |

Command dasar:

```bash
systemctl status lms
journalctl -u lms --since '30 min ago' --no-pager
systemctl status ollama
journalctl -u ollama --since '30 min ago' --no-pager
ollama ps
df -h
du -sh /srv/lms/shared/uploads
psql 'service=lms' -X -c 'SELECT current_database(), now();'
psql 'service=lms_aux' -X -c 'SELECT current_database(), now();'
```

Log dapat memuat username, detail error, dan metadata pemrosesan. Batasi akses dan redaksi sebelum membagikan. Tidak ada integrasi metrics backend/alerting otomatis yang dipasang hanya dengan menjalankan app.

### 11.2 Query operasional AUX

```sql
SELECT status, count(*) FROM acs_local_grading_jobs GROUP BY status;
SELECT status, count(*) FROM pds_local_detections GROUP BY status;
SELECT pg_size_pretty(pg_database_size(current_database()));
SELECT filename, baselined, applied_at FROM schema_migrations_aux ORDER BY filename;
```

Untuk OpenAI, gunakan `acs_grading_jobs` dan `pds_detections`. Jangan mengubah status job langsung hanya untuk menghilangkan indikator running; cocokkan log dan hasil parsial dahulu.

### 11.3 Restart dan job recovery

1. Hentikan pemicu job baru melalui prosedur maintenance/operator.
2. Pastikan job aktif sudah selesai atau dokumentasikan job yang akan terputus.
3. Restart service.
4. Periksa log startup, login, local health, status job, dan upload.
5. Jika job terputus, review partial result dan rerun melalui workflow aplikasi yang sesuai.

**Tidak ada jaminan job resume setelah proses mati.** Background work berjalan dalam proses Node; semaphore local bukan queue persisten lintas host. Jangan menganggap row `running` berarti worker masih berjalan.

### 11.4 Perubahan konfigurasi dan secret

| Perubahan | Tindakan |
|---|---|
| `.env.local` server settings | Restart proses; rebuild jika menyangkut public/build-time setting |
| `NEXT_PUBLIC_*` yang digunakan client | Rebuild dan redeploy |
| Local config lewat admin | Env override tetap menang; cache sekitar 30 detik |
| File prompt override | Dibaca ulang per pemanggilan; versioning dan audit perubahan tetap wajib |
| `NEXTAUTH_SECRET` | Rotasi terencana; session lama tidak lagi valid |
| Encryption secret | Re-encrypt credential atau input ulang key; jangan mengganti tanpa rencana |
| Model/dimensi embedding | Migrasi + reindex terencana; bukan sekadar restart |

Jika dedicated encryption secret belum digunakan, mengganti `NEXTAUTH_SECRET` juga dapat merusak dekripsi OpenAI credential yang tersimpan. Backup AUX dan encryption secret sebagai pasangan.

## 12. Backup, restore, dan pemindahan host

### 12.1 Unit backup

Satu set backup harus mengandung:

1. LMS database.
2. AUX database termasuk corpus, hasil, ledger migrasi, dan credential terenkripsi.
3. File `public/uploads` dari storage persisten.
4. Secret konfigurasi yang disimpan terenkripsi di secret manager, khususnya encryption secret.
5. Commit aplikasi, model/digest, dan konfigurasi efektif yang tidak mengungkap secret.

`pg_dump` masing-masing database konsisten secara internal, tetapi dua dump dan filesystem bukan snapshot lintas sistem yang atomik. Untuk baseline sederhana, hentikan writer selama backup; jika SLA tidak mengizinkan downtime, desain snapshot/PITR dan mekanisme konsistensinya secara terpisah.

### 12.2 Contoh backup maintenance window

Command berikut memerlukan akses service dan permission direktori backup. Jalankan setelah semua job selesai:

```bash
set -euo pipefail
umask 077
BACKUP_DIR="/srv/lms-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
sudo systemctl stop lms
pg_dump --dbname='service=lms' --format=custom --no-owner --no-acl --file="$BACKUP_DIR/lms.dump"
pg_dump --dbname='service=lms_aux' --format=custom --no-owner --no-acl --file="$BACKUP_DIR/aux.dump"
tar -C /srv/lms/shared -czf "$BACKUP_DIR/uploads.tar.gz" uploads
git rev-parse HEAD > "$BACKUP_DIR/commit.txt"
ollama list > "$BACKUP_DIR/ollama-models.txt"
sha256sum "$BACKUP_DIR/lms.dump" "$BACKUP_DIR/aux.dump" "$BACKUP_DIR/uploads.tar.gz" > "$BACKUP_DIR/SHA256SUMS"
sudo systemctl start lms
```

Untuk provider OpenAI tanpa Ollama, lewati `ollama list`. Pada macOS gunakan `shasum -a 256` sebagai pengganti `sha256sum`.

> **[PERHATIAN]** Dengan `set -e`, kegagalan backup menghentikan script sebelum start. Operator harus memeriksa error, menentukan apakah aman start kembali, lalu menjalankan `sudo systemctl start lms`. Jangan membiarkan service mati tanpa alert. Contoh ini bukan scheduler backup otomatis.

Simpan backup terenkripsi di storage terpisah dengan retention sesuai SLA. RPO/RTO harus ditetapkan pemilik layanan; repo tidak menetapkannya.

### 12.3 Restore drill

Restore ke **database baru/kosong**, bukan menimpa produksi. Siapkan role owner dan extension yang dibutuhkan menggunakan langkah bagian 4. Buat service libpq terpisah, misalnya `lms_restore` dan `lms_aux_restore`.

```bash
pg_restore --list /path/backup/lms.dump
pg_restore --list /path/backup/aux.dump
pg_restore --dbname='service=lms_restore' --no-owner --no-acl --exit-on-error /path/backup/lms.dump
pg_restore --dbname='service=lms_aux_restore' --no-owner --no-acl --exit-on-error /path/backup/aux.dump
```

Jika extension telah dibuat oleh admin, pastikan role restore memiliki permission yang memadai dan verifikasi hasil `pg_restore`; jangan mengabaikan semua error sebagai harmless. Restore upload ke lokasi staging terpisah; verifikasi checksum dan owner.

Arahkan checkout staging ke database restore melalui env private. Gunakan secret dekripsi yang sama jika ingin membuka stored credential. Jalankan commit yang tercatat, lalu migration status dan smoke test. Jangan menjalankan bootstrap admin/seed lagi pada data restore.

### 12.4 Pindah host

1. Provision runtime, PostgreSQL, extension, dan AI endpoint pada host baru.
2. Clone commit release; `npm ci`.
3. Restore LMS, AUX, upload; pasang env host baru.
4. Sesuaikan `NEXTAUTH_URL`, DB host, dan `OLLAMA_BASE_URL`.
5. Pastikan kedua koneksi LMS tetap menunjuk dataset yang sama.
6. Build, smoke test, uji login/file/grading pada jaringan staging.
7. Bekukan writer host lama, ambil backup final, restore final, lakukan cutover DNS/proxy.
8. Cegah kedua host menerima write secara bersamaan.
9. Pantau setelah cutover; simpan host lama dalam kondisi aman untuk recovery.

Memindahkan corpus AUX tidak menggantikan upload asli untuk reindex/unduh. Jangan menyalin dump tanpa file materi jika pengguna tetap membutuhkan file tersebut.

## 13. Update dan rollback

### 13.1 Update

1. Catat release aktif dan perubahan schema/config.
2. Siapkan release directory baru; simpan env dan upload di luar release lifecycle.
3. Checkout commit target, jalankan `npm ci`, lint, typecheck, tests, dan build.
4. Review migrasi dan dampak kompatibilitas versi lama/baru.
5. Jadwalkan maintenance; drain job; backup konsisten.
6. Terapkan migrasi LMS/AUX yang disetujui menggunakan konfigurasi target.
7. Alihkan release dan restart service.
8. Jalankan smoke test; periksa status job, error rate, dan file.
9. Catat commit, schema state, operator, waktu, dan hasil verifikasi.

Jangan `git pull` lalu build di folder yang aktif melayani traffic tanpa prosedur release. Jangan memperbarui semua dependency atau model bersamaan dengan migrasi besar tanpa staging.

### 13.2 Rollback

**Rollback kode** boleh jika schema yang diterapkan tetap kompatibel dengan kode sebelumnya. Alihkan release directory ke commit sebelumnya dan restart setelah drain.

**Rollback schema/data** tidak otomatis: AUX runner tidak menyediakan down migration. Untuk perubahan inkompatibel, gunakan forward fix terverifikasi atau restore set backup sesuai keputusan incident owner. Restore menghilangkan perubahan data sejak backup; hentikan writer sebelum recovery.

Jangan menghapus `_prisma_migrations` atau `schema_migrations_aux` agar status terlihat bersih. Jangan menjalankan `migrate reset` terhadap database operasional.

## 14. Testing dan CI

### 14.1 Pemeriksaan lokal

```bash
npm run lint
npm run typecheck
npm run test:setup
npm test -- --runInBand
npm test -- --runInBand --coverage --ci
npm run build
git diff --check
```

Lint dapat exit 0 dengan warning hook existing. Catat warning dan evaluasi perubahan baru secara terpisah. Coverage 100% hanya di-enforce pada path yang tercantum di `jest.config.js`, bukan seluruh aplikasi.

Pemeriksaan instalasi bersih: **51 suite / 985 test Jest lulus**, coverage gate dan TypeScript lulus, lint exit 0 dengan warning, serta **46 test Playwright pada mode production lulus**. Setup/bootstrap juga diuji terhadap PostgreSQL disposable. Detail dan batas cakupan: [Install Verification](INSTALL-VERIFICATION.md).

Tes integrasi setup memerlukan dua database disposable lokal yang sudah disiapkan engineer. Database LMS harus sudah dimigrasikan; database AUX boleh kosong. User test membutuhkan hak membuat database untuk pengujian guard AUX. Command ini hanya untuk database disposable:

```bash
LMS_SETUP_TEST_URL=postgresql://TEST_USER@127.0.0.1:5432/lms_setup_test \
LMS_SETUP_AUX_TEST_URL=postgresql://TEST_USER@127.0.0.1:5432/lms_aux_setup_test \
  npm run test:setup
```

Tanpa kedua variable, unit test setup tetap berjalan dan grup integrasi terkait ditandai skipped. CI menjalankan grup integrasi pada PostgreSQL service terpisah. Bootstrap integration test melakukan TRUNCATE pada database LMS test; guard mensyaratkan host lokal dan suffix `_setup_test`. Jangan pernah menunjuk data operasional.

### 14.2 E2E terisolasi

Prasyarat: PostgreSQL lokal, extension vector/pgcrypto, user test, Chromium. Untuk cluster uji di port terpisah, set `E2E_DB_PORT` (default `5432`). Database wajib berakhiran `_e2e_test`; gunakan `lms_e2e_test`.

```bash
createdb -h 127.0.0.1 lms_e2e_test
DATABASE_URL=postgresql://TEST_USER:URL_ENCODED_TEST_PASSWORD@127.0.0.1:5432/lms_e2e_test \
  npm run db:migrate
npx playwright install chromium
E2E_DB_USER=TEST_USER E2E_DB_PASSWORD=TEST_PASSWORD \
  npx playwright test --grep-invert 'Test group'
```

Placeholder test credential wajib diganti; untuk secret riil gunakan mekanisme env yang tidak masuk shell history. Jika cluster local memakai user OS tanpa password, ikuti [panduan E2E](../tests/e2e/README.md).

Production-mode E2E:

```bash
E2E_SERVER_MODE=production npx playwright test --grep-invert 'Test group'
npx playwright show-report
```

Pasang `E2E_DB_USER`/`E2E_DB_PASSWORD` sesuai kebutuhan pada kedua mode. Seed akan **menghapus dan mengisi ulang seluruh tabel test**. Jangan mengganti guard untuk memakai database asli. Production E2E menulis `.next`; jalankan di checkout test, bukan folder service aktif.

Artifact: `playwright-report/`, `test-results/`, `test-reports/e2e-results.json`, `test-reports/e2e-webserver.log`. CI melakukan satu retry dan gagal bila test hanya lulus saat retry.

### 14.3 CI dan secret scan

Workflow `.github/workflows/ci.yml`: lint/typecheck/test coverage, production build, Playwright dengan PostgreSQL disposable, Gitleaks, serta dependency audit pada schedule/manual.

Workflow CI menggunakan Node.js 24 untuk job yang memasang runtime Node aplikasi, selaras dengan runtime deployment pada panduan ini.

```bash
gitleaks git --redact --no-banner .
```

Scan di atas memeriksa riwayat commit, bukan hanya working tree. Empat finding yang telah ditriase berada di `tests/lib/crypto.test.ts` dan merupakan ciphertext/dummy test key. `.gitleaksignore` mengecualikan hanya empat fingerprint yang sudah direview, bukan seluruh rule atau seluruh file. Setiap finding baru harus ditriase.

### 14.4 Benchmark penelitian

`scripts/validation/` memerlukan dataset dan hasil referensi di `docs/validation/` yang **tidak dibawa Git**. Jalankan hanya setelah menerima paket dataset dan akun validasi melalui jalur private. Benchmark bukan syarat startup LMS dan bukan health probe rutin.

[RTX runbook](rtx-runbook.md) menjelaskan benchmark hardware. Dokumen lama memuat referensi branch/config eksperimen; untuk instalasi normal gunakan commit release, `.env.example`, dan runbook ini. Jangan menyalin prompt eksperimen tanpa memahami study yang dituju.

## 15. Troubleshooting

| Gejala | Pemeriksaan | Tindakan |
|---|---|---|
| Login gagal, halaman login normal | `POSTGRES_*`, user active/deleted, bcrypt, role join | Samakan DB login dengan `DATABASE_URL`; verifikasi role/account |
| Login berhasil tetapi data berbeda | URL LMS vs `POSTGRES_*` | Arahkan semua client LMS ke database yang sama |
| `P1001` / connection refused | Host/port, service PostgreSQL, firewall | Uji `pg_isready`; verifikasi endpoint dari host aplikasi |
| Prisma env missing | Prisma CLI dipanggil tanpa wrapper | Gunakan `npm run db:migrate`, `db:status`, atau `db:generate` |
| AUX migrasi salah target | Process env atau file mode lain | Periksa process env, `NODE_ENV`, dan file dotenv; shell kini selalu menang |
| Legacy migration no ledger | Schema legacy / ledger | Terapkan SQL legacy bila kosong, lalu baseline sekali |
| `DRIFTED` | Checksum file vs ledger | Temukan perubahan; buat migrasi baru, jangan hapus ledger |
| `extension vector is not available` | Package extension pada DB server | Instal pgvector di server; buat extension dengan role berwenang |
| `relation ... does not exist` | Database yang terhubung dan migration status | Terapkan migrasi pada target yang benar; jangan asal baseline |
| Roles kosong | `enumeration.category` | Gunakan category `ROLE`, bukan fixture `USER_ROLE` |
| Status submission gagal | Master status dan cache | Periksa `SUBMISSION_STATUS`, nama persis, is_active; restart |
| SSL error saat `next start` | `POSTGRES_SSL`, URL sslmode, client mana | Untuk local tanpa TLS isi `false`; untuk managed DB uji semua client |
| Credential gagal didekripsi | Secret yang digunakan saat encrypt | Pulihkan encryption secret atau input ulang key melalui admin |
| Local health ready=false | Reachability dan `missingModels` | Start Ollama / pull model persis sesuai config |
| Local health HTTP 401/403 | Session admin | Login admin; endpoint bukan probe publik |
| Grading timeout / GPU OOM | Residency, context, concurrency, logs | Mulai concurrency 1; ukur VRAM; evaluasi context dan model |
| Grading job terus running setelah restart | Log dan status partial result | Review lalu rerun terkontrol; tidak ada automatic resume |
| AI feature denied | Feature access course, teacher ownership | Aktifkan course dan verifikasi offering/assignment yang benar |
| Materials 422 / tidak ada teks | Resource ownership, file asli, parser, text layer | Gunakan PDF teks/DOCX dari offering assignment; OCR di luar app |
| Upload 413 | Nginx body limit | Sesuaikan multipart budget; batas aplikasi tetap 10 MB |
| Upload 415 | Ekstensi, declared MIME, signature | Gunakan file valid yang didukung; jangan sekadar rename ekstensi |
| File hilang setelah deploy | Persistent mount/symlink/permissions | Pulihkan storage; jangan mengandalkan isi checkout |
| PDF worker/module error | Node version, `serverExternalPackages`, dependency lengkap | Node 24, `npm ci`; pertahankan konfigurasi `pdfjs-dist` |
| Font download build gagal | Akses jaringan Google Fonts | Izinkan pada build host atau implementasikan font lokal |
| Nilai env admin tidak berubah | Env override, cache local config | Hapus override yang tidak diinginkan, restart; tunggu refresh |
| E2E gagal sebelum test | DB lokal/extension/Chromium/port 3100 | Siapkan disposable DB; lihat server log dan README E2E |

Saat eskalasi, sertakan commit, Node version, provider, timestamp dengan timezone, endpoint, status code, job/detection ID, dan log yang sudah direduksi. Jangan lampirkan `.env.local`, API key, password, atau dump siswa tanpa jalur dan otorisasi yang sesuai.

## 16. Batasan dan acceptance checklist

### 16.1 Batasan yang harus diterima engineer

- Repo mandiri secara Git tidak berarti bebas dari PostgreSQL, model, storage, atau data bootstrap.
- Bootstrap tersedia melalui `npm run db:bootstrap`; provisioning infrastruktur dan data akademik tetap memerlukan engineer. User Management masih mengandalkan ID role STUDENT=1, TEACHER=2, ADMIN=3.
- Background job tidak memakai durable worker queue; restart/multi-replica membutuhkan kontrol operasional.
- Tidak tersedia OCR; dukungan upload dan parser RAG berbeda.
- TLS database belum seragam di semua client; perlu verifikasi managed DB.
- Hasil AI tidak menjamin kebenaran penilaian; tetap gunakan review sesuai kebijakan sekolah.
- `docs/` tidak ikut commit; dokumentasi operasional utama berada di `ops/`.

### 16.2 Handover engineer

- [ ] Commit/tag, Node/npm version, dan dependency lock dicatat.
- [ ] Dua database, owner, extension, dan target koneksi diverifikasi.
- [ ] Prisma migration status bersih; AUX tanpa pending/drift.
- [ ] Env private terpasang; URL LMS dan login menunjuk dataset sama.
- [ ] Encryption secret disimpan dan recovery-nya diuji.
- [ ] Role/master minimum dan akun admin pertama diverifikasi.
- [ ] Login admin/teacher/student diuji.
- [ ] Academic offering dan enrollment benar; akses lintas kelas ditolak.
- [ ] Upload persisten, dapat dibaca, dan tidak hilang setelah restart.
- [ ] Local provider health + satu inference/embedding/grading berhasil, atau OpenAI functional test berhasil.
- [ ] Course feature access sesuai kebutuhan.
- [ ] Service/proxy/TLS dan log access diverifikasi pada domain target.
- [ ] Unit/coverage/typecheck/lint/build serta staging E2E dicatat.
- [ ] Pipeline CI pada commit release lulus dengan Node.js 24.
- [ ] Backup LMS/AUX/upload/secret tersedia; restore drill lulus.
- [ ] Maintenance, job recovery, rollback, RPO/RTO, dan owner layanan ditetapkan.

## 17. Peta source dan referensi

### 17.1 Source of truth proyek

| Area | File |
|---|---|
| Script dan dependency | `package.json`, `package-lock.json` |
| Env template dan CLI loader | `.env.example`, `scripts/lib/load-env.cjs`, `scripts/env-run.mjs` |
| Bootstrap | `scripts/setup/bootstrap.mjs`, `scripts/setup/bootstrap-core.mjs` |
| Login dan session | `auth.ts`, `lib/db.ts`, `lib/hash.ts` |
| TLS / raw DB | `lib/pg-ssl.ts`, `lib/database.ts`, `lib/lms-db.ts`, `lib/aux-db.ts` |
| Schema LMS | `prisma/schema.prisma`, `prisma/migrations/` |
| Schema AUX | `db/ai-db/*.sql`, `db/ai-db/local/*.sql`, `db/ai-db/migrate.mjs` |
| Roles/status lookup | `lib/enumeration-service.ts`, `app/api/admin/roles/route.ts` |
| AI provider/config | `lib/ai/index.ts`, `lib/ai-config.ts`, `lib/ai-local/config.ts` |
| Local cache/HTTP | `lib/ai-local/config-repo.ts`, `lib/ai-local/ollama-client.ts` |
| Credential encryption | `lib/crypto.ts`, `lib/openai.ts` |
| Access course/AI | `lib/auth/course-access.ts`, `lib/feature-access.ts` |
| Upload/parser | `app/api/upload/route.ts`, `lib/ai-local/rag/parsers.ts` |
| E2E | `playwright.config.ts`, `tests/e2e/README.md`, `tests/e2e/support/` |
| CI | `.github/workflows/ci.yml` |

### 17.2 Referensi eksternal

Perilaku proyek di atas mengikuti source baseline. Dokumentasi vendor dapat membahas versi lebih baru; jangan menyalin konfigurasi Prisma/Next versi major lain tanpa verifikasi.

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting): reverse proxy dan perbedaan build/runtime env.
- [Ollama list models API](https://docs.ollama.com/api/tags): pemeriksaan model yang tersedia.
- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html): format backup dan kompatibilitas client.
- [Prisma environment variables](https://www.prisma.io/docs/orm/more/development-environment/environment-variables): referensi vendor; proyek menggunakan Prisma 6 dan command eksplisit yang dicantumkan di atas.

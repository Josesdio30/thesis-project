# RTX 16 GB deployment runbook (local AI stack)

This runbook stands up the LMS with local grading (`AI_PROVIDER=local`) on a fresh
Windows or Linux PC with an NVIDIA RTX GPU (16 GB VRAM). It then runs the
benchmark that checks whether the stack fits and how fast it grades.

- Chat model: `qwen2.5:14b-instruct-q4_K_M`
- Embedding model: `bge-m3` (1024 dims)
- Databases: Postgres with pgvector. There are two of them: the LMS database (Prisma) and the aux AI database (`db/ai-db/`).
- Reference run: Apple M4 Pro, 24 GB. Median grading call 17.3 s, 21 tok/s generation, 73 ms retrieval. Scores were exactly reproducible across runs with `seed: 0`.

All VRAM figures below are estimates until the benchmark (step 9) measures them.

---

## 0. Bring from the M4 machine

`docs/` is gitignored, so git will not carry these files. Copy them by USB or a
private share, never through a public repo:

1. The folder `docs/validation/automated-grading/`. It must contain at least `dataset.json`, `ingest-ids.json` and `results/local/results-final.json` (the reference).
2. Dumps of both databases (see step 4a). They hold the validation teacher, the assignments and the RAG corpora that the benchmark grades against.
3. The values of `.env.local` (secrets: send them privately).

---

## 1. NVIDIA driver

Install a current NVIDIA driver for your OS: GeForce/Studio on Windows, `nvidia-driver-5xx` or newer on Linux. Then check that the GPU is visible:

```bash
nvidia-smi        # shows the GPU name and 16 GB (≈16376 MiB) total memory
```

If the RTX also drives your monitor, the desktop takes 0.3–1 GB of VRAM. Count that in the budget (step 7).

---

## 2. Ollama with CUDA

### 2.1 Install

Linux:

```bash
curl -fsSL https://ollama.com/install.sh | sh    # installs the systemd service "ollama"
```

Windows: run `OllamaSetup.exe` from https://ollama.com/download. Ollama then runs as a tray app.

Both installers ship the CUDA runtime, so you do not need a separate CUDA toolkit.

### 2.2 Server environment variables

Set these variables on the **Ollama server process**, not in the app's `.env.local`:

| Variable | Value | Why |
|---|---|---|
| `OLLAMA_MAX_LOADED_MODELS` | `2` | Every grading call uses both models: bge-m3 embeds the query for retrieval, then qwen grades. With a limit of 1, each call evicts the other model and reloads it. That is a cold load (20–40 s) on every answer, visible as `load_ms` > 1000. |
| `OLLAMA_KEEP_ALIVE` | `30m` | Keeps both models resident between calls and during gaps in a class session. The app also sends its own `OLLAMA_KEEP_ALIVE` (default `30m`) with each request, and that per-request value wins. The server value covers manual warm-ups and other clients. Use `-1` to pin the models for a whole day. |
| `OLLAMA_FLASH_ATTENTION` | `1` | Cuts attention memory and is faster on RTX cards. It is also **required** for KV cache quantization (fallback 7.2): without it, `OLLAMA_KV_CACHE_TYPE` is ignored. |
| `OLLAMA_NUM_PARALLEL` | `1` | Ollama allocates the KV cache as `num_ctx × num_parallel`. The app grades one answer at a time (`LOCAL_LLM_CONCURRENCY=1`), so any value above 1 only multiplies KV VRAM, and it can change batching numerics. |

Linux (systemd override):

```bash
sudo systemctl edit ollama
# add:
# [Service]
# Environment="OLLAMA_MAX_LOADED_MODELS=2"
# Environment="OLLAMA_KEEP_ALIVE=30m"
# Environment="OLLAMA_FLASH_ATTENTION=1"
# Environment="OLLAMA_NUM_PARALLEL=1"
sudo systemctl daemon-reload && sudo systemctl restart ollama
```

Windows (PowerShell, user scope):

```powershell
[Environment]::SetEnvironmentVariable('OLLAMA_MAX_LOADED_MODELS', '2',   'User')
[Environment]::SetEnvironmentVariable('OLLAMA_KEEP_ALIVE',        '30m', 'User')
[Environment]::SetEnvironmentVariable('OLLAMA_FLASH_ATTENTION',   '1',   'User')
[Environment]::SetEnvironmentVariable('OLLAMA_NUM_PARALLEL',      '1',   'User')
# Quit Ollama from the tray icon, then start it again from the Start menu.
```

### 2.3 Pull the models

```bash
ollama pull qwen2.5:14b-instruct-q4_K_M    # ≈ 9.0 GB
ollama pull bge-m3                          # ≈ 1.2 GB
```

### 2.4 Verify the GPU is used

```bash
ollama run qwen2.5:14b-instruct-q4_K_M "Say OK"
ollama ps          # PROCESSOR column must read "100% GPU"
nvidia-smi         # an ollama process should hold ~9-11 GB
```

In the server log, look for `library=cuda` and `offloaded N/N layers to GPU`, where every layer is on the GPU.

Linux:

```bash
journalctl -u ollama --since "5 min ago" | grep -Ei "cuda|offloaded"
```

Windows:

```powershell
Select-String -Path "$env:LOCALAPPDATA\Ollama\server.log" -Pattern 'cuda|offloaded' | Select-Object -Last 10
```

If `ollama ps` shows a split such as `20%/80% CPU/GPU`, the model does not fit. Go to step 7.

---

## 3. Node.js

Install Node 22 LTS or newer (the M4 ran v24). Then get the code:

```bash
git clone <repo-url> lms && cd lms
git checkout local-ai
npm ci
```

---

## 4. Postgres + pgvector

The M4 runs **Postgres 18.3**. This runbook installs Postgres 17 as planned. The dump in 4a uses plain SQL so that it restores into 17. If you would rather avoid version friction, install 18 instead and keep everything else the same.

Linux (Debian/Ubuntu, PGDG repo):

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt install -y postgresql-17 postgresql-17-pgvector
```

Windows: there are two options.

- **Docker (simplest):** run the official pgvector image. This also works on Linux.

  ```powershell
  docker run -d --name lms-pg -p 5432:5432 -e POSTGRES_PASSWORD=<choose> `
    -v lms-pg:/var/lib/postgresql/data pgvector/pgvector:pg17
  ```

- **Native:** install PostgreSQL 17 with the EDB installer, then build pgvector (the M4 has 0.8.1). Run this from the *x64 Native Tools Command Prompt for VS*:

  ```bat
  set "PGROOT=C:\Program Files\PostgreSQL\17"
  git clone --branch v0.8.1 https://github.com/pgvector/pgvector.git
  cd pgvector
  nmake /F Makefile.win
  nmake /F Makefile.win install
  ```

Next, create the role and both databases. Superuser rights are needed for the extensions. The names below match the M4; any names work if the URLs in step 5 match them.

```bash
psql -U postgres -c "CREATE ROLE lms LOGIN PASSWORD '<choose>';"
psql -U postgres -c "CREATE DATABASE sinluidua_lms OWNER lms;"
psql -U postgres -c "CREATE DATABASE lms_aux OWNER lms;"
psql -U postgres -d lms_aux -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

### 4a. Restore the M4 data (required for the benchmark)

On the M4, use the Postgres.app 18 binaries. Use the URLs from `.env.local` and remove any `?schema=…` suffix first:

```bash
PGBIN=/Applications/Postgres.app/Contents/Versions/latest/bin
$PGBIN/pg_dump --no-owner --no-acl -Fp -d "$LMS_POSTGRES_URL" -f lms.sql
$PGBIN/pg_dump --no-owner --no-acl -Fp -d "$AUX_POSTGRES_URL" -f aux.sql
```

On the RTX box, restore as the app role so that it owns the tables:

```bash
psql -U lms -d sinluidua_lms -f lms.sql
psql -U lms -d lms_aux       -f aux.sql
```

Some errors are harmless: errors on `COMMENT ON EXTENSION`, on `CREATE EXTENSION` (already created), or on an unknown `SET` parameter. An error on `CREATE TABLE` or `COPY` is **not** harmless.

Then confirm that both schemas are current:

```bash
npm run db2:migrate -- --status    # every line "applied"/"baselined", none "DRIFTED"/"PENDING"
npm run db2:migrate                # "nothing to do — schema is up to date"
npx prisma migrate status          # "Database schema is up to date"
```

### 4b. Empty install (no benchmark data)

```bash
npx prisma migrate deploy                         # LMS database
# aux database: the 7 legacy files predate the runner and must be run by hand once
for f in db/ai-db/00[1-7]_*.sql; do psql "$AUX_POSTGRES_URL" -v ON_ERROR_STOP=1 -f "$f"; done
npm run db2:migrate -- --baseline                 # records them, then applies db/ai-db/local/*.sql
```

PowerShell version of the loop:

```powershell
Get-ChildItem db/ai-db/00[1-7]_*.sql | Sort-Object Name | ForEach-Object { psql $env:AUX_POSTGRES_URL -v ON_ERROR_STOP=1 -f $_.FullName }
```

---

## 5. App environment and start

Create `.env.local` in the repo root. Use placeholders here and fill in the real values privately.

```dotenv
DATABASE_URL=postgresql://lms:<pw>@localhost:5432/sinluidua_lms
LMS_POSTGRES_URL=postgresql://lms:<pw>@localhost:5432/sinluidua_lms
AUX_POSTGRES_URL=postgresql://lms:<pw>@localhost:5432/lms_aux
POSTGRES_SSL=false                 # local Postgres has no TLS; `next start` would otherwise demand it
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_SECRET=<same as the M4>   # same value so restored encrypted credentials still decrypt

AI_PROVIDER=local
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=qwen2.5:14b-instruct-q4_K_M
OLLAMA_EMBED_MODEL=bge-m3
OLLAMA_EMBED_DIMS=1024
OLLAMA_NUM_CTX=8192
OLLAMA_NUM_PREDICT=1536
OLLAMA_KEEP_ALIVE=30m
LOCAL_RAG_TOP_K=6
LOCAL_LLM_CONCURRENCY=1
# Leave LOCAL_SCORING_MODE and LOCAL_SYSTEM_PROMPT_FILE UNSET: the reference
# run used the default holistic mode and the frozen system prompt.

# Benchmark only
RUN_USER=val_teacher
RUN_PASS=<validation teacher password>
```

Environment variables override the admin-saved `local_ai_config` row, so the values above win.

Build and start the server:

```bash
npm run build && npm start         # serves http://localhost:3000
```

Do **not** use `npm run dev`: turbopack HMR kills the long grading loop.

---

## 6. Health check

1. Log in as an admin in the browser.
2. Open http://localhost:3000/api/admin/ai/local-health.
3. Expect `"provider": "local"`, `"ready": true`, `"missingModels": []`. If a model is missing, `remediation` lists the `ollama pull` commands.

The benchmark preflight does not need a login and checks Ollama, both models, the app, the aux DB and the input files:

```bash
node scripts/validation/bench-local.mjs --dry-run
```

---

## 7. VRAM budget (estimates — verify with step 9)

| Item | Estimate | Notes |
|---|---|---|
| qwen2.5 14B q4_K_M weights | ≈ 9.0 GB (8.4 GiB) | blob size from `ollama list` |
| qwen KV cache, `num_ctx` 8192, f16 | ≈ 1.5 GiB | 48 layers × 8 KV heads × 128 dims × 2 (K,V) × 2 B = 192 KiB/token |
| qwen compute buffers | ≈ 0.3–0.8 GiB | |
| bge-m3 weights (F16) | ≈ 1.2 GB (1.1 GiB) | |
| bge-m3 context/compute buffers | ≈ 0.2–0.5 GiB | the app sends `num_ctx` 8192 to the embedder too |
| CUDA context, 2 runner processes | ≈ 0.5–0.8 GiB | not included in Ollama's `size_vram` |
| Desktop/display (if this GPU drives a monitor) | ≈ 0.3–1.0 GiB | |
| **Total** | **≈ 12.5–14.5 GiB of ~15.9 GiB usable** | expected to fit, with 1.5–3 GiB headroom |

How to read the measurements:

- `/api/ps` `size_vram` is Ollama's own accounting of weights, KV cache and buffers.
- `nvidia-smi memory.used` is the truth: it includes the CUDA contexts and the desktop.

The setup does not fit if any of the following happens:

- `ollama ps` shows anything other than `100% GPU` for qwen.
- The Ollama log shows CUDA out-of-memory errors.
- `nvidia-smi` peaks above ~15.5 GiB.
- The benchmark reports more than 2 cold loads, which means the models are evicting each other.

### What to do if it does not fit (in this order)

Re-run the benchmark after each change, and stop as soon as it fits.

1. **Lower the context to 6144.** Set `OLLAMA_NUM_CTX=6144` in `.env.local`, then rebuild and restart the app. The app sends `num_ctx` with every request, so this is an app setting, not an Ollama one. It saves ≈ 0.4 GiB of KV cache. It is safe: the largest grading call on the M4 used ≈ 3,000 tokens (prompt ≤ 2,700 + completion ≤ 490 over 163 calls).
2. **Quantize the KV cache.** Set `OLLAMA_KV_CACHE_TYPE=q8_0` on the **Ollama server** (same method as 2.2), then restart Ollama. It needs `OLLAMA_FLASH_ATTENTION=1`, and without that it is silently ignored. It roughly halves the KV cache (≈ 0.75 GiB saved at 8192). It slightly changes numerics, so read the parity section of the benchmark carefully.
3. **Keep bge-m3 on the CPU.** This creates a CPU-only alias of the same weights:

   Linux:

   ```bash
   printf 'FROM bge-m3\nPARAMETER num_gpu 0\n' > Modelfile.bge-cpu
   ollama create bge-m3-cpu -f Modelfile.bge-cpu
   ```

   Windows:

   ```powershell
   "FROM bge-m3`nPARAMETER num_gpu 0" | Set-Content Modelfile.bge-cpu
   ollama create bge-m3-cpu -f Modelfile.bge-cpu
   ```

   Then set `OLLAMA_EMBED_MODEL=bge-m3-cpu` in `.env.local` and restart the app. Embed something once and check that `ollama ps` shows `100% CPU` for it.

   - It frees ≈ 1.3–1.6 GiB.
   - Expect a higher `retrieval_ms`.
   - The corpus vectors already in the DB stay valid because the weights are the same.
   - New corpora will record `embed_model = bge-m3-cpu`.

**A smaller chat model (e.g. a 7B, or a lower quant of the 14B) is NOT a deployment tweak.** The thesis validation measured `qwen2.5:14b-instruct-q4_K_M` specifically. Any other chat model is a **new validation study**: rerun the calibration and final sets and compare them against the teachers again. Do not deploy it with the old numbers.

---

## 8. Things not needed for the benchmark

- `public/uploads/`: the corpora are already chunked and embedded in the aux DB.
- `OPENAI_API_KEY`: only needed for the OpenAI arm.

---

## 9. Run the benchmark

Prerequisites:

- The app is running (`npm start`) and nothing else is using the GPU.
- The step 6 dry run passes.

The run grades the 27 held-out answers once (≈ 8–10 min at M4 speed; expect faster on RTX).

Linux:

```bash
RUN_PASS='<password>' node scripts/validation/bench-local.mjs
```

Windows (PowerShell):

```powershell
$env:RUN_PASS = '<password>'; node scripts/validation/bench-local.mjs
```

`RUN_PASS` can also live in `.env.local`. The shell value wins.

Optional flags:

| Flag | Effect |
|---|---|
| `--runs=3` | Also checks that this GPU is self-consistent. The reference used 3 runs. |
| `--set=final\|calib\|both` | Which answer set to grade. |
| `--reference=<file>` | Compare against a different results file. |
| `--out-dir=<dir>` | Write the outputs somewhere else. |

What the benchmark does:

1. Runs a preflight.
2. Records the hardware: OS, CPU, RAM, Node, Ollama, and `nvidia-smi` GPU/driver.
3. Runs `scripts/validation/run-grading.mjs`.
4. Samples `/api/ps` and `nvidia-smi` every 2 s while it runs.
5. Reads the `acs_local_token_usage` rows written during the run.
6. Compares every `median_native` with the M4 reference.

The outputs go to `docs/validation/automated-grading/bench/<hostname>-<timestamp>/`:

- `bench.json`: everything.
- `SUMMARY.md`: the table printed at the end.
- `results.json`: the harness output.
- `harness.log`.

How to read the results:

- **Score parity** is a finding, not a pass/fail. `seed: 0` makes a run reproducible on one machine, but different GPU kernels can round differently. Report how many of the 27 answers are identical and list the ones that differ.
- **Exit code**: non-zero means a preflight or harness failure only. A large null-score count (> 2%) in the harness log invalidates the run.

### Send back

1. The whole `bench/<hostname>-<timestamp>/` folder, zipped. It contains no secrets.
2. The output of `ollama ps` and `nvidia-smi` taken right after the run.
3. Which fallbacks from step 7 you applied, if any, and the Ollama server env vars you used.

Do not send `.env.local`.

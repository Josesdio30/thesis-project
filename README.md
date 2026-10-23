This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# LMS St. Louis 2

**Learning management dengan AI-assisted grading dan retrieval berbasis materi pembelajaran.**

LMS berbasis Next.js untuk mengelola pembelajaran, submission, dan grading dalam satu aplikasi. Pengembangan di repo ini berfokus pada AI pipeline: memproses materi menjadi konteks, menjalankan rubric-based grading, dan melakukan cross-submission similarity analysis.

Inference mendukung **Ollama** untuk local models dan **OpenAI** melalui API. Data LMS dikelola dengan Prisma, sementara AI configuration, RAG corpus, dan embedding disimpan di database AUX berbasis PostgreSQL dengan `pgvector`.

## Core capabilities

- **Rubric-based grading** — AI grading dengan per-criterion scores, structured output, dan batch processing queue.
- **Assignment-scoped RAG** — ingestion PDF, DOCX, PPTX, TXT, dan Markdown; dilanjutkan dengan chunking, checksum deduplication, embedding, dan context retrieval per assignment.
- **Citation validation** — source references pada model output dicocokkan dengan retrieved passages; references di luar konteks tersebut dibuang.
- **Cross-submission similarity analysis** — embedding comparison antar-submission, dilengkapi evidence, flags, dan result export untuk mendukung plagiarism review.
- **AI administration** — provider configuration, feature access control, audit logs, dan encrypted API credential storage.
- **Operational tooling** — database bootstrap, AUX migrations dengan checksum ledger, Jest dan Playwright test suites, GitHub Actions CI, serta deployment dan maintenance runbooks.

## Built on LMS_StLouis2

Proyek ini melanjutkan [Josesdio30/LMS_StLouis2](https://github.com/Josesdio30/LMS_StLouis2), yang menyediakan fondasi LMS: authentication, roles, course dan class management, enrollment, learning resources, assignments, submissions, manual grading, forums, dan admin panel, beserta Prisma schema dan struktur UI dasarnya.

Repo ini mengembangkan fondasi tersebut dengan AI backend, RAG dan embedding pipeline, citation validation, serta cross-submission similarity analysis. Sebagian upstream code juga disesuaikan untuk mendukung integrasi tersebut.

Kredit untuk fondasi LMS tetap kepada upstream developers. Ketentuan lisensi dan hak cipta tersedia di [LICENSE](LICENSE).

## Engineering documentation

Mulai dari **[Engineering Runbook](ops/ENGINEERING-RUNBOOK.md)** untuk setup, deployment, dan pengoperasian aplikasi.

Runbook mencakup:

- Runtime requirements, architecture, ports, dan storage.
- Environment configuration serta perbedaan loading behavior pada Next.js, Prisma, dan standalone scripts.
- PostgreSQL dan `pgvector` setup, LMS/AUX migrations, serta master data dan admin bootstrap.
- Ollama/OpenAI integration dan optional Supabase migration.
- Development dan production setup, termasuk systemd, Nginx, dan HTTPS.
- Administration, monitoring, backup/restore, dan update/rollback.
- Testing, troubleshooting, known limitations, dan acceptance checklist.

Referensi tambahan:

- [Environment template](.env.example) — daftar environment variables untuk konfigurasi awal.
- [Clean installation verification](ops/INSTALL-VERIFICATION.md) — hasil verifikasi instalasi dari environment kosong.
- [Playwright E2E guide](tests/e2e/README.md) — setup dan eksekusi end-to-end tests.
- [RTX deployment and benchmarks](ops/rtx-runbook.md) — catatan hardware experiments; gunakan Engineering Runbook untuk deployment umum.

## Requirements

- **Node.js 24.x** dan npm.
- **PostgreSQL**, dengan extensions `vector` dan `pgcrypto` pada database AUX.
- Dua database: **LMS** untuk application data dan **AUX** untuk AI configuration, RAG, serta supporting tables.
- **Ollama** beserta local models untuk `AI_PROVIDER=local`, atau **OpenAI API credentials** untuk `AI_PROVIDER=openai`.
- Persistent storage untuk `public/uploads/`.

> Fresh installation belum memiliki user accounts atau academic data. Dependency installation dan schema migrations tidak membuat admin account. Jalankan `npm run db:bootstrap` sesuai runbook. E2E seed hanya digunakan untuk test environments.

## Initial setup

Salin environment template, lalu isi database URLs dan credentials sebelum menjalankan setup commands.

```bash
cp .env.example .env.local
npm ci
npm run db:migrate
npm run db2:init
npm run db:bootstrap -- --help
```

Command terakhir menampilkan bootstrap options. Untuk membuat master data dan admin account, ikuti command lengkap di Engineering Runbook; bootstrap menerima password melalui stdin.

`db2:init` digunakan untuk database AUX kosong. Untuk existing database, ikuti migration dan baseline procedure di runbook.

Seluruh setup CLI menggunakan environment loader yang sama dengan Next.js, dengan process environment variables sebagai prioritas tertinggi.

## Running the application

Setelah initial setup selesai, jalankan production build:

```bash
npm run build
npm start
```

Untuk local development:

```bash
npm run dev
```

Gunakan production build saat menjalankan batch grading. Application restart dan development HMR dapat menghentikan background jobs.

## Verification

Jalankan checks berikut untuk memverifikasi code quality, setup tooling, tests, dan production build:

```bash
npm run lint
npm run typecheck
npm run test:setup
npm test -- --runInBand --coverage --ci
npm run build
```

Untuk end-to-end testing, ikuti [Playwright E2E guide](tests/e2e/README.md).

## Private data and local files

Environment files yang berisi credentials, uploaded files, backups, dan direktori `docs/` tidak disertakan dalam version control.

Gunakan `.env.example` sebagai configuration template dan simpan nilai environment lokal di `.env.local`. Engineering documentation yang perlu ikut version control tersedia di `ops/`.

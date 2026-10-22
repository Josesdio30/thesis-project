# Verifikasi Instalasi Bersih

Tanggal: 17 Oktober 2026. Platform uji: macOS arm64. Tooling diuji dari salinan Git terpisah tanpa env private, upload, atau database aplikasi existing.

## Environment uji

| Komponen | Versi / konfigurasi |
|---|---|
| Node.js | 24.18.1 |
| npm | 11.16.0 |
| PostgreSQL | 18.3, cluster disposable dengan pgvector, loopback pada port terpisah |
| Database | LMS clone kosong, AUX kosong, bootstrap integration test, dan E2E terpisah |
| Aplikasi | Next.js 15.2.3, Prisma 6.8.2, package-lock repository |
| Browser test | Chromium terpasang lokal melalui cache Playwright |
| Env | `.env.local` sintetis, tanpa salinan secret aplikasi |

## Hasil

| Pemeriksaan | Hasil |
|---|---|
| Clone snapshot Git kandidat tanpa file ignored | Lulus |
| `npm ci --offline --no-audit --no-fund` | Lulus; dependency berasal dari cache npm, bukan node_modules project utama |
| `npm run db:migrate` terhadap LMS kosong | Lulus; migrasi initial diterapkan |
| `npm run db2:init` terhadap AUX kosong | Lulus; 12 migrasi diterapkan dan ledger tercatat |
| Status LMS dan AUX | Schema up to date; seluruh migrasi AUX applied |
| Bootstrap admin melalui stdin | Lulus; bcrypt cost 12, role dan profil admin terbentuk |
| Bootstrap ulang | Lulus; password existing tidak diganti |
| Guard role/account conflict dan rollback transaksi | Lulus pada database nyata |
| Guard AUX nonempty tanpa ledger | Lulus; tidak membuat ledger pada database yang ditolak |
| Prioritas env, ekspansi, forwarding argumen/exit code/signal | Lulus |
| Setup tests dengan database nyata | 16 test lulus, tanpa skipped |
| Jest + coverage gate | 51 suite, 985 test lulus |
| TypeScript | Lulus |
| Lint | Lulus dengan warning hook existing |
| Production build | Lulus |
| HTTP production pada loopback | Login page HTTP 200 |
| Login nyata NextAuth dengan akun bootstrap | Lulus; session ADMIN |
| Admin roles API | HTTP 200; tiga role canonical |
| Playwright, mode production, satu retry diizinkan | 46 test lulus; tidak ada flaky test yang dilaporkan |
| Dokumen dan file kandidat | Tautan/sintaks diperiksa; secret scan dijalankan sebelum commit |

Pengujian guard/bootstrap menggunakan database yang namanya diakhiri `_setup_test`; E2E memakai `lms_e2e_test`. User, password, dan konfigurasi adalah fixture uji. Tidak ada credential OpenAI yang dipakai dan tidak ada request inference berbayar.

## Batas verifikasi

- Clone adalah snapshot kandidat yang dibuat dari file versioned dan file baru yang akan di-commit; bukan clone dari remote GitHub. Repository belum memiliki remote.
- Instalasi dependency memakai cache npm lokal. Instalasi dengan cache kosong, akses registry, dan jalur proxy perusahaan belum diuji.
- PostgreSQL nyata yang diuji adalah versi 18.3. CI dikonfigurasi memakai PostgreSQL 17; eksekusi workflow GitHub belum dilakukan.
- Pengujian AI di suite memakai fixture/mock sesuai test; inference Ollama/OpenAI nyata dan kualitas skor AI belum divalidasi dalam pemeriksaan ini.
- systemd, Nginx, sertifikat TLS, managed-database TLS, multi-host, backup/restore, dan disaster recovery belum dieksekusi.
- Bootstrap hanya membuat master minimum dan admin pertama. Data akademik tetap perlu diprovisioning.
- User Management masih membutuhkan ID role STUDENT=1, TEACHER=2, ADMIN=3; bootstrap memverifikasi constraint tersebut, belum menghapus hardcode dari seluruh UI/API.

## Reproduksi oleh engineer

Ikuti [Engineering Runbook](ENGINEERING-RUNBOOK.md), terutama konfigurasi env, setup dua database, migrasi, dan bootstrap. Untuk mengulang tes integrasi, siapkan database disposable sesuai bagian testing runbook. Jangan menjalankan seed E2E atau integration setup test pada database operasional.

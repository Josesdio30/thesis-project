import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  serverExternalPackages: [],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // pdfjs-dist loads its worker (pdf.worker.mjs) from beside its own module
  // file at runtime. Bundled into .next/server/chunks that file is missing and
  // every PDF fails to parse during RAG ingest, so Node must load it from
  // node_modules.
  serverExternalPackages: ['@prisma/client', 'pdfjs-dist'],
  transpilePackages: ['next-auth'],
};

export default nextConfig;

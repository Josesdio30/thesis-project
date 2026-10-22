import { NextRequest } from 'next/server';

export interface RequestOptions {
  method?: string;
  json?: unknown;
  form?: FormData;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

/** Builds the `NextRequest` a route handler receives. */
export function buildRequest(path: string, options: RequestOptions = {}): NextRequest {
  const url = new URL(path, 'http://localhost:3000');
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);

  const headers = new Headers(options.headers);
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }

  return new NextRequest(url, { method: options.method ?? 'GET', headers, body });
}

/** The second argument App Router handlers receive: `{ params: Promise<...> }`. */
export function routeContext<T extends Record<string, string | string[]>>(params: T) {
  return { params: Promise.resolve(params) };
}

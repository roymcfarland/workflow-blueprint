export function jsonRequest(path: string, body: unknown, init?: RequestInit) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

  return new Request(new URL(path, origin), {
    ...init,
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin,
      ...init?.headers,
    },
    method: init?.method ?? "POST",
  });
}

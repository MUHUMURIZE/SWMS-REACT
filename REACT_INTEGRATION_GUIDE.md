# React Integration Guide

## Readiness

The backend is consumable by a React client using JSON over HTTPS and bearer JWT authentication. The repository's `swms-frontend` directory is empty, so this guide is based on the verified backend contract; it is not evidence of an existing or tested React app.

## Configure origins and environment

Configure backend variables in the backend deployment environment; do not copy production secrets into a Vite bundle.

| Variable | Purpose |
|---|---|
| `PORT` | Backend listen port; defaults to `3000`. |
| `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASS`/`DB_PASSWORD`, `DB_PORT` | PostgreSQL connection. |
| `DB_CONNECTION_LIMIT` | PostgreSQL pool maximum; defaults to 10. |
| `JWT_SECRET` | Random signing secret of at least 32 characters; mandatory in production. |
| `JWT_ISSUER`, `JWT_AUDIENCE` | JWT claim validation values; default to `swms-api`. |
| `CORS_ORIGINS` | Comma-separated exact browser origins; mandatory in production. Include scheme and port, with no path. |
| `SWAGGER_ENABLED` | Production Swagger opt-in; keep false unless explicitly approved. |

For local Vite development, `.env.example` includes `http://localhost:5173`. For deployment, set `CORS_ORIGINS` to the actual frontend origin, such as `https://swms.example.org`. Configure Vite separately, for example `VITE_API_BASE_URL=https://api.example.org`. The OpenAPI server URL is currently hard-coded to localhost; do not treat it as the deployed API base URL.

CORS allows `Content-Type`, `Authorization`, and `X-Audit-Reason`, and the supported methods are GET, POST, PUT, DELETE, and OPTIONS. The current bearer-token design does not use cookies, and the server does not enable credentialed CORS.

## Login and authenticated requests

1. Send `POST /api/auth/login` with `{ "email": "...", "password": "..." }`.
2. Read `data.accessToken`, `data.user`, and `data.expiresIn` from the response.
3. Attach `Authorization: Bearer <accessToken>` to protected requests.
4. Tokens expire after one hour. There is no refresh endpoint; require sign-in again after expiry.
5. Call `POST /api/auth/logout` while the token is still available, then clear client auth state.
6. A password change invalidates all outstanding tokens.

Keep tokens in memory where practical. Browser storage persists tokens across reloads but is readable by JavaScript and therefore increases impact from XSS. Never place tokens in query strings, analytics events, or error logs.

Example request helper:

```js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function apiRequest(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : options.body,
  });

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.blob();

  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    throw error;
  }
  return payload;
}
```

For JSON APIs, read `result.data`. Errors use `error.code`, `error.message`, and optional validation `error.details`. Handle 401 by clearing authentication; 403 by showing an access-denied state; 409 as a business conflict; and 429 by asking the user to wait before retrying.

## Pagination and role-based views

Paginated list endpoints use `?limit=50&offset=0`, with a maximum limit of 200. The response is `{ "data": [...] }`; there is no total count or `hasMore` property. Use a page length smaller than the requested limit to infer the last page.

The backend enforces role permissions and organization ownership. Use the returned `data.user.role` to select navigation, but do not rely on the UI to enforce security. The server remains authoritative:

- Admin: system management and admin dashboard/reports.
- Company representative: own-company collectors, households, collections, and dashboard.
- Collector: assigned households and collection work.
- Household: own self-service profile, bin, notifications, progress, and dashboard.

`GET /api/reports/collector` is intentionally management-scoped to administrators and company representatives; a collector should use `GET /api/dashboard/collector` for personal metrics.

## Downloads and uploads

There are no upload endpoints. Export requests are `GET /api/exports/{resource}/{format}` and return a file response. Use `response.blob()` rather than JSON parsing for downloads. Supported resource/format values:

- Resources: `companies`, `collectors`, `households`, `bins`, `collections`.
- Formats: `csv`, `xlsx`, `pdf`.

The response sets `Content-Disposition` with a filename, but the current CORS configuration does not expose that header to cross-origin JavaScript. For a `fetch`/Blob download, derive a filename from the requested resource and format unless the backend adds `Content-Disposition` to CORS `exposedHeaders`. Exports have no pagination and can be large; avoid triggering them repeatedly and show a loading state.

## API contract and useful links

- Endpoint inventory and request/response notes: [API_ENDPOINTS_DOCUMENTATION.md](./API_ENDPOINTS_DOCUMENTATION.md)
- Generated OpenAPI JSON: `/api-docs.json`
- Swagger UI: `/api-docs` when enabled
- Successful JSON API responses generally wrap results in `data`; errors wrap details in `error`; DELETE returns 204 with no body.

The generated OpenAPI currently omits pagination query parameters on scheduling endpoints, uses placeholder examples for some report/scheduling responses, and advertises a local server URL. Confirm these details against runtime until the spec is updated.

## Integration checklist

- [ ] Set `VITE_API_BASE_URL` to the deployed API origin.
- [ ] Add the exact frontend origin to backend `CORS_ORIGINS`.
- [ ] Verify login, token attachment, role navigation, expiry, logout, and password-change behavior.
- [ ] Exercise unauthorized and out-of-scope requests and handle 401/403/404/409 responses.
- [ ] Test pagination and CSV/XLSX/PDF downloads with realistic data volume.
- [ ] Verify HTTPS, token storage policy, and production Swagger setting.
- [ ] Add React/browser tests; none can currently run because there is no frontend package or source.
- [ ] Address collection lifecycle/notification consistency findings before live collection operations.

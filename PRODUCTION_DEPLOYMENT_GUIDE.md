# SWMS Production Deployment Guide

## 1. Infrastructure

- Provision PostgreSQL 14 or newer.
- Provision a Node.js 20 or newer runtime.
- Run the API behind TLS using a trusted reverse proxy or managed load balancer.
- Use an external process manager or container orchestrator.
- Add Redis for shared login throttling when running multiple API replicas.

## 2. Environment

Create production environment variables from `.env.example`.

Required:

- `NODE_ENV=production`
- `PORT`
- `DB_USER`
- `DB_HOST`
- `DB_NAME`
- `DB_PASS`
- `DB_PORT`
- `DB_CONNECTION_LIMIT`
- `JWT_SECRET` with at least 32 random characters
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `CORS_ORIGINS` with exact HTTPS origins
- `SWAGGER_ENABLED=false` unless Swagger is explicitly required

Never commit `.env` or deployment secrets.

## 3. Database migration

1. Take an encrypted PostgreSQL backup.
2. Confirm migration history.
3. Run `npm run migrate`.
4. Verify migrations 002 through 010 are recorded.
5. Confirm migration 008 created the district-agreement schema and history-preserving triggers, migration 009 created `company_has_active_district`, and migration 010 created fleet, assignment-history, and maintenance tables.
6. Smoke-test district, agreement, vehicle assignment, maintenance, bin, collection, notification, report, and export queries.

## 4. Application startup

From `swms-backend`:

```powershell
npm install --omit=dev
npm run migrate
npm start
```

Create the bootstrap administrator with `npm run create-admin` only on the intended first deployment.

## 5. Health and monitoring

- Monitor `GET /health`.
- Monitor PostgreSQL pool errors.
- Monitor district agreement expiry job failures and administrator notifications.
- Export audit logs to centralized and immutable storage.
- Monitor HTTP 401, 403, 429, 409, and 500 rates.
- Alert on revoked-token cleanup failures and migration failures.
- Monitor collection overdue and bin-full metrics.
- Monitor vehicle registration, insurance, and inspection expiries; maintenance reminder notifications are not yet implemented.

## 6. Security

- Rotate all previously exposed credentials.
- Restrict database network access to application hosts.
- Use HTTPS and secure reverse-proxy headers.
- Add Redis-based distributed login throttling for replica deployments.
- Keep Swagger disabled unless protected and intentionally exposed.
- Add MFA for administrators and privileged users.
- Review audit logs regularly.

## 7. Backups

- Schedule daily full PostgreSQL backups.
- Schedule point-in-time recovery where supported.
- Test restoration into a separate environment.
- Archive audit exports according to jurisdictional retention policy.

## 8. Pre-release checks

- Run `npm test`.
- Run `npm audit --omit=dev`.
- Run database migrations against a production-equivalent backup.
- Verify all role-scoped report and export endpoints.
- Verify completed collections empty bins and create notifications.
- Verify district agreements remain pending until explicitly activated, ending an agreement leaves the district unassigned, and agreement history is retained.
- Verify bin thresholds create exactly one threshold notification per crossing.
- Verify CORS and Swagger are disabled or restricted as required.

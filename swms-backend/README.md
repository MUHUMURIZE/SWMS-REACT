# Smart Waste Management System API

REST API built with Node.js, Express, PostgreSQL (`pg`), JWT, and bcrypt. The API uses role-scoped authorization and returns JSON in the shape `{ "data": ... }` for successful responses and `{ "error": { "code": "...", "message": "..." } }` for errors.

## Folder structure

```text
swms-backend/
  config/          PostgreSQL connection pool
  controllers/     Request handling and business rules
  database/        PostgreSQL schema and incremental migrations
  docs/            Endpoint examples and response shapes
  middleware/      JWT authentication, RBAC, validation, error handling
  models/          SQL access for each domain entity
  docs/            Swagger/OpenAPI configuration and API documentation
  routes/          REST endpoint definitions
  scripts/         Initial administrator bootstrap
  services/        Transactional account, district, and fleet workflows
  tests/           Node test-runner tests
  utils/           Errors, async handling, transactions
  validation/      Request schemas
  server.js        Express app and route mounting
```

## Start locally

1. Install PostgreSQL and its command-line tools (`psql`, `createdb`). Create the database:

   ```sql
   CREATE DATABASE "SWMS_db";
   ```

   Or from PowerShell: `createdb -U postgres "SWMS_db"`.

2. Copy `.env.example` to `.env`. It contains the requested PostgreSQL variable names and defaults (`DB_USER=postgres`, `DB_HOST=localhost`, `DB_NAME=SWMS_db`, `DB_PORT=5432`). Set `DB_PASS` to your local database password and `JWT_SECRET` to a securely generated random value of at least 32 characters. Do not commit `.env` or use a weak development secret outside local testing.
3. Apply the schema to the selected database:

   ```powershell
   psql -U postgres -d "SWMS_db" -f database\schema.sql
   npm run migrate
   ```

4. Install the backend dependencies and create the first administrator:

   ```powershell
   npm install
   # Set BOOTSTRAP_ADMIN_* values in .env first.
   npm run create-admin
   npm start
   ```

The API listens on `http://localhost:3000` by default. `GET /health` checks connectivity to PostgreSQL. The first administrator is created only by the bootstrap script; subsequent accounts are created through the protected API.

## Production configuration

- Set `API_SERVER_URL` to the public API origin used in OpenAPI documentation and `CORS_ORIGINS` to the exact permitted frontend origins.
- Set `DB_SSL_MODE=verify-full` in production. PostgreSQL certificate verification cannot be disabled in production; optionally set `DB_SSL_CA_FILE` to the trusted PEM CA bundle path. Local development defaults to `disable`.
- Set `REDIS_URL` to a TLS `rediss://` endpoint for production. API, authentication, and device-ingestion limits use Redis-backed shared storage, and the server waits for Redis before accepting requests; it does not fall back to per-process throttling in production.
- Default limits are 600 general API requests per IP per 15 minutes, 60 authentication requests per IP per 15 minutes (plus 10 failed login attempts per IP/email per 15 minutes), 600 GPS messages per device per minute, 120 bin messages per device per minute, and 12,000 ingestion requests per IP per minute. Configure `API_RATE_LIMIT_PER_15_MINUTES`, `AUTH_RATE_LIMIT_PER_15_MINUTES`, `GPS_DEVICE_INGESTION_LIMIT_PER_MINUTE`, `IOT_DEVICE_INGESTION_LIMIT_PER_MINUTE`, and `DEVICE_INGESTION_IP_LIMIT_PER_MINUTE` to fit measured traffic. Device ingestion is excluded from the general API limit.
- Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse-proxy hops, or leave it at `0` when the API is directly exposed. Do not trust forwarded headers from untrusted clients.
- Set frontend `VITE_API_BASE_URL` to the HTTPS API origin when building a deployment; the localhost fallback is for development only.
- Keep Redis and database credentials in the deployment secret manager. Do not put production credentials in `.env.example` or commit them.
- `GET /health` checks PostgreSQL only. On `SIGTERM`/`SIGINT`, the API stops accepting requests, drains active HTTP work, then closes PostgreSQL and Redis; allow up to 30 seconds for shutdown.

See the [production deployment guide](../PRODUCTION_DEPLOYMENT_GUIDE.md) for environment separation, backup/restore, HTTPS, monitoring, and release procedures. Password recovery endpoints are not currently implemented.

## Database

`database/schema.sql` creates the core PostgreSQL schema. `npm run migrate` applies additive operational, security, district-agreement, and fleet migrations. Profile `id` values are the resource IDs used by `/api/representatives/:id`, `/api/collectors/:id`, `/api/households/:id`, and `collectionId` relationships. `userId` is the authentication account ID.

Relationship summary: each company has one Company Representative account; that representative manages the company's collectors, households, and collections. Each collector profile has households; collections link one household to its assigned collector; users own notifications and revoked-token records.

## Authorization notes

- Roles are `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR`, and `HOUSEHOLD`.
- `POST /api/auth/register` is admin-only. Its body must include fields for the requested role: `companyId` for a representative, `representativeId` for a collector, and `collectorId` plus `address` for a household.
- Each company has at most one Company Representative. That person can manage the company's collectors, households, and collections.
- Company Representatives manage only their own vehicles; National Administrators have national visibility. Vehicle assignment requires the collector to belong to the same company and an active agreement for the collector's district. Ending that agreement automatically releases affected vehicles and preserves assignment history.
- Collectors can view only their currently assigned vehicle when its district remains authorized. Maintenance and assignment histories are retained and paginated.
- Collectors create, view, update, and delete only their households. Admins retain system-wide access.
- Household self-service routes return only the authenticated household's data.
- Creating or changing a collection creates a notification for the affected household.
- Logout revokes the current JWT. Changing a password increments the user's token version, invalidating all outstanding tokens.
- Deleting a representative or collector cascades through that account's lower-level household accounts and their collections. Company deletion is rejected while representatives are assigned.
- Collection statuses are `pending`, `scheduled`, `in_progress`, `collected`, `completed`, `missed`, and `cancelled`. New collections may start only as `pending` or `scheduled`; subsequent transitions are enforced by the API and PostgreSQL migration.
- Completing a collection atomically updates its state, empties the household bin, creates completion notifications, and writes the audit record. Repeated or concurrent completion requests do not repeat those side effects.

## Fleet management

- `GET /api/vehicles` lists vehicles visible to the authenticated administrator, company, or assigned collector.
- `POST /api/vehicles` registers a vehicle. Administrators must supply `companyId`; representatives are always bound to their own company.
- `PUT /api/vehicles/:id` updates registration, type, make/model, capacity, fuel, and expiry details.
- `PUT /api/vehicles/:id/assignment` assigns an available vehicle to a company collector; `DELETE /api/vehicles/:id/assignment` releases it.
- `PUT /api/vehicles/:id/status` sets `AVAILABLE`, `MAINTENANCE`, or `INACTIVE`. An assigned vehicle must first be released.
- `GET /api/vehicles/:id/assignments` returns assignment history.
- `GET/POST /api/vehicles/:id/maintenance` reads service history and schedules maintenance. `PUT /api/vehicles/:id/maintenance/:maintenanceId/status` completes or cancels a scheduled record.

Fleet records do not represent live GPS telemetry. Hardware tracking, routing, and sensor ingestion are separate phases and must not be simulated as real data.

## Swagger API documentation and testing

Start the backend and open [Swagger UI](http://localhost:3000/api-docs) at `http://localhost:3000/api-docs`. The OpenAPI JSON is available at `http://localhost:3000/api-docs.json`. Route definitions are scanned from `routes/`, and request body schemas are generated from `validation/schemas.js`.

To test protected endpoints, run `POST /api/auth/login` in Swagger with an account's email and password. Copy `data.accessToken` from the response, select **Authorize**, paste the token, and confirm. Swagger applies it to protected requests. Choose an endpoint, select **Try it out**, enter its parameters or JSON body, then select **Execute**. Authorization requirements and examples are shown for each endpoint. Create a company and its representative as an administrator before testing company-managed resources.

## PostgreSQL migration

See [PostgreSQL migration checklist](docs/MIGRATION-POSTGRESQL.md) for the source conversion checklist and commands for migrating an existing MySQL database.

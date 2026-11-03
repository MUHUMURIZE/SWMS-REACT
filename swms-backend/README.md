# Smart Waste Management System API

REST API built with Node.js, Express, PostgreSQL (`pg`), JWT, and bcrypt. The API uses role-scoped authorization and returns JSON in the shape `{ "data": ... }` for successful responses and `{ "error": { "code": "...", "message": "..." } }` for errors.

## Folder structure

```text
swms-backend/
  config/          PostgreSQL connection pool
  controllers/     Request handling and business rules
  database/        MySQL schema
  docs/            Endpoint examples and response shapes
  middleware/      JWT authentication, RBAC, validation, error handling
  models/          SQL access for each domain entity
  docs/            Swagger/OpenAPI configuration and API documentation
  routes/          REST endpoint definitions
  scripts/         Initial administrator bootstrap
  services/        Shared account creation transaction
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
   ```

4. Install the backend dependencies and create the first administrator:

   ```powershell
   npm install
   # Set BOOTSTRAP_ADMIN_* values in .env first.
   npm run create-admin
   npm start
   ```

The API listens on `http://localhost:3000` by default. `GET /health` checks connectivity to PostgreSQL. The first administrator is created only by the bootstrap script; subsequent accounts are created through the protected API.

## Database

`database/schema.sql` creates PostgreSQL enum types, companies, users, representative/collector/household profiles, collections, notifications, and revoked-token tables. Profile `id` values are the resource IDs used by `/api/representatives/:id`, `/api/collectors/:id`, `/api/households/:id`, and `collectionId` relationships. `userId` is the authentication account ID.

Relationship summary: each company has one Company Representative account; that representative manages the company's collectors, households, and collections. Each collector profile has households; collections link one household to its assigned collector; users own notifications and revoked-token records.

## Authorization notes

- Roles are `ADMIN`, `COMPANY_REPRESENTATIVE`, `COLLECTOR`, and `HOUSEHOLD`.
- `POST /api/auth/register` is admin-only. Its body must include fields for the requested role: `companyId` for a representative, `representativeId` for a collector, and `collectorId` plus `address` for a household.
- Each company has at most one Company Representative. That person can manage the company's collectors, households, and collections.
- Collectors create, view, update, and delete only their households. Admins retain system-wide access.
- Household self-service routes return only the authenticated household's data.
- Creating or changing a collection creates a notification for the affected household.
- Logout revokes the current JWT. Changing a password increments the user's token version, invalidating all outstanding tokens.
- Deleting a representative or collector cascades through that account's lower-level household accounts and their collections. Company deletion is rejected while representatives are assigned.
- Collection statuses are `pending`, `scheduled`, `in_progress`, `collected`, `completed`, and `missed`.

## Swagger API documentation and testing

Start the backend and open [Swagger UI](http://localhost:3000/api-docs) at `http://localhost:3000/api-docs`. The OpenAPI JSON is available at `http://localhost:3000/api-docs.json`. Route definitions are scanned from `routes/`, and request body schemas are generated from `validation/schemas.js`.

To test protected endpoints, run `POST /api/auth/login` in Swagger with an account's email and password. Copy `data.accessToken` from the response, select **Authorize**, paste the token, and confirm. Swagger applies it to protected requests. Choose an endpoint, select **Try it out**, enter its parameters or JSON body, then select **Execute**. Authorization requirements and examples are shown for each endpoint. Create a company and its representative as an administrator before testing company-managed resources.

## PostgreSQL migration

See [PostgreSQL migration checklist](docs/MIGRATION-POSTGRESQL.md) for the source conversion checklist and commands for migrating an existing MySQL database.

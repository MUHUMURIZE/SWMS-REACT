# Swagger API testing

Swagger UI is the interactive API documentation and testing interface:

- UI: `http://localhost:3000/api-docs`
- OpenAPI JSON: `http://localhost:3000/api-docs.json`

## Start the API

From the `swms-backend` directory, configure the PostgreSQL connection and `JWT_SECRET` in `.env`, then run:

```powershell
npm start
```

The server must be running before opening Swagger UI.

## Authenticate

1. Expand **Auth → POST /api/auth/login**, select **Try it out**, and enter an account email and password.
2. Select **Execute** and copy the `data.accessToken` value from the response.
3. Select **Authorize** near the top of the page, paste the token, and select **Authorize**, then **Close**. Paste only the JWT; Swagger adds the `Bearer` prefix.
4. Use **Try it out** and **Execute** on protected endpoints. Select **Authorize** again to replace or clear the saved token.

The token expires after one hour. Log in again and replace it when a protected request returns `401`.

## Create and manage SWMS records

Use an administrator token to create a company, then create its Company Representative using the new company's ID. Each company may have at most one representative. Log in as the representative to manage that company's collectors, households, and collections. Use the examples displayed on each operation and supply the referenced profile IDs.

Swagger lists every route from `routes/`, describes authorization requirements, and generates JSON request body schemas from `validation/schemas.js`. Endpoints are grouped under Auth, Companies, Representatives, Collectors, Households, Collections, Notifications, Dashboards, and Self Service.

## Fleet vehicles

Fleet endpoints are available under `/api/vehicles`. Administrators can manage vehicles nationally; Company Representatives can manage only their company's fleet; Collectors can read only vehicles assigned to them while their district agreement is active.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/vehicles` | List vehicles in the authenticated role's scope |
| `POST` | `/api/vehicles` | Register a vehicle |
| `GET` | `/api/vehicles/:id` | Get a vehicle |
| `PUT` | `/api/vehicles/:id` | Update vehicle details |
| `PUT` | `/api/vehicles/:id/status` | Set availability, maintenance, or inactive status |
| `PUT` | `/api/vehicles/:id/assignment` | Assign an available vehicle to a same-company collector |
| `DELETE` | `/api/vehicles/:id/assignment` | Release the current assignment |
| `GET` | `/api/vehicles/:id/assignments` | Read paginated assignment history |
| `GET` | `/api/vehicles/:id/maintenance` | Read paginated maintenance history |
| `POST` | `/api/vehicles/:id/maintenance` | Schedule service |
| `PUT` | `/api/vehicles/:id/maintenance/:maintenanceId/status` | Complete or cancel scheduled service |

Vehicle records include registration, type, make/model, capacity, fuel type, and registration/insurance/inspection expiry dates. Assignment is restricted to collectors in the vehicle's company with active district authorization. Ending an agreement automatically releases assigned vehicles and records the assignment end. No GPS positions are fabricated or implied by fleet records.

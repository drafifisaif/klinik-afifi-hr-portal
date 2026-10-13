# Klinik Afifi HR API v1

Base URL: `https://hr.klinikafifi.com.my/api/v1`

This is a read-only, server-to-server API. It authenticates an existing Klinik Afifi portal user with that user's Supabase access token. It does not issue API keys or accept Supabase service-role keys. Requests use the same role permissions as the portal; Branch PIC roster and staff results are limited to their linked branch, while staff attendance and roster results are limited to their own linked staff record.

## Authentication

Send the current Supabase access token in every request:

```http
Authorization: Bearer <supabase_access_token>
Accept: application/json
```

The token must belong to an active portal user. Do not put it in a URL, browser bundle, source control, or logs. Tokens expire; the calling application should use the normal Supabase Auth refresh flow and send the refreshed access token.

## Endpoints

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/me` | Any authenticated portal user | Minimal identity and role context |
| GET | `/staff` | Roles allowed to open Staff | Staff directory, paginated; Branch PIC sees own branch |
| GET | `/attendance` | Roles allowed to open Attendance | Attendance rows for a date range, paginated |
| GET | `/roster` | Roles allowed to open Roster | Roster rows for a date range, paginated |

Attendance and roster dates use `from=YYYY-MM-DD` and `to=YYYY-MM-DD`; the inclusive range may span at most 370 days. Alternatively, pass `ranges` as JSON containing one to four `{ "start", "end" }` ranges. Page defaults to `1`, `per_page` defaults to `100`, and `per_page` cannot exceed `100`.

Example:

```bash
curl --get 'https://hr.klinikafifi.com.my/api/v1/attendance' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN' \
  --data-urlencode 'from=2026-10-01' \
  --data-urlencode 'to=2026-10-31' \
  --data-urlencode 'page=1' \
  --data-urlencode 'per_page=100'
```

Paginated endpoints return `{ "data": [], "pagination": { "page": 1, "per_page": 100, "total": 0, "total_pages": 0 } }`. Attendance omits IP addresses and exact GPS coordinates. Staff returns only directory fields; it does not return identity-card numbers, addresses, or emergency contacts.

## Responses and errors

Successful responses are JSON and set `Cache-Control: private, no-store`. Errors use `{ "error": { "code": "...", "message": "..." } }`.

| Status | Meaning |
| --- | --- |
| 400 | Invalid pagination or date range |
| 401 | Missing, invalid, or expired bearer token |
| 403 | The authenticated role cannot access that resource |
| 500 | Data query failed |
| 503 | Supabase authentication is not configured |

The machine-readable contract is [`openapi/hr-api-v1.json`](../openapi/hr-api-v1.json).

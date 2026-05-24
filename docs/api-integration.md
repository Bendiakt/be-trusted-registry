# MyDD API Integration Guide

**Audience:** ERP developers, mandataires platforms, white-label partners  
**Base URL (production):** `https://api.mydd.work`  
**Base URL (staging):** `https://api-staging.mydd.work`  
**OpenAPI spec:** `GET /api/docs`

---

## Authentication

MyDD supports two authentication methods. API keys are recommended for B2B server-to-server integrations.

### API Keys (recommended for server integrations)

API keys are long-lived credentials scoped to specific operations. They are issued per MyDD account and suitable for ERP systems, automation pipelines, and white-label integrations.

**Key format:** `mydd_lk_<48 hex chars>` (production) / `mydd_tk_<48 hex chars>` (staging)

**Sending the key — two accepted methods:**

```http
# Option 1 — Authorization header (preferred)
Authorization: Bearer mydd_lk_abc123...

# Option 2 — X-API-Key header
X-API-Key: mydd_lk_abc123...
```

### JWT (for user-facing clients)

Session-based auth via `POST /api/auth/login`. Returns an httpOnly cookie. Not suitable for server integrations.

---

## Creating an API Key

From your MyDD dashboard → **API Keys** tab, or via API:

```http
POST /api/keys
Authorization: Bearer <your-existing-key-with-company:write-scope>
Content-Type: application/json

{
  "name": "ERP Production",
  "scopes": ["registry:read", "verify:read"],
  "rateLimit": 120,
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

**Response (201) — raw key shown ONCE, store immediately:**

```json
{
  "id": 42,
  "prefix": "mydd_lk_abc1",
  "name": "ERP Production",
  "scopes": ["registry:read", "verify:read"],
  "rateLimit": 120,
  "createdAt": "2026-05-13T12:00:00Z",
  "key": "mydd_lk_abc123def456..."
}
```

> **Security:** The raw `key` value is returned exactly once and never stored by MyDD. If lost, revoke the key and create a new one.

---

## Available Scopes

| Scope | Access |
|-------|--------|
| `registry:read` | `GET /api/registry` — search certified suppliers |
| `verify:read` | `GET /api/verify/:id` — verify a specific company |
| `company:read` | `GET /api/companies/:id` — read company profile |
| `company:write` | `POST /PATCH` on company endpoints |
| `admin` | Full access (internal use only) |

Default scopes when not specified: `["registry:read", "verify:read"]`

---

## Core Endpoints

### Search the registry

```http
GET /api/registry?search=acme&country=AE&level=2&page=1&limit=50
X-API-Key: mydd_lk_...
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Company name, country, or sector (partial match) |
| `country` | string | ISO country name filter |
| `level` | integer | Minimum certification level (1–3) |
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Results per page (default: 50, max: 200) |

**Response (200):**

```json
{
  "data": [
    {
      "id": 1,
      "company_name": "Acme Trading LLC",
      "country": "United Arab Emirates",
      "sector": "Trading",
      "certification_level": 2,
      "status": "active"
    }
  ],
  "total": 128,
  "page": 1,
  "limit": 50
}
```

### Verify a specific company

```http
GET /api/verify/1
X-API-Key: mydd_lk_...
```

**Response (200):**

```json
{
  "company": {
    "id": 1,
    "company_name": "Acme Trading LLC",
    "country": "United Arab Emirates",
    "sector": "Trading",
    "certification_level": 2,
    "status": "active",
    "website": "https://acme.ae"
  },
  "certification": {
    "level": 2,
    "status": "active",
    "granted_at": "2025-11-01T00:00:00Z",
    "expires_at": "2026-11-01T00:00:00Z"
  }
}
```

**Response (404):** `{ "error": "Company not found" }`

---

## Webhooks — Real-Time Certification Events

Webhooks push certification events to your server the moment they occur, eliminating polling.

### Registering an endpoint

```http
POST /api/webhooks
Authorization: Bearer mydd_lk_...
Content-Type: application/json

{
  "url": "https://your-erp.com/hooks/mydd",
  "events": ["cert.status_changed", "cert.issued"],
  "description": "ERP supplier sync"
}
```

**Response (201) — signing secret shown ONCE, store immediately:**

```json
{
  "id": 7,
  "url": "https://your-erp.com/hooks/mydd",
  "events": ["cert.status_changed", "cert.issued"],
  "active": true,
  "secret": "a3f9b2c1d8e7..."
}
```

### Available events

| Event | Trigger |
|-------|---------|
| `cert.status_changed` | Certification level or status modified by admin |
| `cert.issued` | New certificate granted |
| `cert.expired` | Certificate passed its expiry date |
| `cert.revoked` | Certificate manually revoked |

### Payload format

```json
{
  "event": "cert.status_changed",
  "companyId": 1,
  "companyName": "Acme Trading LLC",
  "level": 2,
  "status": "active",
  "delivered_at": "2026-05-13T14:30:00.000Z"
}
```

### Verifying the signature (MANDATORY)

Every webhook request includes an `X-MyDD-Signature` header. **You must verify this signature before processing the payload** to prevent spoofed requests.

**Header format:** `X-MyDD-Signature: sha256=<hex>`

**Verification — Node.js:**

```js
const crypto = require('crypto')

function verifyWebhookSignature(rawBody, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  // Use timingSafeEqual to prevent timing attacks
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// Express example
app.post('/hooks/mydd', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-mydd-signature']
  if (!verifyWebhookSignature(req.body, sig, process.env.MYDD_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature')
  }
  const event = JSON.parse(req.body)
  // process event...
  res.sendStatus(200)
})
```

**Verification — Python:**

```python
import hmac, hashlib

def verify_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = 'sha256=' + hmac.new(
        secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

### Retry policy

MyDD retries failed deliveries (non-2xx or timeout) with exponential back-off:

| Attempt | Delay after previous failure |
|---------|------------------------------|
| 1 | Immediate |
| 2 | 30 seconds |
| 3 | 60 seconds |
| 4 | 120 seconds |
| 5 | 300 seconds |

After 5 failures, the endpoint is automatically deactivated. Re-activate it from the dashboard after fixing the issue.

**Your endpoint must respond within 10 seconds.** Return HTTP 2xx to acknowledge. Any other response or timeout counts as a failure.

### Testing your endpoint

```http
POST /api/webhooks/7/ping
Authorization: Bearer mydd_lk_...
```

Returns the signature and payload that would be sent, so you can verify your implementation against a known value before going live.

---

## Rate Limits

| Context | Default limit |
|---------|---------------|
| API key requests | 60 req/min (configurable per key, max 600) |
| Create API key | 10 keys/hour per account |
| Register webhook | 20 endpoints/hour per account |

Rate limit headers on every response:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 57
X-RateLimit-Reset: 1716300060
```

When the limit is exceeded: HTTP 429 with `{ "error": "Too many requests" }`.

---

## Error Reference

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | Bad Request | Validation error — check the `error` field |
| 401 | Unauthorized | Missing, invalid, revoked, or expired API key |
| 403 | Forbidden | Valid key but missing required scope |
| 404 | Not Found | Resource does not exist |
| 429 | Too Many Requests | Rate limit exceeded — retry after `X-RateLimit-Reset` |
| 500 | Internal Error | Server error — retry with exponential back-off |

Error response format:

```json
{ "error": "Scope 'verify:read' required" }
```

---

## SDK Examples

### Node.js / TypeScript

```ts
const MYDD_KEY = process.env.MYDD_API_KEY

async function getSupplier(companyId: number) {
  const res = await fetch(`https://api.mydd.work/api/verify/${companyId}`, {
    headers: { 'Authorization': `Bearer ${MYDD_KEY}` },
  })
  if (!res.ok) throw new Error(`MyDD API ${res.status}`)
  return res.json()
}

async function searchRegistry(params: { search?: string; level?: number; country?: string }) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null) as any)
  const res = await fetch(`https://api.mydd.work/api/registry?${qs}`, {
    headers: { 'X-API-Key': MYDD_KEY! },
  })
  if (!res.ok) throw new Error(`MyDD API ${res.status}`)
  return res.json()
}
```

### Python

```python
import httpx

MYDD_KEY = os.environ["MYDD_API_KEY"]
BASE = "https://api.mydd.work"

def verify_supplier(company_id: int) -> dict:
    r = httpx.get(f"{BASE}/api/verify/{company_id}",
                  headers={"Authorization": f"Bearer {MYDD_KEY}"}, timeout=10)
    r.raise_for_status()
    return r.json()

def search_registry(search: str = "", level: int = 0, country: str = "") -> dict:
    r = httpx.get(f"{BASE}/api/registry",
                  params={"search": search, "level": level, "country": country},
                  headers={"X-API-Key": MYDD_KEY}, timeout=10)
    r.raise_for_status()
    return r.json()
```

---

## Support

- **Interactive API explorer:** `https://api.mydd.work/api/docs`
- **Status page:** `https://api.mydd.work/status`
- **Technical support:** contact your B&E Consult account manager

---

*Last updated: 2026-05-13 — MyDD API v1*

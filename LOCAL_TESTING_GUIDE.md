# Local Testing Guide - Trasealla CRM

## Quick Start

Both servers are running:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:4000

---

## Test 1: Try the Demo (Existing Tenant)

### Open Browser
```
http://localhost:5173
```

### Click "Try Demo" or go to Login
```
http://localhost:5173/login
```

### Login Credentials

| User | Username | Password | Role |
|------|----------|----------|------|
| Platform Admin | `osama` | `ALPHa251611@` | Super Admin (can manage all tenants) |
| Tenant Admin | `admin` | `Trasealla123` | Admin (Trasealla tenant) |
| Demo User | `demo` | `demo123` | Staff (Trasealla tenant) |

---

## Test 2: Register a New Company (Multi-Tenant Test)

### Method A: Using the UI

1. Go to: http://localhost:5173/register
2. Fill in the form:
   - Company Name: `ABC Corporation`
   - Your Name: `John Doe`
   - Email: `john@abc.com`
   - Industry: `Technology`
   - Password: `Test123456`
   - Confirm Password: `Test123456`
3. Click "Start Free Trial"
4. You're now logged in as the admin of your new company!

### Method B: Using curl (API)

```bash
curl -X POST http://localhost:4000/api/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "ABC Corporation",
    "email": "john@abc.com",
    "password": "Test123456",
    "full_name": "John Doe",
    "industry": "Technology"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "tenant": {
      "id": 2,
      "name": "ABC Corporation",
      "slug": "abc-corporation",
      "subdomain": "abc-corporation",
      "trial_ends_at": "2026-01-08..."
    },
    "user": {
      "id": 9,
      "username": "john",
      "email": "john@abc.com",
      "role": "admin"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

## Test 3: Login & Verify Tenant Isolation

### Login as Tenant 1 (Trasealla)

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo123"}'
```

Save the token, then:

```bash
TOKEN1="<token from above>"

# Create a contact for Trasealla tenant
curl -X POST http://localhost:4000/api/contacts \
  -H "Authorization: Bearer $TOKEN1" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Alice","last_name":"Smith","email":"alice@trasealla.com"}'
```

### Login as Tenant 2 (ABC Corporation)

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"john","password":"Test123456"}'
```

Save the token, then:

```bash
TOKEN2="<token from above>"

# Create a contact for ABC Corporation tenant
curl -X POST http://localhost:4000/api/contacts \
  -H "Authorization: Bearer $TOKEN2" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Bob","last_name":"Jones","email":"bob@abc.com"}'

# List contacts - should only see ABC Corporation's contact!
curl http://localhost:4000/api/contacts \
  -H "Authorization: Bearer $TOKEN2"
```

**Result:** Each tenant only sees their own data!

---

## Test 4: Test All CRM Modules

### Using the Browser (Recommended)

1. Login at http://localhost:5173/login
2. Navigate through the sidebar:

| Module | URL | What to Test |
|--------|-----|--------------|
| Dashboard | `/dashboard` | Stats, recent activity |
| Leads | `/leads` | Create, edit, convert to deal |
| Deals | `/deals` | Kanban board, pipeline |
| Contacts | `/contacts` | CRUD operations |
| Accounts | `/accounts` | Company management |
| Activities | `/activities` | Tasks, calls, meetings |
| Calendar | `/calendar` | Schedule activities |
| Products | `/products` | Product catalog |
| Tags | `/tags` | Organize with tags |
| Notes | `/notes` | Add notes to records |
| Reports | `/reports` | View analytics |

### Quick API Tests

```bash
# Get a token first
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Trasealla123"}' | jq -r '.token')

# Test each endpoint
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/stats
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/leads
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/deals
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/contacts
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/accounts
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/activities
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/products
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/tags
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/notes
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/pipelines
```

---

## Test 5: Platform Admin Features

Login as the Platform Super Admin (`osama`):

```bash
# Login
ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"osama","password":"ALPHa251611@"}' | jq -r '.token')

# List ALL tenants
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4000/api/tenants

# Get specific tenant details
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4000/api/tenants/1

# Suspend a tenant
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4000/api/tenants/2/suspend

# Re-activate a tenant
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:4000/api/tenants/2/activate

# Generate a license key
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:4000/api/tenants/licenses/generate \
  -d '{
    "license_type": "professional",
    "max_users": 25,
    "expires_in_days": 365
  }'
```

---

## Test 6: License Key Flow (Self-Hosted Simulation)

### Step 1: Generate License (as Platform Admin)

```bash
LICENSE_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:4000/api/tenants/licenses/generate \
  -d '{"license_type":"enterprise","max_users":50,"expires_in_days":365}')

echo $LICENSE_RESPONSE
# Returns: { "license_key": "TRAS-ENT-XXXXX-XXXX", ... }
```

### Step 2: Activate License (as New Customer)

```bash
LICENSE_KEY="TRAS-ENT-XXXXX-XXXX"  # Use the key from above

curl -X POST http://localhost:4000/api/tenants/licenses/activate \
  -H "Content-Type: application/json" \
  -d "{
    \"license_key\": \"$LICENSE_KEY\",
    \"company_name\": \"Enterprise Corp\",
    \"email\": \"admin@enterprise.com\",
    \"password\": \"Secure123!\",
    \"full_name\": \"Enterprise Admin\"
  }"
```

---

## Test 7: Multi-Language (RTL Support)

1. Login at http://localhost:5173/login
2. Click the language dropdown (top right, shows "EN-US")
3. Select "العربية" (Arabic)
4. The entire UI should flip to RTL!

---

## Troubleshooting

### Backend not running?
```bash
cd /Users/usama/Desktop/trasealla/crm-backend
npm run dev
```

### Frontend not running?
```bash
cd /Users/usama/Desktop/trasealla/crm-frontend
npm run dev
```

### Database connection issues?
Check `.env` file in crm-backend:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=trasealla_crm
```

### See server logs
Backend logs appear in the terminal where you ran `npm run dev`

---

## Quick Reference URLs

| Description | URL |
|-------------|-----|
| Landing Page | http://localhost:5173 |
| Login | http://localhost:5173/login |
| Register | http://localhost:5173/register |
| Dashboard | http://localhost:5173/dashboard |
| API Health Check | http://localhost:4000/api/health |
| API Docs | See `ARCHITECTURE.md` |



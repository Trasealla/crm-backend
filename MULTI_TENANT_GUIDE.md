# Multi-Tenant CRM Implementation Guide

## Architecture Overview

Your CRM now supports **multi-tenancy** - the ability to serve multiple customers (tenants) from a single deployment while keeping their data completely isolated.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        TRASEALLA CRM PLATFORM                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                       MULTI-TENANT DATABASE                             │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │ │
│  │  │  tenants    │  │ subscriptions│  │license_keys │  │   staff     │    │ │
│  │  │  table      │  │   table     │  │   table     │  │ (users)     │    │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │ │
│  │         │                │                │                │           │ │
│  │         └────────────────┴────────────────┴────────────────┘           │ │
│  │                                   │                                     │ │
│  │                          All CRM tables                                 │ │
│  │                         have tenant_id                                  │ │
│  │  ┌────────────┬────────────┬────────────┬────────────┬────────────┐   │ │
│  │  │ contacts   │  leads     │   deals    │ activities │  products  │   │ │
│  │  │ tenant_id  │ tenant_id  │ tenant_id  │ tenant_id  │ tenant_id  │   │ │
│  │  └────────────┴────────────┴────────────┴────────────┴────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Business Model Flow

### Flow 1: SaaS (Cloud-Hosted)

```
CUSTOMER JOURNEY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. DISCOVERY
   │
   └── Customer visits: https://crm.trasealla.com
       │
       └── Clicks "Start Free Trial"

2. REGISTRATION (POST /api/tenants/register)
   │
   ├── Creates Tenant record
   │   └── Name: "ABC Corporation"
   │   └── Slug: "abc-corporation"
   │   └── Subdomain: "abc-corporation"
   │   └── Status: "trial"
   │   └── Trial ends: 14 days from now
   │
   ├── Creates Subscription
   │   └── Plan: "trial"
   │   └── Max users: 3
   │   └── Features: basic CRM
   │
   ├── Creates Admin User
   │   └── Role: "admin"
   │   └── Is Owner: true
   │
   └── Returns JWT token → Auto-login

3. TRIAL PERIOD (14 days)
   │
   ├── Full access to CRM
   │   └── Leads, Deals, Contacts, Activities
   │   └── Reports, Calendar, Notes
   │   └── Basic workflows
   │
   └── Upgrade prompts shown
       └── "X days left in trial"
       └── "Upgrade to unlock more features"

4. SUBSCRIPTION (Upgrade)
   │
   ├── Plans Available:
   │   │
   │   ├── STARTER ($29/month)
   │   │   └── 5 users
   │   │   └── Core CRM
   │   │   └── Basic reports
   │   │
   │   ├── PROFESSIONAL ($79/month)
   │   │   └── 25 users
   │   │   └── Full CRM + Workflows
   │   │   └── Advanced reports
   │   │   └── Integrations
   │   │
   │   └── ENTERPRISE ($199/month)
   │       └── Unlimited users
   │       └── All features
   │       └── Custom branding
   │       └── Priority support
   │
   └── Payment → Stripe Integration (TODO)

5. ONGOING USAGE
   │
   ├── Tenant uses CRM at: https://abc-corporation.crm.trasealla.com
   │   └── Or: https://crm.trasealla.com (login shows their tenant)
   │
   ├── Data isolation ensured:
   │   └── All queries filtered by tenant_id
   │   └── Users can only see their company's data
   │
   └── Usage tracked:
       └── User count
       └── Feature usage
       └── API calls
```

### Flow 2: Self-Hosted (On-Premise)

```
SELF-HOSTED LICENSE FLOW:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. PURCHASE
   │
   └── Customer buys license from Trasealla
       └── One-time or annual fee
       └── License key generated

2. GENERATE LICENSE (Admin Panel)
   │
   POST /api/tenants/licenses/generate
   │
   ├── License Type: "enterprise"
   ├── Max Users: 50
   ├── Expires: 1 year
   │
   └── Returns: TRAS-ENT-1A2B3C4D-EFGH5678

3. CUSTOMER DEPLOYMENT
   │
   ├── Customer downloads CRM package
   │
   ├── Deploys on their infrastructure:
   │   └── Docker Compose
   │   └── Kubernetes
   │   └── Manual installation
   │
   └── Enters license key during setup

4. LICENSE ACTIVATION
   │
   POST /api/tenants/licenses/activate
   │
   ├── Validates license key
   ├── Creates tenant
   ├── Creates admin user
   │
   └── CRM ready to use!

5. LICENSE VALIDATION (Periodic)
   │
   POST /api/tenants/licenses/validate
   │
   └── Checks:
       └── Key is valid
       └── Not expired
       └── Within user limit
```

## API Endpoints

### Public Endpoints (No Auth Required)

```bash
# Register new tenant
POST /api/tenants/register
{
  "company_name": "My Company",
  "email": "admin@mycompany.com",
  "password": "SecurePass123",
  "full_name": "John Doe",
  "industry": "Technology"
}

# Check availability
GET /api/tenants/check-availability?slug=my-company&email=admin@mycompany.com

# Validate license
POST /api/tenants/licenses/validate
{
  "license_key": "TRAS-ENT-XXXXX-XXXX"
}

# Activate license
POST /api/tenants/licenses/activate
{
  "license_key": "TRAS-ENT-XXXXX-XXXX",
  "company_name": "Customer Corp",
  "email": "admin@customer.com",
  "password": "SecurePass123"
}
```

### Authenticated Endpoints (Tenant Users)

```bash
# Get current tenant info
GET /api/tenants/current
Authorization: Bearer <token>

# Update tenant settings
PATCH /api/tenants/current
{
  "name": "Updated Name",
  "timezone": "America/New_York"
}

# Get subscription info
GET /api/tenants/subscription

# Get usage stats
GET /api/tenants/usage
```

### Platform Admin Endpoints (Trasealla Staff Only)

```bash
# List all tenants
GET /api/tenants
Authorization: Bearer <platform_admin_token>

# Get specific tenant
GET /api/tenants/:id

# Update tenant
PATCH /api/tenants/:id
{
  "status": "active",
  "plan": "professional"
}

# Suspend tenant
POST /api/tenants/:id/suspend

# Activate tenant
POST /api/tenants/:id/activate

# Delete tenant
DELETE /api/tenants/:id

# Generate license key
POST /api/tenants/licenses/generate
{
  "license_type": "professional",
  "max_users": 25,
  "expires_in_days": 365
}
```

## Database Schema

### Core Multi-Tenant Tables

```sql
-- Tenants (Companies/Organizations)
CREATE TABLE tenants (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  subdomain VARCHAR(100) UNIQUE,
  domain VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  logo_url VARCHAR(500),
  industry VARCHAR(100),
  status ENUM('active', 'trial', 'suspended', 'cancelled'),
  trial_ends_at DATETIME,
  settings JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions
CREATE TABLE subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  plan ENUM('trial', 'starter', 'professional', 'enterprise'),
  max_users INT DEFAULT 5,
  current_users INT DEFAULT 1,
  features JSON,
  current_period_end DATETIME,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- License Keys (for self-hosted)
CREATE TABLE license_keys (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT,
  license_key VARCHAR(255) UNIQUE NOT NULL,
  license_type VARCHAR(50),
  max_users INT,
  features JSON,
  expires_at DATETIME,
  is_active BOOLEAN DEFAULT TRUE
);
```

## How Data Isolation Works

Every CRM table now has a `tenant_id` column:

```javascript
// In routes/contacts.js (example)
router.get('/', authMiddleware, async (req, res) => {
  const tenantId = req.tenantId; // Set by auth middleware
  
  let sql = 'SELECT * FROM contacts WHERE 1=1';
  const params = [];
  
  // Filter by tenant
  if (tenantId) {
    sql += ' AND tenant_id = ?';
    params.push(tenantId);
  }
  
  const contacts = await query(sql, params);
  res.json({ success: true, data: contacts });
});
```

## Testing Multi-Tenancy

### 1. Register a New Tenant

```bash
curl -X POST http://localhost:4000/api/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Test Company",
    "email": "test@test.com",
    "password": "Test123456",
    "full_name": "Test User"
  }'
```

### 2. Login as Tenant User

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test",
    "password": "Test123456"
  }'
```

### 3. Access Tenant-Filtered Data

```bash
TOKEN="eyJhbGciOiJIUzI1NiIs..."

curl http://localhost:4000/api/contacts \
  -H "Authorization: Bearer $TOKEN"
# Returns only contacts for this tenant!
```

### 4. Platform Admin Access

```bash
# Login as platform admin
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "osama",
    "password": "ALPHa251611@"
  }'

# List all tenants
curl http://localhost:4000/api/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Selling to Customers: Example Scenarios

### Scenario 1: Small Business (5 users)

**Customer:** Real estate agency with 5 agents

**Plan:** Starter ($29/month)

**Setup:**
1. Customer registers at crm.trasealla.com
2. Creates account for "ABC Realty"
3. Gets subdomain: abc-realty.crm.trasealla.com
4. Adds 5 users (agents)
5. Customizes pipeline for real estate

**Features:**
- Lead tracking
- Property deals pipeline
- Basic reports
- Calendar & activities

### Scenario 2: Medium Business (25 users)

**Customer:** Technology consulting firm

**Plan:** Professional ($79/month)

**Setup:**
1. Registers company
2. Imports existing contacts
3. Sets up multiple pipelines (Sales, Support, Projects)
4. Configures workflows for automation

**Features:**
- Full CRM + workflows
- Custom fields
- Email templates
- Integrations (optional)

### Scenario 3: Enterprise (On-Premise)

**Customer:** Healthcare organization requiring data sovereignty

**Plan:** Self-Hosted License ($5,000/year)

**Setup:**
1. Purchase license from Trasealla
2. Receive license key: TRAS-ENT-XXXXX
3. Deploy on their own servers
4. Activate with license key
5. Full control over data

**Features:**
- All enterprise features
- Unlimited users
- Custom domain
- Full data control
- No data leaves their network

## Next Steps

### To Complete Before Launch:

1. **Stripe Integration** - Payment processing for subscriptions
2. **Email Notifications** - Welcome emails, trial ending reminders
3. **Admin Dashboard** - Platform admin UI to manage tenants
4. **Usage Metering** - Track API calls, storage, etc.
5. **Branding** - Allow tenants to customize logo/colors

### Optional Enhancements:

1. **Custom Domains** - Let enterprises use their own domain
2. **SSO/SAML** - Enterprise single sign-on
3. **API Rate Limiting** - Per-tenant rate limits
4. **Data Export** - GDPR compliance
5. **Backup/Restore** - Per-tenant backups



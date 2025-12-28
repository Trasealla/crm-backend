# Trasealla CRM - Architecture & Deployment Guide

## 📐 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRASEALLA CRM PLATFORM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   BROWSER   │     │   MOBILE    │     │   DESKTOP   │                   │
│  │  (React)    │     │   (Future)  │     │  (Electron) │   ◄── CLIENTS    │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                   │
│         │                   │                   │                           │
│         └───────────────────┼───────────────────┘                           │
│                             │                                               │
│                             ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    LOAD BALANCER / CDN                              │   │
│  │                   (Cloudflare / AWS CloudFront)                     │   │
│  └─────────────────────────────┬───────────────────────────────────────┘   │
│                                │                                            │
│         ┌──────────────────────┼──────────────────────┐                    │
│         ▼                      ▼                      ▼                    │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐              │
│  │  FRONTEND   │       │  FRONTEND   │       │  FRONTEND   │              │
│  │  Server 1   │       │  Server 2   │       │  Server N   │              │
│  │   (React)   │       │   (React)   │       │   (React)   │              │
│  └─────────────┘       └─────────────┘       └─────────────┘              │
│         │                      │                      │                    │
│         └──────────────────────┼──────────────────────┘                    │
│                                │                                            │
│                                ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       API GATEWAY                                    │   │
│  │                    (Express.js / NGINX)                             │   │
│  └─────────────────────────────┬───────────────────────────────────────┘   │
│                                │                                            │
│         ┌──────────────────────┼──────────────────────┐                    │
│         ▼                      ▼                      ▼                    │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐              │
│  │  BACKEND    │       │  BACKEND    │       │  BACKEND    │              │
│  │  Server 1   │       │  Server 2   │       │  Server N   │              │
│  │ (Node.js)   │       │ (Node.js)   │       │ (Node.js)   │              │
│  └─────────────┘       └─────────────┘       └─────────────┘              │
│         │                      │                      │                    │
│         └──────────────────────┼──────────────────────┘                    │
│                                │                                            │
│         ┌──────────────────────┼──────────────────────┐                    │
│         ▼                      ▼                      ▼                    │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐              │
│  │   MySQL     │       │   Redis     │       │   Storage   │              │
│  │  Database   │       │   Cache     │       │   (S3/DO)   │              │
│  │  (Primary)  │       │  (Sessions) │       │   (Files)   │              │
│  └─────────────┘       └─────────────┘       └─────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🏗️ Project Structure

```
trasealla/
├── crm-backend/                 # Node.js Express API Server
│   ├── src/
│   │   ├── config.js           # Environment configuration
│   │   ├── index.js            # Main entry point
│   │   ├── lib/
│   │   │   └── database.js     # MySQL connection & migrations
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT authentication
│   │   └── routes/
│   │       ├── auth.js         # Authentication endpoints
│   │       ├── staff.js        # User management
│   │       ├── accounts.js     # Account management
│   │       ├── contacts.js     # Contact management
│   │       ├── leads.js        # Lead management
│   │       ├── deals.js        # Deal/opportunity management
│   │       ├── activities.js   # Activity tracking
│   │       ├── pipelines.js    # Sales pipelines
│   │       ├── products.js     # Product catalog
│   │       ├── quotes.js       # Quote generation
│   │       ├── campaigns.js    # Marketing campaigns
│   │       ├── workflows.js    # Automation workflows
│   │       ├── reports.js      # Analytics & reports
│   │       └── ...             # More modules
│   └── package.json
│
├── crm-frontend/               # React Vite Frontend
│   ├── src/
│   │   ├── App.jsx            # Main application
│   │   ├── pages/             # Page components
│   │   ├── components/        # Reusable components
│   │   ├── lib/               # Utilities & API client
│   │   ├── i18n/              # Internationalization
│   │   └── assets/            # Images, fonts, icons
│   ├── public/                # Static assets
│   └── package.json
│
└── database/                   # Database schema (auto-created)
    └── trasealla_crm          # MySQL database
```

## 🔄 Multi-Tenant Architecture Options

### Option 1: Single Database, Multi-Tenant (Recommended for Start)
```
┌──────────────────────────────────────────┐
│              trasealla_crm               │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │          tenants table             │  │
│  │  id | company_name | subdomain     │  │
│  │  1  | Company A    | company-a     │  │
│  │  2  | Company B    | company-b     │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │        All tables have             │  │
│  │        tenant_id column            │  │
│  │  contacts: tenant_id, name...      │  │
│  │  leads: tenant_id, name...         │  │
│  │  deals: tenant_id, name...         │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### Option 2: Database per Tenant (For Large Customers)
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  company_a   │  │  company_b   │  │  company_c   │
│   database   │  │   database   │  │   database   │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ - contacts   │  │ - contacts   │  │ - contacts   │
│ - leads      │  │ - leads      │  │ - leads      │
│ - deals      │  │ - deals      │  │ - deals      │
│ - etc.       │  │ - etc.       │  │ - etc.       │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Option 3: Self-Hosted License (On-Premise)
```
Customer's Infrastructure:
┌────────────────────────────────────┐
│       Customer's Server            │
├────────────────────────────────────┤
│  Frontend + Backend + Database     │
│  Licensed for X users              │
│  License key validates annually    │
└────────────────────────────────────┘
```

## 💰 Business Model & Licensing

### Pricing Tiers

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRASEALLA CRM PRICING                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │    STARTER      │  │   PROFESSIONAL  │  │   ENTERPRISE    │ │
│  │   Up to 5 users │  │  Up to 25 users │  │  Unlimited      │ │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤ │
│  │ $49/month       │  │ $149/month      │  │ $499/month      │ │
│  │ or $490/year    │  │ or $1,490/year  │  │ or $4,990/year  │ │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤ │
│  │ ✓ Core CRM      │  │ ✓ All Starter   │  │ ✓ All Pro       │ │
│  │ ✓ Leads         │  │ ✓ Workflows     │  │ ✓ API Access    │ │
│  │ ✓ Contacts      │  │ ✓ Campaigns     │  │ ✓ White Label   │ │
│  │ ✓ Deals         │  │ ✓ Reports       │  │ ✓ Custom Dev    │ │
│  │ ✓ Activities    │  │ ✓ Integrations  │  │ ✓ Dedicated     │ │
│  │ ✓ Basic Reports │  │ ✓ Email Support │  │   Support       │ │
│  │ ✓ 1 Pipeline    │  │ ✓ 5 Pipelines   │  │ ✓ SLA           │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              SELF-HOSTED / ON-PREMISE LICENSE               ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ One-time license: $2,999 - $9,999 (based on users)         ││
│  │ Annual support & updates: 20% of license fee               ││
│  │ Includes: Source code, installation, 1 year support        ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Customer Purchase Cycle (10 Users Example)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    CUSTOMER PURCHASE CYCLE                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. DISCOVERY                                                            │
│     ▼                                                                    │
│  ┌────────────────────────────────────────┐                             │
│  │ Customer visits trasealla-crm.com      │                             │
│  │ Clicks "Try Demo" or "Start Free Trial"│                             │
│  └────────────────────┬───────────────────┘                             │
│                       ▼                                                  │
│  2. TRIAL (14 Days Free)                                                │
│     ▼                                                                    │
│  ┌────────────────────────────────────────┐                             │
│  │ - Creates account (demo@company.com)   │                             │
│  │ - Gets subdomain: company.crm.trasealla.com                          │
│  │ - Full access to Professional features │                             │
│  │ - Limited to 3 users during trial      │                             │
│  └────────────────────┬───────────────────┘                             │
│                       ▼                                                  │
│  3. PURCHASE (10 Users - Professional Plan)                             │
│     ▼                                                                    │
│  ┌────────────────────────────────────────┐                             │
│  │ Subscription: $149/month base          │                             │
│  │ + $15/user × 10 users = $150           │                             │
│  │ ─────────────────────────────          │                             │
│  │ Total: $299/month                      │                             │
│  │ Or: $2,990/year (2 months free)        │                             │
│  └────────────────────┬───────────────────┘                             │
│                       ▼                                                  │
│  4. PROVISIONING (Automatic)                                            │
│     ▼                                                                    │
│  ┌────────────────────────────────────────┐                             │
│  │ System automatically:                  │                             │
│  │ - Creates tenant in database           │                             │
│  │ - Sets up subdomain                    │                             │
│  │ - Creates admin user                   │                             │
│  │ - Applies license (10 users max)       │                             │
│  │ - Sends welcome email with credentials │                             │
│  └────────────────────┬───────────────────┘                             │
│                       ▼                                                  │
│  5. ONBOARDING                                                          │
│     ▼                                                                    │
│  ┌────────────────────────────────────────┐                             │
│  │ - Customer logs in as admin            │                             │
│  │ - Creates 9 staff users                │                             │
│  │ - Imports contacts/leads               │                             │
│  │ - Configures pipelines                 │                             │
│  │ - Sets up workflows                    │                             │
│  └────────────────────┬───────────────────┘                             │
│                       ▼                                                  │
│  6. ONGOING                                                             │
│  ┌────────────────────────────────────────┐                             │
│  │ - Monthly/Annual billing               │                             │
│  │ - Usage tracking                       │                             │
│  │ - Support tickets                      │                             │
│  │ - Feature upgrades                     │                             │
│  └────────────────────────────────────────┘                             │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Deployment Options

### Option 1: SaaS (Recommended)

**Best for**: Recurring revenue, easier updates, lower customer friction

```bash
# Infrastructure needed:
- VPS/Cloud: DigitalOcean, AWS, or Hetzner
- Database: Managed MySQL (PlanetScale, AWS RDS)
- CDN: Cloudflare
- Email: SendGrid or Mailgun
- Payments: Stripe

# Estimated monthly costs:
- 2× App Servers (4GB each): $40/month
- Managed Database: $25/month
- CDN + SSL: Free (Cloudflare)
- Email (10k/month): $15/month
- Domain: $12/year
─────────────────────────────────
Total: ~$80-100/month
```

### Option 2: Self-Hosted License

**Best for**: Enterprise customers, government, banks

```bash
# Customer gets:
- Source code (obfuscated or full)
- Docker containers
- Installation guide
- License key file

# Your responsibilities:
- Generate license keys
- Validate licenses periodically
- Provide updates
- Support
```

## 🔐 License Key System

```javascript
// License structure
{
  "license_key": "TRAS-ENT-2024-XXXX-YYYY-ZZZZ",
  "company": "Customer Corp",
  "type": "professional",
  "max_users": 10,
  "features": ["crm", "workflows", "reports", "api"],
  "issued_at": "2024-01-01",
  "expires_at": "2025-01-01",
  "signature": "..." // Cryptographic signature
}

// Validation happens on:
// 1. Server startup
// 2. User login
// 3. Daily cron job
```

## 📊 Database Schema Overview

```sql
-- Core CRM Tables
tenants (id, name, subdomain, plan, max_users, created_at)
staff (id, tenant_id, username, email, password, role, permissions)
accounts (id, tenant_id, name, industry, website, owner_id)
contacts (id, tenant_id, account_id, first_name, last_name, email)
leads (id, tenant_id, first_name, company, status, source)
deals (id, tenant_id, name, account_id, pipeline_id, stage_id, amount)
activities (id, tenant_id, type, subject, due_date, assigned_to)
pipelines (id, tenant_id, name, is_default)
pipeline_stages (id, pipeline_id, name, probability, sort_order)

-- Supporting Tables
notes (id, tenant_id, content, related_type, related_id)
tags (id, tenant_id, name, color, entity_type)
products (id, tenant_id, name, sku, unit_price)
quotes (id, tenant_id, deal_id, total, status)
campaigns (id, tenant_id, name, type, status)
workflows (id, tenant_id, name, trigger_event, actions)
audit_logs (id, tenant_id, user_id, action, entity_type)
```

## 🛠️ Production Deployment Steps

### Step 1: Prepare Environment

```bash
# On your production server
mkdir -p /var/www/trasealla-crm
cd /var/www/trasealla-crm

# Clone or upload the code
git clone your-repo-url .

# Create environment files
cp crm-backend/.env.example crm-backend/.env
cp crm-frontend/.env.example crm-frontend/.env
```

### Step 2: Configure Backend

```bash
# crm-backend/.env
NODE_ENV=production
PORT=4000
DB_HOST=your-mysql-host
DB_USER=crm_user
DB_PASSWORD=secure_password
DB_NAME=trasealla_crm
JWT_SECRET=your-very-long-secret-key-min-32-chars
FRONTEND_URL=https://crm.trasealla.com
```

### Step 3: Configure Frontend

```bash
# crm-frontend/.env
VITE_API_URL=https://api.crm.trasealla.com
VITE_APP_NAME=Trasealla CRM
```

### Step 4: Build & Deploy

```bash
# Backend
cd crm-backend
npm install --production
pm2 start src/index.js --name crm-api

# Frontend
cd ../crm-frontend
npm install
npm run build
# Serve with nginx or copy dist/ to CDN
```

### Step 5: Configure NGINX

```nginx
# /etc/nginx/sites-available/crm

# API Server
server {
    listen 443 ssl;
    server_name api.crm.trasealla.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Frontend
server {
    listen 443 ssl;
    server_name crm.trasealla.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    root /var/www/trasealla-crm/crm-frontend/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 📈 Scaling Roadmap

```
Phase 1: Launch (0-100 customers)
├── Single server deployment
├── Basic monitoring
└── Manual onboarding

Phase 2: Growth (100-500 customers)
├── Add load balancer
├── Database replication
├── Automated onboarding
└── Payment integration (Stripe)

Phase 3: Scale (500+ customers)
├── Kubernetes deployment
├── Multi-region support
├── Enterprise features
├── API marketplace
└── Partner program
```

## 🔧 What You Need to Add for Production

1. **Tenant System**: Add `tenant_id` to all tables
2. **Subscription Management**: Stripe integration
3. **License Validation**: For self-hosted version
4. **Usage Limits**: Check user count against plan
5. **Onboarding Flow**: New customer signup
6. **Admin Dashboard**: For you to manage tenants
7. **Billing Portal**: Customers manage subscriptions
8. **Documentation**: User guides, API docs
9. **Support System**: Ticketing (Zendesk/Freshdesk)
10. **Legal**: Terms of Service, Privacy Policy

---

© 2025 Trasealla CRM - All Rights Reserved


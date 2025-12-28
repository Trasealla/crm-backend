# Production Deployment Guide

## Quick Start Commands

### Local Development
```bash
# Terminal 1 - Backend
cd crm-backend
npm install
npm run dev

# Terminal 2 - Frontend  
cd crm-frontend
npm install
npm run dev
```

### Production Build
```bash
# Backend - use PM2
cd crm-backend
npm install --production
pm2 start src/index.js --name trasealla-crm-api

# Frontend - build static files
cd crm-frontend
npm install
npm run build
# Output in dist/ folder - serve with nginx
```

## Docker Deployment (Recommended)

### docker-compose.yml
```yaml
version: '3.8'

services:
  # MySQL Database
  mysql:
    image: mysql:8.0
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: trasealla_crm
      MYSQL_USER: crm_user
      MYSQL_PASSWORD: ${DB_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache (for sessions)
  redis:
    image: redis:alpine
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  # Backend API
  api:
    build: ./crm-backend
    restart: always
    environment:
      NODE_ENV: production
      PORT: 4000
      DB_HOST: mysql
      DB_USER: crm_user
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: trasealla_crm
      JWT_SECRET: ${JWT_SECRET}
      REDIS_URL: redis://redis:6379
    ports:
      - "4000:4000"
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_started

  # Frontend (nginx)
  frontend:
    build: ./crm-frontend
    restart: always
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - api
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl

volumes:
  mysql_data:
  redis_data:
```

### Backend Dockerfile
```dockerfile
# crm-backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 4000

CMD ["node", "src/index.js"]
```

### Frontend Dockerfile
```dockerfile
# crm-frontend/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## Cloud Deployment Options

### DigitalOcean (Budget: $80-100/month)
1. Create 1× Droplet (4GB RAM) - $24/month
2. Create Managed MySQL - $15/month
3. Create Spaces for file storage - $5/month
4. Use Cloudflare for CDN (Free)

### AWS (Scalable)
1. EC2 t3.medium for API
2. RDS MySQL for database
3. S3 for file storage
4. CloudFront for CDN
5. Route 53 for DNS

### Hetzner (Best Value)
1. CX31 (8GB RAM) - €9/month
2. Managed MySQL - €15/month
3. Object Storage - €5/month

## Environment Variables

### Backend (.env)
```bash
# Server
NODE_ENV=production
PORT=4000

# Database
DB_HOST=localhost
DB_USER=crm_user
DB_PASSWORD=your_secure_password
DB_NAME=trasealla_crm

# Authentication
JWT_SECRET=your-very-long-secret-key-minimum-32-characters-recommended

# Frontend
FRONTEND_URL=https://crm.trasealla.com
CORS_ORIGINS=https://crm.trasealla.com,https://www.crm.trasealla.com

# Email (for notifications)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
FROM_EMAIL=noreply@trasealla.com

# File Storage (optional - for S3/DO Spaces)
STORAGE_TYPE=s3
S3_ENDPOINT=https://sgp1.digitaloceanspaces.com
S3_BUCKET=trasealla-crm-files
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key

# License (for multi-tenant)
LICENSE_KEY=TRASEALLA-MASTER-KEY
```

### Frontend (.env)
```bash
VITE_API_URL=https://api.crm.trasealla.com
VITE_APP_NAME=Trasealla CRM
VITE_APP_VERSION=1.0.0
```

## SSL Certificates (Free with Let's Encrypt)

```bash
# Install certbot
apt install certbot python3-certbot-nginx

# Get certificates
certbot --nginx -d crm.trasealla.com -d api.crm.trasealla.com

# Auto-renewal (add to crontab)
0 0 * * * /usr/bin/certbot renew --quiet
```

## Monitoring Setup

### PM2 Monitoring
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# View logs
pm2 logs trasealla-crm-api

# Monitor
pm2 monit
```

### Health Check Endpoint
Add to your backend:
```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version
  });
});
```

## Backup Strategy

```bash
#!/bin/bash
# backup.sh - Run daily via cron

DATE=$(date +%Y%m%d)
BACKUP_DIR=/var/backups/trasealla-crm

# Database backup
mysqldump -h localhost -u crm_user -p trasealla_crm > $BACKUP_DIR/db_$DATE.sql
gzip $BACKUP_DIR/db_$DATE.sql

# Upload to S3/Spaces
aws s3 cp $BACKUP_DIR/db_$DATE.sql.gz s3://trasealla-backups/

# Keep only last 30 days locally
find $BACKUP_DIR -mtime +30 -delete
```

## Security Checklist

- [ ] Use HTTPS everywhere
- [ ] Set secure JWT secret (32+ characters)
- [ ] Enable rate limiting
- [ ] Configure CORS properly
- [ ] Use prepared statements (already done)
- [ ] Hash passwords with bcrypt (already done)
- [ ] Set up firewall (ufw)
- [ ] Regular security updates
- [ ] Database backups
- [ ] Log monitoring



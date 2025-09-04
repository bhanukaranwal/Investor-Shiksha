# Deployment Guide - Investor Shiksha

## Prerequisites
- Docker and Docker Compose
- Node.js 18+
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- AWS CLI configured

## Quick Start

### 1. Clone Repository
git clone https://github.com/investor-shiksha/platform.git
cd platform

### 2. Environment Setup
cp .env.example .env
Edit .env with your configuration
text

### 3. Local Development
Start all services
docker-compose up -d

Run database migrations
npm run migrate

Seed initial data
npm run seed



### 4. Production Deployment
Deploy infrastructure
cd terraform
terraform init
terraform apply

Deploy application
./scripts/deploy.sh production



## Configuration

### Environment Variables
See `.env.example` for all required environment variables.

### Database Setup
1. Create PostgreSQL database
2. Run migrations: `npm run migrate`
3. Seed data: `npm run seed`

### Monitoring
- Health checks: `/health`
- Metrics: Available via New Relic
- Logs: CloudWatch integration

For detailed deployment instructions, see individual service README files.

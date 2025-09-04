# Investor Shiksha API Documentation

## Base URL
- Production: `https://investorshiksha.com/api`
- Staging: `https://staging.investorshiksha.com/api`

## Authentication
All API endpoints require JWT authentication via the `Authorization` header:
Authorization: Bearer <jwt_token>

## Core Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration  
- `POST /auth/refresh` - Refresh JWT token
- `POST /auth/logout` - User logout

### User Management
- `GET /users/profile` - Get user profile
- `PUT /users/profile` - Update user profile
- `GET /users/progress` - Get learning progress

### Courses
- `GET /courses` - List all courses
- `GET /courses/:id` - Get course details
- `POST /courses/:id/enroll` - Enroll in course
- `GET /courses/:id/lessons` - Get course lessons

### Trading
- `GET /trading/portfolio` - Get user portfolio
- `POST /trading/orders` - Place trading order
- `GET /trading/history` - Get trading history
- `GET /trading/positions` - Get current positions

### Market Data
- `GET /market/stocks` - Get stock market data
- `GET /market/indices` - Get market indices
- `GET /market/news` - Get financial news

For complete API documentation, visit: https://investorshiksha.com/api-docs


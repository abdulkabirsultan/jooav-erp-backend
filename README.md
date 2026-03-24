# JOOAV ERP Backend

A robust, scalable Enterprise Resource Planning (ERP) system built with NestJS, and PostgreSQL. This backend provides comprehensive business management capabilities including user management, customer relations, inventory management, order processing, and project management.

### Technical Features

- **Enterprise Architecture**: Modular, scalable design
- **Database**: PostgreSQL with Prisma ORM
- **API Documentation**: Swagger/OpenAPI integration
- **Security**: Helmet, CORS, rate limiting, input validation
- **Health Monitoring**: Built-in health checks and monitoring
- **Testing**: Comprehensive unit and integration tests
- **CI/CD Ready**: GitHub Actions workflows

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Yarn package manager

### Development Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd jooav-erp-backend
   ```

2. **Install dependencies**

   ```bash
   yarn install
   ```

3. **Setup environment**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Setup local services**

   ```bash
   # Start PostgreSQL and Redis services
   yarn dev:services:start

   # Verify services are running
   yarn dev:services:check
   ```

5. **Setup development environment**

   ```bash
   yarn dev:setup
   ```

   This command will:
   - Verify database connection
   - Run database migrations
   - Seed initial data

6. **Start the application**
   ```bash
   yarn dev:start
   ```

The API will be available at:

- **API**: http://localhost:3000/api/v1
- **Documentation**: http://localhost:3000/api/docs
- **Health Check**: http://localhost:3000/api/v1/health

## 📊 Database

### Schema Management

```bash
# Generate Prisma client
yarn db:generate

# Create and apply migration
yarn db:migrate

# Deploy migrations (production)
yarn db:migrate:deploy

# Seed database
yarn db:seed

# Open Prisma Studio
yarn db:studio
```

## 🔒 Security Features

- **Helmet**: Security headers configuration
- **CORS**: Cross-origin resource sharing controls
- **Rate Limiting**: Request throttling protection
- **Input Validation**: Comprehensive request validation
- **JWT Authentication**: Secure token-based authentication
- **Role-based Authorization**: Granular permission system with 4 distinct user roles

## 👥 User Roles & Permissions

The system implements a 4-tier role-based access control system:

### 1. **SUPER_ADMIN** 🔑

- **Highest level access** - Full system control (Platform Owner)
- **Permissions**: All system operations
  - Create, manage, and delete all user types
  - Full manufacturer management and approval
  - Complete system configuration access
  - Order override capabilities
  - Full analytics and reporting access
- **Regional Assignment**: None - Global access without restrictions (Platform Owner)
- **Use Case**: Platform owners and system administrators

### 2. **ADMIN** 👨‍💼

- **Administrative access** with configurable permissions
- **Permissions** (configurable per admin):
  - Manufacturer management (if enabled)
  - SME user approval (if enabled)
  - Sub-admin management (if enabled)
  - Analytics access (if enabled)
  - Limited system configuration (if enabled)
- **Regional Assignment**: Optional - Can manage specific regions or operate nation-wide
- **Use Case**: Regional managers, department heads

### 3. **SUB_ADMIN** 📋

- **Procurement officers** - Order and vendor management
- **Permissions**:
  - Order processing and management
  - Vendor relationship management
  - Limited user management within assigned scope
  - Regional or order-based assignment flexibility
- **Regional Assignment**: Optional - Can be assigned by region OR by specific orders
- **Use Case**: Procurement officers, order managers

### 4. **SME_USER** 🏭

- **Small & Medium Enterprises** - End customers
- **Permissions**:
  - Place and track orders
  - Manage company profile
  - View assigned product catalog
  - Access order history and analytics
- **Use Case**: Business customers placing orders

### Regional Assignment Strategy

The system supports flexible regional assignments for scalability:

- **Current State**: Single-region operation with optional regional assignments
- **Future Ready**: Multi-region expansion supported without system changes
- **Assignment Types**:
  - Regional-based (geographic territories)
  - Order-based (specific customer/order assignments)
  - Hybrid approach for maximum flexibility

## 🔐 Authentication System

### Default Admin Account

```bash
# Create Super Admin (development)
yarn admin:seed

# Default credentials (change immediately)
Email: superadmin@jooav.com
Password: password123
Role: SUPER_ADMIN
```

### JWT Token Structure

```typescript
{
  sub: string,        // User ID
  email: string,      // User email
  role: UserRole,     // User role enum
  type: 'admin' | 'user',
  regions?: string[]  // Optional assigned regions
}
```

## 📚 API Documentation

The API is fully documented using Swagger/OpenAPI. Access the interactive documentation at:
`http://localhost:3000/api/docs`

### Key Endpoints

- `GET /api/v1/health` - Health check
- `GET /api/v1/users` - User management (coming soon)
- `GET /api/v1/customers` - Customer management (coming soon)
- `GET /api/v1/products` - Product catalog (coming soon)
- `GET /api/v1/orders` - Order processing (coming soon)
- `GET /api/v1/projects` - Project management (coming soon)

## 🧪 Testing

```bash
# Unit tests
yarn test

# Integration tests
yarn test:e2e

# Test coverage
yarn test:cov

# Watch mode
yarn test:watch
```

## 🔧 Development Scripts

```bash
# Development
yarn dev:start             # Start with hot reload
yarn start:debug           # Start with debugging
yarn dev:setup             # Complete development setup

# Local Services Management
yarn dev:services:start    # Start PostgreSQL and Redis
yarn dev:services:stop     # Stop PostgreSQL and Redis
yarn dev:services:check    # Check services status

# Building
yarn build                 # Build for production
yarn start:prod            # Start production build

# Code Quality
yarn lint                  # Check linting
yarn format                # Format code
yarn typecheck             # TypeScript checking

# Database
yarn db:generate           # Generate Prisma client
yarn db:migrate            # Create migration
yarn db:seed               # Seed database
yarn db:studio             # Open Prisma Studio


# Utilities
yarn health:check          # Health check
```

## 🏗️ Architecture

```
src/
├── common/              # Shared utilities
│   ├── decorators/      # Custom decorators
│   ├── dto/            # Data transfer objects
│   ├── enums/          # Enumerations
│   ├── filters/        # Exception filters
│   ├── guards/         # Authentication guards
│   ├── interceptors/   # Request/response interceptors
│   ├── pipes/          # Validation pipes
│   └── utils/          # Utility functions
├── config/             # Configuration management
├── database/           # Database setup and utilities
├── modules/            # Feature modules
├── shared/             # Shared resources
└── health/             # Health check endpoints
```

## 🌍 Environment Configuration

Key environment variables:

```env
# Database (Local PostgreSQL)
DATABASE_URL=postgresql://jooav:password@localhost:5432/jooav_erp_dev

# Database (Prisma Postgres recommended)
# DATABASE_URL=postgres://USER:PASSWORD@pooled.db.prisma.io:5432/postgres?sslmode=require
# DIRECT_URL=postgres://USER:PASSWORD@db.prisma.io:5432/postgres?sslmode=require

# Redis (Local Redis)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Application
NODE_ENV=development
PORT=3000
API_PREFIX=api
API_VERSION=v1

# Security
JWT_SECRET=your-super-secret-jwt-key
THROTTLE_TTL=60000
THROTTLE_LIMIT=10

# Sentry Error Tracking
SENTRY_DSN=your-sentry-dsn-here

# Cloudinary File Upload
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Documentation
SWAGGER_TITLE="JOOAV ERP API"
SWAGGER_VERSION="1.0"
```

## 🚀 Production Deployment

1. **Build the application**

   ```bash
   yarn build
   ```

2. **Setup production database**

   ```bash
   yarn db:migrate:deploy
   yarn db:seed
   ```

3. **Start the application**
   ```bash
   yarn start:prod
   ```

## 📈 Monitoring & Health Checks

The application includes comprehensive health monitoring:

- **Health Endpoint**: `/api/v1/health` - Overall application health
- **Readiness Probe**: `/api/v1/health/ready` - Application readiness
- **Liveness Probe**: `/api/v1/health/live` - Application liveness
- **Database Health**: Automatic database connection monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Development Guidelines

- Follow TypeScript best practices
- Write comprehensive tests
- Update documentation
- Follow conventional commits
- Ensure security best practices

## 📄 License

This project is licensed under the MIT License.

---

Built with ❤️ using NestJS, Prisma, and PostgreSQL.

  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn start

# watch mode
$ yarn start:dev

# production mode
$ yarn start:prod
```

## Run tests

```bash
# unit tests
$ yarn test

# e2e tests
$ yarn test:e2e

# test coverage
$ yarn test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

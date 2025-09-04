# Contributing to Investor Shiksha

Thank you for your interest in contributing to the Investor Shiksha platform! This document provides guidelines for contributing to our multilingual investor education platform.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Coding Standards](#coding-standards)
- [Submitting Changes](#submitting-changes)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)

## Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please read and follow our Code of Conduct.

## Getting Started

1. **Fork the repository**
git clone https://github.com/your-username/investor-shiksha-platform.git
cd investor-shiksha-plat

2. **Set up development environment**
cp .env.example .env

Edit .env with your configuration
docker-compose up -d

3. **Install dependencies**
Frontend
cd frontend && npm install

Backend
cd ../backend && npm install

AI Services
cd ../ai-services && pip install -r requirements.txt

## Development Process

1. **Create a feature branch**
git checkout -b feature/your-feature-name

2. **Make your changes**
   - Follow our coding standards
   - Add appropriate tests
   - Update documentation

3. **Test your changes**
npm test
npm
4. **Commit your changes**
5. 
## Coding Standards

### TypeScript/JavaScript
- Use ESLint and Prettier configurations
- Follow functional programming principles
- Write self-documenting code
- Use TypeScript strict mode

### Python
- Follow PEP 8 style guidelines
- Use type hints
- Write comprehensive docstrings
- Use Black for code formatting

### Database
- Use descriptive table and column names
- Always add proper indexes
- Write migrations with rollback scripts
- Document complex queries

## Submitting Changes

1. **Push to your fork**
git push origin feature/your-feature-name


2. **Create a Pull Request**
- Use descriptive title and description
- Link related issues
- Include screenshots for UI changes
- Add test coverage information

3. **Code Review Process**
- All PRs require at least 2 approvals
- Address review comments
- Ensure CI/CD pipeline passes

## Testing Guidelines

- Write unit tests for all new functions
- Add integration tests for API endpoints
- Include E2E tests for critical user flows
- Maintain minimum 80% code coverage

## Documentation

- Update README.md for significant changes
- Add inline code documentation
- Update API documentation
- Include examples in documentation

## Questions?

Feel free to reach out:
- Create an issue for bugs or feature requests
- Join our discussion forum for questions
- Email: contributors@investorshiksha.com

Thank you for contributing! 🚀




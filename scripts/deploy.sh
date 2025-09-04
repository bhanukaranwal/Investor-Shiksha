#!/bin/bash

set -e

echo "🚀 Starting deployment process..."

# Configuration
ENVIRONMENT=${1:-production}
AWS_REGION=${AWS_REGION:-us-east-1}
ECR_REGISTRY=${ECR_REGISTRY}
IMAGE_TAG=${GITHUB_SHA:-latest}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed"
        exit 1
    fi
    
    log_info "Prerequisites check passed ✓"
}

# Build Docker images
build_images() {
    log_info "Building Docker images..."
    
    # Frontend
    log_info "Building frontend image..."
    docker build -t investor-shiksha-frontend:${IMAGE_TAG} ./frontend
    docker tag investor-shiksha-frontend:${IMAGE_TAG} ${ECR_REGISTRY}/investor-shiksha-frontend:${IMAGE_TAG}
    
    # Backend
    log_info "Building backend image..."
    docker build -t investor-shiksha-backend:${IMAGE_TAG} ./backend
    docker tag investor-shiksha-backend:${IMAGE_TAG} ${ECR_REGISTRY}/investor-shiksha-backend:${IMAGE_TAG}
    
    # AI Services
    log_info "Building AI services image..."
    docker build -t investor-shiksha-ai:${IMAGE_TAG} ./ai-services
    docker tag investor-shiksha-ai:${IMAGE_TAG} ${ECR_REGISTRY}/investor-shiksha-ai:${IMAGE_TAG}
    
    log_info "Docker images built successfully ✓"
}

# Push images to ECR
push_images() {
    log_info "Pushing images to ECR..."
    
    # Login to ECR
    aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}
    
    # Push images
    docker push ${ECR_REGISTRY}/investor-shiksha-frontend:${IMAGE_TAG}
    docker push ${ECR_REGISTRY}/investor-shiksha-backend:${IMAGE_TAG}
    docker push ${ECR_REGISTRY}/investor-shiksha-ai:${IMAGE_TAG}
    
    log_info "Images pushed to ECR successfully ✓"
}

# Deploy infrastructure
deploy_infrastructure() {
    log_info "Deploying infrastructure with Terraform..."
    
    cd terraform
    
    # Initialize Terraform
    terraform init
    
    # Plan deployment
    terraform plan -var="environment=${ENVIRONMENT}" -var="image_tag=${IMAGE_TAG}" -out=tfplan
    
    # Apply changes
    terraform apply tfplan
    
    cd ..
    
    log_info "Infrastructure deployed successfully ✓"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Get RDS endpoint from Terraform output
    RDS_ENDPOINT=$(cd terraform && terraform output -raw rds_endpoint)
    
    # Run migrations using ECS task
    aws ecs run-task \
        --cluster investor-shiksha-${ENVIRONMENT} \
        --task-definition investor-shiksha-migration-${ENVIRONMENT} \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[$(cd terraform && terraform output -raw private_subnet_ids | tr ',' ' ')],securityGroups=[$(cd terraform && terraform output -raw ecs_security_group_id)],assignPublicIp=DISABLED}" \
        --overrides '{
            "containerOverrides": [
                {
                    "name": "migration",
                    "command": ["npm", "run", "migrate"]
                }
            ]
        }'
    
    log_info "Database migrations completed ✓"
}

# Update ECS services
update_services() {
    log_info "Updating ECS services..."
    
    # Update frontend service
    aws ecs update-service \
        --cluster investor-shiksha-${ENVIRONMENT} \
        --service investor-shiksha-frontend-${ENVIRONMENT} \
        --force-new-deployment
    
    # Update backend service
    aws ecs update-service \
        --cluster investor-shiksha-${ENVIRONMENT} \
        --service investor-shiksha-backend-${ENVIRONMENT} \
        --force-new-deployment
    
    # Update AI services
    aws ecs update-service \
        --cluster investor-shiksha-${ENVIRONMENT} \
        --service investor-shiksha-ai-${ENVIRONMENT} \
        --force-new-deployment
    
    log_info "ECS services updated ✓"
}

# Wait for deployment
wait_for_deployment() {
    log_info "Waiting for deployment to complete..."
    
    # Wait for services to stabilize
    aws ecs wait services-stable \
        --cluster investor-shiksha-${ENVIRONMENT} \
        --services \
            investor-shiksha-frontend-${ENVIRONMENT} \
            investor-shiksha-backend-${ENVIRONMENT} \
            investor-shiksha-ai-${ENVIRONMENT}
    
    log_info "Deployment completed successfully ✓"
}

# Health check
health_check() {
    log_info "Performing health checks..."
    
    # Get ALB endpoint
    ALB_ENDPOINT=$(cd terraform && terraform output -raw alb_dns_name)
    
    # Check frontend
    if curl -s "https://${ALB_ENDPOINT}/health" | grep -q "ok"; then
        log_info "Frontend health check passed ✓"
    else
        log_error "Frontend health check failed ✗"
        exit 1
    fi
    
    # Check backend API
    if curl -s "https://${ALB_ENDPOINT}/api/health" | grep -q "ok"; then
        log_info "Backend health check passed ✓"
    else
        log_error "Backend health check failed ✗"
        exit 1
    fi
    
    # Check AI services
    if curl -s "https://${ALB_ENDPOINT}/ai/health" | grep -q "healthy"; then
        log_info "AI services health check passed ✓"
    else
        log_error "AI services health check failed ✗"
        exit 1
    fi
    
    log_info "All health checks passed ✓"
}

# Rollback function
rollback() {
    log_warn "Initiating rollback..."
    
    # Get previous task definition revisions
    FRONTEND_PREV=$(aws ecs describe-services --cluster investor-shiksha-${ENVIRONMENT} --services investor-shiksha-frontend-${ENVIRONMENT} --query 'services[0].deployments[1].taskDefinition' --output text)
    BACKEND_PREV=$(aws ecs describe-services --cluster investor-shiksha-${ENVIRONMENT} --services investor-shiksha-backend-${ENVIRONMENT} --query 'services[0].deployments[1].taskDefinition' --output text)
    AI_PREV=$(aws ecs describe-services --cluster investor-shiksha-${ENVIRONMENT} --services investor-shiksha-ai-${ENVIRONMENT} --query 'services[0].deployments[1].taskDefinition' --output text)
    
    # Update services with previous task definitions
    aws ecs update-service --cluster investor-shiksha-${ENVIRONMENT} --service investor-shiksha-frontend-${ENVIRONMENT} --task-definition ${FRONTEND_PREV}
    aws ecs update-service --cluster investor-shiksha-${ENVIRONMENT} --service investor-shiksha-backend-${ENVIRONMENT} --task-definition ${BACKEND_PREV}
    aws ecs update-service --cluster investor-shiksha-${ENVIRONMENT} --service investor-shiksha-ai-${ENVIRONMENT} --task-definition ${AI_PREV}
    
    log_warn "Rollback completed"
}

# Send notification
send_notification() {
    local status=$1
    local message=$2
    
    if [ ! -z "${SLACK_WEBHOOK_URL}" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚀 Investor Shiksha Deployment ${status}: ${message}\"}" \
            ${SLACK_WEBHOOK_URL}
    fi
}

# Main deployment function
main() {
    log_info "Starting deployment to ${ENVIRONMENT} environment"
    
    # Trap errors and rollback
    trap 'log_error "Deployment failed! Initiating rollback..."; rollback; send_notification "FAILED" "Deployment failed and rolled back"; exit 1' ERR
    
    check_prerequisites
    build_images
    push_images
    deploy_infrastructure
    run_migrations
    update_services
    wait_for_deployment
    health_check
    
    log_info "🎉 Deployment completed successfully!"
    send_notification "SUCCESS" "Deployment completed successfully to ${ENVIRONMENT}"
}

# Run main function
main "$@"

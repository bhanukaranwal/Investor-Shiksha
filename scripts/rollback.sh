#!/bin/bash

set -e

ENVIRONMENT=${1:-staging}
ROLLBACK_VERSION=${2}

echo "🔄 Initiating rollback for $ENVIRONMENT environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get current service versions
get_current_versions() {
    log_info "Getting current service versions..."
    
    FRONTEND_CURRENT=$(aws ecs describe-services --cluster investor-shiksha-$ENVIRONMENT --services investor-shiksha-frontend-$ENVIRONMENT --query 'services[0].taskDefinition' --output text)
    BACKEND_CURRENT=$(aws ecs describe-services --cluster investor-shiksha-$ENVIRONMENT --services investor-shiksha-backend-$ENVIRONMENT --query 'services[0].taskDefinition' --output text)
    AI_CURRENT=$(aws ecs describe-services --cluster investor-shiksha-$ENVIRONMENT --services investor-shiksha-ai-$ENVIRONMENT --query 'services[0].taskDefinition' --output text)
    
    log_info "Current Frontend: $FRONTEND_CURRENT"
    log_info "Current Backend: $BACKEND_CURRENT"
    log_info "Current AI Services: $AI_CURRENT"
}

# Get previous versions
get_previous_versions() {
    log_info "Getting previous service versions..."
    
    if [ -n "$ROLLBACK_VERSION" ]; then
        # Use specified version
        FRONTEND_TARGET="investor-shiksha-frontend-$ENVIRONMENT:$ROLLBACK_VERSION"
        BACKEND_TARGET="investor-shiksha-backend-$ENVIRONMENT:$ROLLBACK_VERSION"
        AI_TARGET="investor-shiksha-ai-$ENVIRONMENT:$ROLLBACK_VERSION"
    else
        # Get previous versions from deployment history
        FRONTEND_REVISIONS=$(aws ecs list-task-definition-families --family-prefix investor-shiksha-frontend-$ENVIRONMENT --status ACTIVE --max-items 5)
        BACKEND_REVISIONS=$(aws ecs list-task-definition-families --family-prefix investor-shiksha-backend-$ENVIRONMENT --status ACTIVE --max-items 5)
        AI_REVISIONS=$(aws ecs list-task-definition-families --family-prefix investor-shiksha-ai-$ENVIRONMENT --status ACTIVE --max-items 5)
        
        # Get second latest version (previous stable)
        FRONTEND_TARGET=$(echo $FRONTEND_REVISIONS | jq -r '.families[1]' 2>/dev/null || echo "")
        BACKEND_TARGET=$(echo $BACKEND_REVISIONS | jq -r '.families[1]' 2>/dev/null || echo "")
        AI_TARGET=$(echo $AI_REVISIONS | jq -r '.families[1]' 2>/dev/null || echo "")
    fi
    
    if [ -z "$FRONTEND_TARGET" ] || [ -z "$BACKEND_TARGET" ] || [ -z "$AI_TARGET" ]; then
        log_error "Could not determine rollback versions"
        exit 1
    fi
    
    log_info "Rollback Frontend: $FRONTEND_TARGET"
    log_info "Rollback Backend: $BACKEND_TARGET"
    log_info "Rollback AI Services: $AI_TARGET"
}

# Create database backup before rollback
create_backup() {
    log_info "Creating backup before rollback..."
    ./scripts/backup.sh
}

# Perform rollback
perform_rollback() {
    log_warn "Starting service rollback..."
    
    # Update services to previous versions
    aws ecs update-service --cluster investor-shiksha-$ENVIRONMENT --service investor-shiksha-frontend-$ENVIRONMENT --task-definition $FRONTEND_TARGET
    aws ecs update-service --cluster investor-shiksha-$ENVIRONMENT --service investor-shiksha-backend-$ENVIRONMENT --task-definition $BACKEND_TARGET
    aws ecs update-service --cluster investor-shiksha-$ENVIRONMENT --service investor-shiksha-ai-$ENVIRONMENT --task-definition $AI_TARGET
    
    log_info "Services updated, waiting for stabilization..."
    
    # Wait for services to stabilize
    aws ecs wait services-stable --cluster investor-shiksha-$ENVIRONMENT --services investor-shiksha-frontend-$ENVIRONMENT investor-shiksha-backend-$ENVIRONMENT investor-shiksha-ai-$ENVIRONMENT
    
    log_info "Services stabilized ✓"
}

# Run health checks
verify_rollback() {
    log_info "Verifying rollback success..."
    
    # Run health checks
    if ./scripts/health-check.sh $ENVIRONMENT; then
        log_info "✅ Rollback successful and services are healthy!"
    else
        log_error "❌ Rollback completed but health checks failed!"
        exit 1
    fi
}

# Send notifications
send_notification() {
    local status=$1
    local message=$2
    
    if [ ! -z "${SLACK_WEBHOOK_URL}" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🔄 Investor Shiksha Rollback ${status}: ${message}\"}" \
            ${SLACK_WEBHOOK_URL}
    fi
}

# Main rollback function
main() {
    log_warn "⚠️  WARNING: You are about to rollback $ENVIRONMENT environment!"
    
    if [ "$ENVIRONMENT" = "production" ]; then
        read -p "Are you sure you want to rollback PRODUCTION? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Rollback cancelled by user"
            exit 0
        fi
    fi
    
    get_current_versions
    get_previous_versions
    create_backup
    perform_rollback
    verify_rollback
    
    send_notification "SUCCESS" "Rollback completed successfully to previous version"
    log_info "🎉 Rollback completed successfully!"
}

# Execute main function
main "$@"

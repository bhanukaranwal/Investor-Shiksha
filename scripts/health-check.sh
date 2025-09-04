#!/bin/bash

set -e

ENVIRONMENT=${1:-staging}
MAX_RETRIES=30
RETRY_INTERVAL=10
TIMEOUT=5

echo "🔍 Starting health checks for $ENVIRONMENT environment..."

# Health check URLs
if [ "$ENVIRONMENT" = "production" ]; then
    BASE_URL="https://investorshiksha.com"
else
    BASE_URL="https://$ENVIRONMENT.investorshiksha.com"
fi

FRONTEND_URL="$BASE_URL"
BACKEND_URL="$BASE_URL/api/health"
AI_SERVICES_URL="$BASE_URL/ai/health"

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

# Function to check URL health
check_url() {
    local url=$1
    local service_name=$2
    local retry_count=0
    
    log_info "Checking $service_name at $url"
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        if curl -f -s --connect-timeout $TIMEOUT "$url" > /dev/null 2>&1; then
            log_info "$service_name is healthy ✓"
            return 0
        else
            retry_count=$((retry_count + 1))
            log_warn "$service_name check failed (attempt $retry_count/$MAX_RETRIES)"
            
            if [ $retry_count -lt $MAX_RETRIES ]; then
                log_info "Retrying in $RETRY_INTERVAL seconds..."
                sleep $RETRY_INTERVAL
            fi
        fi
    done
    
    log_error "$service_name health check failed after $MAX_RETRIES attempts ✗"
    return 1
}

# Function to check API endpoints
check_api_endpoints() {
    local base_url=$1
    local endpoints=(
        "/api/health"
        "/api/auth/health"
        "/api/courses"
        "/api/market/health"
    )
    
    log_info "Checking API endpoints..."
    
    for endpoint in "${endpoints[@]}"; do
        local url="$base_url$endpoint"
        if curl -f -s --connect-timeout $TIMEOUT "$url" > /dev/null 2>&1; then
            log_info "API endpoint $endpoint is accessible ✓"
        else
            log_warn "API endpoint $endpoint is not accessible ✗"
        fi
    done
}

# Function to check database connectivity
check_database() {
    log_info "Checking database connectivity..."
    
    # Get database connection info from environment or Terraform output
    if command -v terraform &> /dev/null; then
        DB_ENDPOINT=$(cd terraform && terraform output -raw rds_endpoint 2>/dev/null || echo "")
        if [ -n "$DB_ENDPOINT" ]; then
            # Test database connection (requires appropriate credentials)
            log_info "Database endpoint: $DB_ENDPOINT"
            # Add actual database connectivity test here
        fi
    fi
}

# Function to check Redis connectivity
check_redis() {
    log_info "Checking Redis connectivity..."
    
    if command -v terraform &> /dev/null; then
        REDIS_ENDPOINT=$(cd terraform && terraform output -raw redis_endpoint 2>/dev/null || echo "")
        if [ -n "$REDIS_ENDPOINT" ]; then
            log_info "Redis endpoint: $REDIS_ENDPOINT"
            # Add actual Redis connectivity test here
        fi
    fi
}

# Function to check SSL certificate
check_ssl_certificate() {
    local domain=$1
    
    log_info "Checking SSL certificate for $domain"
    
    if command -v openssl &> /dev/null; then
        local cert_info=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
        
        if [ $? -eq 0 ]; then
            log_info "SSL certificate is valid ✓"
            echo "$cert_info" | while read line; do
                log_info "  $line"
            done
        else
            log_warn "SSL certificate check failed ✗"
        fi
    else
        log_warn "OpenSSL not available, skipping SSL certificate check"
    fi
}

# Function to check performance metrics
check_performance() {
    local url=$1
    
    log_info "Checking performance metrics..."
    
    if command -v curl &> /dev/null; then
        local response_time=$(curl -o /dev/null -s -w "%{time_total}" "$url")
        local http_code=$(curl -o /dev/null -s -w "%{http_code}" "$url")
        
        log_info "Response time: ${response_time}s"
        log_info "HTTP status: $http_code"
        
        # Check if response time is acceptable (< 2 seconds)
        if (( $(echo "$response_time < 2.0" | bc -l) )); then
            log_info "Performance check passed ✓"
        else
            log_warn "Performance check failed - slow response time ✗"
        fi
    fi
}

# Main health check execution
main() {
    local exit_code=0
    
    # Extract domain from URL for SSL check
    local domain=$(echo "$BASE_URL" | sed 's|https\?://||g' | sed 's|/.*||g')
    
    # Run all health checks
    if ! check_url "$FRONTEND_URL" "Frontend"; then
        exit_code=1
    fi
    
    if ! check_url "$BACKEND_URL" "Backend API"; then
        exit_code=1
    fi
    
    if ! check_url "$AI_SERVICES_URL" "AI Services"; then
        exit_code=1
    fi
    
    check_api_endpoints "$BASE_URL"
    check_database
    check_redis
    check_ssl_certificate "$domain"
    check_performance "$FRONTEND_URL"
    
    # Summary
    if [ $exit_code -eq 0 ]; then
        log_info "✅ All health checks passed for $ENVIRONMENT environment!"
    else
        log_error "❌ Some health checks failed for $ENVIRONMENT environment!"
    fi
    
    return $exit_code
}

# Execute main function
main "$@"

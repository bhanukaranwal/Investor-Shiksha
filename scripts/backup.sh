#!/bin/bash

set -e

# Configuration
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
S3_BACKUP_BUCKET=${S3_BACKUP_BUCKET:-investor-shiksha-backups}
RETENTION_DAYS=${RETENTION_DAYS:-30}

echo "🔒 Starting backup process..."

# Database backup
backup_database() {
    echo "📊 Creating database backup..."
    
    # Get database credentials from AWS Secrets Manager
    DB_SECRET=$(aws secretsmanager get-secret-value --secret-id investor-shiksha-db-password-production --query SecretString --output text)
    DB_PASSWORD=$(echo $DB_SECRET | jq -r '.password')
    DB_ENDPOINT=$(cd terraform && terraform output -raw rds_endpoint)
    
    # Create backup
    PGPASSWORD=$DB_PASSWORD pg_dump \
        -h $DB_ENDPOINT \
        -U postgres \
        -d investor_shiksha \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        > backup_${BACKUP_DATE}.sql
    
    # Compress backup
    gzip backup_${BACKUP_DATE}.sql
    
    # Upload to S3
    aws s3 cp backup_${BACKUP_DATE}.sql.gz s3://${S3_BACKUP_BUCKET}/database/
    
    # Clean up local file
    rm backup_${BACKUP_DATE}.sql.gz
    
    echo "✅ Database backup completed"
}

# Redis backup
backup_redis() {
    echo "🔴 Creating Redis backup..."
    
    # Get Redis endpoint
    REDIS_ENDPOINT=$(cd terraform && terraform output -raw redis_endpoint)
    
    # Create Redis backup using BGSAVE
    redis-cli -h $REDIS_ENDPOINT BGSAVE
    
    # Wait for backup to complete
    while [ $(redis-cli -h $REDIS_ENDPOINT LASTSAVE) -eq $(redis-cli -h $REDIS_ENDPOINT LASTSAVE) ]; do
        sleep 1
    done
    
    echo "✅ Redis backup completed"
}

# File system backup
backup_files() {
    echo "📁 Creating file system backup..."
    
    # Get S3 bucket for user uploads
    UPLOADS_BUCKET=$(cd terraform && terraform output -raw s3_uploads_bucket)
    
    # Sync to backup location
    aws s3 sync s3://${UPLOADS_BUCKET} s3://${S3_BACKUP_BUCKET}/files/${BACKUP_DATE}/
    
    echo "✅ File system backup completed"
}

# Clean old backups
cleanup_old_backups() {
    echo "🧹 Cleaning up old backups..."
    
    # Delete database backups older than retention period
    aws s3 ls s3://${S3_BACKUP_BUCKET}/database/ | while read -r line; do
        backup_date=$(echo $line | awk '{print $4}' | cut -d'_' -f2 | cut -d'.' -f1)
        if [ ! -z "$backup_date" ]; then
            backup_timestamp=$(date -d "${backup_date:0:8} ${backup_date:9:2}:${backup_date:11:2}:${backup_date:13:2}" +%s)
            cutoff_timestamp=$(date -d "${RETENTION_DAYS} days ago" +%s)
            
            if [ $backup_timestamp -lt $cutoff_timestamp ]; then
                filename=$(echo $line | awk '{print $4}')
                aws s3 rm s3://${S3_BACKUP_BUCKET}/database/$filename
                echo "Deleted old backup: $filename"
            fi
        fi
    done
    
    echo "✅ Cleanup completed"
}

# Main backup function
main() {
    backup_database
    backup_redis
    backup_files
    cleanup_old_backups
    
    echo "🎉 Backup process completed successfully!"
    
    # Send notification
    if [ ! -z "${SLACK_WEBHOOK_URL}" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"💾 Investor Shiksha backup completed successfully - ${BACKUP_DATE}\"}" \
            ${SLACK_WEBHOOK_URL}
    fi
}

# Run main function
main "$@"

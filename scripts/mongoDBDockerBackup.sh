#!/bin/bash
set -e

BACKUP_DIR="/backup"
# Default to daily backups (86400 seconds = 24 hours)
BACKUP_INTERVAL=${BACKUP_INTERVAL:-86400}

echo "MongoDB Backup Service Started"
echo "Backup interval: ${BACKUP_INTERVAL} seconds"

while true; do
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  BACKUP_NAME="mongodb-backup-${TIMESTAMP}"
  
  echo "Starting backup: ${BACKUP_NAME}"
  
  # Run backup
  mongodump \
    --host ${MONGO_HOST}:${MONGO_PORT} \
    --username ${MONGO_USERNAME} \
    --password ${MONGO_PASSWORD} \
    --authenticationDatabase admin \
    --gzip \
    --out ${BACKUP_DIR}/${BACKUP_NAME}
  
  # Remove old backups (older than BACKUP_RETENTION_DAYS)
  find ${BACKUP_DIR} -name "mongodb-backup-*" -type d -mtime +${BACKUP_RETENTION_DAYS} -exec rm -rf {} +
  
  echo "Backup completed: ${BACKUP_NAME}"
  echo "Next backup in ${BACKUP_INTERVAL} seconds..."
  
  # Wait for next backup
  sleep ${BACKUP_INTERVAL}
done
#!/bin/bash

# 백업 디렉토리 생성
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 프론트엔드 백업
echo "Backing up frontend..."
cp -r frontend "$BACKUP_DIR/"

# 백엔드 백업
echo "Backing up backend..."
cp -r backend "$BACKUP_DIR/"

# 데이터베이스 백업
echo "Backing up database..."
python backend/backup_db.py

# 의존성 파일 백업
echo "Backing up dependency files..."
cp frontend/package.json "$BACKUP_DIR/"
cp frontend/package-lock.json "$BACKUP_DIR/"
cp backend/requirements.txt "$BACKUP_DIR/"

# README 및 문서 백업
echo "Backing up documentation..."
cp README.md "$BACKUP_DIR/"

# 백업 완료 메시지
echo "Backup completed: $BACKUP_DIR" 
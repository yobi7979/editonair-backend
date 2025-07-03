# 백업 디렉토리 생성
$BACKUP_DIR = "backups/$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Force -Path $BACKUP_DIR

# 소스 코드 백업
Write-Host "Backing up source code..."
Copy-Item -Path "src" -Destination "$BACKUP_DIR/" -Recurse
Copy-Item -Path "backend" -Destination "$BACKUP_DIR/" -Recurse

# 데이터베이스 백업
Write-Host "Backing up database..."
python backend/backup_db.py

# 의존성 파일 백업
Write-Host "Backing up dependency files..."
Copy-Item -Path "package.json" -Destination "$BACKUP_DIR/"
Copy-Item -Path "package-lock.json" -Destination "$BACKUP_DIR/"
Copy-Item -Path "backend/requirements.txt" -Destination "$BACKUP_DIR/"

# 설정 파일 백업
Write-Host "Backing up configuration files..."
Copy-Item -Path "vite.config.js" -Destination "$BACKUP_DIR/"
Copy-Item -Path "tailwind.config.js" -Destination "$BACKUP_DIR/"
Copy-Item -Path "postcss.config.js" -Destination "$BACKUP_DIR/"
Copy-Item -Path "jsconfig.json" -Destination "$BACKUP_DIR/"
Copy-Item -Path "components.json" -Destination "$BACKUP_DIR/"
Copy-Item -Path "eslint.config.js" -Destination "$BACKUP_DIR/"

# README 및 문서 백업
Write-Host "Backing up documentation..."
Copy-Item -Path "README.md" -Destination "$BACKUP_DIR/"

# 백업 완료 메시지
Write-Host "Backup completed: $BACKUP_DIR" 
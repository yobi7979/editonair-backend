import os
import shutil
import subprocess
from datetime import datetime
from urllib.parse import urlparse
import json

def get_database_url():
    """데이터베이스 URL 가져오기"""
    # 환경 변수에서 DATABASE_URL 가져오기
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        # 기본값 사용
        db_url = 'postgresql://postgres:postgres@localhost:5432/editor'
    return db_url

def backup_postgres_db(backup_dir, timestamp):
    """PostgreSQL 데이터베이스 백업"""
    db_url = get_database_url()
    parsed = urlparse(db_url)
    
    # 데이터베이스 접속 정보
    db_name = parsed.path[1:]  # 맨 앞의 / 제거
    db_user = parsed.username
    db_host = parsed.hostname
    db_port = parsed.port or 5432
    
    # 백업 파일 경로
    backup_file = os.path.join(backup_dir, f'database_{timestamp}.sql')
    
    try:
        # pg_dump 명령 실행
        env = os.environ.copy()
        if parsed.password:
            env['PGPASSWORD'] = parsed.password
            
        cmd = [
            'pg_dump',
            '-h', db_host,
            '-p', str(db_port),
            '-U', db_user,
            '-F', 'p',  # 일반 텍스트 형식
            '-f', backup_file,
            db_name
        ]
        
        subprocess.run(cmd, env=env, check=True)
        print(f'PostgreSQL database backed up to: {backup_file}')
        return True
    except subprocess.CalledProcessError as e:
        print(f'Error backing up PostgreSQL database: {e}')
        return False

def backup_project_files(backup_dir, timestamp):
    """프로젝트 파일들 백업"""
    # 프로젝트 디렉토리 경로
    projects_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'projects')
    if not os.path.exists(projects_dir):
        print('Projects directory not found')
        return False
        
    # 백업 파일 경로
    backup_file = os.path.join(backup_dir, f'projects_{timestamp}.zip')
    
    try:
        # 프로젝트 디렉토리를 ZIP 파일로 압축
        shutil.make_archive(
            os.path.splitext(backup_file)[0],  # 확장자 제외한 경로
            'zip',
            projects_dir
        )
        print(f'Project files backed up to: {backup_file}')
        return True
    except Exception as e:
        print(f'Error backing up project files: {e}')
        return False

def create_backup_info(backup_dir, timestamp, db_success, files_success):
    """백업 정보 저장"""
    info = {
        'timestamp': timestamp,
        'database_backup': db_success,
        'files_backup': files_success,
        'database_url': get_database_url(),
        'backup_date': datetime.now().isoformat()
    }
    
    info_file = os.path.join(backup_dir, f'backup_info_{timestamp}.json')
    with open(info_file, 'w', encoding='utf-8') as f:
        json.dump(info, f, indent=2, ensure_ascii=False)
    print(f'Backup info saved to: {info_file}')

def backup_all():
    """전체 백업 실행"""
    # 백업 디렉토리 생성
    backup_dir = os.path.join(os.path.dirname(__file__), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    
    # 타임스탬프 생성
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # 데이터베이스 백업
    db_success = backup_postgres_db(backup_dir, timestamp)
    
    # 프로젝트 파일 백업
    files_success = backup_project_files(backup_dir, timestamp)
    
    # 백업 정보 저장
    create_backup_info(backup_dir, timestamp, db_success, files_success)
    
    return db_success and files_success

if __name__ == '__main__':
    backup_all() 
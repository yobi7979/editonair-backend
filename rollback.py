import os
import json
import shutil
import psycopg2
from urllib.parse import urlparse
from datetime import datetime

def get_database_url():
    """데이터베이스 URL 가져오기"""
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        db_url = 'postgresql://postgres:postgres@localhost:5432/editor'
    return db_url

def find_latest_backup():
    """가장 최근 백업 찾기"""
    backup_dir = os.path.join(os.path.dirname(__file__), 'backups')
    if not os.path.exists(backup_dir):
        raise Exception('백업 디렉토리를 찾을 수 없습니다.')
        
    # 백업 정보 파일 찾기
    info_files = [f for f in os.listdir(backup_dir) if f.startswith('backup_info_') and f.endswith('.json')]
    if not info_files:
        raise Exception('백업을 찾을 수 없습니다.')
        
    # 가장 최근 백업 찾기
    latest_info = max(info_files, key=lambda x: x.replace('backup_info_', '').replace('.json', ''))
    
    # 백업 정보 읽기
    with open(os.path.join(backup_dir, latest_info), 'r', encoding='utf-8') as f:
        info = json.load(f)
        
    return info['timestamp'], backup_dir

def restore_database(timestamp, backup_dir):
    """데이터베이스 복원"""
    db_url = get_database_url()
    parsed = urlparse(db_url)
    
    # 백업 파일 경로
    backup_file = os.path.join(backup_dir, f'database_{timestamp}.sql')
    if not os.path.exists(backup_file):
        raise Exception(f'데이터베이스 백업 파일을 찾을 수 없습니다: {backup_file}')
    
    try:
        # psql 명령으로 복원
        env = os.environ.copy()
        if parsed.password:
            env['PGPASSWORD'] = parsed.password
            
        # 기존 연결 종료
        conn = psycopg2.connect(
            dbname=parsed.path[1:],
            user=parsed.username,
            password=parsed.password,
            host=parsed.hostname,
            port=parsed.port or 5432
        )
        conn.set_isolation_level(0)
        cur = conn.cursor()
        
        # 기존 연결 강제 종료
        cur.execute('''
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = %s
            AND pid <> pg_backend_pid()
        ''', (parsed.path[1:],))
        
        # 데이터베이스 재생성
        cur.execute(f'DROP DATABASE IF EXISTS {parsed.path[1:]}')
        cur.execute(f'CREATE DATABASE {parsed.path[1:]}')
        conn.close()
        
        # 백업 복원
        os.system(f'psql -h {parsed.hostname} -p {parsed.port or 5432} -U {parsed.username} -d {parsed.path[1:]} -f {backup_file}')
        print('데이터베이스가 성공적으로 복원되었습니다.')
        return True
        
    except Exception as e:
        print(f'데이터베이스 복원 중 오류 발생: {e}')
        return False

def restore_project_files(timestamp, backup_dir):
    """프로젝트 파일 복원"""
    # 백업 파일 경로
    backup_file = os.path.join(backup_dir, f'projects_{timestamp}.zip')
    if not os.path.exists(backup_file):
        raise Exception(f'프로젝트 파일 백업을 찾을 수 없습니다: {backup_file}')
        
    try:
        # 프로젝트 디렉토리 경로
        projects_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'projects')
        
        # 기존 프로젝트 디렉토리 백업
        if os.path.exists(projects_dir):
            backup_timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            shutil.move(projects_dir, f'{projects_dir}_{backup_timestamp}_before_rollback')
            
        # 백업에서 복원
        shutil.unpack_archive(backup_file, os.path.dirname(projects_dir), 'zip')
        print('프로젝트 파일이 성공적으로 복원되었습니다.')
        return True
        
    except Exception as e:
        print(f'프로젝트 파일 복원 중 오류 발생: {e}')
        return False

def rollback():
    """전체 롤백 실행"""
    print('롤백을 시작합니다...')
    
    try:
        # 최근 백업 찾기
        timestamp, backup_dir = find_latest_backup()
        print(f'백업 타임스탬프: {timestamp}')
        
        # 데이터베이스 복원
        if not restore_database(timestamp, backup_dir):
            raise Exception('데이터베이스 복원에 실패했습니다.')
            
        # 프로젝트 파일 복원
        if not restore_project_files(timestamp, backup_dir):
            raise Exception('프로젝트 파일 복원에 실패했습니다.')
            
        print('롤백이 성공적으로 완료되었습니다.')
        return True
        
    except Exception as e:
        print(f'롤백 중 오류 발생: {e}')
        return False

if __name__ == '__main__':
    rollback() 
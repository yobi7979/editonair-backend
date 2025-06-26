import os
import shutil
from datetime import datetime

def backup_database():
    # 백업 디렉토리 생성
    backup_dir = os.path.join(os.path.dirname(__file__), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    
    # 현재 시간을 파일명에 포함
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_file = os.path.join(backup_dir, f'editor_data_{timestamp}.db')
    
    # 데이터베이스 파일 경로 (실제 DB 파일 위치로 수정)
    db_file = os.path.join(os.path.dirname(__file__), 'editor_data.db')
    
    # 데이터베이스 파일 복사
    shutil.copy2(db_file, backup_file)
    print(f'Database backed up to: {backup_file}')

if __name__ == '__main__':
    backup_database() 
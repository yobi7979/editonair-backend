import os
import shutil
import subprocess
from datetime import datetime
from urllib.parse import urlparse
import json
import zipfile
from pathlib import Path

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

def get_project_library_info():
    """프로젝트별 라이브러리 정보 수집"""
    projects_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'projects')
    if not os.path.exists(projects_dir):
        return {}
    
    libraries_info = {}
    
    for project_dir in os.listdir(projects_dir):
        project_path = os.path.join(projects_dir, project_dir)
        if not os.path.isdir(project_path):
            continue
            
        library_path = os.path.join(project_path, 'library')
        if not os.path.exists(library_path):
            libraries_info[project_dir] = {
                'images_count': 0,
                'images_size': '0B',
                'sequences_count': 0,
                'sequences_size': '0B',
                'thumbnails_count': 0,
                'thumbnails_size': '0B'
            }
            continue
        
        # 이미지 정보
        images_path = os.path.join(library_path, 'images')
        images_count = 0
        images_size = 0
        if os.path.exists(images_path):
            for file in os.listdir(images_path):
                if file.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
                    file_path = os.path.join(images_path, file)
                    if os.path.isfile(file_path):
                        images_count += 1
                        images_size += os.path.getsize(file_path)
        
        # 썸네일 정보
        thumbnails_path = os.path.join(library_path, 'thumbnails')
        thumbnails_count = 0
        thumbnails_size = 0
        if os.path.exists(thumbnails_path):
            for file in os.listdir(thumbnails_path):
                if file.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    file_path = os.path.join(thumbnails_path, file)
                    if os.path.isfile(file_path):
                        thumbnails_count += 1
                        thumbnails_size += os.path.getsize(file_path)
        
        # 시퀀스 정보
        sequences_path = os.path.join(library_path, 'sequences')
        sequences_count = 0
        sequences_size = 0
        if os.path.exists(sequences_path):
            for seq_dir in os.listdir(sequences_path):
                seq_path = os.path.join(sequences_path, seq_dir)
                if os.path.isdir(seq_path):
                    sequences_count += 1
                    # 시퀀스 폴더 내 모든 파일 크기 합계
                    for root, dirs, files in os.walk(seq_path):
                        for file in files:
                            file_path = os.path.join(root, file)
                            sequences_size += os.path.getsize(file_path)
        
        libraries_info[project_dir] = {
            'images_count': images_count,
            'images_size': f'{images_size}B',
            'sequences_count': sequences_count,
            'sequences_size': f'{sequences_size}B',
            'thumbnails_count': thumbnails_count,
            'thumbnails_size': f'{thumbnails_size}B'
        }
    
    return libraries_info

def format_file_size(size_bytes):
    """바이트 크기를 읽기 쉬운 형태로 변환"""
    if size_bytes == 0:
        return "0B"
    
    size_names = ["B", "KB", "MB", "GB"]
    i = 0
    while size_bytes >= 1024 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1
    
    return f"{size_bytes:.1f}{size_names[i]}"

def backup_project_libraries(backup_dir, timestamp):
    """프로젝트별 라이브러리 백업"""
    projects_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'projects')
    if not os.path.exists(projects_dir):
        print('Projects directory not found')
        return False
    
    # 백업 파일 경로
    backup_file = os.path.join(backup_dir, f'libraries_{timestamp}.zip')
    
    try:
        with zipfile.ZipFile(backup_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for project_dir in os.listdir(projects_dir):
                project_path = os.path.join(projects_dir, project_dir)
                if not os.path.isdir(project_path):
                    continue
                
                library_path = os.path.join(project_path, 'library')
                if not os.path.exists(library_path):
                    continue
                
                # 프로젝트별 라이브러리 폴더를 ZIP에 추가
                for root, dirs, files in os.walk(library_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        # ZIP 내에서의 상대 경로
                        arcname = os.path.join(f'project_{project_dir}', 
                                             os.path.relpath(file_path, project_path))
                        zipf.write(file_path, arcname)
                        print(f'Added to backup: {arcname}')
        
        print(f'Project libraries backed up to: {backup_file}')
        return True
    except Exception as e:
        print(f'Error backing up project libraries: {e}')
        return False

def restore_project_libraries(backup_file, restore_dir):
    """프로젝트별 라이브러리 복구"""
    if not os.path.exists(backup_file):
        print(f'Backup file not found: {backup_file}')
        return False
    
    try:
        with zipfile.ZipFile(backup_file, 'r') as zipf:
            # ZIP 파일 내용 확인
            file_list = zipf.namelist()
            
            # 프로젝트별로 복구
            projects_to_restore = set()
            for file_path in file_list:
                if file_path.startswith('project_'):
                    project_name = file_path.split('/')[0].replace('project_', '')
                    projects_to_restore.add(project_name)
            
            print(f'Found projects to restore: {list(projects_to_restore)}')
            
            # 각 프로젝트 복구
            for project_name in projects_to_restore:
                project_dir = os.path.join(restore_dir, project_name)
                os.makedirs(project_dir, exist_ok=True)
                
                # 해당 프로젝트의 파일들만 추출
                for file_path in file_list:
                    if file_path.startswith(f'project_{project_name}/'):
                        # ZIP 내 경로에서 실제 파일 경로 추출
                        relative_path = file_path.replace(f'project_{project_name}/', '')
                        target_path = os.path.join(project_dir, relative_path)
                        
                        # 디렉토리 생성
                        os.makedirs(os.path.dirname(target_path), exist_ok=True)
                        
                        # 파일 추출
                        with zipf.open(file_path) as source, open(target_path, 'wb') as target:
                            shutil.copyfileobj(source, target)
                        
                        print(f'Restored: {target_path}')
        
        print(f'Project libraries restored from: {backup_file}')
        return True
    except Exception as e:
        print(f'Error restoring project libraries: {e}')
        return False

def create_backup_info(backup_dir, timestamp, db_success, files_success, libraries_success):
    """백업 정보 저장"""
    libraries_info = get_project_library_info()
    
    # 전체 크기 계산
    total_size = 0
    for project_info in libraries_info.values():
        for key, value in project_info.items():
            if key.endswith('_size') and value != '0B':
                size_str = value.replace('B', '')
                if 'KB' in size_str:
                    total_size += float(size_str.replace('KB', '')) * 1024
                elif 'MB' in size_str:
                    total_size += float(size_str.replace('MB', '')) * 1024 * 1024
                elif 'GB' in size_str:
                    total_size += float(size_str.replace('GB', '')) * 1024 * 1024 * 1024
                else:
                    total_size += float(size_str)
    
    info = {
        'timestamp': timestamp,
        'database_backup': db_success,
        'files_backup': files_success,
        'libraries_backup': libraries_success,
        'libraries_info': libraries_info,
        'total_size': format_file_size(int(total_size)),
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
    
    # 프로젝트 라이브러리 백업
    libraries_success = backup_project_libraries(backup_dir, timestamp)
    
    # 백업 정보 저장
    create_backup_info(backup_dir, timestamp, db_success, files_success, libraries_success)
    
    return db_success and files_success and libraries_success

def list_backups():
    """백업 목록 조회"""
    backup_dir = os.path.join(os.path.dirname(__file__), 'backups')
    if not os.path.exists(backup_dir):
        return []
    
    backups = []
    for item in os.listdir(backup_dir):
        if item.startswith('backup_info_') and item.endswith('.json'):
            timestamp = item.replace('backup_info_', '').replace('.json', '')
            info_file = os.path.join(backup_dir, item)
            
            try:
                with open(info_file, 'r', encoding='utf-8') as f:
                    info = json.load(f)
                    backups.append({
                        'timestamp': timestamp,
                        'info': info
                    })
            except Exception as e:
                print(f'Error reading backup info {item}: {e}')
    
    # 타임스탬프 기준으로 정렬 (최신순)
    backups.sort(key=lambda x: x['timestamp'], reverse=True)
    return backups

if __name__ == '__main__':
    backup_all() 
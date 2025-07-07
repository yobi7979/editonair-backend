import os
import sys
import subprocess
from datetime import datetime
import time
import requests

def run_command(command, error_message):
    """명령어 실행 및 에러 처리"""
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        return True, result.stdout
    except subprocess.CalledProcessError as e:
        print(f'❌ {error_message}')
        print(f'오류: {e.stderr}')
        return False, e.stderr

def run_deployment_checks():
    """배포 전 체크리스트 실행"""
    print('🔍 배포 전 체크리스트 실행 중...')
    result = subprocess.run([sys.executable, 'deployment_check.py'])
    return result.returncode == 0

def backup_database():
    """데이터베이스 백업"""
    print('💾 데이터베이스 백업 중...')
    result = subprocess.run([sys.executable, 'backup_db.py'])
    return result.returncode == 0

def push_to_github():
    """GitHub에 코드 푸시"""
    print('📤 GitHub에 코드 푸시 중...')
    
    # Git 상태 확인
    status_ok, status = run_command(['git', 'status', '--porcelain'], '깃 상태 확인 실패')
    if not status_ok:
        return False
        
    if status.strip():
        # 변경사항이 있으면 커밋
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        _, _ = run_command(['git', 'add', '.'], '파일 스테이징 실패')
        commit_ok, _ = run_command(
            ['git', 'commit', '-m', f'배포: {timestamp}'],
            '커밋 생성 실패'
        )
        if not commit_ok:
            return False
    
    # main 브랜치로 푸시
    push_ok, _ = run_command(
        ['git', 'push', 'origin', 'main'],
        'GitHub 푸시 실패'
    )
    return push_ok

def wait_for_deployment(max_wait=300):
    """Railway 배포 완료 대기"""
    print('⏳ Railway 배포 대기 중...')
    
    api_url = os.getenv('RAILWAY_STATUS_URL')
    if not api_url:
        print('⚠️ RAILWAY_STATUS_URL이 설정되지 않아 배포 상태를 확인할 수 없습니다.')
        return True
        
    start_time = time.time()
    while time.time() - start_time < max_wait:
        try:
            response = requests.get(api_url)
            if response.status_code == 200:
                print('✅ Railway 배포가 완료되었습니다!')
                return True
        except:
            pass
        
        print('.', end='', flush=True)
        time.sleep(10)
    
    print('\n⚠️ 배포 상태 확인 시간이 초과되었습니다.')
    return False

def main():
    """배포 프로세스 실행"""
    print('🚀 배포 프로세스 시작\n')
    
    # 1. 배포 전 체크
    if not run_deployment_checks():
        print('❌ 배포 전 체크 실패')
        return 1
    
    # 2. 데이터베이스 백업
    if not backup_database():
        print('❌ 데이터베이스 백업 실패')
        return 1
    
    # 3. GitHub 푸시
    if not push_to_github():
        print('❌ GitHub 푸시 실패')
        return 1
    
    # 4. Railway 배포 대기
    if not wait_for_deployment():
        print('⚠️ Railway 배포 상태를 확인할 수 없습니다.')
    
    print('\n✨ 배포가 성공적으로 완료되었습니다!')
    return 0

if __name__ == '__main__':
    sys.exit(main()) 
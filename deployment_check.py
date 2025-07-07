import os
import sys
import psycopg2
from urllib.parse import urlparse
import requests

def check_database_connection():
    """데이터베이스 연결 테스트"""
    print('\n[데이터베이스 연결 체크]')
    try:
        db_url = os.getenv('DATABASE_URL')
        if not db_url:
            print('❌ DATABASE_URL이 설정되지 않았습니다.')
            return False
            
        parsed = urlparse(db_url)
        conn = psycopg2.connect(
            dbname=parsed.path[1:],
            user=parsed.username,
            password=parsed.password,
            host=parsed.hostname,
            port=parsed.port or 5432
        )
        cur = conn.cursor()
        cur.execute('SELECT version()')
        version = cur.fetchone()[0]
        print(f'✅ PostgreSQL 연결 성공 ({version})')
        conn.close()
        return True
    except Exception as e:
        print(f'❌ 데이터베이스 연결 실패: {e}')
        return False

def check_required_files():
    """필수 파일 존재 여부 체크"""
    print('\n[필수 파일 체크]')
    required_files = [
        'requirements.txt',
        'Procfile',
        'app.py',
        '.gitignore'
    ]
    
    all_exist = True
    for file in required_files:
        if os.path.exists(file):
            print(f'✅ {file} 존재')
        else:
            print(f'❌ {file} 없음')
            all_exist = False
    return all_exist

def check_requirements():
    """requirements.txt 유효성 체크"""
    print('\n[requirements.txt 체크]')
    try:
        import pkg_resources
        with open('requirements.txt') as f:
            requirements = pkg_resources.parse_requirements(f)
            for req in requirements:
                print(f'✅ {req}')
        return True
    except Exception as e:
        print(f'❌ requirements.txt 파싱 실패: {e}')
        return False

def check_git_status():
    """Git 상태 체크"""
    print('\n[Git 상태 체크]')
    try:
        # 변경된 파일 확인
        import subprocess
        result = subprocess.run(['git', 'status', '--porcelain'], capture_output=True, text=True)
        changes = result.stdout.strip()
        
        if changes:
            print('⚠️ 커밋되지 않은 변경사항:')
            print(changes)
            return False
        else:
            print('✅ 모든 변경사항이 커밋됨')
            return True
    except Exception as e:
        print(f'❌ Git 상태 확인 실패: {e}')
        return False

def check_environment_variables():
    """필수 환경변수 체크"""
    print('\n[환경변수 체크]')
    required_vars = [
        'DATABASE_URL',
        'JWT_SECRET_KEY',
        'FLASK_ENV'
    ]
    
    all_set = True
    for var in required_vars:
        if os.getenv(var):
            print(f'✅ {var} 설정됨')
        else:
            print(f'❌ {var} 설정되지 않음')
            all_set = False
    return all_set

def run_tests():
    """기본 테스트 실행"""
    print('\n[기본 테스트 실행]')
    try:
        import pytest
        result = pytest.main(['tests/'])
        return result == 0
    except ImportError:
        print('❌ pytest가 설치되지 않았습니다.')
        return False
    except Exception as e:
        print(f'❌ 테스트 실행 실패: {e}')
        return False

def main():
    """메인 체크 함수"""
    print('🔍 배포 전 체크리스트 실행\n')
    
    checks = [
        ('데이터베이스 연결', check_database_connection),
        ('필수 파일 존재', check_required_files),
        ('requirements.txt', check_requirements),
        ('Git 상태', check_git_status),
        ('환경변수', check_environment_variables),
        ('기본 테스트', run_tests)
    ]
    
    results = []
    for name, check in checks:
        try:
            result = check()
            results.append((name, result))
        except Exception as e:
            print(f'❌ {name} 체크 중 오류 발생: {e}')
            results.append((name, False))
    
    print('\n📋 체크리스트 결과:')
    all_passed = True
    for name, result in results:
        status = '✅ 통과' if result else '❌ 실패'
        print(f'{status} - {name}')
        if not result:
            all_passed = False
    
    if all_passed:
        print('\n✨ 모든 체크 통과! 배포를 진행해도 좋습니다.')
        return 0
    else:
        print('\n⚠️ 일부 체크가 실패했습니다. 문제를 해결하고 다시 시도하세요.')
        return 1

if __name__ == '__main__':
    sys.exit(main()) 
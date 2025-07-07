import socketio
import requests
import time
import pytest
from unittest.mock import patch

# 테스트용 사용자 생성
def create_test_user():
    try:
        response = requests.post('http://localhost:5000/api/auth/register', json={
            'username': 'testuser',
            'password': 'testpass123'
        })
        if response.status_code == 409:  # 이미 존재하는 사용자
            pass
        else:
            response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Failed to create test user: {e}")

# 로그인하여 토큰 얻기
def get_auth_token():
    try:
        response = requests.post('http://localhost:5000/api/auth/login', json={
            'username': 'testuser',
            'password': 'testpass123'
        })
        response.raise_for_status()
        return response.json()['token']
    except requests.exceptions.RequestException as e:
        print(f"Failed to get auth token: {e}")
        return None

# 테스트 프로젝트 생성
def create_test_project():
    token = get_auth_token()
    if not token:
        print("Failed to get auth token for project creation")
        return
        
    try:
        response = requests.post(
            'http://localhost:5000/api/projects',
            json={
                'name': 'Test Project',
                'scenes': [
                    {
                        'name': 'Scene 1',
                        'order': 0
                    }
                ]
            },
            headers={'Authorization': f'Bearer {token}'}
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Failed to create test project: {e}")
        return None

class TestWebSocket:
    @pytest.fixture(autouse=True)
    def setup(self):
        create_test_user()
        create_test_project()  # 테스트 프로젝트 생성
        
    @pytest.fixture
    def sio(self):
        return socketio.Client(logger=True, engineio_logger=True)
        
    def test_connection_success(self, sio):
        token = get_auth_token()
        assert token is not None, "Failed to get auth token"
        
        connected = False
        error_message = None
        
        @sio.event
        def connect():
            nonlocal connected
            connected = True
            print('Connected to server')
            
        @sio.event
        def connect_error(data):
            nonlocal error_message
            error_message = str(data)
            print(f'Connection error: {data}')

        try:
            sio.connect(
                f'http://localhost:5000?token={token}',
                wait_timeout=5,
                transports=['websocket', 'polling']
            )
            assert connected == True, "Connection should be successful"
            assert error_message is None, f"Unexpected error: {error_message}"
            
        finally:
            if sio.connected:
                sio.disconnect()
                
    def test_connection_without_token(self, sio):
        error_message = None
        
        @sio.event
        def connect_error(data):
            nonlocal error_message
            error_message = str(data)
            print(f'Connection error: {data}')
            
        with pytest.raises(socketio.exceptions.ConnectionError):
            sio.connect(
                'http://localhost:5000',
                wait_timeout=5,
                transports=['websocket', 'polling']
            )
        assert error_message == 'Token is required', f"Unexpected error: {error_message}"
        
    def test_connection_with_invalid_token(self, sio):
        error_message = None
        
        @sio.event
        def connect_error(data):
            nonlocal error_message
            error_message = str(data)
            print(f'Connection error: {data}')
            
        with pytest.raises(socketio.exceptions.ConnectionError):
            sio.connect(
                'http://localhost:5000?token=invalid_token',
                wait_timeout=5,
                transports=['websocket', 'polling']
            )
        assert error_message == 'Invalid token', f"Unexpected error: {error_message}"
        
    def test_project_join(self, sio):
        token = get_auth_token()
        assert token is not None, "Failed to get auth token"
        
        connected = False
        joined = False
        error_message = None
        
        @sio.event
        def connect():
            nonlocal connected
            connected = True
            print('Connected to server')
            sio.emit('join', {'project': 'Test Project'})
            
        @sio.event
        def joined(data):
            nonlocal joined
            joined = True
            print('Joined project:', data)
            
        @sio.event
        def error(data):
            nonlocal error_message
            error_message = data.get('message')
            print(f'Error: {error_message}')
            
        @sio.event
        def connect_error(data):
            nonlocal error_message
            error_message = str(data)
            print(f'Connection error: {data}')

        try:
            sio.connect(
                f'http://localhost:5000?token={token}',
                wait_timeout=5,
                transports=['websocket', 'polling']
            )
            assert connected == True, "Connection should be successful"
            
            # Wait for join response
            time.sleep(2)
            assert error_message is None, f"Unexpected error: {error_message}"
            assert joined == True, "Should successfully join the project"
            
        finally:
            if sio.connected:
                sio.disconnect()

if __name__ == '__main__':
    pytest.main([__file__, '-v']) 
import requests
import json

BASE_URL = 'http://localhost:5000/api'

def test_register():
    url = f'{BASE_URL}/auth/register'
    data = {
        'username': 'test',
        'password': 'test123'
    }
    response = requests.post(url, json=data)
    print('Register Response:', response.status_code)
    print(response.json() if response.ok else response.text)

def test_login():
    url = f'{BASE_URL}/auth/login'
    data = {
        'username': 'test',
        'password': 'test123'
    }
    response = requests.post(url, json=data)
    print('Login Response:', response.status_code)
    print(response.json() if response.ok else response.text)

if __name__ == '__main__':
    print('Testing Register API...')
    test_register()
    print('\nTesting Login API...')
    test_login() 
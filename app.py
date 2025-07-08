# 배포 트리거용 주석
# ... existing code ...

import os
import json
import re
import shutil
import io
import socket
from datetime import datetime, timedelta
from functools import wraps
from urllib.parse import unquote

from flask import Flask, jsonify, request, render_template, send_from_directory, session
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, jwt_required, decode_token
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from PIL import Image
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
import bcrypt
import gevent
from gevent import monkey
monkey.patch_all()

# Initialize Flask app
app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:3000", "*"], supports_credentials=True)

print("Starting application...")

# 상수 정의
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

try:
    # Configure database
    basedir = os.path.abspath(os.path.dirname(__file__))
    # PostgreSQL을 우선 사용하고, 없으면 SQLite 사용
    database_url = os.environ.get('DATABASE_URL')
    if database_url:
        # Railway PostgreSQL URL을 SQLAlchemy 형식으로 변환
        if database_url.startswith('postgres://'):
            database_url = database_url.replace('postgres://', 'postgresql://', 1)
        app.config['SQLALCHEMY_DATABASE_URI'] = database_url
        print(f"Using PostgreSQL database")
    else:
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'editor_data.db')
        print(f"Using SQLite database: {app.config['SQLALCHEMY_DATABASE_URI']}")

    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key')  # 프로덕션에서는 환경 변수 사용

    # Session configuration
    app.config['SESSION_TYPE'] = 'filesystem'
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=1)

    # JWT 설정
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'your-secret-key')  # 프로덕션에서는 환경 변수 사용
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=1)  # 토큰 만료 시간

    # Initialize extensions
    db = SQLAlchemy(app)
    jwt = JWTManager(app)
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent', allow_unsafe_werkzeug=True)

    print("Database and extensions initialized successfully")

except Exception as e:
    print(f"Error during initialization: {e}")
    raise

# 전역 변수들 (중복 제거)
# socketio는 이미 위에서 초기화됨

# 사용자별 송출 상태 관리 (메모리 기반)
user_broadcast_state = {}

def get_user_broadcast_state(user_id):
    """사용자별 송출 상태 가져오기"""
    if user_id not in user_broadcast_state:
        user_broadcast_state[user_id] = {
            'current_pushed_scene_id': None,
            'is_broadcasting': False
        }
    return user_broadcast_state[user_id]

def set_user_pushed_scene(user_id, scene_id):
    """사용자별 송출 씬 설정"""
    state = get_user_broadcast_state(user_id)
    state['current_pushed_scene_id'] = scene_id
    state['is_broadcasting'] = True if scene_id else False

# --- Database Models ---

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    def __repr__(self):
        return f'<User {self.username}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_active': self.is_active
        }

class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('projects', lazy=True))

    # Relationships
    scenes = db.relationship('Scene', backref='project', lazy=True, cascade='all, delete-orphan')
    permissions = db.relationship('ProjectPermission', backref='project', lazy=True, cascade='all, delete-orphan')

class ProjectPermission(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    permission_type = db.Column(db.String(20), nullable=False)  # 'owner', 'editor', 'viewer'
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<ProjectPermission {self.user_id}:{self.project_id}:{self.permission_type}>'

class Scene(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    order = db.Column(db.Integer, default=0)
    duration = db.Column(db.Integer, default=0)  # 씬 길이 (밀리초)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    objects = db.relationship('Object', backref='scene', lazy=True, cascade='all, delete-orphan')

class Object(db.Model):
    __tablename__ = 'objects'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    order = db.Column(db.Integer, nullable=False)
    properties = db.Column(db.Text, nullable=False)  # JSON string
    in_motion = db.Column(db.Text, nullable=False)  # JSON string
    out_motion = db.Column(db.Text, nullable=False)  # JSON string
    timing = db.Column(db.Text, nullable=False)  # JSON string
    scene_id = db.Column(db.Integer, db.ForeignKey('scene.id'), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<Object {self.type}>'

# --- Helper Functions ---

def allowed_image_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

def check_file_size(file):
    """파일 크기 체크"""
    file.seek(0, 2)  # 파일 끝으로 이동
    size = file.tell()
    file.seek(0)  # 파일 시작으로 복귀
    return size <= MAX_FILE_SIZE

def safe_unicode_filename(filename):
    # 위험문자만 제거하고 한글 등 유니코드는 허용
    keepchars = (' ', '.', '_', '-')
    filename = filename.replace('\x00', '')
    filename = filename.replace('/', '').replace('\\', '')
    return ''.join(c for c in filename if c.isalnum() or c in keepchars or ord(c) > 127)

def slugify(name):
    if not name:
        return 'untitled'
    name = name.lower()
    name = re.sub(r'[^a-z0-9가-힣-_]', '-', name)
    name = re.sub(r'-+', '-', name)
    return name.strip('-') or 'untitled'

def get_project_folder(project_name, user_id=None):
    """프로젝트명으로 폴더 생성 및 경로 반환 (사용자별 격리)"""
    basedir = os.path.abspath(os.path.dirname(__file__))
    folder = slugify(project_name)
    
    if user_id:
        # 사용자별 폴더 구조: projects/user_{user_id}/{project_name}
        return os.path.join(basedir, '..', 'projects', f'user_{user_id}', folder)
    else:
        # 하위 호환성을 위해 user_id가 없으면 기존 방식 사용
        return os.path.join(basedir, '..', 'projects', folder)

def get_current_user_from_token():
    """현재 인증된 사용자를 반환하는 헬퍼 함수"""
    try:
        current_user_id = get_jwt_identity()
        return User.query.get(current_user_id)
    except:
        return None

def get_project_by_name(project_name, user_id=None):
    """프로젝트 이름으로 프로젝트를 찾는 헬퍼 함수 (사용자별 격리)"""
    if user_id:
        # 사용자가 접근 가능한 프로젝트 중에서 검색
        permissions = ProjectPermission.query.filter_by(user_id=user_id).all()
        project_ids = [p.project_id for p in permissions]
        return Project.query.filter(
            Project.id.in_(project_ids),
            Project.name == project_name
        ).first()
    else:
        # 하위 호환성을 위해 user_id가 없으면 기존 방식 사용
        return Project.query.filter_by(name=project_name).first()

def check_project_permission(user_id, project_id, required_permission):
    """사용자의 프로젝트 권한을 확인하는 헬퍼 함수"""
    permission = ProjectPermission.query.filter_by(
        user_id=user_id,
        project_id=project_id
    ).first()
    
    if not permission:
        return False
        
    # 권한 레벨 체크
    permission_levels = {
        'viewer': 0,
        'editor': 1,
        'owner': 2
    }
    
    required_level = permission_levels.get(required_permission, 0)
    current_level = permission_levels.get(permission.permission_type, 0)
    
    return current_level >= required_level

def object_to_dict(obj):
    """오브젝트 객체를 딕셔너리로 변환하는 헬퍼 함수"""
    return {
        'id': obj.id,
        'name': obj.name,
        'type': obj.type,
        'order': obj.order,
        'properties': json.loads(obj.properties) if obj.properties else {},
        'in_motion': json.loads(obj.in_motion) if obj.in_motion else {},
        'out_motion': json.loads(obj.out_motion) if obj.out_motion else {},
        'timing': json.loads(obj.timing) if obj.timing else {},
        'scene_id': obj.scene_id,
        'created_at': obj.created_at.isoformat() if obj.created_at else None,
        'updated_at': obj.updated_at.isoformat() if obj.updated_at else None
    }

def scene_to_dict(scene):
    """씬 객체를 딕셔너리로 변환하는 헬퍼 함수"""
    try:
        objects = []
        for obj in sorted(scene.objects, key=lambda x: x.order):
            try:
                # 안전한 JSON 로딩
                properties = json.loads(obj.properties) if obj.properties else {}
                in_motion = json.loads(obj.in_motion) if obj.in_motion else {}
                out_motion = json.loads(obj.out_motion) if obj.out_motion else {}
                timing = json.loads(obj.timing) if obj.timing else {}
                
                objects.append({
                    'id': obj.id,
                    'name': obj.name,
                    'type': obj.type,
                    'order': obj.order,
                    'properties': properties,
                    'in_motion': in_motion,
                    'out_motion': out_motion,
                    'timing': timing
                })
            except (json.JSONDecodeError, TypeError) as e:
                print(f"Error parsing JSON for object {obj.id}: {str(e)}")
                # 기본값으로 빈 딕셔너리 사용
                objects.append({
                    'id': obj.id,
                    'name': obj.name,
                    'type': obj.type,
                    'order': obj.order,
                    'properties': {},
                    'in_motion': {},
                    'out_motion': {},
                    'timing': {}
                })
        
        return {
            'id': scene.id,
            'name': scene.name,
            'order': scene.order,
            'duration': scene.duration,
            'created_at': scene.created_at.isoformat() if scene.created_at else None,
            'updated_at': scene.updated_at.isoformat() if scene.updated_at else None,
            'objects': objects
        }
    except Exception as e:
        print(f"Error in scene_to_dict: {str(e)}")
        # 최소한의 데이터만 반환
        return {
            'id': scene.id,
            'name': scene.name,
            'order': scene.order,
            'duration': scene.duration,
            'created_at': scene.created_at.isoformat() if scene.created_at else None,
            'updated_at': scene.updated_at.isoformat() if scene.updated_at else None,
            'objects': []
        }

def project_to_dict(project):
    """프로젝트 객체를 딕셔너리로 변환하는 헬퍼 함수"""
    return {
        'id': project.id,
        'name': project.name,
        'created_at': project.created_at.isoformat() if project.created_at else None,
        'updated_at': project.updated_at.isoformat() if project.updated_at else None,
        'user': project.user.to_dict() if project.user else None,
        'scenes': [{
            'id': scene.id,
            'name': scene.name,
            'order': scene.order,
            'objects': [{
        'id': obj.id,
        'name': obj.name,
        'type': obj.type,
        'order': obj.order,
        'properties': json.loads(obj.properties) if obj.properties else {},
        'in_motion': json.loads(obj.in_motion) if obj.in_motion else {},
        'out_motion': json.loads(obj.out_motion) if obj.out_motion else {},
                'timing': json.loads(obj.timing) if obj.timing else {}
            } for obj in sorted(scene.objects, key=lambda x: x.order)]
        } for scene in sorted(project.scenes, key=lambda x: x.order)]
    }

# --- Decorators ---

def auth_required(permission='viewer'):
    """권한 체크 데코레이터"""
    def decorator(f):
        @jwt_required()
        @wraps(f)
        def decorated_function(*args, **kwargs):
            current_user = get_current_user_from_token()
            if not current_user:
                return jsonify({'error': 'Authentication required'}), 401
                
            # project_name이 URL에 있는 경우
            project_name = kwargs.get('project_name')
            if project_name:
                project = get_project_by_name(project_name, current_user.id)
                if not project:
                    return jsonify({'error': 'Project not found'}), 404
                    
                if not check_project_permission(current_user.id, project.id, permission):
                    return jsonify({'error': 'Permission denied'}), 403
                    
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def authenticated_only(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        token = request.args.get('token')
        if not token:
            disconnect()
            return False
            
        try:
            decoded_token = decode_token(token)
            user_id = decoded_token['sub']
            user = User.query.get(user_id)
            
            if not user:
                disconnect()
                return False
                
            session['user_id'] = user_id
            return f(*args, **kwargs)
            
        except Exception as e:
            app.logger.error(f"WebSocket authentication error: {str(e)}")
            disconnect()
            return False
            
    return wrapped

def admin_required(f):
    """관리자 권한이 필요한 API를 위한 데코레이터"""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        try:
            user_id = get_jwt_identity()
            user = User.query.get(user_id)
            
            if not user or user.username != 'admin':
                return jsonify({'error': '관리자 권한이 필요합니다.'}), 403
            
            return f(*args, **kwargs)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    return decorated_function

# CORS 미들웨어 제거 (Flask-CORS가 처리)

@app.route('/health')
def health_check():
    """Health check endpoint for Railway"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }), 200

# --- Authentication Routes ---

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    
    if not all(k in data for k in ('username', 'password')):
        return jsonify({'error': 'Missing required fields'}), 400
        
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 409
        
    hashed = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt())
    new_user = User(
        username=data['username'],
        password=hashed.decode('utf-8'),
        created_at=datetime.utcnow()
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    # 사용자 생성 후 바로 토큰 발급
    token = create_access_token(identity=new_user.id)
    
    return jsonify({
        'message': 'User created successfully',
        'token': token,
        'user': {
            'id': new_user.id,
            'username': new_user.username
        }
    }), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    
    if not all(k in data for k in ('username', 'password')):
        return jsonify({'error': 'Missing required fields'}), 400
        
    user = User.query.filter_by(username=data['username']).first()
    if not user or not bcrypt.checkpw(data['password'].encode('utf-8'), user.password.encode('utf-8')):
        return jsonify({'error': 'Invalid username or password'}), 401
    
    # flask_jwt_extended의 create_access_token 사용
    token = create_access_token(identity=user.id)
    
    return jsonify({
        'token': token,
        'user': {
            'id': user.id,
            'username': user.username
        }
    }), 200

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_current_user_info():
    current_user = get_current_user_from_token()
    if not current_user:
        return jsonify({'error': 'User not found'}), 404
        
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'is_active': current_user.is_active
    })

# --- WebSocket Events ---

@socketio.on_error_default
def default_error_handler(e):
    app.logger.error(f"SocketIO error: {str(e)}")
    emit('error', {'message': str(e)})

@socketio.on('connect')
def handle_connect():
    """WebSocket 연결 처리"""
    print(f"WebSocket connection attempt from {request.remote_addr}")
    print(f"Query parameters: {request.args}")
    
    token = request.args.get('token')
    project_id = request.args.get('project_id')
    user_id = request.args.get('user_id')
    
    # 토큰이 없는 경우 (오버레이 페이지) - user_id로 사용자별 룸 조인
    if not token:
        print(f"No token provided, checking user_id: {user_id}")
        if user_id:
            try:
                user_id = int(user_id)
                user_room = f'user_{user_id}'
                join_room(user_room)
                print(f"Overlay page joined user room: {user_room}")
                return True
            except ValueError:
                print("Invalid user_id format")
                return False
        else:
            print("No user_id provided for overlay page")
            return False
        
    # 토큰이 있는 경우 (프론트엔드 앱) - 사용자 인증
    print(f"Token provided: {token[:20]}...")
    try:
        decoded = decode_token(token)
        user_id = decoded['sub']
        user_room = f'user_{user_id}'
        join_room(user_room)
        print(f"Authenticated user {user_id} joined room: {user_room}")
        return True
    except Exception as e:
        print(f"Token validation failed: {e}")
        disconnect()
        return False

@socketio.on('disconnect')
def handle_disconnect():
    if 'user_id' in session:
        del session['user_id']

@socketio.on('join')
@authenticated_only
def handle_join(data):
    project_name = data.get('project')
    if not project_name:
        emit('error', {'message': 'Project name is required'})
        return
        
    # WebSocket에서는 session에 user_id가 설정되어 있음 (authenticated_only 데코레이터에서)
    user_id = session.get('user_id')
    if not user_id:
        emit('error', {'message': 'Authentication required'})
        return
        
    project = get_project_by_name(project_name, user_id)
    if not project:
        emit('error', {'message': 'Project not found'})
        return
        
    # 프로젝트 소유자는 자동으로 권한 부여
    if project.user_id == user_id:
        room = f'project_{project.id}'
        join_room(room)
        emit('joined', {'project': project_name, 'room': room})
        return
        
    # 권한 체크
    permission = ProjectPermission.query.filter_by(
        user_id=user_id,
        project_id=project.id
    ).first()
    
    if not permission:
        # 프로젝트 소유자에게 기본 권한 부여
        if project.user_id == user_id:
            permission = ProjectPermission(
                user_id=user_id,
                project_id=project.id,
                permission_type='owner'
            )
            db.session.add(permission)
            db.session.commit()
        else:
            emit('error', {'message': 'Permission denied'})
            return
            
    room = f'project_{project.id}'
    join_room(room)
    emit('joined', {'project': project_name, 'room': room})

# --- Project API ---

def validate_project_name(name, user_id=None):
    """프로젝트 이름 유효성 검사"""
    errors = []
    
    if not name or not name.strip():
        errors.append('프로젝트 이름을 입력해주세요.')
        return errors
    
    name = name.strip()
    
    # 영문 대문자 검사
    if any(c.isupper() and c.isalpha() for c in name):
        errors.append('영문 대문자는 사용할 수 없습니다. 소문자를 사용해주세요.')
    
    # 띄어쓰기 검사
    if ' ' in name:
        errors.append('띄어쓰기는 사용할 수 없습니다. 하이픈(-) 또는 언더스코어(_)를 사용해주세요.')
    
    # 중복 이름 검사 (user_id가 제공된 경우)
    if user_id:
        # 해당 사용자가 접근 가능한 프로젝트 중에서 중복 체크
        permissions = ProjectPermission.query.filter_by(user_id=user_id).all()
        project_ids = [p.project_id for p in permissions]
        existing_project = Project.query.filter(
            Project.id.in_(project_ids),
            Project.name.ilike(name)  # 대소문자 구분 없이 검사
        ).first()
        
        if existing_project:
            errors.append('이미 존재하는 프로젝트 이름입니다.')
    
    return errors

@app.route('/api/projects', methods=['POST'])
@jwt_required()
def create_project():
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({'message': 'Project name is required'}), 400
    
    user_id = get_jwt_identity()
    project_name = data['name'].strip()
    
    # 프로젝트 이름 유효성 검사
    validation_errors = validate_project_name(project_name, user_id)
    if validation_errors:
        return jsonify({'message': ' '.join(validation_errors)}), 400
        
    # 프로젝트 생성
    project = Project(
        name=project_name,
        user_id=user_id
    )
    db.session.add(project)
    db.session.flush()  # ID를 얻기 위해 flush
    
    # 프로젝트 소유자 권한 추가
    permission = ProjectPermission(
        project_id=project.id,
        user_id=user_id,
        permission_type='owner'
    )
    db.session.add(permission)
    
    # 씬 생성
    if 'scenes' in data:
        for scene_data in data['scenes']:
            scene = Scene(
                name=scene_data['name'],
                order=scene_data['order'],
                project=project
            )
            db.session.add(scene)
            
    try:
        db.session.commit()
        
        # 프로젝트 폴더 생성
        project_folder = get_project_folder(project.name, user_id)
        os.makedirs(os.path.join(project_folder, 'library', 'images'), exist_ok=True)
        os.makedirs(os.path.join(project_folder, 'library', 'sequences'), exist_ok=True)
        
        return jsonify({
            'id': project.id,
            'name': project.name,
            'created_at': project.created_at.isoformat(),
            'updated_at': project.updated_at.isoformat(),
            'scenes': [{
                'id': scene.id,
                'name': scene.name,
                'order': scene.order
            } for scene in project.scenes]
        }), 201
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Failed to create project: {str(e)}")
        return jsonify({'message': 'Failed to create project'}), 500

@app.route('/api/projects', methods=['GET'])
@jwt_required()
def handle_projects():
    current_user = get_current_user_from_token()
    if not current_user:
        return jsonify({'error': 'User not found'}), 404

    if request.method == 'POST':
        try:
            data = request.get_json()
            new_project_name = data.get('name', 'Untitled Project').strip()
            
            # 프로젝트 이름 유효성 검사
            validation_errors = validate_project_name(new_project_name, current_user.id)
            if validation_errors:
                return jsonify({'error': ' '.join(validation_errors)}), 400
                
            new_project = Project(
                name=new_project_name,
                user_id=current_user.id
            )
            db.session.add(new_project)
            db.session.flush()  # ID를 얻기 위해 flush
        
            initial_scenes_data = data.get('scenes', [])
            for scene_data in initial_scenes_data:
                new_scene = Scene(
                    name=scene_data.get('name', 'Untitled Scene'),
                    order=scene_data.get('order', 0),
                    project=new_project
                )
                db.session.add(new_scene)
                db.session.flush()  # ID를 얻기 위해 flush
                
                initial_objects_data = scene_data.get('objects', [])
                for i, obj_data in enumerate(initial_objects_data):
                    new_object = Object(
                        name=obj_data.get('name', 'New Object'),
                        type=obj_data.get('type', 'text'),
                        order=obj_data.get('order', i),
                        properties=json.dumps(obj_data.get('properties', {})),
                        in_motion=json.dumps(obj_data.get('in_motion', {})),
                        out_motion=json.dumps(obj_data.get('out_motion', {})),
                        timing=json.dumps(obj_data.get('timing', {})),
                        scene=new_scene
                    )
                    db.session.add(new_object)
            
            # 프로젝트 소유자 권한 추가
            permission = ProjectPermission(
                project_id=new_project.id,
                user_id=current_user.id,
                permission_type='owner'
            )
            db.session.add(permission)
            
            db.session.commit()

            # 프로젝트 폴더 생성
            project_folder = get_project_folder(new_project_name, current_user.id)
            os.makedirs(os.path.join(project_folder, 'library', 'images'), exist_ok=True)
            os.makedirs(os.path.join(project_folder, 'library', 'sequences'), exist_ok=True)

            return jsonify(project_to_dict(new_project)), 201

        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error creating project: {str(e)}")
            return jsonify({'error': 'Failed to create project'}), 500
            
    else:  # GET
        try:
            # 사용자가 접근 가능한 모든 프로젝트 조회
            permissions = ProjectPermission.query.filter_by(user_id=current_user.id).all()
            project_ids = [p.project_id for p in permissions]
            projects = Project.query.filter(Project.id.in_(project_ids)).all()
            
            return jsonify([project_to_dict(p) for p in projects])
            
        except Exception as e:
            app.logger.error(f"Error fetching projects: {str(e)}")
            return jsonify({'error': 'Failed to fetch projects'}), 500

@app.route('/api/projects/<project_name>', methods=['GET', 'PUT', 'DELETE'])
@auth_required('viewer')
def handle_project_detail(project_name):
    current_user = get_current_user_from_token()
    project = get_project_by_name(project_name, current_user.id)
    
    # 프로젝트 접근 권한 확인
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    if not check_project_permission(current_user.id, project.id, 'viewer'):
        return jsonify({'error': 'Permission denied'}), 403

    if request.method == 'GET':
        return jsonify(project_to_dict(project))

    elif request.method == 'PUT':
        # 편집 권한 확인
        if not check_project_permission(current_user.id, project.id, 'editor'):
            return jsonify({'error': 'Permission denied'}), 403
            
        data = request.get_json()
        if 'name' in data:
            project.name = data['name']
        db.session.commit()
        return jsonify(project_to_dict(project))
        
    elif request.method == 'DELETE':
        # 소유자 권한 확인
        if not check_project_permission(current_user.id, project.id, 'owner'):
            return jsonify({'error': 'Permission denied'}), 403
            
        # 프로젝트 폴더 삭제
        project_folder = get_project_folder(project.name, current_user.id)
        if os.path.exists(project_folder):
            shutil.rmtree(project_folder)
            
        db.session.delete(project)
        db.session.commit()
        return jsonify({'message': 'Project deleted successfully'})

@app.route('/api/projects/<project_name>/share', methods=['POST'])
@auth_required('owner')
def handle_project_share(project_name):
    current_user = get_current_user_from_token()
    project = get_project_by_name(project_name, current_user.id)
    
    data = request.get_json()
    if not all(k in data for k in ('username', 'permission_type')):
        return jsonify({'error': 'Missing required fields'}), 400
        
    # 권한 타입 검증
    if data['permission_type'] not in ['viewer', 'editor', 'owner']:
        return jsonify({'error': 'Invalid permission type'}), 400
        
    # 공유할 사용자 찾기
    share_user = User.query.filter_by(username=data['username']).first()
    if not share_user:
        return jsonify({'error': 'User not found'}), 404
        
    # 이미 권한이 있는지 확인
    existing_permission = ProjectPermission.query.filter_by(
        project_id=project.id,
        user_id=share_user.id
    ).first()
    
    if existing_permission:
        existing_permission.permission_type = data['permission_type']
    else:
        new_permission = ProjectPermission(
            project_id=project.id,
            user_id=share_user.id,
            permission_type=data['permission_type']
        )
        db.session.add(new_permission)
        
    db.session.commit()
    return jsonify({'message': 'Project shared successfully'})

# Scene CRUD operations
@app.route('/api/projects/<project_name>/scenes', methods=['POST'])
@auth_required('editor')
def create_scene(project_name):
    current_user = get_current_user_from_token()
    project = get_project_by_name(project_name, current_user.id)
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({'error': 'Scene name is required'}), 400

    # Determine order for the new scene
    new_order = len(project.scenes)

    new_scene = Scene(
        name=data['name'],
        order=new_order,
        project_id=project.id
    )
    db.session.add(new_scene)
    db.session.commit()
    return jsonify(scene_to_dict(new_scene)), 201

@app.route('/api/scenes/<int:scene_id>', methods=['GET', 'PUT'])
@jwt_required()
def handle_scene(scene_id):
    try:
        current_user = get_current_user_from_token()
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        
        scene = Scene.query.get_or_404(scene_id)
        
        # 씬의 프로젝트에 대한 권한 확인
        if not check_project_permission(current_user.id, scene.project_id, 'viewer'):
            return jsonify({'error': 'Permission denied'}), 403
        
        if request.method == 'GET':
            return jsonify(scene_to_dict(scene))
        
        elif request.method == 'PUT':
            # 편집 권한 확인
            if not check_project_permission(current_user.id, scene.project_id, 'editor'):
                return jsonify({'error': 'Permission denied'}), 403
                
            data = request.get_json()
            if not data or 'name' not in data:
                return jsonify({'error': 'Scene name is required'}), 400

            # 씬 이름 업데이트
            print(f"Updating scene {scene_id} name from '{scene.name}' to '{data['name']}'")
            scene.name = data['name']
            
            # Update objects if provided
            if 'objects' in data:
                print(f"Updating objects for scene {scene_id}")
                # Get existing object IDs
                existing_object_ids = {obj.id for obj in scene.objects}
                incoming_object_ids = {obj_data['id'] for obj_data in data['objects'] if 'id' in obj_data}
                
                # Delete objects that are no longer in the scene
                for obj in list(scene.objects):
                    if obj.id not in incoming_object_ids:
                        db.session.delete(obj)
                
                # Update or create objects
                for obj_data in data['objects']:
                    obj_id = obj_data.get('id')
                    if obj_id and obj_id in existing_object_ids:
                        # Update existing object
                        obj = next(o for o in scene.objects if o.id == obj_id)
                        obj.name = obj_data.get('name', obj.name)
                        obj.type = obj_data.get('type', obj.type)
                        obj.order = obj_data.get('order', obj.order)
                        obj.properties = json.dumps(obj_data.get('properties', {}))
                        obj.in_motion = json.dumps(obj_data.get('in_motion', {}))
                        obj.out_motion = json.dumps(obj_data.get('out_motion', {}))
                        obj.timing = json.dumps(obj_data.get('timing', {}))
                    else:
                        # Create new object
                        new_object = Object(
                            name=obj_data.get('name', 'New Object'),
                            type=obj_data.get('type', 'text'),
                            order=obj_data.get('order', 0),
                            properties=json.dumps(obj_data.get('properties', {})),
                            in_motion=json.dumps(obj_data.get('in_motion', {})),
                            out_motion=json.dumps(obj_data.get('out_motion', {})),
                            timing=json.dumps(obj_data.get('timing', {})),
                            scene_id=scene.id
                        )
                        db.session.add(new_object)
            
            # 업데이트 시간 설정
            scene.updated_at = datetime.utcnow()
            
            # 데이터베이스 커밋
            db.session.commit()
            print(f"Scene {scene_id} updated successfully")
            
            # 응답 반환
            return jsonify(scene_to_dict(scene))
            
    except Exception as e:
        print(f"Error in handle_scene: {str(e)}")
        import traceback
        print(traceback.format_exc())
        db.session.rollback()
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/scenes/<int:scene_id>', methods=['DELETE'])
@jwt_required()
def delete_scene(scene_id):
    current_user = get_current_user_from_token()
    if not current_user:
        return jsonify({'error': 'Authentication required'}), 401
    
    scene = Scene.query.get_or_404(scene_id)
    
    # 편집 권한 확인
    if not check_project_permission(current_user.id, scene.project_id, 'editor'):
        return jsonify({'error': 'Permission denied'}), 403
    
    db.session.delete(scene)
    db.session.commit()
    return jsonify({'message': 'Scene deleted successfully'})

@app.route('/overlay/project/<project_name>')
def overlay_project(project_name):
    try:
        print(f"Accessing overlay for project {project_name}")
        
        # URL 파라미터에서 사용자 ID 가져오기
        user_id = request.args.get('user_id')
        if not user_id:
            return "user_id parameter is required", 400
            
        try:
            user_id = int(user_id)
        except ValueError:
            return "Invalid user_id parameter", 400
        
        # 사용자 존재 확인
        user = User.query.get(user_id)
        if not user:
            return "User not found", 404
            
        # 프로젝트 조회 (사용자별)
        project = get_project_by_name(project_name, user_id)
        if not project:
            return "Project not found", 404
        print(f"Found project: {project.name}")
        
        # 사용자별 송출 상태 확인
        user_state = get_user_broadcast_state(user_id)
        scene = None
        
        if user_state['current_pushed_scene_id']:
            print(f"Looking for pushed scene: {user_state['current_pushed_scene_id']}")
            scene = Scene.query.get(user_state['current_pushed_scene_id'])
            if scene:
                print(f"Found pushed scene: {scene.name}")
        
        if not scene and project.scenes:
            print("Using first scene from project")
            scene = project.scenes[0]
            if scene:
                print(f"Found first scene: {scene.name}")
        
        print(f"Rendering template with scene: {scene.name if scene else 'None'}")
        return render_template('overlay.html', 
                             project=project, 
                             scene=scene_to_dict(scene) if scene else None,
                             canvas_width=1920,
                             canvas_height=1080,
                             user_id=user_id)  # 사용자 ID를 템플릿에 전달
    except Exception as e:
        print(f"Error in overlay_project: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return str(e), 500

@app.route('/overlay/project/<project_name>/scene/<int:scene_id>')
def overlay_scene(project_name, scene_id):
    # 오버레이 페이지는 인증 없이 접근 가능하므로 프로젝트 이름으로만 검색
    project = Project.query.filter_by(name=project_name).first()
    if not project:
        return "Project not found", 404
    scene = Scene.query.get_or_404(scene_id)
    return render_template('overlay.html', 
                         project=project, 
                         scene=scene_to_dict(scene),
                         canvas_width=1920,
                         canvas_height=1080)

@app.route('/api/scenes/<int:scene_id>/push', methods=['POST'])
@jwt_required()
def push_scene(scene_id):
    try:
        current_user = get_current_user_from_token()
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        
        global current_pushed_scene_id
        scene = Scene.query.get_or_404(scene_id)
        
        # 편집 권한 확인
        if not check_project_permission(current_user.id, scene.project_id, 'editor'):
            return jsonify({'error': 'Permission denied'}), 403
        
        set_user_pushed_scene(current_user.id, scene_id)
        print(f"Scene {scene_id} pushed successfully")
        # 사용자별 룸으로 브로드캐스트
        user_room = f'user_{current_user.id}'
        socketio.emit('scene_change', {
            'scene_id': scene_id,
            'transition': 'fade',
            'duration': 1.0,
            'clear_effects': True
        }, room=user_room)
        return jsonify({'status': 'success', 'scene_id': scene_id})
    except Exception as e:
        print(f"Error in push_scene: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/scenes/<int:scene_id>/out', methods=['POST'])
@jwt_required()
def out_scene(scene_id):
    try:
        current_user = get_current_user_from_token()
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        
        scene = Scene.query.get_or_404(scene_id)
        
        # 편집 권한 확인
        if not check_project_permission(current_user.id, scene.project_id, 'editor'):
            return jsonify({'error': 'Permission denied'}), 403
        
        # 사용자 송출 상태 초기화
        set_user_pushed_scene(current_user.id, None)
        print(f"Scene {scene_id} out successfully")
        # 사용자별 룸으로 브로드캐스트
        user_room = f'user_{current_user.id}'
        socketio.emit('scene_out', {
            'scene_id': scene_id,
            'transition': 'fade',
            'duration': 1.0
        }, room=user_room)
        return jsonify({'status': 'success', 'scene_id': scene_id})
    except Exception as e:
        print(f"Error in out_scene: {str(e)}")
        return jsonify({'error': str(e)}), 500


# --- Helper function to initialize database ---
def init_db():
    try:
        with app.app_context():
            db.create_all()
            
            # 기본 사용자가 없는 경우 생성
            default_user = User.query.filter_by(username='admin').first()
            if not default_user:
                default_user = User(
                    username='admin',
                    password=generate_password_hash('admin123'), # 초기 비밀번호
                    is_active=True
                )
                db.session.add(default_user)
                db.session.commit()
                
                # 기존 프로젝트들을 기본 사용자에게 할당
                projects = Project.query.filter_by(user_id=None).all()
                for project in projects:
                    project.user_id = default_user.id
                    permission = ProjectPermission(
                        project_id=project.id,
                        user_id=default_user.id,
                        permission_type='owner'
                    )
                    db.session.add(permission)
                db.session.commit()
                
            print("Database initialized successfully!")
    except Exception as e:
        print(f"Database initialization error: {e}")
        # 프로덕션에서는 에러를 무시하고 계속 진행
        pass

def get_user_by_name(username):
    return User.query.filter_by(username=username).first()

def get_user_by_email(email):
    return User.query.filter_by(email=email).first()

@app.route('/api/scenes/<int:scene_id>/objects', methods=['POST'])
@jwt_required()
def create_object(scene_id):
    current_user = get_current_user_from_token()
    if not current_user:
        return jsonify({'error': 'Authentication required'}), 401
    
    scene = Scene.query.get_or_404(scene_id)
    
    # 편집 권한 확인
    if not check_project_permission(current_user.id, scene.project_id, 'editor'):
        return jsonify({'error': 'Permission denied'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # Get the highest current order and add 1
    max_order = db.session.query(db.func.max(Object.order)).filter_by(scene_id=scene_id).scalar()
    new_order = (max_order or 0) + 1 if max_order is not None else 0

    new_object = Object(
        name=data.get('name', 'New Object'),
        type=data.get('type', 'text'),
        order=new_order,
        properties=json.dumps(data.get('properties', {})),
        in_motion=json.dumps(data.get('in_motion', {})),
        out_motion=json.dumps(data.get('out_motion', {})),
        timing=json.dumps(data.get('timing', {})),
        scene_id=scene.id
    )
    db.session.add(new_object)
    db.session.commit()

    return jsonify(object_to_dict(new_object)), 201

@app.route('/api/objects/<int:object_id>', methods=['PUT'])
@jwt_required()
def update_object(object_id):
    """Updates an existing object."""
    current_user = get_current_user_from_token()
    if not current_user:
        return jsonify({'error': 'Authentication required'}), 401
    
    obj = Object.query.get_or_404(object_id)
    
    # 편집 권한 확인
    if not check_project_permission(current_user.id, obj.scene.project_id, 'editor'):
        return jsonify({'error': 'Permission denied'}), 403
    
    data = request.get_json()

    print(f"Received update request for object {object_id}:")
    print(f"Request data: {data}")

    if not data:
        return jsonify({'error': 'No data provided for update'}), 400

    # Update fields if they exist in the request data
    obj.name = data.get('name', obj.name)
    obj.type = data.get('type', obj.type)
    if 'order' in data:
        obj.order = data.get('order')
    
    # properties 업데이트 시 rotation 값 확인
    new_properties = data.get('properties', json.loads(obj.properties or '{}'))
    if 'rotation' in new_properties:
        print(f"Rotation value being saved: {new_properties['rotation']} (type: {type(new_properties['rotation'])})")
    
    obj.properties = json.dumps(new_properties)
    obj.in_motion = json.dumps(data.get('in_motion', json.loads(obj.in_motion or '{}')))
    obj.out_motion = json.dumps(data.get('out_motion', json.loads(obj.out_motion or '{}')))
    obj.timing = json.dumps(data.get('timing', json.loads(obj.timing or '{}')))
    if 'locked' in data:
        obj.locked = data['locked']
    if 'visible' in data:
        obj.visible = data['visible']
    try:
        db.session.commit()
        print("Successfully updated object in database")
        return jsonify(object_to_dict(obj))
    except Exception as e:
        print(f"Error updating object: {str(e)}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/objects/<int:object_id>', methods=['DELETE'])
@jwt_required()
def delete_object(object_id):
    """Deletes an object."""
    current_user = get_current_user_from_token()
    if not current_user:
        return jsonify({'error': 'Authentication required'}), 401
    
    obj = Object.query.get_or_404(object_id)
    
    # 편집 권한 확인
    if not check_project_permission(current_user.id, obj.scene.project_id, 'editor'):
        return jsonify({'error': 'Permission denied'}), 403
    
    db.session.delete(obj)
    db.session.commit()
    return jsonify({'message': 'Object deleted successfully'}), 200

@app.route('/api/scenes/<int:scene_id>/object-orders', methods=['PUT'])
@jwt_required()
def update_object_orders(scene_id):
    """Updates the order of multiple objects in a scene at once."""
    try:
        current_user = get_current_user_from_token()
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        
        scene = Scene.query.get_or_404(scene_id)
        
        # 편집 권한 확인
        if not check_project_permission(current_user.id, scene.project_id, 'editor'):
            return jsonify({'error': 'Permission denied'}), 403
        
        data = request.get_json()
        if not data or 'objectOrders' not in data:
            return jsonify({'error': 'No objectOrders data provided'}), 400
            
        object_orders = data['objectOrders']
        
        # 전달된 id와 order 값을 터미널에 출력
        print(f"--- Updating object orders for Scene ID: {scene_id} ---")
        for item in object_orders:
            print(f"  ID: {item.get('id')}, New Order: {item.get('order')}")
        print("----------------------------------------------------")
        
        for order_data in object_orders:
            object_id = order_data.get('id')
            new_order = order_data.get('order')
            
            if object_id is None or new_order is None:
                continue
                
            obj = Object.query.get(object_id)
            if obj and obj.scene_id == scene_id:
                obj.order = new_order
                
        db.session.commit()
        
        # DB에 저장된 값을 다시 조회하여 터미널에 출력
        print(f"--- Verifying saved data in DB for Scene ID: {scene_id} ---")
        updated_objects_from_db = Object.query.filter_by(scene_id=scene_id).order_by(Object.order).all()
        for obj in updated_objects_from_db:
            print(f"  ID: {obj.id}, Saved Order: {obj.order}")
        print("---------------------------------------------------------")
        
        updated_objects = Object.query.filter_by(scene_id=scene_id).all()
        
        return jsonify({
            'message': 'Object orders updated successfully',
            'objects': [object_to_dict(obj) for obj in updated_objects]
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# --- WebSocket Events ---

@socketio.on('scene_change')
def handle_scene_change(data):
    """씬 변경 이벤트 처리 - 인증된 사용자만 가능"""
    try:
        token = request.args.get('token')
        if not token:
            disconnect()
            return False
            
        decoded = decode_token(token)
        project_id = data.get('project_id')
        
        # 프로젝트 권한이 있는 경우만 허용
        if check_project_permission(project_id):
            emit('scene_change', data, room=f'project_{project_id}')
            return True
            
        disconnect()
        return False
    except:
        disconnect()
        return False

@socketio.on('scene_out')
def handle_scene_out(data):
    """씬 아웃 이벤트 처리 - 인증된 사용자만 가능"""
    try:
        token = request.args.get('token')
        if not token:
            disconnect()
            return False
            
        decoded = decode_token(token)
        project_id = data.get('project_id')
        
        # 프로젝트 권한이 있는 경우만 허용
        if check_project_permission(project_id):
            emit('scene_out', room=f'project_{project_id}')
            return True
            
        disconnect()
        return False
    except:
        disconnect()
        return False

@socketio.on('get_first_scene')
def handle_get_first_scene(data):
    project_name = data.get('project_name')
    if project_name:
        # WebSocket에서는 session에 user_id가 설정되어 있음
        user_id = session.get('user_id')
        if user_id:
            project = get_project_by_name(project_name, user_id)
        if project and project.scenes:
            first_scene = project.scenes[0]
            emit('first_scene', scene_to_dict(first_scene))

@app.route('/api/dummy-scene')
def get_dummy_scene():
    """더미 씬 반환"""
    return jsonify({
        'id': 0,
        'name': 'Dummy Scene',
        'objects': [],
        'duration': 0,
        'order': 0
    })

@app.route('/api/overlay/scenes/<int:scene_id>')
def get_overlay_scene(scene_id):
    """오버레이 페이지 전용 씬 조회 API (인증 불필요)"""
    try:
        scene = Scene.query.get_or_404(scene_id)
        print(f"Overlay scene request for scene {scene_id}: {scene.name}")
        return jsonify(scene_to_dict(scene))
    except Exception as e:
        print(f"Error in get_overlay_scene: {str(e)}")
        return jsonify({'error': str(e)}), 500

def create_thumbnail(image_path, thumb_path, size=(150, 150)):
    """이미지 썸네일 생성"""
    try:
        with Image.open(image_path) as img:
            # 이미지를 RGB 모드로 변환 (알파 채널이 있는 경우 처리)
            if img.mode in ('RGBA', 'LA'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1])
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # 썸네일 생성
            img.thumbnail(size, Image.Resampling.LANCZOS)
            
            # WebP 형식으로 저장
            img.save(thumb_path, 'WEBP', quality=85, method=6)
            return True
    except Exception as e:
        print(f"썸네일 생성 실패: {e}")
        return False

def create_sequence_thumbnail(sprite_path, thumb_path, frame_width, size=(150, 150)):
    """시퀀스 스프라이트에서 첫 프레임 썸네일 생성"""
    try:
        with Image.open(sprite_path) as img:
            # 첫 프레임 추출
            first_frame = img.crop((0, 0, frame_width, img.size[1]))
            
            # RGB 모드로 변환
            if first_frame.mode in ('RGBA', 'LA'):
                background = Image.new('RGB', first_frame.size, (255, 255, 255))
                background.paste(first_frame, mask=first_frame.split()[-1])
                first_frame = background
            elif first_frame.mode != 'RGB':
                first_frame = first_frame.convert('RGB')
            
            # 썸네일 생성
            first_frame.thumbnail(size, Image.Resampling.LANCZOS)
            
            # WebP 형식으로 저장
            first_frame.save(thumb_path, 'WEBP', quality=85, method=6)
            return True
    except Exception as e:
        print(f"시퀀스 썸네일 생성 실패: {e}")
        return False

def get_thumbnail_path(project_name, filename, user_id=None):
    """썸네일 파일 경로 생성"""
    project_folder = get_project_folder(project_name, user_id)
    thumb_dir = os.path.join(project_folder, 'library', 'thumbnails')
    os.makedirs(thumb_dir, exist_ok=True)
    return os.path.join(thumb_dir, f"{os.path.splitext(filename)[0]}.webp")

def get_sequence_thumbnail_path(project_name, sequence_name, user_id=None):
    """시퀀스 썸네일 파일 경로 생성"""
    project_folder = get_project_folder(project_name, user_id)
    thumb_dir = os.path.join(project_folder, 'library', 'sequence_thumbnails')
    os.makedirs(thumb_dir, exist_ok=True)
    return os.path.join(thumb_dir, f"{sequence_name}.webp")

@app.route('/api/projects/<project_name>/upload/image', methods=['POST'])
@auth_required('editor')
def upload_image(project_name):
    try:
        current_user = get_current_user_from_token()
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
            
        if 'file' not in request.files:
            return jsonify({'error': '파일이 없습니다.'}), 400
        
        files = request.files.getlist('file')
        overwrite = request.form.get('overwrite', 'false').lower() == 'true'
        
        project_folder = get_project_folder(project_name, current_user.id)
        images_path = os.path.join(project_folder, 'library', 'images')
        os.makedirs(images_path, exist_ok=True)
        
        uploaded_files = []
        for file in files:
            if not file or not allowed_image_file(file.filename):
                continue
                
            if not check_file_size(file):
                return jsonify({'error': f'파일이 너무 큽니다: {file.filename}'}), 400
                
            filename = safe_unicode_filename(file.filename)
            file_path = os.path.join(images_path, filename)
            
            if os.path.exists(file_path) and not overwrite:
                continue
                
            file.save(file_path)
            
            # 썸네일 생성
            thumb_path = get_thumbnail_path(project_name, filename, current_user.id)
            create_thumbnail(file_path, thumb_path)
            
            uploaded_files.append(filename)
            
        return jsonify({
            'message': '이미지가 업로드되었습니다.',
            'files': uploaded_files
        })
    except Exception as e:
        print(f"이미지 업로드 오류: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

def create_sprite_sheet(image_files, output_path):
    '''여러 이미지를 세로 1줄 sprite sheet로 합치고 저장'''
    print(f"Creating sprite sheet with {len(image_files)} images...")
    images = [Image.open(f) for f in image_files]
    if not images:
        return None, None, None
    
    # 모든 이미지를 RGBA 모드로 변환하여 투명도 지원
    rgba_images = []
    for i, img in enumerate(images):
        print(f"Processing image {i+1}/{len(images)}...")
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        rgba_images.append(img)
    
    widths, heights = zip(*(img.size for img in rgba_images))
    max_width = max(widths)
    total_height = sum(heights)
    
    print(f"Sprite sheet size: {max_width}x{total_height}")
    
    # RGBA 모드로 스프라이트 시트 생성
    sheet = Image.new('RGBA', (max_width, total_height), (0, 0, 0, 0))
    y_offset = 0
    frame_sizes = []
    
    for img in rgba_images:
        # 투명 배경으로 붙이기
        sheet.paste(img, (0, y_offset), img)
        frame_sizes.append({'width': img.width, 'height': img.height})
        y_offset += img.height
    
    # PNG로 저장하여 투명도 유지
    print("Saving sprite sheet...")
    sheet.save(output_path, 'PNG', optimize=True)
    print("Sprite sheet created successfully!")
    return len(rgba_images), frame_sizes, rgba_images[0].size if rgba_images else (0, 0)

def convert_image_format(input_path, output_path, format='PNG', quality=95):
    '''이미지 포맷을 변환하는 함수'''
    try:
        print(f"Converting {os.path.basename(input_path)} to {format}...")
        with Image.open(input_path) as img:
            # RGBA 모드로 변환하여 투명도 지원
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            if format.upper() == 'PNG':
                img.save(output_path, 'PNG', optimize=True)
            elif format.upper() == 'JPEG':
                # JPEG는 투명도를 지원하지 않으므로 흰색 배경으로 합성
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1])  # 알파 채널을 마스크로 사용
                background.save(output_path, 'JPEG', quality=quality, optimize=True)
            elif format.upper() == 'WEBP':
                img.save(output_path, 'WEBP', quality=quality, method=6)
            else:
                img.save(output_path, format.upper())
        print(f"Converted {os.path.basename(input_path)} successfully!")
        return True
    except Exception as e:
        print(f"Error converting {os.path.basename(input_path)}: {e}")
        return False

def process_sequence_images(image_files, output_dir, sequence_name, options=None):
    '''시퀀스 이미지들을 처리하는 함수'''
    if options is None:
        options = {}
    
    format = options.get('format', 'PNG')
    quality = options.get('quality', 95)
    create_sprite = options.get('create_sprite', True)
    resize = options.get('resize', None)
    
    print(f"Processing {len(image_files)} images for sequence '{sequence_name}'...")
    print(f"Format: {format}, Quality: {quality}, Create sprite: {create_sprite}")
    
    processed_files = []
    temp_frame_paths = []
    
    for i, file_path in enumerate(image_files):
        if not os.path.exists(file_path):
            print(f"Warning: File {file_path} does not exist, skipping...")
            continue
            
        # 파일명 생성 (숫자 순서대로)
        filename = f"frame_{i:04d}.{format.lower()}"
        output_path = os.path.join(output_dir, filename)
        
        print(f"Processing frame {i+1}/{len(image_files)}: {os.path.basename(file_path)}")
        
        # 이미지 변환
        if convert_image_format(file_path, output_path, format, quality):
            processed_files.append(filename)
            temp_frame_paths.append(output_path)
        else:
            print(f"Failed to convert {file_path}")
    
    print(f"Successfully processed {len(processed_files)} images")
    
    # 스프라이트 시트 생성 (옵션)
    sprite_path = None
    meta = {
        'name': sequence_name,
        'format': format,
        'frame_count': len(processed_files),
        'original_filenames': [os.path.basename(p) for p in image_files],
        'processed_filenames': processed_files
    }
    
    if create_sprite and temp_frame_paths:
        print("Creating sprite sheet...")
        sprite_path = os.path.join(output_dir, 'sprite.png')
        frame_count, frame_sizes, (frame_w, frame_h) = create_sprite_sheet(temp_frame_paths, sprite_path)
        meta.update({
            'sprite': 'sprite.png',
            'frame_width': frame_w,
            'frame_height': frame_h,
            'frame_sizes': frame_sizes
        })
    
    # 메타데이터 저장
    meta_path = os.path.join(output_dir, 'meta.json')
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    
    print(f"Sequence '{sequence_name}' processing completed!")
    return processed_files, sprite_path, meta

@app.route('/api/projects/<project_name>/upload/sequence', methods=['POST'])
@auth_required('editor')
def upload_sequence(project_name):
    try:
        current_user = get_current_user_from_token()
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
            
        if 'sprite' not in request.files or 'meta' not in request.files:
            return jsonify({'error': '스프라이트와 메타 파일이 필요합니다.'}), 400

        sprite_file = request.files['sprite']
        meta_file = request.files['meta']
        sequence_name = request.form.get('sequence_name', '')

        if not sequence_name:
            return jsonify({'error': '시퀀스 이름이 필요합니다.'}), 400

        # 파일 크기 체크
        if not check_file_size(sprite_file) or not check_file_size(meta_file):
            return jsonify({'error': '파일이 너무 큽니다 (최대 50MB).'}), 400

        project_folder = get_project_folder(project_name, current_user.id)
        sequence_folder = os.path.join(project_folder, 'library', 'sequences', sequence_name)
        
        # 폴더가 이미 존재하면 삭제
        if os.path.exists(sequence_folder):
            shutil.rmtree(sequence_folder)
        
        os.makedirs(sequence_folder, exist_ok=True)

        # 스프라이트와 메타 파일 저장
        sprite_path = os.path.join(sequence_folder, 'sprite.png')
        meta_path = os.path.join(sequence_folder, 'meta.json')
        
        sprite_file.save(sprite_path)
        meta_file.save(meta_path)

        # 메타 데이터 읽기
        try:
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta_data = json.load(f)
        except Exception as e:
            return jsonify({'error': f'메타 파일 읽기 실패: {str(e)}'}), 400

        # 썸네일 생성
        try:
            thumb_path = get_sequence_thumbnail_path(project_name, sequence_name, current_user.id)
            create_sequence_thumbnail(sprite_path, thumb_path, meta_data.get('frame_width', 150))
        except Exception as e:
            print(f"썸네일 생성 실패: {e}")
            # 썸네일 생성 실패는 치명적이지 않으므로 계속 진행

        return jsonify({
            'message': '시퀀스가 업로드되었습니다.',
            'sequence_name': sequence_name,
            'meta': meta_data
        })
    except Exception as e:
        print(f"시퀀스 업로드 실패: {e}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/projects/<project_name>/library/images', methods=['GET'])
@auth_required('viewer')
def list_project_images(project_name):
    current_user = get_current_user_from_token()
    project = get_project_by_name(project_name, current_user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 프로젝트 접근 권한 확인
    if not check_project_permission(current_user.id, project.id, 'viewer'):
        return jsonify({'error': 'Permission denied'}), 403
    project_folder = get_project_folder(project_name, current_user.id)
    images_path = os.path.join(project_folder, 'library', 'images')
    if not os.path.exists(images_path):
        return jsonify([])
    files = [f for f in os.listdir(images_path) if os.path.isfile(os.path.join(images_path, f))]
    return jsonify(files)

@app.route('/api/projects/<project_name>/library/sequences', methods=['GET'])
@auth_required('viewer')
def list_project_sequences(project_name):
    current_user = get_current_user_from_token()
    project = get_project_by_name(project_name, current_user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 프로젝트 접근 권한 확인
    if not check_project_permission(current_user.id, project.id, 'viewer'):
        return jsonify({'error': 'Permission denied'}), 403
    project_folder = get_project_folder(project_name, current_user.id)
    sequences_path = os.path.join(project_folder, 'library', 'sequences')
    if not os.path.exists(sequences_path):
        return jsonify([])
    sequence_folders = [d for d in os.listdir(sequences_path) if os.path.isdir(os.path.join(sequences_path, d))]
    result = []
    for seq in sequence_folders:
        seq_path = os.path.join(sequences_path, seq)
        frames = [f for f in os.listdir(seq_path) if os.path.isfile(os.path.join(seq_path, f))]
        frames.sort()
        result.append({'name': seq, 'frames': frames})
    return jsonify(result)

@app.route('/projects/<project_name>/library/images/<path:filename>')
def serve_project_image(project_name, filename):
    # URL 디코딩
    decoded_filename = unquote(filename)
    
    # 프로젝트 정보를 가져와서 소유자 ID 확인
    project = Project.query.filter_by(name=project_name).first()
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 프로젝트 소유자의 폴더 구조 사용
    project_folder = get_project_folder(project_name, project.user_id)
    images_path = os.path.join(project_folder, 'library', 'images')
    
    # 파일이 존재하는지 확인
    file_path = os.path.join(images_path, decoded_filename)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_from_directory(images_path, decoded_filename)

@app.route('/projects/<project_name>/library/sequences/<path:sequence_and_filename>')
def serve_project_sequence_frame(project_name, sequence_and_filename):
    # sequence_and_filename: '시퀀스명/프레임파일명.png'
    decoded_path = unquote(sequence_and_filename)
    
    # 프로젝트 정보를 가져와서 소유자 ID 확인
    project = Project.query.filter_by(name=project_name).first()
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 프로젝트 소유자의 폴더 구조 사용
    project_folder = get_project_folder(project_name, project.user_id)
    sequences_path = os.path.join(project_folder, 'library', 'sequences')
    
    # 파일이 존재하는지 확인
    file_path = os.path.join(sequences_path, decoded_path)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_from_directory(sequences_path, decoded_path)

@app.route('/projects/<project_name>/library/thumbnails/<path:filename>')
def serve_project_thumbnail(project_name, filename):
    # URL 디코딩
    decoded_filename = unquote(filename)
    
    # 프로젝트 정보를 가져와서 소유자 ID 확인
    project = Project.query.filter_by(name=project_name).first()
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 프로젝트 소유자의 폴더 구조 사용
    project_folder = get_project_folder(project_name, project.user_id)
    thumbnails_path = os.path.join(project_folder, 'library', 'thumbnails')
    
    # 파일이 존재하는지 확인
    file_path = os.path.join(thumbnails_path, decoded_filename)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_from_directory(thumbnails_path, decoded_filename)

@app.route('/projects/<project_name>/library/sequence_thumbnails/<path:filename>')
def serve_project_sequence_thumbnail(project_name, filename):
    # URL 디코딩
    decoded_filename = unquote(filename)
    
    # 프로젝트 정보를 가져와서 소유자 ID 확인
    project = Project.query.filter_by(name=project_name).first()
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 프로젝트 소유자의 폴더 구조 사용
    project_folder = get_project_folder(project_name, project.user_id)
    sequence_thumbnails_path = os.path.join(project_folder, 'library', 'sequence_thumbnails')
    
    # 파일이 존재하는지 확인
    file_path = os.path.join(sequence_thumbnails_path, decoded_filename)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_from_directory(sequence_thumbnails_path, decoded_filename)

@app.route('/api/projects/<project_name>/library/images/<filename>', methods=['DELETE'])
@auth_required('editor')
def delete_project_image(project_name, filename):
    current_user = get_current_user_from_token()
    project = get_project_by_name(project_name, current_user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    project_folder = get_project_folder(project_name, current_user.id)
    decoded_filename = unquote(filename)
    images_path = os.path.join(project_folder, 'library', 'images')
    file_path = os.path.join(images_path, decoded_filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return jsonify({'message': 'Deleted'}), 200
    else:
        return jsonify({'error': 'File not found'}), 404

@app.route('/api/projects/<project_name>/library/sequences/<sequence_name>', methods=['DELETE'])
@auth_required('editor')
def delete_project_sequence(project_name, sequence_name):
    current_user = get_current_user_from_token()
    project = get_project_by_name(project_name, current_user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    project_folder = get_project_folder(project_name, current_user.id)
    sequences_path = os.path.join(project_folder, 'library', 'sequences')
    sequence_folder = os.path.join(sequences_path, sequence_name)
    if os.path.exists(sequence_folder):
        shutil.rmtree(sequence_folder)
        return jsonify({'message': 'Sequence deleted'}), 200
    else:
        return jsonify({'error': 'Sequence not found'}), 404

@app.route('/api/preload/<project_name>')
@auth_required('viewer')
def preload_project(project_name):
    """프로젝트 데이터를 미리 로드하여 캐시"""
    try:
        current_user = get_current_user_from_token()
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
            
        # 프로젝트 정보 가져오기
        project = get_project_by_name(project_name, current_user.id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404
        
        # 씬 데이터 가져오기
        scenes = Scene.query.filter_by(project_id=project.id).all()
        scene_data = []
        
        for scene in scenes:
            objects = Object.query.filter_by(scene_id=scene.id).all()
            object_data = []
            
            for obj in objects:
                object_data.append({
                    'id': obj.id,
                    'type': obj.type,
                    'properties': json.loads(obj.properties) if obj.properties else {}
                })
            
            scene_data.append({
                'id': scene.id,
                'name': scene.name,
                'objects': object_data
            })
        
        # 프리로딩 데이터 반환
        preload_data = {
            'project': {
                'id': project.id,
                'name': project.name
            },
            'scenes': scene_data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        return jsonify(preload_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Admin API Routes ---

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def get_all_users():
    """모든 사용자 조회 (관리자 전용)"""
    try:
        users = User.query.all()
        return jsonify([user.to_dict() for user in users])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users', methods=['POST'])
@admin_required
def create_user():
    """새 사용자 생성 (관리자 전용)"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': '사용자명과 비밀번호가 필요합니다.'}), 400
        
        # 중복 사용자명 체크
        if User.query.filter_by(username=username).first():
            return jsonify({'error': '이미 존재하는 사용자명입니다.'}), 400
        
        # 비밀번호 해싱
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        new_user = User(
            username=username,
            password=hashed_password,
            is_active=data.get('is_active', True)
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        return jsonify(new_user.to_dict()), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """사용자 정보 수정 (관리자 전용)"""
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': '사용자를 찾을 수 없습니다.'}), 404
        
        data = request.get_json()
        
        if 'username' in data:
            # 중복 사용자명 체크 (현재 사용자 제외)
            existing_user = User.query.filter_by(username=data['username']).first()
            if existing_user and existing_user.id != user_id:
                return jsonify({'error': '이미 존재하는 사용자명입니다.'}), 400
            user.username = data['username']
        
        if 'password' in data:
            user.password = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        if 'is_active' in data:
            user.is_active = data['is_active']
        
        db.session.commit()
        return jsonify(user.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """사용자 삭제 (관리자 전용)"""
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': '사용자를 찾을 수 없습니다.'}), 404
        
        # admin 계정은 삭제할 수 없음
        if user.username == 'admin':
            return jsonify({'error': '관리자 계정은 삭제할 수 없습니다.'}), 400
        
        db.session.delete(user)
        db.session.commit()
        return jsonify({'message': '사용자가 삭제되었습니다.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/projects', methods=['GET'])
@admin_required
def get_all_projects():
    """모든 프로젝트 조회 (관리자 전용)"""
    try:
        projects = Project.query.all()
        project_list = []
        
        for project in projects:
            scene_count = Scene.query.filter_by(project_id=project.id).count()
            project_dict = project_to_dict(project)
            project_dict['scene_count'] = scene_count
            project_list.append(project_dict)
        
        return jsonify(project_list)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/projects/<int:project_id>', methods=['DELETE'])
@admin_required
def delete_project_admin(project_id):
    """프로젝트 삭제 (관리자 전용)"""
    try:
        project = Project.query.get(project_id)
        if not project:
            return jsonify({'error': '프로젝트를 찾을 수 없습니다.'}), 404
        
        # 프로젝트 폴더 삭제
        project_folder = get_project_folder(project.name, project.user_id)
        if os.path.exists(project_folder):
            shutil.rmtree(project_folder)
        
        db.session.delete(project)
        db.session.commit()
        return jsonify({'message': '프로젝트가 삭제되었습니다.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/stats', methods=['GET'])
@admin_required
def get_system_stats():
    """시스템 통계 조회 (관리자 전용)"""
    try:
        total_users = User.query.count()
        total_projects = Project.query.count()
        active_users = User.query.filter_by(is_active=True).count()
        
        # 최근 활동 (예시)
        recent_activities = [
            {
                'action': f'사용자 {user.username} 가입',
                'timestamp': user.created_at.strftime('%Y-%m-%d %H:%M:%S')
            }
            for user in User.query.order_by(User.created_at.desc()).limit(10)
        ]
        
        # 저장 공간 사용량 계산 (예시)
        storage_used = "계산 중..."
        
        return jsonify({
            'total_users': total_users,
            'total_projects': total_projects,
            'active_users': active_users,
            'storage_used': storage_used,
            'memory_usage': '65%',  # 실제 구현 시 psutil 등 사용
            'cpu_usage': '45%',     # 실제 구현 시 psutil 등 사용
            'recent_activities': recent_activities
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/backup', methods=['POST'])
@admin_required
def backup_database():
    """데이터베이스 백업 (관리자 전용)"""
    try:
        # SQLAlchemy ORM을 사용한 안전한 백업
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        backup_filename = f'backup_{timestamp}.sql'
        
        backup_content = []
        backup_content.append("-- EditOnair Database Backup")
        backup_content.append(f"-- Generated: {datetime.utcnow().isoformat()}")
        backup_content.append("-- ")
        backup_content.append("")
        
        try:
            # 사용자 테이블 백업
            users = User.query.all()
            if users:
                backup_content.append("-- User Table")
                backup_content.append("DELETE FROM user WHERE id IN (SELECT id FROM user);")
                for user in users:
                    created_at = user.created_at.isoformat() if user.created_at else 'NULL'
                    backup_content.append(f"INSERT INTO user (id, username, password, created_at, is_active) VALUES ({user.id}, '{user.username}', '{user.password}', '{created_at}', {user.is_active});")
                backup_content.append("")
            
            # 프로젝트 테이블 백업
            projects = Project.query.all()
            if projects:
                backup_content.append("-- Project Table")
                backup_content.append("DELETE FROM project WHERE id IN (SELECT id FROM project);")
                for project in projects:
                    created_at = project.created_at.isoformat() if project.created_at else 'NULL'
                    updated_at = project.updated_at.isoformat() if project.updated_at else 'NULL'
                    backup_content.append(f"INSERT INTO project (id, name, created_at, updated_at, user_id) VALUES ({project.id}, '{project.name}', '{created_at}', '{updated_at}', {project.user_id});")
                backup_content.append("")
            
            # 씬 테이블 백업
            scenes = Scene.query.all()
            if scenes:
                backup_content.append("-- Scene Table")
                backup_content.append("DELETE FROM scene WHERE id IN (SELECT id FROM scene);")
                for scene in scenes:
                    created_at = scene.created_at.isoformat() if scene.created_at else 'NULL'
                    updated_at = scene.updated_at.isoformat() if scene.updated_at else 'NULL'
                    backup_content.append(f"INSERT INTO scene (id, project_id, name, \"order\", duration, created_at, updated_at) VALUES ({scene.id}, {scene.project_id}, '{scene.name}', {scene.order}, {scene.duration}, '{created_at}', '{updated_at}');")
                backup_content.append("")
            
            # 객체 테이블 백업
            objects = Object.query.all()
            if objects:
                backup_content.append("-- Objects Table")
                backup_content.append("DELETE FROM objects WHERE id IN (SELECT id FROM objects);")
                for obj in objects:
                    # JSON 문자열을 이스케이프
                    properties = obj.properties.replace("'", "''") if obj.properties else ''
                    in_motion = obj.in_motion.replace("'", "''") if obj.in_motion else ''
                    out_motion = obj.out_motion.replace("'", "''") if obj.out_motion else ''
                    timing = obj.timing.replace("'", "''") if obj.timing else ''
                    
                    created_at = obj.created_at.isoformat() if obj.created_at else 'NULL'
                    updated_at = obj.updated_at.isoformat() if obj.updated_at else 'NULL'
                    
                    backup_content.append(f"INSERT INTO objects (id, name, type, \"order\", properties, in_motion, out_motion, timing, scene_id, created_at, updated_at) VALUES ({obj.id}, '{obj.name}', '{obj.type}', {obj.order}, '{properties}', '{in_motion}', '{out_motion}', '{timing}', {obj.scene_id}, '{created_at}', '{updated_at}');")
                backup_content.append("")
            
            # 프로젝트 권한 테이블 백업
            permissions = ProjectPermission.query.all()
            if permissions:
                backup_content.append("-- Project Permission Table")
                backup_content.append("DELETE FROM project_permission WHERE id IN (SELECT id FROM project_permission);")
                for perm in permissions:
                    created_at = perm.created_at.isoformat() if perm.created_at else 'NULL'
                    updated_at = perm.updated_at.isoformat() if perm.updated_at else 'NULL'
                    backup_content.append(f"INSERT INTO project_permission (id, project_id, user_id, permission_type, created_at, updated_at) VALUES ({perm.id}, {perm.project_id}, {perm.user_id}, '{perm.permission_type}', '{created_at}', '{updated_at}');")
                backup_content.append("")
            
            # 백업 내용을 문자열로 결합
            backup_sql = "\n".join(backup_content)
            
            # 메모리에서 직접 반환
            from flask import make_response
            response = make_response(backup_sql)
            response.headers['Content-Type'] = 'application/sql'
            response.headers['Content-Disposition'] = f'attachment; filename="{backup_filename}"'
            response.headers['Content-Length'] = len(backup_sql.encode('utf-8'))
            
            return response
            
        except Exception as e:
            app.logger.error(f'백업 생성 중 오류: {str(e)}')
            return jsonify({'error': f'백업 생성 중 오류 발생: {str(e)}'}), 500
            
    except Exception as e:
        app.logger.error(f'백업 처리 중 오류: {str(e)}')
        return jsonify({'error': f'백업 처리 중 오류 발생: {str(e)}'}), 500

# --- Main Entry Point ---

if __name__ == '__main__':
    with app.app_context():
        db.create_all()  # 데이터베이스 테이블 생성
        
        # 기본 관리자 계정 생성
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            admin = User(
                username='admin',
                password=bcrypt.hashpw('admin123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
                is_active=True
            )
            db.session.add(admin)
            db.session.commit()
    
    # Railway의 PORT 환경 변수 사용, 없으면 5000 사용
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, debug=False, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)

# 임시 접근 토큰 관련 함수
def generate_overlay_token(project_id):
    """오버레이 페이지용 임시 접근 토큰 생성"""
    expires = datetime.utcnow() + timedelta(days=30)  # 30일 유효
    token = create_access_token(
        identity=project_id,
        expires_delta=timedelta(days=30),
        additional_claims={'type': 'overlay'}
    )
    return token

def verify_overlay_token(token):
    """오버레이 페이지용 토큰 검증"""
    try:
        decoded = decode_token(token)
        if decoded.get('type') != 'overlay':
            return None
        return decoded['sub']  # project_id 반환
    except:
        return None

@app.route('/api/projects/<int:project_id>/overlay-token', methods=['POST'])
@jwt_required()
def create_overlay_token(project_id):
    """프로젝트의 오버레이 접근 토큰 생성 API"""
    project = get_project_by_name(project_id)  # project_id를 프로젝트 이름으로 변경
    
    # 프로젝트 접근 권한 확인
    if not check_project_permission(project_id):  # project_id를 프로젝트 이름으로 변경
        return jsonify({'message': '권한이 없습니다.'}), 403
        
    token = generate_overlay_token(project_id)
    return jsonify({'token': token})

@app.route('/overlay/<int:project_id>')
def overlay_page(project_id):
    """오버레이 페이지 렌더링 - 퍼블릭 접근 허용"""
    project = get_project_by_name(project_id)  # project_id를 프로젝트 이름으로 변경
    return render_template('overlay.html', project=project)

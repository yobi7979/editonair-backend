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

# 라이브 상태 관리 시스템 import
from live_state import live_state_manager

# 백업 시스템 import
from backup_db import backup_all, list_backups, restore_project_libraries, get_project_library_info

from flask import Flask, jsonify, request, render_template, send_from_directory, session, make_response
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
    
    # WebSocket 설정 개선 - Railway 환경 호환성
    socketio = SocketIO(
        app, 
        cors_allowed_origins="*", 
        async_mode='threading',  # gevent 대신 threading 사용
        allow_unsafe_werkzeug=True,
        ping_timeout=60,
        ping_interval=25,
        max_http_buffer_size=1e8,
        logger=True,
        engineio_logger=True
    )

    print("Database and extensions initialized successfully")

except Exception as e:
    print(f"Error during initialization: {e}")
    raise

# 전역 변수들 (중복 제거)
# socketio는 이미 위에서 초기화됨

# 사용자별 송출 상태 (메모리 저장)
user_broadcast_state = {}

# 백업/복구 진행상황 관리
backup_progress = {}
restore_progress = {}

def get_user_broadcast_state(user_id, channel_id=None):
    """사용자 및 채널별 송출 상태 가져오기"""
    # channel_id가 없으면 기본 채널 사용
    if channel_id is None:
        channel_id = 'default'
    
    # 사용자별 상태 초기화
    if user_id not in user_broadcast_state:
        user_broadcast_state[user_id] = {}
    
    # 채널별 상태 초기화
    if channel_id not in user_broadcast_state[user_id]:
        user_broadcast_state[user_id][channel_id] = {
            'current_pushed_scene_id': None,
            'is_broadcasting': False
        }
    
    return user_broadcast_state[user_id][channel_id]

def set_user_pushed_scene(user_id, scene_id, channel_id=None):
    """사용자 및 채널별 송출 씬 설정"""
    state = get_user_broadcast_state(user_id, channel_id)
    state['current_pushed_scene_id'] = scene_id
    state['is_broadcasting'] = True if scene_id else False

def get_user_room_name(user_id, channel_id=None):
    """사용자 및 채널별 WebSocket 룸 이름 생성"""
    if channel_id and channel_id != 'default':
        return f'user_{user_id}_channel_{channel_id}'
    return f'user_{user_id}'

def update_backup_progress(user_id, step, message, percentage=None):
    """백업 진행상황 업데이트"""
    if user_id not in backup_progress:
        backup_progress[user_id] = {}
    
    backup_progress[user_id] = {
        'step': step,
        'message': message,
        'percentage': percentage,
        'timestamp': datetime.now().isoformat()
    }
    
    # WebSocket으로 진행상황 전송 (연결된 경우에만)
    try:
        user_room = f'user_{user_id}'
        socketio.emit('backup_progress', backup_progress[user_id], room=user_room)
    except Exception as e:
        print(f"WebSocket 전송 실패 (백업): {e}")
        # WebSocket 실패해도 진행상황은 메모리에 저장됨

def update_restore_progress(user_id, step, message, percentage=None):
    """복구 진행상황 업데이트"""
    if user_id not in restore_progress:
        restore_progress[user_id] = {}
    
    restore_progress[user_id] = {
        'step': step,
        'message': message,
        'percentage': percentage,
        'timestamp': datetime.now().isoformat()
    }
    
    # WebSocket으로 진행상황 전송 (연결된 경우에만)
    try:
        user_room = f'user_{user_id}'
        socketio.emit('restore_progress', restore_progress[user_id], room=user_room)
    except Exception as e:
        print(f"WebSocket 전송 실패 (복구): {e}")
        # WebSocket 실패해도 진행상황은 메모리에 저장됨

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

class CanvasPreset(db.Model):
    __tablename__ = 'canvas_presets'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    canvas_scale = db.Column(db.Float, nullable=False)
    scroll_left = db.Column(db.Float, nullable=False)
    scroll_top = db.Column(db.Float, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('canvas_presets', lazy=True))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f'<CanvasPreset {self.name}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'canvas_scale': self.canvas_scale,
            'scroll_left': self.scroll_left,
            'scroll_top': self.scroll_top,
            'user_id': self.user_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

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
        print(f"🔑 JWT Identity: {current_user_id}")
        user = User.query.get(current_user_id)
        print(f"🔑 User found: {user.username if user else 'None'}")
        return user
    except Exception as e:
        print(f"❌ JWT validation error: {str(e)}")
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
    """WebSocket 연결 처리 - 간소화된 버전"""
    print(f"WebSocket connection attempt from {request.remote_addr}")
    
    # 기본적으로 연결 허용 (인증은 join 이벤트에서 처리)
    print("WebSocket connection accepted")
    return True

@socketio.on('disconnect')
def handle_disconnect():
    if 'user_id' in session:
        del session['user_id']

@socketio.on('join')
def handle_join(data):
    print(f"🎯 JOIN 이벤트 받음: {data}")
    
    # 오버레이 페이지에서 직접 룸 이름을 전달하는 경우
    room = data.get('room')
    if room:
        print(f"🎯 직접 룸 조인 요청: {room}")
        join_room(room)
        print(f"✅ Socket.io: 클라이언트가 룸에 참여 - {room}")
        emit('joined', {'room': room})
        return
    
    # 기존 방식 (프로젝트 기반)
    project_name = data.get('project')
    overlay_user_id = data.get('user_id')  # 오버레이에서 제공하는 user_id
    
    if not project_name:
        print("❌ 프로젝트 이름이 없음")
        emit('error', {'message': 'Project name is required'})
        return
    
    print(f"🎯 프로젝트 이름: {project_name}")
    print(f"🎯 오버레이 user_id: {overlay_user_id}")
    
    # 토큰이 있는 경우 사용자 인증
    token = request.args.get('token')
    user_id = None
    
    print(f"🎯 토큰 존재: {token is not None}")
    
    if token:
        try:
            decoded_token = decode_token(token)
            user_id = decoded_token['sub']
            session['user_id'] = user_id
            print(f"🎯 토큰 인증 성공: user_id={user_id}")
        except Exception as e:
            print(f"❌ 토큰 인증 실패: {str(e)}")
            app.logger.error(f"Token validation failed: {str(e)}")
            emit('error', {'message': 'Invalid token'})
            return
    
    # 프로젝트 검색 (user_id가 있으면 권한 확인, 없으면 공개적으로 접근)
    if user_id:
        print(f"🎯 토큰 사용자로 프로젝트 검색: user_id={user_id}")
        project = get_project_by_name(project_name, user_id)
        if not project:
            print("❌ 프로젝트를 찾을 수 없음 (토큰 사용자)")
            emit('error', {'message': 'Project not found'})
            return
    else:
        # 토큰 없이 접근하는 경우 (오버레이 페이지 등)
        print("🎯 토큰 없이 프로젝트 검색 (오버레이 페이지)")
        project = Project.query.filter_by(name=project_name).first()
        if not project:
            print("❌ 프로젝트를 찾을 수 없음 (토큰 없음)")
            emit('error', {'message': 'Project not found'})
            return
    
    print(f"✅ 프로젝트 검색 성공: {project.name}")
    
    # 프로젝트 룸에 참여
    room = f'project_{project_name}'
    join_room(room)
    print(f"✅ Socket.io: 클라이언트가 룸에 참여 - {room}")
    print(f"✅ Socket.io: 현재 연결된 세션 ID - {request.sid}")
    
    # user_id가 있으면 user 룸에도 참여 (토큰 인증된 사용자 또는 오버레이의 user_id)
    final_user_id = user_id or overlay_user_id
    if final_user_id:
        user_room = f'user_{final_user_id}'
        join_room(user_room)
        print(f"✅ Socket.io: 클라이언트가 사용자 룸에도 참여 - {user_room}")
        
        # room_type이 'user'인 경우 사용자별 룸만 참여했다고 응답
        room_type = data.get('room_type')
        if room_type == 'user':
            emit('joined', {'project': project_name, 'room': user_room})
        else:
            emit('joined', {'project': project_name, 'room': room, 'user_room': user_room})
    else:
        emit('joined', {'project': project_name, 'room': room})
    
    print(f"✅ Socket.io: joined 이벤트 전송 완료")

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
    
    # 디버깅 로그 추가
    print(f"🔍 Project detail request - Project: {project_name}")
    print(f"🔍 Current user: {current_user.username if current_user else 'None'}")
    print(f"🔍 User ID: {current_user.id if current_user else 'None'}")
    
    # 관리자 모드 확인
    admin_token = request.headers.get('X-Admin-Token')
    owner_id = request.headers.get('X-Owner-Id')
    is_admin_mode = False

@app.route('/api/overlay/users/<username>/projects/<project_name>', methods=['GET'])
def get_overlay_user_project(username, project_name):
    """오버레이 페이지용 프로젝트 조회 API (인증 불필요)"""
    try:
        print(f"🔍 Overlay project request - User: {username}, Project: {project_name}")
        
        # 사용자명으로 사용자 조회
        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        # 프로젝트 조회 (사용자별)
        project = get_project_by_name(project_name, user.id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404
            
        print(f"✅ Found project: {project.name} for user: {username}")
        return jsonify(project_to_dict(project))
        
    except Exception as e:
        print(f"❌ Error in get_overlay_user_project: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/api/users/<username>/projects/<project_name>', methods=['GET', 'PUT', 'DELETE'])
@auth_required('viewer')
def handle_user_project_detail(username, project_name):
    try:
        current_user = get_current_user_from_token()
        
        # 디버깅 로그 추가
        print(f"🔍 User project detail request - User: {username}, Project: {project_name}")
        print(f"🔍 Current user: {current_user.username if current_user else 'None'}")
        print(f"🔍 User ID: {current_user.id if current_user else 'None'}")
        
        # URL의 username과 현재 사용자명이 일치하는지 확인
        if current_user.username != username:
            return jsonify({'error': 'Permission denied'}), 403
    finally:
        pass   

    # 관리자 모드 확인
    admin_token = request.headers.get('X-Admin-Token')
    owner_id = request.headers.get('X-Owner-Id')
    is_admin_mode = False
    
    if admin_token and owner_id:
        # 관리자 토큰 검증
        try:
            decoded_token = jwt.decode(admin_token, app.config['SECRET_KEY'], algorithms=['HS256'])
            admin_user = User.query.get(decoded_token['user_id'])
            if admin_user and admin_user.username == 'admin':
                is_admin_mode = True
                # 관리자 모드일 때는 지정된 owner_id로 프로젝트 조회
                project = get_project_by_name(project_name, int(owner_id))
            else:
                project = get_project_by_name(project_name, current_user.id)
        except:
            project = get_project_by_name(project_name, current_user.id)
    else:
        project = get_project_by_name(project_name, current_user.id)
    
    # 프로젝트 접근 권한 확인
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 관리자 모드가 아닐 때만 권한 확인
    if not is_admin_mode and not check_project_permission(current_user.id, project.id, 'viewer'):
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

@app.route('/api/users/<username>/projects/<project_name>/scenes', methods=['POST'])
@auth_required('editor')
def create_user_scene(username, project_name):
    current_user = get_current_user_from_token()
    
    # URL의 username과 현재 사용자명이 일치하는지 확인
    if current_user.username != username:
        return jsonify({'error': 'Permission denied'}), 403
    
    project = get_project_by_name(project_name, current_user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
        
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
        
        # 관리자 모드 확인
        admin_token = request.headers.get('X-Admin-Token')
        owner_id = request.headers.get('X-Owner-Id')
        is_admin_mode = False
        
        if admin_token and owner_id:
            try:
                decoded_token = jwt.decode(admin_token, app.config['SECRET_KEY'], algorithms=['HS256'])
                admin_user = User.query.get(decoded_token['user_id'])
                if admin_user and admin_user.username == 'admin':
                    is_admin_mode = True
            except:
                pass
        
        # 씬의 프로젝트에 대한 권한 확인 (관리자 모드가 아닐 때만)
        if not is_admin_mode and not check_project_permission(current_user.id, scene.project_id, 'viewer'):
            return jsonify({'error': 'Permission denied'}), 403
        
        if request.method == 'GET':
            return jsonify(scene_to_dict(scene))
        
        elif request.method == 'PUT':
            # 편집 권한 확인 (관리자 모드가 아닐 때만)
            if not is_admin_mode and not check_project_permission(current_user.id, scene.project_id, 'editor'):
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
        
        # URL 파라미터에서 사용자 ID와 채널 ID 가져오기
        user_id = request.args.get('user_id')
        channel_id = request.args.get('channel_id', 'default')  # 기본값은 'default'
        
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
        print(f"Found project: {project.name}, Channel: {channel_id}")
        
        # 사용자 및 채널별 송출 상태 확인
        user_state = get_user_broadcast_state(user_id, channel_id)
        scene = None
        
        if user_state['current_pushed_scene_id']:
            print(f"Looking for pushed scene: {user_state['current_pushed_scene_id']} (Channel: {channel_id})")
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
                             user_id=user_id,
                             channel_id=channel_id)  # 채널 ID도 템플릿에 전달
    except Exception as e:
        print(f"Error in overlay_project: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return str(e), 500

@app.route('/overlay/user/<username>/project/<project_name>')
def overlay_user_project(username, project_name):
    try:
        print(f"Accessing overlay for user {username}, project {project_name}")
        
        # URL 파라미터에서 채널 ID 가져오기
        channel_id = request.args.get('channel_id', 'default')  # 기본값은 'default'
        
        # 사용자명으로 사용자 조회
        user = User.query.filter_by(username=username).first()
        if not user:
            return "User not found", 404
            
        # 프로젝트 조회 (사용자별)
        project = get_project_by_name(project_name, user.id)
        if not project:
            return "Project not found", 404
        print(f"Found project: {project.name}, Channel: {channel_id}")
        
        # 사용자 및 채널별 송출 상태 확인
        user_state = get_user_broadcast_state(user.id, channel_id)
        scene = None
        
        if user_state['current_pushed_scene_id']:
            print(f"Looking for pushed scene: {user_state['current_pushed_scene_id']} (Channel: {channel_id})")
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
                             project=project_to_dict(project), 
                             scene=scene_to_dict(scene) if scene else None,
                             canvas_width=1920,
                             canvas_height=1080,
                             user_id=user.id,
                             username=user.username,  # 사용자명도 직접 전달
                             channel_id=channel_id)  # 채널 ID도 템플릿에 전달
    except Exception as e:
        print(f"Error in overlay_user_project: {str(e)}")
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
        
        data = request.get_json() or {}
        channel_id = data.get('channel_id', 'default')  # 요청에서 채널 ID 가져오기
        
        scene = Scene.query.get_or_404(scene_id)
        
        # 편집 권한 확인
        if not check_project_permission(current_user.id, scene.project_id, 'editor'):
            return jsonify({'error': 'Permission denied'}), 403
        
        set_user_pushed_scene(current_user.id, scene_id, channel_id)
        print(f"Scene {scene_id} pushed successfully to channel {channel_id}")
        
        # 사용자 및 채널별 룸으로 브로드캐스트
        user_room = get_user_room_name(current_user.id, channel_id)
        socketio.emit('scene_change', {
            'scene_id': scene_id,
            'transition': 'fade',
            'duration': 1.0,
            'clear_effects': True,
            'channel_id': channel_id
        }, room=user_room)
        
        return jsonify({
            'status': 'success', 
            'scene_id': scene_id,
            'channel_id': channel_id
        })
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
        
        data = request.get_json() or {}
        channel_id = data.get('channel_id', 'default')  # 요청에서 채널 ID 가져오기
        
        scene = Scene.query.get_or_404(scene_id)
        
        # 편집 권한 확인
        if not check_project_permission(current_user.id, scene.project_id, 'editor'):
            return jsonify({'error': 'Permission denied'}), 403
        
        # 사용자 및 채널별 송출 상태 초기화
        set_user_pushed_scene(current_user.id, None, channel_id)
        print(f"Scene {scene_id} out successfully from channel {channel_id}")
        
        # 사용자 및 채널별 룸으로 브로드캐스트
        user_room = get_user_room_name(current_user.id, channel_id)
        socketio.emit('scene_out', {
            'scene_id': scene_id,
            'transition': 'fade',
            'duration': 1.0,
            'channel_id': channel_id
        }, room=user_room)
        
        return jsonify({
            'status': 'success', 
            'scene_id': scene_id,
            'channel_id': channel_id
        })
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

@app.route('/api/objects/<int:object_id>/change-id', methods=['PUT'])
@jwt_required()
def change_object_id(object_id):
    """Changes an object's ID."""
    current_user = get_current_user_from_token()
    if not current_user:
        return jsonify({'error': 'Authentication required'}), 401
    
    obj = Object.query.get_or_404(object_id)
    
    # 편집 권한 확인
    if not check_project_permission(current_user.id, obj.scene.project_id, 'editor'):
        return jsonify({'error': 'Permission denied'}), 403
    
    data = request.get_json()
    new_id = data.get('new_id')
    
    if not new_id:
        return jsonify({'error': 'new_id is required'}), 400
    
    try:
        new_id = int(new_id)
    except ValueError:
        return jsonify({'error': 'new_id must be a valid integer'}), 400
    
    # 새 ID가 현재 ID와 같으면 변경하지 않음
    if new_id == object_id:
        return jsonify({'message': 'ID is already the same'}), 200
    
    # 중복 ID 체크
    existing_obj = Object.query.get(new_id)
    if existing_obj:
        # 중복된 객체가 있는 씬 정보 반환
        scene = existing_obj.scene
        project = scene.project
        return jsonify({
            'error': 'ID already exists',
            'conflicting_object': {
                'id': existing_obj.id,
                'name': existing_obj.name,
                'scene_name': scene.name,
                'project_name': project.name
            }
        }), 409
    
    try:
        # 기존 객체 데이터 백업
        old_data = {
            'name': obj.name,
            'type': obj.type,
            'order': obj.order,
            'properties': obj.properties,
            'in_motion': obj.in_motion,
            'out_motion': obj.out_motion,
            'timing': obj.timing,
            'scene_id': obj.scene_id,
            'created_at': obj.created_at,
            'updated_at': obj.updated_at
        }
        
        # 기존 객체 삭제
        db.session.delete(obj)
        db.session.flush()  # 삭제를 즉시 반영
        
        # 새 ID로 객체 생성 (ID를 수동으로 지정)
        # SQLAlchemy INSERT를 사용하여 ID 수동 지정
        from sqlalchemy import text
        
        insert_stmt = text("""
            INSERT INTO objects (id, name, type, "order", properties, in_motion, out_motion, timing, scene_id, created_at, updated_at)
            VALUES (:id, :name, :type, :order, :properties, :in_motion, :out_motion, :timing, :scene_id, :created_at, :updated_at)
        """)
        
        db.session.execute(insert_stmt, {
            'id': new_id,
            'name': old_data['name'],
            'type': old_data['type'],
            'order': old_data['order'],
            'properties': old_data['properties'],
            'in_motion': old_data['in_motion'],
            'out_motion': old_data['out_motion'],
            'timing': old_data['timing'],
            'scene_id': old_data['scene_id'],
            'created_at': old_data['created_at'],
            'updated_at': datetime.utcnow()
        })
        
        db.session.commit()
        
        # 새로 생성된 객체 조회
        new_obj = Object.query.get(new_id)
        
        return jsonify({
            'message': 'Object ID changed successfully',
            'object': object_to_dict(new_obj)
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to change ID: {str(e)}'}), 500

@app.route('/api/objects/check-id/<int:new_id>', methods=['GET'])
@jwt_required()
def check_object_id(new_id):
    """Checks if an object ID is available."""
    current_user = get_current_user_from_token()
    if not current_user:
        return jsonify({'error': 'Authentication required'}), 401
    
    existing_obj = Object.query.get(new_id)
    
    if existing_obj:
        # 해당 객체가 속한 씬과 프로젝트 정보 반환
        scene = existing_obj.scene
        project = scene.project
        
        # 사용자가 해당 프로젝트에 접근 권한이 있는지 확인
        if check_project_permission(current_user.id, project.id, 'viewer'):
            return jsonify({
                'available': False,
                'conflicting_object': {
                    'id': existing_obj.id,
                    'name': existing_obj.name,
                    'scene_name': scene.name,
                    'project_name': project.name
                }
            }), 200
        else:
            # 권한이 없는 프로젝트의 객체는 단순히 사용 불가로 표시
            return jsonify({
                'available': False,
                'conflicting_object': {
                    'id': existing_obj.id,
                    'name': '(접근 권한 없음)',
                    'scene_name': '(접근 권한 없음)',
                    'project_name': '(접근 권한 없음)'
                }
            }), 200
    
    return jsonify({'available': True}), 200

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
    """씬 변경 이벤트 처리 - 서버에서 직접 emit하므로 단순 전달"""
    try:
        print(f"🔍 Scene change event received: {data}")
        # 서버에서 직접 emit하는 이벤트이므로 단순히 전달
        emit('scene_change', data)
        return True
    except Exception as e:
        print(f"❌ Error in handle_scene_change: {str(e)}")
        return False

@socketio.on('scene_out')
def handle_scene_out(data):
    """씬 아웃 이벤트 처리 - 서버에서 직접 emit하므로 단순 전달"""
    try:
        print(f"🔍 Scene out event received: {data}")
        # 서버에서 직접 emit하는 이벤트이므로 단순히 전달
        emit('scene_out', data)
        return True
    except Exception as e:
        print(f"❌ Error in handle_scene_out: {str(e)}")
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
    """오버레이 페이지 전용 씬 조회 API (인증 불필요, 라이브 상태 병합)"""
    try:
        scene = Scene.query.get_or_404(scene_id)
        project_name = scene.project.name
        
        print(f"🔍 오버레이 씬 요청: {scene_id} ({scene.name}) - 프로젝트: {project_name}")
        
        # 원본 씬 데이터 가져오기
        scene_data = scene_to_dict(scene)
        
        # 라이브 상태 가져오기
        project_live_state = live_state_manager.get_project_live_state(project_name)
        
        if project_live_state:
            print(f"🔄 라이브 상태 발견: {len(project_live_state)}개 객체")
            
            # 각 객체에 라이브 상태 병합
            for obj_data in scene_data['objects']:
                obj_id = obj_data['id']
                if obj_id in project_live_state:
                    live_properties = project_live_state[obj_id].get('properties', {})
                    if live_properties:
                        # 원본 properties와 라이브 properties 병합
                        merged_properties = {**obj_data['properties'], **live_properties}
                        obj_data['properties'] = merged_properties
                        print(f"📝 객체 {obj_id} 라이브 상태 병합: {live_properties}")
            
            print(f"✅ 라이브 상태 병합 완료")
        else:
            print(f"ℹ️ 라이브 상태 없음")
        
        return jsonify(scene_data)
    except Exception as e:
        print(f"❌ 오버레이 씬 조회 오류: {str(e)}")
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
        sequences_path = os.path.join(project_folder, 'library', 'sequences')
        sequence_folder = os.path.join(sequences_path, sequence_name)
        
        # 기존 시퀀스가 있으면 삭제
        if os.path.exists(sequence_folder):
            shutil.rmtree(sequence_folder)
        
        os.makedirs(sequence_folder, exist_ok=True)
        
        # 스프라이트 파일 저장
        sprite_path = os.path.join(sequence_folder, 'sprite.png')
        sprite_file.save(sprite_path)
        
        # 메타 파일 저장
        meta_path = os.path.join(sequence_folder, 'meta.json')
        meta_file.save(meta_path)
        
        # 썸네일 생성
        thumb_path = get_sequence_thumbnail_path(project_name, sequence_name, current_user.id)
        create_sequence_thumbnail(sprite_path, thumb_path, 150)
        
        return jsonify({
            'message': '시퀀스가 업로드되었습니다.',
            'sequence_name': sequence_name
        })
    except Exception as e:
        print(f"시퀀스 업로드 오류: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

# 사용자별 업로드 라우트들
@app.route('/api/users/<username>/projects/<project_name>/upload/image', methods=['POST'])
@auth_required('editor')
def upload_user_image(username, project_name):
    try:
        current_user = get_current_user_from_token()
        if not current_user:
            return jsonify({'error': 'Authentication required'}), 401
        
        # 사용자 조회
        user = get_user_by_name(username)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # 프로젝트 조회
        project = get_project_by_name(project_name, user.id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404
        
        # 프로젝트 접근 권한 확인
        if not check_project_permission(current_user.id, project.id, 'editor'):
            return jsonify({'error': 'Permission denied'}), 403
            
        if 'file' not in request.files:
            return jsonify({'error': '파일이 없습니다.'}), 400
        
        files = request.files.getlist('file')
        overwrite = request.form.get('overwrite', 'false').lower() == 'true'
        
        project_folder = get_project_folder(project_name, user.id)
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
            thumb_path = get_thumbnail_path(project_name, filename, user.id)
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

@app.route('/api/users/<username>/projects/<project_name>/upload/sequence', methods=['POST'])
@auth_required('editor')
def upload_user_sequence(username, project_name):
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

        # 사용자 조회
        user = get_user_by_name(username)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # 프로젝트 조회
        project = get_project_by_name(project_name, user.id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404
        
        # 프로젝트 접근 권한 확인
        if not check_project_permission(current_user.id, project.id, 'editor'):
            return jsonify({'error': 'Permission denied'}), 403

        project_folder = get_project_folder(project_name, user.id)
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
            thumb_path = get_sequence_thumbnail_path(project_name, sequence_name, user.id)
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
    
    # URL 파라미터에서 사용자 ID 가져오기
    user_id = request.args.get('user_id')
    
    if user_id:
        try:
            user_id = int(user_id)
            # 사용자별 프로젝트 조회
            project = get_project_by_name(project_name, user_id)
            if not project:
                return jsonify({'error': 'Project not found'}), 404
            
            # 사용자별 폴더 구조 사용
            project_folder = get_project_folder(project_name, user_id)
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid user_id parameter'}), 400
    else:
        # 기존 방식 (하위 호환성)
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
    
    # URL 파라미터에서 사용자 ID 가져오기
    user_id = request.args.get('user_id')
    
    if user_id:
        try:
            user_id = int(user_id)
            # 사용자별 프로젝트 조회
            project = get_project_by_name(project_name, user_id)
            if not project:
                return jsonify({'error': 'Project not found'}), 404
            
            # 사용자별 폴더 구조 사용
            project_folder = get_project_folder(project_name, user_id)
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid user_id parameter'}), 400
        else:
        # 기존 방식 (하위 호환성)
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

# 사용자별 파일 서빙 라우트들
@app.route('/users/<username>/projects/<project_name>/library/images/<path:filename>')
def serve_user_project_image(username, project_name, filename):
    # URL 디코딩
    decoded_filename = unquote(filename)
    
    # 사용자 조회
    user = get_user_by_name(username)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # 프로젝트 조회
    project = get_project_by_name(project_name, user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 사용자별 폴더 구조 사용
    project_folder = get_project_folder(project_name, user.id)
    images_path = os.path.join(project_folder, 'library', 'images')
    
    # 파일이 존재하는지 확인
    file_path = os.path.join(images_path, decoded_filename)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_from_directory(images_path, decoded_filename)

@app.route('/users/<username>/projects/<project_name>/library/sequences/<path:sequence_and_filename>')
def serve_user_project_sequence_frame(username, project_name, sequence_and_filename):
    # sequence_and_filename: '시퀀스명/프레임파일명.png'
    decoded_path = unquote(sequence_and_filename)
    
    # 사용자 조회
    user = get_user_by_name(username)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # 프로젝트 조회
    project = get_project_by_name(project_name, user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 사용자별 폴더 구조 사용
    project_folder = get_project_folder(project_name, user.id)
    sequences_path = os.path.join(project_folder, 'library', 'sequences')
    
    # 파일이 존재하는지 확인
    file_path = os.path.join(sequences_path, decoded_path)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_from_directory(sequences_path, decoded_path)

@app.route('/users/<username>/projects/<project_name>/library/thumbnails/<path:filename>')
def serve_user_project_thumbnail(username, project_name, filename):
    # URL 디코딩
    decoded_filename = unquote(filename)
    
    # 사용자 조회
    user = get_user_by_name(username)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # 프로젝트 조회
    project = get_project_by_name(project_name, user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 사용자별 폴더 구조 사용
    project_folder = get_project_folder(project_name, user.id)
    thumbnails_path = os.path.join(project_folder, 'library', 'thumbnails')
    
    # 파일이 존재하는지 확인
    file_path = os.path.join(thumbnails_path, decoded_filename)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_from_directory(thumbnails_path, decoded_filename)

@app.route('/users/<username>/projects/<project_name>/library/sequence_thumbnails/<path:filename>')
def serve_user_project_sequence_thumbnail(username, project_name, filename):
    # URL 디코딩
    decoded_filename = unquote(filename)
    
    # 사용자 조회
    user = get_user_by_name(username)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # 프로젝트 조회
    project = get_project_by_name(project_name, user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 사용자별 폴더 구조 사용
    project_folder = get_project_folder(project_name, user.id)
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

# 사용자별 라이브러리 라우트들
@app.route('/api/users/<username>/projects/<project_name>/library/images', methods=['GET'])
@auth_required('viewer')
def list_user_project_images(username, project_name):
    current_user = get_current_user_from_token()
    
    # 사용자 조회
    user = get_user_by_name(username)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # 프로젝트 조회
    project = get_project_by_name(project_name, user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 프로젝트 접근 권한 확인
    if not check_project_permission(current_user.id, project.id, 'viewer'):
        return jsonify({'error': 'Permission denied'}), 403
    
    project_folder = get_project_folder(project_name, user.id)
    images_path = os.path.join(project_folder, 'library', 'images')
    if not os.path.exists(images_path):
        return jsonify([])
    files = [f for f in os.listdir(images_path) if os.path.isfile(os.path.join(images_path, f))]
    return jsonify(files)

@app.route('/api/users/<username>/projects/<project_name>/library/sequences', methods=['GET'])
@auth_required('viewer')
def list_user_project_sequences(username, project_name):
    current_user = get_current_user_from_token()
    
    # 사용자 조회
    user = get_user_by_name(username)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # 프로젝트 조회
    project = get_project_by_name(project_name, user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 프로젝트 접근 권한 확인
    if not check_project_permission(current_user.id, project.id, 'viewer'):
        return jsonify({'error': 'Permission denied'}), 403
    
    project_folder = get_project_folder(project_name, user.id)
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

@app.route('/api/users/<username>/projects/<project_name>/library/images/<filename>', methods=['DELETE'])
@auth_required('editor')
def delete_user_project_image(username, project_name, filename):
    current_user = get_current_user_from_token()
    
    # 사용자 조회
    user = get_user_by_name(username)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # 프로젝트 조회
    project = get_project_by_name(project_name, user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 프로젝트 접근 권한 확인
    if not check_project_permission(current_user.id, project.id, 'editor'):
        return jsonify({'error': 'Permission denied'}), 403
    
    project_folder = get_project_folder(project_name, user.id)
    decoded_filename = unquote(filename)
    images_path = os.path.join(project_folder, 'library', 'images')
    file_path = os.path.join(images_path, decoded_filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return jsonify({'message': 'Deleted'}), 200
    else:
        return jsonify({'error': 'File not found'}), 404

@app.route('/api/users/<username>/projects/<project_name>/library/sequences/<sequence_name>', methods=['DELETE'])
@auth_required('editor')
def delete_user_project_sequence(username, project_name, sequence_name):
    current_user = get_current_user_from_token()
    
    # 사용자 조회
    user = get_user_by_name(username)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # 프로젝트 조회
    project = get_project_by_name(project_name, user.id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # 프로젝트 접근 권한 확인
    if not check_project_permission(current_user.id, project.id, 'editor'):
        return jsonify({'error': 'Permission denied'}), 403
    
    project_folder = get_project_folder(project_name, user.id)
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

@app.route('/api/admin/restore', methods=['POST'])
@admin_required
def restore_database():
    """데이터베이스 복구 (관리자 전용)"""
    try:
        # 업로드된 파일 확인
        if 'backup_file' not in request.files:
            return jsonify({'error': '백업 파일이 선택되지 않았습니다.'}), 400
        
        file = request.files['backup_file']
        if file.filename == '':
            return jsonify({'error': '파일이 선택되지 않았습니다.'}), 400
        
        if not file.filename.endswith('.sql'):
            return jsonify({'error': 'SQL 파일만 업로드 가능합니다.'}), 400
        
        # 파일 내용 읽기
        backup_content = file.read().decode('utf-8')
        
        try:
            # SQLAlchemy text import 확인
            from sqlalchemy import text
            
            # 기존 데이터 삭제 (순서 중요: 외래키 제약조건 고려)
            db.session.execute(text("DELETE FROM objects;"))
            db.session.execute(text("DELETE FROM scene;"))
            db.session.execute(text("DELETE FROM project_permission;"))
            db.session.execute(text("DELETE FROM project;"))
            db.session.execute(text("DELETE FROM user WHERE username != 'admin';"))  # admin 계정 보호
            
            # SQL 문을 줄별로 분리하여 실행
            sql_lines = backup_content.split('\n')
            current_sql = ""
            
            for line in sql_lines:
                line = line.strip()
                
                # 주석이나 빈 줄 무시
                if not line or line.startswith('--'):
                    continue
                
                current_sql += line + " "
                
                # SQL 문이 완료되면 실행
                if line.endswith(';'):
                    try:
                        # admin 사용자를 덮어쓰지 않도록 보호
                        if "INSERT INTO user" in current_sql and "username = 'admin'" in current_sql:
                            current_sql = ""
                            continue
                            
                        db.session.execute(text(current_sql))
                        current_sql = ""
                    except Exception as e:
                        app.logger.warning(f"SQL 실행 중 경고: {str(e)} - SQL: {current_sql[:100]}")
                        current_sql = ""
                        continue
            
            # 변경사항 커밋
            db.session.commit()
            
            return jsonify({
                'message': '데이터베이스 복구가 완료되었습니다.',
                'timestamp': datetime.utcnow().isoformat()
            })
            
        except Exception as e:
            db.session.rollback()
            app.logger.error(f'복구 실행 중 오류: {str(e)}')
            return jsonify({'error': f'복구 중 오류 발생: {str(e)}'}), 500
            
    except Exception as e:
        app.logger.error(f'복구 처리 중 오류: {str(e)}')
        return jsonify({'error': f'복구 처리 중 오류 발생: {str(e)}'}), 500

@app.route('/api/admin/backup', methods=['POST'])
@admin_required
def backup_database():
    """전체 시스템 백업 (JSON + 라이브러리 ZIP 다운로드)"""
    try:
        user_id = get_jwt_identity()
        
        with app.app_context():
            # 백업 시작
            update_backup_progress(user_id, 'start', '백업을 시작합니다...', 0)
            
            # 백업 데이터 생성
            update_backup_progress(user_id, 'database', '데이터베이스 정보를 수집하고 있습니다...', 10)
            backup_data = create_backup_data()
            update_backup_progress(user_id, 'database', '데이터베이스 정보 수집 완료', 30)
            
            # 라이브러리 파일 정보도 백업 데이터에 포함
            print(f"🔍 백업 데이터의 라이브러리 파일 정보:")
            if 'libraries_files' in backup_data:
                for project_name, project_files in backup_data['libraries_files'].items():
                    print(f"  - 프로젝트 '{project_name}':")
                    for file_type, files in project_files.items():
                        print(f"    * {file_type}: {len(files)}개 파일")
                        for file_info in files:
                            if isinstance(file_info, dict):
                                print(f"      - {file_info.get('filename', 'unknown')} ({file_info.get('path', 'unknown')})")
                            else:
                                print(f"      - {file_info}")
            else:
                print("  - 라이브러리 파일 정보가 없습니다.")
            
            # 라이브러리 파일들을 ZIP으로 압축
            import zipfile
            import io
            import json
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            
            update_backup_progress(user_id, 'zip', 'ZIP 파일을 생성하고 있습니다...', 40)
            
            # 메모리에 ZIP 파일 생성
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                # JSON 백업 데이터를 ZIP에 추가
                json_data = json.dumps(backup_data, indent=2, ensure_ascii=False)
                zipf.writestr('backup_info.json', json_data)
                update_backup_progress(user_id, 'zip', '백업 정보를 ZIP에 추가했습니다', 50)
                
                # 라이브러리 파일들을 ZIP에 추가
                current_dir = os.path.dirname(__file__)  # backend/
                parent_dir = os.path.dirname(current_dir)  # graphics-editor/
                projects_dir = os.path.join(parent_dir, 'projects')  # graphics-editor/projects/
                
                print(f"🔍 백업 디버그: current_dir = {current_dir}")
                print(f"🔍 백업 디버그: parent_dir = {parent_dir}")
                print(f"🔍 백업 디버그: projects_dir = {projects_dir}")
                print(f"🔍 백업 디버그: projects_dir exists = {os.path.exists(projects_dir)}")
                
                if os.path.exists(projects_dir):
                    # 사용자별 폴더 순회
                    all_projects = []
                    for user_dir in os.listdir(projects_dir):
                        user_path = os.path.join(projects_dir, user_dir)
                        if os.path.isdir(user_path):
                            for project_dir in os.listdir(user_path):
                                project_path = os.path.join(user_path, project_dir)
                                if os.path.isdir(project_path):
                                    all_projects.append((user_dir, project_dir, project_path))
                    
                    print(f"🔍 백업 디버그: 발견된 프로젝트들 = {[(u, p) for u, p, _ in all_projects]}")
                    total_projects = len(all_projects)
                    
                    # 전체 파일 수 미리 계산
                    total_files = 0
                    project_files_count = {}
                    for user_dir, project_dir, project_path in all_projects:
                        library_path = os.path.join(project_path, 'library')
                        project_key = f"{user_dir}/{project_dir}"
                        print(f"🔍 백업 디버그: 프로젝트 '{project_key}' library_path = {library_path}")
                        print(f"🔍 백업 디버그: library_path exists = {os.path.exists(library_path)}")
                        
                        if os.path.exists(library_path):
                            file_count = sum(len(files) for _, _, files in os.walk(library_path))
                            project_files_count[project_key] = file_count
                            total_files += file_count
                            print(f"🔍 백업 디버그: 프로젝트 '{project_key}' 파일 수 = {file_count}")
                            
                            # 실제 파일 목록 출력
                            print(f"🔍 백업 디버그: 프로젝트 '{project_key}' 파일 목록:")
                            for root, dirs, files in os.walk(library_path):
                                for file in files:
                                    file_path = os.path.join(root, file)
                                    relative_path = os.path.relpath(file_path, library_path)
                                    print(f"  - {relative_path} (전체 경로: {file_path})")
                        else:
                            print(f"🔍 백업 디버그: 프로젝트 '{project_key}' 라이브러리 폴더가 존재하지 않음")
                    
                    processed_files = 0
                    for i, (user_dir, project_dir, project_path) in enumerate(all_projects):
                        library_path = os.path.join(project_path, 'library')
                        project_key = f"{user_dir}/{project_dir}"
                        
                        if os.path.exists(library_path):
                            file_count = project_files_count.get(project_key, 0)
                            update_backup_progress(user_id, 'libraries', f'프로젝트 "{project_key}" 라이브러리를 압축하고 있습니다... ({i+1}/{total_projects}, {file_count}개 파일)', 50 + (i * 30 // total_projects))
                            
                            # 프로젝트별 라이브러리 폴더를 ZIP에 추가
                            all_files = []
                            for root, dirs, files in os.walk(library_path):
                                for file in files:
                                    all_files.append((root, file))
                            
                            print(f"🔍 백업 디버그: 프로젝트 '{project_key}'에서 {len(all_files)}개 파일 발견")
                            
                            for j, (root, file) in enumerate(all_files):
                                file_path = os.path.join(root, file)
                                # ZIP 내에서의 상대 경로 (library 폴더 기준)
                                relative_path = os.path.relpath(file_path, library_path)
                                arcname = os.path.join(f'projects/{user_dir}/{project_dir}/library', relative_path)
                                
                                try:
                                    zipf.write(file_path, arcname)
                                    print(f"✅ 백업 파일 추가: {file_path} -> {arcname}")
                                except Exception as e:
                                    print(f"❌ 백업 파일 추가 실패: {file_path} -> {arcname}, 오류: {e}")
                                
                                # 파일별 진행상황 업데이트 (10개 파일마다)
                                processed_files += 1
                                if (processed_files % 10 == 0) or (j == len(all_files) - 1):
                                    progress_percent = 50 + (processed_files * 30 // total_files) if total_files > 0 else 80
                                    update_backup_progress(user_id, 'libraries', f'전체 라이브러리 압축 중... ({processed_files}/{total_files} 파일)', progress_percent)
                        else:
                            update_backup_progress(user_id, 'libraries', f'프로젝트 "{project_key}" 라이브러리 폴더가 없습니다. ({i+1}/{total_projects})', 50 + (i * 30 // total_projects))
                            continue
            
            update_backup_progress(user_id, 'complete', '백업 파일 생성이 완료되었습니다. 다운로드를 시작합니다...', 100)
            
            # ZIP 파일 내용 확인
            zip_buffer.seek(0)
            with zipfile.ZipFile(zip_buffer, 'r') as check_zip:
                zip_contents = check_zip.namelist()
                print(f"📦 백업 ZIP 파일 내용:")
                for item in zip_contents:
                    print(f"  - {item}")
            
            # ZIP 파일을 응답으로 반환
            zip_buffer.seek(0)
            response = make_response(zip_buffer.getvalue())
            response.headers['Content-Type'] = 'application/zip'
            response.headers['Content-Disposition'] = f'attachment; filename="editonair_backup_{timestamp}.zip"'
            
            return response
            
    except Exception as e:
        print(f"Backup error: {e}")
        if 'user_id' in locals():
            update_backup_progress(user_id, 'error', f'백업 중 오류가 발생했습니다: {str(e)}', None)
        return jsonify({
            'success': False,
            'message': f'백업 중 오류가 발생했습니다: {str(e)}'
        }), 500

def create_backup_data():
    """백업 데이터 생성"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # 데이터베이스 백업
    db_backup = {}
    try:
        # 사용자 데이터
        users = User.query.all()
        db_backup['users'] = [user.to_dict() for user in users]
        
        # 프로젝트 데이터
        projects = Project.query.all()
        db_backup['projects'] = [project_to_dict(project) for project in projects]
        
        # 씬 데이터
        scenes = Scene.query.all()
        db_backup['scenes'] = [scene_to_dict(scene) for scene in scenes]
        
        # 객체 데이터
        objects = Object.query.all()
        db_backup['objects'] = [object_to_dict(obj) for obj in objects]
        
        # 프로젝트 권한 데이터
        permissions = ProjectPermission.query.all()
        db_backup['permissions'] = [
            {
                'id': perm.id,
                'project_id': perm.project_id,
                'user_id': perm.user_id,
                'permission_type': perm.permission_type,
                'created_at': perm.created_at.isoformat() if perm.created_at else None,
                'updated_at': perm.updated_at.isoformat() if perm.updated_at else None
            }
            for perm in permissions
        ]
    except Exception as e:
        print(f"Database backup error: {e}")
        db_backup['error'] = str(e)
    
    # 라이브러리 정보 및 파일 목록
    libraries_info = {}
    libraries_files = {}
    try:
        libraries_info = get_project_library_info()
        libraries_files = get_libraries_files_info()
        
        # 라이브러리 정보 요약 계산
        total_images = 0
        total_sequences = 0
        total_thumbnails = 0
        total_size = 0
        
        print(f"📊 라이브러리 정보 요약 계산 중...")
        for project_name, project_libs in libraries_files.items():
            project_images = len(project_libs['images'])
            project_thumbnails = len(project_libs['thumbnails'])
            project_sequences = sum(len(seq['files']) for seq in project_libs['sequences'])
            
            # 파일 크기 합계 계산
            for img in project_libs['images']:
                total_size += img['size']
            for thumb in project_libs['thumbnails']:
                total_size += thumb['size']
            for seq in project_libs['sequences']:
                for file in seq['files']:
                    total_size += file['size']
            
            total_images += project_images
            total_thumbnails += project_thumbnails
            total_sequences += project_sequences
            
            print(f"📊 프로젝트 '{project_name}' 라이브러리:")
            print(f"  - 이미지: {project_images}개")
            print(f"  - 썸네일: {project_thumbnails}개")
            print(f"  - 시퀀스 파일: {project_sequences}개")
        
        print(f"📊 전체 라이브러리 요약:")
        print(f"  - 총 이미지: {total_images}개")
        print(f"  - 총 썸네일: {total_thumbnails}개")
        print(f"  - 총 시퀀스 파일: {total_sequences}개")
        print(f"  - 총 크기: {total_size:,} bytes ({total_size / 1024 / 1024:.2f} MB)")
        
    except Exception as e:
        print(f"Libraries info error: {e}")
        libraries_info['error'] = str(e)
        total_images = 0
        total_sequences = 0
        total_thumbnails = 0
        total_size = 0
    
    # 백업 메타데이터
    backup_metadata = {
        'timestamp': timestamp,
        'backup_date': datetime.now().isoformat(),
        'version': '1.0',
        'description': 'EditOnair 전체 시스템 백업 (데이터베이스 + 라이브러리 정보)'
    }
    
    return {
        'metadata': backup_metadata,
        'database': db_backup,
        'libraries_info': libraries_info,
        'libraries_files': libraries_files,
        'libraries_summary': {
            'total_images': total_images,
            'total_thumbnails': total_thumbnails,
            'total_sequences': total_sequences,
            'total_size': total_size
        }
    }

def get_libraries_files_info():
    """사용자별 프로젝트 라이브러리 파일 정보 수집 (개선된 버전)"""
    projects_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'projects')
    print(f"🔍 라이브러리 정보 수집: projects_dir = {projects_dir}")
    print(f"🔍 projects_dir exists = {os.path.exists(projects_dir)}")
    
    if not os.path.exists(projects_dir):
        print("❌ projects 디렉토리가 존재하지 않습니다.")
        return {}
    
    libraries_files = {}
    
    # 사용자별 폴더 순회
    for user_dir in os.listdir(projects_dir):
        user_path = os.path.join(projects_dir, user_dir)
        if not os.path.isdir(user_path):
            continue
            
        print(f"🔍 사용자 폴더 처리 중: {user_dir}")
        
        # 사용자별 프로젝트 폴더 순회
        for project_dir in os.listdir(user_path):
            project_path = os.path.join(user_path, project_dir)
            if not os.path.isdir(project_path):
                continue
                
            # 프로젝트 키: user_id/project_name 형태로 저장
            project_key = f"{user_dir}/{project_dir}"
            print(f"🔍 프로젝트 처리 중: {project_key}")
            
            library_path = os.path.join(project_path, 'library')
            
            if not os.path.exists(library_path):
                print(f"⚠️ 프로젝트 '{project_key}'에 library 폴더가 없습니다.")
                libraries_files[project_key] = {
                    'images': [],
                    'sequences': [],
                    'thumbnails': []
                }
                continue
            
            project_files = {
                'images': [],
                'sequences': [],
                'thumbnails': []
            }
            
            # 이미지 파일 정보 수집
            images_path = os.path.join(library_path, 'images')
            if os.path.exists(images_path):
                print(f"🔍 이미지 폴더 처리: {images_path}")
                for file in os.listdir(images_path):
                    if file.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
                        file_path = os.path.join(images_path, file)
                        if os.path.isfile(file_path):
                            file_size = os.path.getsize(file_path)
                            project_files['images'].append({
                                'filename': file,
                                'size': file_size,
                                'path': f'library/images/{file}'
                            })
                            print(f"  ✅ 이미지 파일: {file} ({file_size} bytes)")
            else:
                print(f"⚠️ 프로젝트 '{project_key}'에 images 폴더가 없습니다.")
            
            # 썸네일 파일 정보 수집
            thumbnails_path = os.path.join(library_path, 'thumbnails')
            if os.path.exists(thumbnails_path):
                print(f"🔍 썸네일 폴더 처리: {thumbnails_path}")
                for file in os.listdir(thumbnails_path):
                    if file.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                        file_path = os.path.join(thumbnails_path, file)
                        if os.path.isfile(file_path):
                            file_size = os.path.getsize(file_path)
                            project_files['thumbnails'].append({
                                'filename': file,
                                'size': file_size,
                                'path': f'library/thumbnails/{file}'
                            })
                            print(f"  ✅ 썸네일 파일: {file} ({file_size} bytes)")
            else:
                print(f"⚠️ 프로젝트 '{project_key}'에 thumbnails 폴더가 없습니다.")
            
            # 시퀀스 파일 정보 수집
            sequences_path = os.path.join(library_path, 'sequences')
            if os.path.exists(sequences_path):
                print(f"🔍 시퀀스 폴더 처리: {sequences_path}")
                for seq_dir in os.listdir(sequences_path):
                    seq_path = os.path.join(sequences_path, seq_dir)
                    if os.path.isdir(seq_path):
                        print(f"  🔍 시퀀스 '{seq_dir}' 처리 중...")
                        seq_files = []
                        for root, dirs, files in os.walk(seq_path):
                            for file in files:
                                file_path = os.path.join(root, file)
                                if os.path.isfile(file_path):
                                    rel_path = os.path.relpath(file_path, seq_path)
                                    file_size = os.path.getsize(file_path)
                                    seq_files.append({
                                        'filename': file,
                                        'path': f'library/sequences/{seq_dir}/{rel_path}',
                                        'size': file_size
                                    })
                                    print(f"    ✅ 시퀀스 파일: {file} ({file_size} bytes)")
                        
                        if seq_files:
                            project_files['sequences'].append({
                                'sequence_name': seq_dir,
                                'files': seq_files
                            })
                            print(f"  ✅ 시퀀스 '{seq_dir}' 완료: {len(seq_files)}개 파일")
            else:
                print(f"⚠️ 프로젝트 '{project_key}'에 sequences 폴더가 없습니다.")
            
            # 프로젝트별 요약 정보 출력
            total_images = len(project_files['images'])
            total_thumbnails = len(project_files['thumbnails'])
            total_sequences = sum(len(seq['files']) for seq in project_files['sequences'])
            
            print(f"📊 프로젝트 '{project_key}' 요약:")
            print(f"  - 이미지: {total_images}개")
            print(f"  - 썸네일: {total_thumbnails}개")
            print(f"  - 시퀀스 파일: {total_sequences}개")
            
            libraries_files[project_key] = project_files
    
    return libraries_files

@app.route('/api/admin/backups', methods=['GET'])
@admin_required
def get_backup_list():
    """백업 목록 조회"""
    try:
        with app.app_context():
            backups = list_backups()
        return jsonify({
            'success': True,
            'backups': backups
        }), 200
    except Exception as e:
        print(f"Backup list error: {e}")
        return jsonify({
            'success': False,
            'message': f'백업 목록 조회 중 오류가 발생했습니다: {str(e)}'
        }), 500

@app.route('/api/admin/restore', methods=['POST'])
@admin_required
def restore_backup():
    """백업 파일에서 복구"""
    try:
        user_id = get_jwt_identity()
        
        if 'backup_file' not in request.files:
            return jsonify({
                'success': False,
                'message': '백업 파일을 업로드해주세요.'
            }), 400
        
        backup_file = request.files['backup_file']
        if backup_file.filename == '':
            return jsonify({
                'success': False,
                'message': '백업 파일을 선택해주세요.'
            }), 400
        
        # 파일 확장자 확인
        if not backup_file.filename.endswith('.zip'):
            return jsonify({
                'success': False,
                'message': 'ZIP 파일만 업로드 가능합니다.'
            }), 400
        
        with app.app_context():
            # 복구 시작
            update_restore_progress(user_id, 'start', '복구를 시작합니다...', 0)
            
            # ZIP 파일 처리
            import zipfile
            import io
            import json
            
            update_restore_progress(user_id, 'read', '백업 파일을 읽고 있습니다...', 10)
            
            # ZIP 파일 읽기
            zip_data = io.BytesIO(backup_file.read())
            
            with zipfile.ZipFile(zip_data, 'r') as zipf:
                # 백업 정보 JSON 읽기
                if 'backup_info.json' not in zipf.namelist():
                    update_restore_progress(user_id, 'error', '백업 정보 파일을 찾을 수 없습니다.', None)
                    return jsonify({
                        'success': False,
                        'message': '백업 정보 파일을 찾을 수 없습니다.'
                    }), 400
                
                update_restore_progress(user_id, 'parse', '백업 정보를 분석하고 있습니다...', 20)
                backup_info = json.loads(zipf.read('backup_info.json').decode('utf-8'))
                
                # 복구 옵션 확인
                restore_database = request.form.get('restore_database', 'false').lower() == 'true'
                restore_libraries = request.form.get('restore_libraries', 'false').lower() == 'true'
                
                if not restore_database and not restore_libraries:
                    update_restore_progress(user_id, 'error', '복구할 항목을 선택해주세요.', None)
                    return jsonify({
                        'success': False,
                        'message': '복구할 항목을 선택해주세요.'
                    }), 400
                
                # 데이터베이스 복구
                if restore_database:
                    update_restore_progress(user_id, 'database', '데이터베이스를 복구하고 있습니다...', 30)
                    success = restore_database_from_backup(backup_info['database'])
                    if not success:
                        update_restore_progress(user_id, 'error', '데이터베이스 복구 중 오류가 발생했습니다.', None)
                        return jsonify({
                            'success': False,
                            'message': '데이터베이스 복구 중 오류가 발생했습니다.'
                        }), 500
                    update_restore_progress(user_id, 'database', '데이터베이스 복구 완료', 60)
                
                # 라이브러리 복구
                if restore_libraries:
                    update_restore_progress(user_id, 'libraries', '라이브러리 파일들을 복구하고 있습니다...', 70)
                    success = restore_libraries_from_zip(zipf, backup_info.get('libraries_files', {}))
                    if not success:
                        update_restore_progress(user_id, 'error', '라이브러리 복구 중 오류가 발생했습니다.', None)
                        return jsonify({
                            'success': False,
                            'message': '라이브러리 복구 중 오류가 발생했습니다.'
                        }), 500
                    update_restore_progress(user_id, 'libraries', '라이브러리 복구 완료', 90)
                
                update_restore_progress(user_id, 'complete', '복구가 성공적으로 완료되었습니다!', 100)
                
                return jsonify({
                    'success': True,
                    'message': '복구가 성공적으로 완료되었습니다.',
                    'restored_database': restore_database,
                    'restored_libraries': restore_libraries
                }), 200
                
    except Exception as e:
        print(f"Restore error: {e}")
        if 'user_id' in locals():
            update_restore_progress(user_id, 'error', f'복구 중 오류가 발생했습니다: {str(e)}', None)
        return jsonify({
            'success': False,
            'message': f'복구 중 오류가 발생했습니다: {str(e)}'
        }), 500

def restore_database_from_backup(db_data):
    """백업 데이터에서 데이터베이스 복구"""
    try:
        user_id = get_jwt_identity()
        
        # 기존 데이터 삭제 (순서 주의)
        update_restore_progress(user_id, 'database', '기존 데이터를 삭제하고 있습니다...', 35)
        Object.query.delete()
        Scene.query.delete()
        ProjectPermission.query.delete()
        Project.query.delete()
        User.query.delete()
        
        # 사용자 복구
        update_restore_progress(user_id, 'database', '사용자 데이터를 복구하고 있습니다...', 40)
        for user_data in db_data.get('users', []):
            user = User(
                id=user_data['id'],
                username=user_data['username'],
                password=user_data['password'],
                created_at=datetime.fromisoformat(user_data['created_at']) if user_data['created_at'] else None,
                is_active=user_data['is_active']
            )
            db.session.add(user)
        
        # 프로젝트 복구
        update_restore_progress(user_id, 'database', '프로젝트 데이터를 복구하고 있습니다...', 45)
        for project_data in db_data.get('projects', []):
            project = Project(
                id=project_data['id'],
                name=project_data['name'],
                created_at=datetime.fromisoformat(project_data['created_at']) if project_data['created_at'] else None,
                updated_at=datetime.fromisoformat(project_data['updated_at']) if project_data['updated_at'] else None,
                user_id=project_data['user_id']
            )
            db.session.add(project)
        
        # 씬 복구
        update_restore_progress(user_id, 'database', '씬 데이터를 복구하고 있습니다...', 50)
        for scene_data in db_data.get('scenes', []):
            scene = Scene(
                id=scene_data['id'],
                project_id=scene_data['project_id'],
                name=scene_data['name'],
                order=scene_data['order'],
                duration=scene_data['duration'],
                created_at=datetime.fromisoformat(scene_data['created_at']) if scene_data['created_at'] else None,
                updated_at=datetime.fromisoformat(scene_data['updated_at']) if scene_data['updated_at'] else None
            )
            db.session.add(scene)
        
        # 객체 복구
        update_restore_progress(user_id, 'database', '객체 데이터를 복구하고 있습니다...', 55)
        for object_data in db_data.get('objects', []):
            obj = Object(
                id=object_data['id'],
                name=object_data['name'],
                type=object_data['type'],
                order=object_data['order'],
                properties=object_data['properties'],
                in_motion=object_data['in_motion'],
                out_motion=object_data['out_motion'],
                timing=object_data['timing'],
                scene_id=object_data['scene_id'],
                created_at=datetime.fromisoformat(object_data['created_at']) if object_data['created_at'] else None,
                updated_at=datetime.fromisoformat(object_data['updated_at']) if object_data['updated_at'] else None
            )
            db.session.add(obj)
        
        # 권한 복구
        update_restore_progress(user_id, 'database', '권한 데이터를 복구하고 있습니다...', 58)
        for perm_data in db_data.get('permissions', []):
            perm = ProjectPermission(
                id=perm_data['id'],
                project_id=perm_data['project_id'],
                user_id=perm_data['user_id'],
                permission_type=perm_data['permission_type'],
                created_at=datetime.fromisoformat(perm_data['created_at']) if perm_data['created_at'] else None,
                updated_at=datetime.fromisoformat(perm_data['updated_at']) if perm_data['updated_at'] else None
            )
            db.session.add(perm)
        
        update_restore_progress(user_id, 'database', '데이터베이스에 저장하고 있습니다...', 59)
        db.session.commit()
        return True
        
    except Exception as e:
        print(f"Database restore error: {e}")
        db.session.rollback()
        return False

def restore_libraries_from_zip(zipf, libraries_files):
    """ZIP 파일에서 라이브러리 복구 (사용자별 구조)"""
    try:
        user_id = get_jwt_identity()
        projects_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'projects')
        
        total_projects = len(libraries_files)
        for i, (project_key, project_files) in enumerate(libraries_files.items()):
            update_restore_progress(user_id, 'libraries', f'프로젝트 "{project_key}" 라이브러리를 복구하고 있습니다... ({i+1}/{total_projects})', 70 + (i * 15 // total_projects))
            
            # project_key는 "user_id/project_name" 형태
            if '/' in project_key:
                user_dir, project_name = project_key.split('/', 1)
            else:
                # 하위 호환성을 위해 기존 방식 지원
                user_dir = 'default'
                project_name = project_key
            
            user_project_dir = os.path.join(projects_dir, user_dir, project_name)
            os.makedirs(user_project_dir, exist_ok=True)
            
            # 프로젝트별 파일 복구
            for file_type, files in project_files.items():
                if file_type == 'images':
                    for file_info in files:
                        zip_path = f'projects/{user_dir}/{project_name}/library/{file_info["path"]}'
                        if zip_path in zipf.namelist():
                            target_path = os.path.join(user_project_dir, file_info["path"])
                            os.makedirs(os.path.dirname(target_path), exist_ok=True)
                            with zipf.open(zip_path) as source, open(target_path, 'wb') as target:
                                shutil.copyfileobj(source, target)
                
                elif file_type == 'thumbnails':
                    for file_info in files:
                        zip_path = f'projects/{user_dir}/{project_name}/library/{file_info["path"]}'
                        if zip_path in zipf.namelist():
                            target_path = os.path.join(user_project_dir, file_info["path"])
                            os.makedirs(os.path.dirname(target_path), exist_ok=True)
                            with zipf.open(zip_path) as source, open(target_path, 'wb') as target:
                                shutil.copyfileobj(source, target)
                
                elif file_type == 'sequences':
                    for seq_info in files:
                        for file_info in seq_info['files']:
                            zip_path = f'projects/{user_dir}/{project_name}/library/{file_info["path"]}'
                            if zip_path in zipf.namelist():
                                target_path = os.path.join(user_project_dir, file_info["path"])
                                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                                with zipf.open(zip_path) as source, open(target_path, 'wb') as target:
                                    shutil.copyfileobj(source, target)
        
        return True
        
    except Exception as e:
        print(f"Libraries restore error: {e}")
        return False

@app.route('/api/admin/libraries/info', methods=['GET'])
@admin_required
def get_libraries_info():
    """프로젝트별 라이브러리 정보 조회 (개선된 버전)"""
    try:
        with app.app_context():
            # 기존 라이브러리 정보
            libraries_info = get_project_library_info()
            
            # 상세 파일 정보 수집
            libraries_files = get_libraries_files_info()
            
            # 프로젝트별 상세 정보 계산
            detailed_info = {}
            total_images = 0
            total_sequences = 0
            total_thumbnails = 0
            total_size = 0
            
            for project_name, project_libs in libraries_files.items():
                project_images = len(project_libs['images'])
                project_thumbnails = len(project_libs['thumbnails'])
                project_sequences = sum(len(seq['files']) for seq in project_libs['sequences'])
                
                # 파일 크기 합계 계산
                project_size = 0
                for img in project_libs['images']:
                    project_size += img['size']
                for thumb in project_libs['thumbnails']:
                    project_size += thumb['size']
                for seq in project_libs['sequences']:
                    for file in seq['files']:
                        project_size += file['size']
                
                detailed_info[project_name] = {
                    'images': project_images,
                    'thumbnails': project_thumbnails,
                    'sequences': project_sequences,
                    'size': project_size,
                    'size_mb': round(project_size / 1024 / 1024, 2)
                }
                
                total_images += project_images
                total_thumbnails += project_thumbnails
                total_sequences += project_sequences
                total_size += project_size
            
            # 전체 요약 정보
            summary = {
                'total_projects': len(libraries_files),
                'total_images': total_images,
                'total_thumbnails': total_thumbnails,
                'total_sequences': total_sequences,
                'total_size': total_size,
                'total_size_mb': round(total_size / 1024 / 1024, 2)
            }
            
        return jsonify({
            'success': True,
            'libraries_info': libraries_info,
            'detailed_info': detailed_info,
            'summary': summary
        }), 200
    except Exception as e:
        print(f"Libraries info error: {e}")
        return jsonify({
            'success': False,
            'message': f'라이브러리 정보 조회 중 오류가 발생했습니다: {str(e)}'
        }), 500

@app.route('/api/admin/backup/progress', methods=['GET'])
@admin_required
def get_backup_progress():
    """백업 진행상황 조회 (폴링용)"""
    try:
        current_user = get_current_user_from_token()
        user_id = current_user.id
        
        if user_id in backup_progress:
            return jsonify({
                'success': True,
                'data': backup_progress[user_id]
            })
        else:
            return jsonify({
                'success': True,
                'data': None
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/admin/restore/progress', methods=['GET'])
@admin_required
def get_restore_progress():
    """복구 진행상황 조회 (폴링용)"""
    try:
        current_user = get_current_user_from_token()
        user_id = current_user.id
        
        if user_id in restore_progress:
            return jsonify({
                'success': True,
                'data': restore_progress[user_id]
            })
        else:
            return jsonify({
                'success': True,
                'data': None
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# --- 라이브 컨트롤 API ---

@app.route('/api/live/projects/<project_name>/state', methods=['GET'])
@auth_required('viewer')
def get_project_live_state(project_name):
    """프로젝트의 라이브 상태 조회"""
    try:
        live_state = live_state_manager.get_project_live_state(project_name)
        scene_states = live_state_manager.get_all_live_scenes(project_name)
        
        return jsonify({
            'object_states': live_state,
            'scene_states': scene_states
        })
    except Exception as e:
        app.logger.error(f'라이브 상태 조회 오류: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/live/objects/<int:object_id>/text', methods=['POST'])
@jwt_required()
def update_text_live(object_id):
    """텍스트 객체 실시간 내용 변경"""
    try:
        data = request.get_json()
        content = data.get('content', '')
        project_name = data.get('project_name')
        
        print(f"🔍 텍스트 업데이트 디버그: object_id={object_id}, content='{content}', project_name={project_name}")
        
        if not project_name:
            return jsonify({'error': '프로젝트 이름이 필요합니다.'}), 400
        
        # 객체 존재 확인
        obj = Object.query.get(object_id)
        if not obj or obj.type != 'text':
            print(f"❌ 텍스트 객체를 찾을 수 없음: object_id={object_id}, obj={obj}, type={obj.type if obj else 'None'}")
            return jsonify({'error': '텍스트 객체를 찾을 수 없습니다.'}), 404
        
        print(f"✅ 텍스트 객체 찾음: {obj.name} (scene_id={obj.scene_id})")
        
        # 라이브 상태 업데이트
        live_state_manager.update_object_property(project_name, object_id, 'content', content)
        print(f"✅ 라이브 상태 매니저 업데이트 완료")
        
        # 소켓으로 실시간 업데이트 전송
        object_update_data = {
            'object_id': object_id,
            'property': 'content',
            'value': content,
            'timestamp': datetime.now().isoformat()
        }
        
        # 프로젝트 룸으로 전송
        project_room = f'project_{project_name}'
        print(f"🚀 텍스트 업데이트: {project_room} 룸으로 object_live_update 이벤트 전송")
        print(f"🚀 전송 데이터: {object_update_data}")
        socketio.emit('object_live_update', object_update_data, room=project_room)
        print(f"🚀 프로젝트 룸 이벤트 전송 완료")
        
        # 오버레이 페이지를 위해 모든 사용자의 개별 룸으로도 전송
        scene = obj.scene
        project = scene.project
        if project:
            print(f"🔍 프로젝트 정보: {project.name} (id={project.id})")
            permissions = ProjectPermission.query.filter_by(project_id=project.id).all()
            print(f"🔍 프로젝트 권한 개수: {len(permissions)}")
            
            if len(permissions) == 0:
                print(f"⚠️ 프로젝트에 권한이 있는 사용자가 없음: project_id={project.id}")
                # 권한이 없어도 기본 사용자 룸으로 전송 시도
                default_user_room = f'user_1'  # 기본 사용자 ID
                print(f"🚀 기본 사용자 룸으로 전송 시도: {default_user_room}")
                socketio.emit('object_live_update', object_update_data, room=default_user_room)
                print(f"🚀 기본 사용자 룸 이벤트 전송 완료")
            
            for permission in permissions:
                user_room = f'user_{permission.user_id}'
                print(f"🚀 오버레이용 텍스트 업데이트: {user_room} 룸으로 object_live_update 이벤트 전송")
                print(f"🚀 권한 정보: user_id={permission.user_id}, permission_type={permission.permission_type}")
                socketio.emit('object_live_update', object_update_data, room=user_room)
                print(f"🚀 {user_room} 룸으로 이벤트 전송 완료")
            print(f"🚀 모든 사용자 룸으로 텍스트 업데이트 이벤트 전송 완료")
        else:
            print(f"❌ 프로젝트를 찾을 수 없음: scene_id={obj.scene_id}")
        
        return jsonify({
            'message': '텍스트가 업데이트되었습니다.',
            'object_id': object_id,
            'content': content
        })
        
    except Exception as e:
        app.logger.error(f'텍스트 라이브 업데이트 오류: {str(e)}')
        print(f"❌ 텍스트 업데이트 예외: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/live/scenes/<int:scene_id>/on', methods=['POST'])
@jwt_required()
def scene_live_on(scene_id):
    """씬 송출 상태로 변경"""
    try:
        data = request.get_json()
        project_name = data.get('project_name')
        
        if not project_name:
            return jsonify({'error': '프로젝트 이름이 필요합니다.'}), 400
        
        # 씬 존재 확인
        scene = Scene.query.get(scene_id)
        if not scene:
            return jsonify({'error': '씬을 찾을 수 없습니다.'}), 404
        
        print(f"🔍 씬 송출 디버그: scene_id={scene_id}, project_name={project_name}")
        print(f"🔍 씬 정보: {scene.name}, project_id={scene.project_id}")
        
        # 다른 씬들 모두 아웃으로 변경
        all_scenes = Scene.query.filter_by(project_id=scene.project_id).all()
        for s in all_scenes:
            live_state_manager.set_scene_live(project_name, s.id, False)
        
        # 해당 씬만 라이브로 설정
        live_state_manager.set_scene_live(project_name, scene_id, True)
        
        # 소켓으로 실시간 업데이트 전송
        room_name = f'project_{project_name}'
        update_data = {
            'scene_id': scene_id,
            'is_live': True,
            'timestamp': datetime.now().isoformat()
        }
        print(f"🚀 씬 송출: {room_name} 룸으로 scene_live_update 이벤트 전송")
        print(f"🚀 전송 데이터: {update_data}")
        
        socketio.emit('scene_live_update', update_data, room=room_name)
        print(f"🚀 Socket.io 이벤트 전송 완료")
        
        # 오버레이 페이지를 위해 모든 사용자의 개별 룸으로도 전송
        project = Project.query.get(scene.project_id)
        if project:
            print(f"🔍 프로젝트 검색 성공: {project.name}")
            # 해당 프로젝트에 권한이 있는 모든 사용자들의 룸으로도 이벤트 전송
            permissions = ProjectPermission.query.filter_by(project_id=project.id).all()
            print(f"🔍 프로젝트 권한 개수: {len(permissions)}")
            
            for permission in permissions:
                user_room = f'user_{permission.user_id}'
                print(f"🚀 오버레이용 송출: {user_room} 룸으로 scene_live_update 이벤트 전송")
                print(f"🚀 권한 정보: user_id={permission.user_id}, permission_type={permission.permission_type}")
                socketio.emit('scene_live_update', update_data, room=user_room)
                print(f"🚀 {user_room} 룸으로 이벤트 전송 완료")
            print(f"🚀 모든 사용자 룸으로 이벤트 전송 완료")
        else:
            print(f"❌ 프로젝트를 찾을 수 없음: project_id={scene.project_id}")
        
        return jsonify({
            'message': f'씬 "{scene.name}"이 송출되었습니다.',
            'scene_id': scene_id,
            'is_live': True
        })
        
    except Exception as e:
        app.logger.error(f'씬 송출 오류: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/live/scenes/<int:scene_id>/off', methods=['POST'])
@jwt_required()
def scene_live_off(scene_id):
    """씬 아웃 상태로 변경"""
    try:
        data = request.get_json()
        project_name = data.get('project_name')
        
        if not project_name:
            return jsonify({'error': '프로젝트 이름이 필요합니다.'}), 400
        
        # 씬 존재 확인
        scene = Scene.query.get(scene_id)
        if not scene:
            return jsonify({'error': '씬을 찾을 수 없습니다.'}), 404
        
        # 씬 아웃으로 설정
        live_state_manager.set_scene_live(project_name, scene_id, False)
        
        # 소켓으로 실시간 업데이트 전송
        room_name = f'project_{project_name}'
        update_data = {
            'scene_id': scene_id,
            'is_live': False,
            'timestamp': datetime.now().isoformat()
        }
        print(f"🛑 씬 아웃: {room_name} 룸으로 scene_live_update 이벤트 전송")
        print(f"🛑 전송 데이터: {update_data}")
        
        socketio.emit('scene_live_update', update_data, room=room_name)
        print(f"🛑 Socket.io 이벤트 전송 완료")
        
        # 오버레이 페이지를 위해 모든 사용자의 개별 룸으로도 전송
        project = Project.query.get(scene.project_id)
        if project:
            # 해당 프로젝트에 권한이 있는 모든 사용자들의 룸으로도 이벤트 전송
            permissions = ProjectPermission.query.filter_by(project_id=project.id).all()
            for permission in permissions:
                user_room = f'user_{permission.user_id}'
                print(f"🛑 오버레이용 아웃: {user_room} 룸으로 scene_live_update 이벤트 전송")
                socketio.emit('scene_live_update', update_data, room=user_room)
            print(f"🛑 모든 사용자 룸으로 이벤트 전송 완료")
        
        return jsonify({
            'message': f'씬 "{scene.name}"이 아웃되었습니다.',
            'scene_id': scene_id,
            'is_live': False
        })
        
    except Exception as e:
        app.logger.error(f'씬 아웃 오류: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/live/objects/<int:object_id>/timer/<action>', methods=['POST'])
@jwt_required()
def control_timer(object_id, action):
    """타이머 제어 (start/stop/reset)"""
    try:
        data = request.get_json()
        project_name = data.get('project_name')
        
        if not project_name:
            return jsonify({'error': '프로젝트 이름이 필요합니다.'}), 400
        
        # 객체 존재 확인
        obj = Object.query.get(object_id)
        if not obj or obj.type != 'timer':
            return jsonify({'error': '타이머 객체를 찾을 수 없습니다.'}), 404
        
        # 객체의 시간 형식 속성 가져오기
        import json
        obj_properties = json.loads(obj.properties) if obj.properties else {}
        time_format = obj_properties.get('timeFormat', 'MM:SS')
        
        # 타이머 제어
        timer_result = None
        if action == 'start':
            timer_result = live_state_manager.start_timer(object_id, project_name, time_format)
        elif action == 'stop':
            timer_result = live_state_manager.stop_timer(object_id)
        elif action == 'reset':
            timer_result = live_state_manager.reset_timer(object_id)
        else:
            return jsonify({'error': '유효하지 않은 액션입니다.'}), 400
        
        print(f"⏰ 타이머 제어 - 객체 ID: {object_id}, 액션: {action}, 시간 형식: {time_format}")
        print(f"⏰ 타이머 제어 결과: {timer_result}")
        
        # 현재 타이머 상태 조회 (시간 형식 적용)
        timer_state = live_state_manager.get_timer_state(object_id, time_format)
        print(f"⏰ 타이머 상태 조회 결과: {timer_state}")
        
        # 라이브 상태에도 업데이트
        live_state_manager.update_object_property(project_name, object_id, 'content', timer_state['current_time'])
        
        # 소켓으로 실시간 업데이트 전송
        timer_update_data = {
            'object_id': object_id,
            'action': action,
            'timer_state': timer_state,
            'timestamp': datetime.now().isoformat()
        }
        
        # timer_result의 데이터도 포함 (클라이언트에서 필요)
        if timer_result:
            timer_update_data.update(timer_result)
        
        # 프로젝트 룸으로 전송
        project_room = f'project_{project_name}'
        print(f"⏰ 타이머 업데이트: {project_room} 룸으로 timer_update 이벤트 전송")
        print(f"⏰ 전송 데이터: {timer_update_data}")
        socketio.emit('timer_update', timer_update_data, room=project_room)
        print(f"⏰ 프로젝트 룸 이벤트 전송 완료")
        
        # 오버레이 페이지를 위해 모든 사용자의 개별 룸으로도 전송
        scene = obj.scene
        project = scene.project
        if project:
            print(f"⏰ 프로젝트 정보: {project.name} (id={project.id})")
            permissions = ProjectPermission.query.filter_by(project_id=project.id).all()
            print(f"⏰ 프로젝트 권한 개수: {len(permissions)}")
            
            for permission in permissions:
                user_room = f'user_{permission.user_id}'
                print(f"⏰ 오버레이용 타이머 업데이트: {user_room} 룸으로 timer_update 이벤트 전송")
                socketio.emit('timer_update', timer_update_data, room=user_room)
                print(f"⏰ {user_room} 룸으로 이벤트 전송 완료")
            print(f"⏰ 모든 사용자 룸으로 타이머 업데이트 이벤트 전송 완료")
        else:
            print(f"⏰ 프로젝트를 찾을 수 없음: scene_id={obj.scene_id}")
        
        return jsonify({
            'message': f'타이머 {action} 완료',
            'object_id': object_id,
            'timer_state': timer_state,
            **timer_result  # 타이머 제어 결과 데이터 포함
        })
        
    except Exception as e:
        app.logger.error(f'타이머 제어 오류: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/live/projects/<project_name>/clear', methods=['POST'])
@auth_required('editor')
def clear_project_live_state(project_name):
    """프로젝트 라이브 상태 모두 초기화"""
    try:
        live_state_manager.clear_project_live_state(project_name)
        
        # 소켓으로 초기화 알림
        clear_data = {
            'project_name': project_name,
            'timestamp': datetime.now().isoformat()
        }
        
        # 프로젝트 룸으로 전송
        socketio.emit('live_state_cleared', clear_data, room=f'project_{project_name}')
        
        # 오버레이 페이지를 위해 모든 사용자의 개별 룸으로도 전송
        current_user = get_current_user_from_token()
        if current_user:
            project = get_project_by_name(project_name, current_user.id)
            if project:
                permissions = ProjectPermission.query.filter_by(project_id=project.id).all()
                for permission in permissions:
                    user_room = f'user_{permission.user_id}'
                    socketio.emit('live_state_cleared', clear_data, room=user_room)
        
        return jsonify({
            'message': f'프로젝트 "{project_name}"의 라이브 상태가 초기화되었습니다.'
        })
        
    except Exception as e:
        app.logger.error(f'라이브 상태 초기화 오류: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/live/objects/<int:object_id>/image', methods=['POST'])
@jwt_required()
def update_image_live(object_id):
    """이미지 객체 실시간 이미지 변경"""
    try:
        data = request.get_json()
        image_src = data.get('src', '')
        project_name = data.get('project_name')
        
        print(f"🔍 이미지 업데이트 디버그: object_id={object_id}, src='{image_src}', project_name={project_name}")
        
        if not project_name:
            return jsonify({'error': '프로젝트 이름이 필요합니다.'}), 400
        
        # 객체 존재 확인
        obj = Object.query.get(object_id)
        if not obj or obj.type != 'image':
            print(f"❌ 이미지 객체를 찾을 수 없음: object_id={object_id}, obj={obj}, type={obj.type if obj else 'None'}")
            return jsonify({'error': '이미지 객체를 찾을 수 없습니다.'}), 404
        
        print(f"✅ 이미지 객체 찾음: {obj.name} (scene_id={obj.scene_id})")
        
        # 라이브 상태 업데이트
        live_state_manager.update_object_property(project_name, object_id, 'src', image_src)
        print(f"✅ 라이브 상태 매니저 업데이트 완료")
        
        # 소켓으로 실시간 업데이트 전송
        object_update_data = {
            'object_id': object_id,
            'property': 'src',
            'value': image_src,
            'timestamp': datetime.now().isoformat()
        }
        
        # 프로젝트 룸으로 전송
        project_room = f'project_{project_name}'
        print(f"🚀 이미지 업데이트: {project_room} 룸으로 object_live_update 이벤트 전송")
        print(f"🚀 전송 데이터: {object_update_data}")
        socketio.emit('object_live_update', object_update_data, room=project_room)
        print(f"🚀 프로젝트 룸 이벤트 전송 완료")
        
        # 오버레이 페이지를 위해 모든 사용자의 개별 룸으로도 전송
        scene = obj.scene
        project = scene.project
        if project:
            print(f"🔍 프로젝트 정보: {project.name} (id={project.id})")
            permissions = ProjectPermission.query.filter_by(project_id=project.id).all()
            print(f"🔍 프로젝트 권한 개수: {len(permissions)}")
            
            for permission in permissions:
                user_room = f'user_{permission.user_id}'
                print(f"🚀 오버레이용 이미지 업데이트: {user_room} 룸으로 object_live_update 이벤트 전송")
                socketio.emit('object_live_update', object_update_data, room=user_room)
                print(f"🚀 {user_room} 룸으로 이벤트 전송 완료")
            print(f"🚀 모든 사용자 룸으로 이미지 업데이트 이벤트 전송 완료")
        
        return jsonify({
            'message': '이미지가 업데이트되었습니다.',
            'object_id': object_id,
            'src': image_src
        })
        
    except Exception as e:
        app.logger.error(f'이미지 라이브 업데이트 오류: {str(e)}')
        print(f"❌ 이미지 업데이트 예외: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/live/objects/<int:object_id>/shape', methods=['POST'])
@jwt_required()
def update_shape_live(object_id):
    """도형 객체 실시간 속성 변경 (컬러 등)"""
    try:
        data = request.get_json()
        color = data.get('color', '')
        project_name = data.get('project_name')
        
        print(f"🔍 도형 업데이트 디버그: object_id={object_id}, color='{color}', project_name={project_name}")
        
        if not project_name:
            return jsonify({'error': '프로젝트 이름이 필요합니다.'}), 400
        
        # 객체 존재 확인
        obj = Object.query.get(object_id)
        if not obj or obj.type != 'shape':
            print(f"❌ 도형 객체를 찾을 수 없음: object_id={object_id}, obj={obj}, type={obj.type if obj else 'None'}")
            return jsonify({'error': '도형 객체를 찾을 수 없습니다.'}), 404
        
        print(f"✅ 도형 객체 찾음: {obj.name} (scene_id={obj.scene_id})")
        
        # 라이브 상태 업데이트
        live_state_manager.update_object_property(project_name, object_id, 'color', color)
        print(f"✅ 라이브 상태 매니저 업데이트 완료")
        
        # 소켓으로 실시간 업데이트 전송
        object_update_data = {
            'object_id': object_id,
            'property': 'color',
            'value': color,
            'timestamp': datetime.now().isoformat()
        }
        
        # 프로젝트 룸으로 전송
        project_room = f'project_{project_name}'
        print(f"🚀 도형 업데이트: {project_room} 룸으로 object_live_update 이벤트 전송")
        print(f"🚀 전송 데이터: {object_update_data}")
        socketio.emit('object_live_update', object_update_data, room=project_room)
        print(f"🚀 프로젝트 룸 이벤트 전송 완료")
        
        # 오버레이 페이지를 위해 모든 사용자의 개별 룸으로도 전송
        scene = obj.scene
        project = scene.project
        if project:
            print(f"🔍 프로젝트 정보: {project.name} (id={project.id})")
            permissions = ProjectPermission.query.filter_by(project_id=project.id).all()
            print(f"🔍 프로젝트 권한 개수: {len(permissions)}")
            
            for permission in permissions:
                user_room = f'user_{permission.user_id}'
                print(f"🚀 오버레이용 도형 업데이트: {user_room} 룸으로 object_live_update 이벤트 전송")
                socketio.emit('object_live_update', object_update_data, room=user_room)
                print(f"🚀 {user_room} 룸으로 이벤트 전송 완료")
            print(f"🚀 모든 사용자 룸으로 도형 업데이트 이벤트 전송 완료")
        
        return jsonify({
            'message': '도형이 업데이트되었습니다.',
            'object_id': object_id,
            'color': color
        })
        
    except Exception as e:
        app.logger.error(f'도형 라이브 업데이트 오류: {str(e)}')
        print(f"❌ 도형 업데이트 예외: {str(e)}")
        return jsonify({'error': str(e)}), 500

# --- Main Entry Point ---

# WebSocket 업데이트 콜백 함수 설정
def websocket_timer_update_callback(timer_update_data, project_name):
    """타이머 업데이트를 WebSocket으로 전송하는 콜백 함수"""
    try:
        print(f"⏰ 타이머 WebSocket 콜백 호출 - 프로젝트: {project_name}")
        print(f"⏰ 전송 데이터: {timer_update_data}")
        
        # 프로젝트 룸으로 전송
        project_room = f'project_{project_name}'
        socketio.emit('timer_update', timer_update_data, room=project_room)
        print(f"⏰ 프로젝트 룸 전송 완료: {project_room}")
        
        # 오버레이 페이지를 위해 모든 사용자의 개별 룸으로도 전송
        project = get_project_by_name(project_name)
        if project:
            permissions = ProjectPermission.query.filter_by(project_id=project.id).all()
            print(f"⏰ 사용자 권한 개수: {len(permissions)}")
            for permission in permissions:
                user_room = f'user_{permission.user_id}'
                socketio.emit('timer_update', timer_update_data, room=user_room)
                print(f"⏰ 사용자 룸 전송 완료: {user_room}")
        else:
            print(f"⏰ 프로젝트를 찾을 수 없음: {project_name}")
    except Exception as e:
        print(f"타이머 업데이트 WebSocket 전송 오류: {e}")

# --- Canvas Preset API Endpoints ---

@app.route('/api/canvas-presets', methods=['GET'])
@jwt_required()
def get_canvas_presets():
    """사용자의 캔버스 프리셋 목록 조회"""
    try:
        current_user = get_current_user_from_token()
        if not current_user:
            return jsonify({'error': '인증되지 않은 사용자입니다.'}), 401
        
        presets = CanvasPreset.query.filter_by(user_id=current_user.id).order_by(CanvasPreset.created_at.desc()).all()
        
        return jsonify({
            'presets': [preset.to_dict() for preset in presets]
        })
        
    except Exception as e:
        app.logger.error(f'캔버스 프리셋 조회 오류: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/canvas-presets', methods=['POST'])
@jwt_required()
def create_canvas_preset():
    """새 캔버스 프리셋 생성"""
    try:
        current_user = get_current_user_from_token()
        if not current_user:
            return jsonify({'error': '인증되지 않은 사용자입니다.'}), 401
        
        data = request.get_json()
        name = data.get('name', '').strip()
        canvas_scale = data.get('canvas_scale', 1.0)
        scroll_left = data.get('scroll_left', 0.0)
        scroll_top = data.get('scroll_top', 0.0)
        
        if not name:
            return jsonify({'error': '프리셋 이름이 필요합니다.'}), 400
        
        # 동일한 이름의 프리셋이 있는지 확인
        existing_preset = CanvasPreset.query.filter_by(
            user_id=current_user.id, 
            name=name
        ).first()
        
        if existing_preset:
            return jsonify({'error': '이미 존재하는 프리셋 이름입니다.'}), 400
        
        # 새 프리셋 생성
        preset = CanvasPreset(
            name=name,
            canvas_scale=canvas_scale,
            scroll_left=scroll_left,
            scroll_top=scroll_top,
            user_id=current_user.id
        )
        
        db.session.add(preset)
        db.session.commit()
        
        return jsonify({
            'message': '캔버스 프리셋이 저장되었습니다.',
            'preset': preset.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'캔버스 프리셋 생성 오류: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/canvas-presets/<int:preset_id>', methods=['DELETE'])
@jwt_required()
def delete_canvas_preset(preset_id):
    """캔버스 프리셋 삭제"""
    try:
        current_user = get_current_user_from_token()
        if not current_user:
            return jsonify({'error': '인증되지 않은 사용자입니다.'}), 401
        
        preset = CanvasPreset.query.filter_by(
            id=preset_id, 
            user_id=current_user.id
        ).first()
        
        if not preset:
            return jsonify({'error': '프리셋을 찾을 수 없습니다.'}), 404
        
        db.session.delete(preset)
        db.session.commit()
        
        return jsonify({
            'message': '캔버스 프리셋이 삭제되었습니다.'
        })
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'캔버스 프리셋 삭제 오류: {str(e)}')
        return jsonify({'error': str(e)}), 500

# 라이브 상태 관리자에 콜백 함수 설정
live_state_manager.set_websocket_callback(websocket_timer_update_callback)

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
    
    # 타이머 업데이트 루프 시작
    print("⏰ 타이머 업데이트 루프 시작")
    live_state_manager.start_timer_updates()
    
    # Railway의 PORT 환경 변수 사용, 없으면 5000 사용
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, debug=False, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)



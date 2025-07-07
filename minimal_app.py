#!/usr/bin/env python3
import os
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_socketio import SocketIO, emit
import bcrypt

app = Flask(__name__)

# CORS 설정 개선
CORS(app, origins=['http://localhost:5173', 'http://localhost:3000'], 
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

print("Starting minimal EditOnAir backend...")

# Configure database
basedir = os.path.abspath(os.path.dirname(__file__))
database_url = os.environ.get('DATABASE_URL')
if database_url:
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    print("Using PostgreSQL database")
else:
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'editor_data.db')
    print("Using SQLite database")

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key')
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'your-secret-key')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=1)

# Initialize extensions
db = SQLAlchemy(app)
jwt = JWTManager(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Database Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    def __repr__(self):
        return f'<User {self.username}>'

class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('projects', lazy=True))

# Routes
@app.route('/health')
def health_check():
    return jsonify({
        "status": "healthy",
        "message": "EditOnAir Backend API",
        "timestamp": datetime.utcnow().isoformat()
    }), 200

@app.route('/')
def home():
    return jsonify({
        "message": "EditOnAir Backend API",
        "status": "running",
        "version": "minimal"
    }), 200

@app.route('/api/test')
def test_db():
    try:
        user_count = User.query.count()
        project_count = Project.query.count()
        return jsonify({
            "status": "success",
            "message": "Database connection successful",
            "user_count": user_count,
            "project_count": project_count
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Database error: {str(e)}"
        }), 500

# Auth routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400
            
        user = User.query.filter_by(username=username).first()
        if user and bcrypt.checkpw(password.encode('utf-8'), user.password.encode('utf-8')):
            access_token = create_access_token(identity=user.id)
            return jsonify({
                'message': 'Login successful',
                'access_token': access_token,
                'user': {
                    'id': user.id,
                    'username': user.username
                }
            }), 200
        else:
            return jsonify({'error': 'Invalid credentials'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400
            
        if User.query.filter_by(username=username).first():
            return jsonify({'error': 'Username already exists'}), 400
            
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user = User(username=username, password=hashed_password)
        db.session.add(user)
        db.session.commit()
        
        access_token = create_access_token(identity=user.id)
        return jsonify({
            'message': 'Registration successful',
            'access_token': access_token,
            'user': {
                'id': user.id,
                'username': user.username
            }
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/projects', methods=['GET'])
def get_projects():
    try:
        # 임시로 JWT 인증 제거 - 모든 프로젝트 반환
        projects = Project.query.all()
        return jsonify([{
            'id': p.id,
            'name': p.name,
            'created_at': p.created_at.isoformat() if p.created_at else None,
            'updated_at': p.updated_at.isoformat() if p.updated_at else None
        } for p in projects]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/projects', methods=['POST'])
def create_project():
    try:
        # 임시로 JWT 인증 제거 - 기본 사용자 ID 사용
        default_user = User.query.filter_by(username='admin').first()
        if not default_user:
            return jsonify({'error': 'Default user not found'}), 500
            
        data = request.get_json()
        name = data.get('name')
        
        if not name:
            return jsonify({'error': 'Project name required'}), 400
            
        # 중복 체크
        existing_project = Project.query.filter_by(name=name).first()
        if existing_project:
            return jsonify({'error': 'Project with this name already exists'}), 400
            
        project = Project(name=name, user_id=default_user.id)
        db.session.add(project)
        db.session.commit()
        
        return jsonify({
            'id': project.id,
            'name': project.name,
            'created_at': project.created_at.isoformat(),
            'updated_at': project.updated_at.isoformat()
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/projects/<project_name>', methods=['DELETE'])
def delete_project(project_name):
    try:
        # URL 디코딩 처리
        import urllib.parse
        decoded_name = urllib.parse.unquote(project_name)
        
        project = Project.query.filter_by(name=decoded_name).first()
        if not project:
            return jsonify({'error': 'Project not found'}), 404
            
        db.session.delete(project)
        db.session.commit()
        
        return jsonify({'message': 'Project deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/projects/<project_name>', methods=['GET'])
def get_project_by_name(project_name):
    try:
        # URL 디코딩 처리
        import urllib.parse
        decoded_name = urllib.parse.unquote(project_name)
        
        project = Project.query.filter_by(name=decoded_name).first()
        if not project:
            return jsonify({'error': 'Project not found'}), 404
            
        return jsonify({
            'id': project.id,
            'name': project.name,
            'created_at': project.created_at.isoformat() if project.created_at else None,
            'updated_at': project.updated_at.isoformat() if project.updated_at else None,
            'scenes': []  # 임시로 빈 배열 반환, 나중에 Scene 모델 구현 시 수정
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/projects/<project_name>/library/images', methods=['GET'])
def get_project_images(project_name):
    try:
        # URL 디코딩 처리
        import urllib.parse
        decoded_name = urllib.parse.unquote(project_name)
        
        project = Project.query.filter_by(name=decoded_name).first()
        if not project:
            return jsonify({'error': 'Project not found'}), 404
            
        # 임시로 빈 배열 반환, 나중에 이미지 관리 시스템 구현 시 수정
        return jsonify([]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/projects/<project_name>/library/sequences', methods=['GET'])
def get_project_sequences(project_name):
    try:
        # URL 디코딩 처리
        import urllib.parse
        decoded_name = urllib.parse.unquote(project_name)
        
        project = Project.query.filter_by(name=decoded_name).first()
        if not project:
            return jsonify({'error': 'Project not found'}), 404
            
        # 임시로 빈 배열 반환, 나중에 시퀀스 관리 시스템 구현 시 수정
        return jsonify([]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# SocketIO events
@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('status', {'msg': 'Connected to EditOnAir backend'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

# Initialize database
def init_db():
    try:
        with app.app_context():
            db.create_all()
            
            # Create default admin user
            admin = User.query.filter_by(username='admin').first()
            if not admin:
                admin_password = bcrypt.hashpw('admin123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                admin = User(username='admin', password=admin_password)
                db.session.add(admin)
                db.session.commit()
                print("Default admin user created")
            
            print("Database tables created successfully")
    except Exception as e:
        print(f"Error creating database tables: {e}")

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting app on port {port}")
    socketio.run(app, debug=False, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
else:
    # Production mode (when imported by gunicorn, etc.)
    init_db() 
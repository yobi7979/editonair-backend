import os
from flask import Flask, jsonify, request, render_template, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
import datetime
import json
from werkzeug.utils import secure_filename
from urllib.parse import unquote
from PIL import Image
import socket
import eventlet

# Initialize Flask app
app = Flask(__name__)

# CORS 미들웨어 추가
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

socketio = SocketIO(app, cors_allowed_origins="*")  # Initialize SocketIO

# Configure database
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'editor_data.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize SQLAlchemy
db = SQLAlchemy(app)

ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_image_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

def safe_unicode_filename(filename):
    # 위험문자만 제거하고 한글 등 유니코드는 허용
    keepchars = (' ', '.', '_', '-')
    filename = filename.replace('\x00', '')
    filename = filename.replace('/', '').replace('\\', '')
    return ''.join(c for c in filename if c.isalnum() or c in keepchars or ord(c) > 127)

# --- Database Models ---

class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, default='Untitled Project')
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    scenes = db.relationship('Scene', back_populates='project', lazy=True, cascade="all, delete-orphan")

    def __repr__(self):
        return f'<Project {self.name}>'


class Scene(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, default='Untitled Scene')
    order = db.Column(db.Integer, nullable=False, default=0)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    project = db.relationship('Project', back_populates='scenes')
    objects = db.relationship('Object', back_populates='scene', lazy=True, cascade="all, delete-orphan")

    def __repr__(self):
        return f'<Scene {self.name}>'


class Object(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    order = db.Column(db.Integer, nullable=False, default=0)
    properties = db.Column(db.Text, nullable=True)
    in_motion = db.Column(db.Text, nullable=True)  # JSON string for in motion
    out_motion = db.Column(db.Text, nullable=True)  # JSON string for out motion
    timing = db.Column(db.Text, nullable=True)  # JSON string for timing info
    scene_id = db.Column(db.Integer, db.ForeignKey('scene.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    scene = db.relationship('Scene', back_populates='objects')

    def __repr__(self):
        return f'<Object {self.name} ({self.type})>'


# --- Serialization/Deserialization Helpers ---

def project_to_dict(project):
    return {
        'id': project.id,
        'name': project.name,
        'created_at': project.created_at.isoformat() if project.created_at else None,
        'updated_at': project.updated_at.isoformat() if project.updated_at else None,
        'scenes': [scene_to_dict(scene) for scene in project.scenes]
    }

def scene_to_dict(scene):
    return {
        'id': scene.id,
        'name': scene.name,
        'order': scene.order,
        'project_id': scene.project_id,
        'created_at': scene.created_at.isoformat() if scene.created_at else None,
        'updated_at': scene.updated_at.isoformat() if scene.updated_at else None,
        'objects': [object_to_dict(obj) for obj in scene.objects]
    }

def object_to_dict(obj):
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


# --- API Endpoints ---

@app.route('/api/projects', methods=['GET', 'POST'])
def handle_projects():
    if request.method == 'POST':
        data = request.get_json()
        new_project_name = data.get('name', 'Untitled Project')
        new_project = Project(name=new_project_name)
        
        initial_scenes_data = data.get('scenes', [])
        for scene_data in initial_scenes_data:
            new_scene = Scene(
                name=scene_data.get('name', 'Untitled Scene'),
                order=scene_data.get('order', 0),
                project=new_project
            )
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
            db.session.add(new_scene)
        
        db.session.add(new_project)
        db.session.commit()

        # --- 라이브러리 폴더 자동 생성 ---
        project_lib_path = os.path.join(basedir, '..', 'projects', str(new_project.id), 'library')
        images_path = os.path.join(project_lib_path, 'images')
        sequences_path = os.path.join(project_lib_path, 'sequences')
        os.makedirs(images_path, exist_ok=True)
        os.makedirs(sequences_path, exist_ok=True)

        return jsonify(project_to_dict(new_project)), 201

    elif request.method == 'GET':
        projects = Project.query.order_by(Project.updated_at.desc()).all()
        # 각 프로젝트별 라이브러리 폴더가 없으면 생성
        for p in projects:
            project_lib_path = os.path.join(basedir, '..', 'projects', str(p.id), 'library')
            images_path = os.path.join(project_lib_path, 'images')
            sequences_path = os.path.join(project_lib_path, 'sequences')
            os.makedirs(images_path, exist_ok=True)
            os.makedirs(sequences_path, exist_ok=True)
        return jsonify([{
            'id': p.id, 
            'name': p.name, 
            'created_at': p.created_at.isoformat() if p.created_at else None,
            'updated_at': p.updated_at.isoformat() if p.updated_at else None
         } for p in projects])

@app.route('/api/projects/<int:project_id>', methods=['GET', 'PUT', 'DELETE'])
def handle_project(project_id):
    project = Project.query.get_or_404(project_id)

    if request.method == 'GET':
        # --- 라이브러리 폴더 없으면 생성 ---
        project_lib_path = os.path.join(basedir, '..', 'projects', str(project.id), 'library')
        images_path = os.path.join(project_lib_path, 'images')
        sequences_path = os.path.join(project_lib_path, 'sequences')
        os.makedirs(images_path, exist_ok=True)
        os.makedirs(sequences_path, exist_ok=True)
        return jsonify(project_to_dict(project))

    elif request.method == 'PUT':
        data = request.get_json()
        project.name = data.get('name', project.name)
        
        incoming_scene_ids = {s_data['id'] for s_data in data.get('scenes', []) if 'id' in s_data}
        
        for scene in list(project.scenes):
            if scene.id not in incoming_scene_ids:
                db.session.delete(scene)

        for s_data in data.get('scenes', []):
            scene_id = s_data.get('id')
            current_scene = None
            if scene_id:
                current_scene = next((s for s in project.scenes if s.id == scene_id), None)

            if current_scene:
                current_scene.name = s_data.get('name', current_scene.name)
                current_scene.order = s_data.get('order', current_scene.order)
            else:
                current_scene = Scene(
                    name=s_data.get('name', 'Untitled Scene'),
                    order=s_data.get('order', 0),
                    project_id=project.id
                )
                db.session.add(current_scene)
                project.scenes.append(current_scene)
            
            db.session.flush()

            incoming_object_ids = {o_data['id'] for o_data in s_data.get('objects', []) if 'id' in o_data}
            for obj in list(current_scene.objects):
                if obj.id not in incoming_object_ids:
                    db.session.delete(obj)
            
            for o_data in s_data.get('objects', []):
                obj_id = o_data.get('id')
                current_object = None
                if obj_id:
                    current_object = next((o for o in current_scene.objects if o.id == obj_id), None)

                if current_object:
                    current_object.name = o_data.get('name', current_object.name)
                    current_object.type = o_data.get('type', current_object.type)
                    current_object.order = o_data.get('order', current_object.order)
                    current_object.properties = json.dumps(o_data.get('properties', {}))
                    current_object.in_motion = json.dumps(o_data.get('in_motion', {}))
                    current_object.out_motion = json.dumps(o_data.get('out_motion', {}))
                    current_object.timing = json.dumps(o_data.get('timing', {}))
                else:
                    new_object = Object(
                        name=o_data.get('name', 'New Object'),
                        type=o_data.get('type', 'text'),
                        order=o_data.get('order', 0),
                        properties=json.dumps(o_data.get('properties', {})),
                        in_motion=json.dumps(o_data.get('in_motion', {})),
                        out_motion=json.dumps(o_data.get('out_motion', {})),
                        timing=json.dumps(o_data.get('timing', {})),
                        scene_id=current_scene.id
                    )
                    db.session.add(new_object)

        project.updated_at = datetime.datetime.utcnow()
        db.session.add(project)
        db.session.commit()
        return jsonify(project_to_dict(project))

    elif request.method == 'DELETE':
        db.session.delete(project)
        db.session.commit()
        return jsonify({'message': 'Project deleted'}), 200


# Scene CRUD operations
@app.route('/api/projects/<int:project_id>/scenes', methods=['POST'])
def create_scene(project_id):
    project = Project.query.get_or_404(project_id)
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
def handle_scene(scene_id):
    scene = Scene.query.get_or_404(scene_id)
    
    if request.method == 'GET':
        return jsonify(scene_to_dict(scene))
    
    elif request.method == 'PUT':
        data = request.get_json()
        if not data or 'name' not in data:
            return jsonify({'error': 'Scene name is required'}), 400

        scene.name = data['name']
        
        # Update objects if provided
        if 'objects' in data:
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
        
        scene.updated_at = datetime.datetime.utcnow()
        db.session.commit()
        return jsonify(scene_to_dict(scene))

@app.route('/api/scenes/<int:scene_id>', methods=['DELETE'])
def delete_scene(scene_id):
    scene = Scene.query.get_or_404(scene_id)
    db.session.delete(scene)
    db.session.commit()
    return jsonify({'message': 'Scene deleted successfully'})

# 현재 푸시된 씬 ID를 저장할 변수
current_pushed_scene_id = None

@app.route('/overlay/project/<int:project_id>')
def overlay_project(project_id):
    try:
        print(f"Accessing overlay for project {project_id}")
        project = Project.query.get_or_404(project_id)
        print(f"Found project: {project.name}")
        
        # 현재 푸시된 씬이 있으면 해당 씬을 사용, 없으면 첫 번째 씬 사용
        scene = None
        if current_pushed_scene_id:
            print(f"Looking for pushed scene: {current_pushed_scene_id}")
            scene = Scene.query.get(current_pushed_scene_id)
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
                             canvas_height=1080)
    except Exception as e:
        print(f"Error in overlay_project: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return str(e), 500

@app.route('/overlay/project/<int:project_id>/scene/<int:scene_id>')
def overlay_scene(project_id, scene_id):
    project = Project.query.get_or_404(project_id)
    scene = Scene.query.get_or_404(scene_id)
    return render_template('overlay.html', 
                         project=project, 
                         scene=scene_to_dict(scene),
                         canvas_width=1920,
                         canvas_height=1080)

@app.route('/api/scenes/<int:scene_id>/push', methods=['POST'])
def push_scene(scene_id):
    global current_pushed_scene_id
    scene = Scene.query.get_or_404(scene_id)
    # 현재 푸시된 씬 ID 업데이트
    current_pushed_scene_id = scene_id
    # 웹소켓을 통해 모든 클라이언트에게 씬 변경 알림
    socketio.emit('scene_change', {
        'scene_id': scene_id,
        'transition': 'fade',
        'duration': 1.0,
        'clear_effects': True  # 효과 초기화 플래그 추가
    }, broadcast=True)
    return jsonify({'status': 'success'})

@app.route('/api/scenes/<int:scene_id>/out', methods=['POST'])
def out_scene(scene_id):
    scene = Scene.query.get_or_404(scene_id)
    # 웹소켓을 통해 모든 클라이언트에게 아웃 모션 알림
    socketio.emit('scene_out', {
        'scene_id': scene_id,
        'transition': 'fade',
        'duration': 1.0
    }, broadcast=True)
    return jsonify({'status': 'success'})


# --- Helper function to initialize database ---
def init_db():
    try:
        with app.app_context():
            db.create_all()
        print("Database initialized successfully!")
    except Exception as e:
        print(f"Database initialization error: {e}")
        # 프로덕션에서는 에러를 무시하고 계속 진행
        pass


@app.route('/api/scenes/<int:scene_id>/objects', methods=['POST'])
def create_object(scene_id):
    scene = Scene.query.get_or_404(scene_id)
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

    # Emit a real-time update
    socketio.emit('object_created', {'object': object_to_dict(new_object)}, room=f'scene_{scene_id}')
    
    # Also update the whole scene for simplicity on the client
    updated_scene_data = scene_to_dict(Scene.query.get(scene_id))
    socketio.emit('scene_updated', {'scene': updated_scene_data}, room=f'project_{scene.project_id}')

    return jsonify(object_to_dict(new_object)), 201

@app.route('/api/objects/<int:object_id>', methods=['PUT'])
def update_object(object_id):
    """Updates an existing object."""
    obj = Object.query.get_or_404(object_id)
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
    obj.properties = json.dumps(data.get('properties', json.loads(obj.properties or '{}')))
    obj.in_motion = json.dumps(data.get('in_motion', json.loads(obj.in_motion or '{}')))
    obj.out_motion = json.dumps(data.get('out_motion', json.loads(obj.out_motion or '{}')))
    obj.timing = json.dumps(data.get('timing', json.loads(obj.timing or '{}')))
    
    try:
        db.session.commit()
        print("Successfully updated object in database")
        return jsonify(object_to_dict(obj))
    except Exception as e:
        print(f"Error updating object: {str(e)}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/objects/<int:object_id>', methods=['DELETE'])
def delete_object(object_id):
    """Deletes an object."""
    obj = Object.query.get_or_404(object_id)
    db.session.delete(obj)
    db.session.commit()
    return jsonify({'message': 'Object deleted successfully'}), 200

@app.route('/api/scenes/<int:scene_id>/object-orders', methods=['PUT'])
def update_object_orders(scene_id):
    """Updates the order of multiple objects in a scene at once."""
    try:
        scene = Scene.query.get_or_404(scene_id)
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

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('join_project')
def handle_join_project(data):
    project_id = data.get('project_id')
    if project_id:
        emit('project_update', project_to_dict(Project.query.get(project_id)))

@socketio.on('join_scene')
def handle_join_scene(data):
    scene_id = data.get('scene_id')
    if scene_id:
        emit('scene_update', scene_to_dict(Scene.query.get(scene_id)))

@socketio.on('scene_update')
def handle_scene_update(data):
    scene_id = data.get('scene_id')
    if scene_id:
        scene = Scene.query.get(scene_id)
        if scene:
            emit('scene_update', scene_to_dict(scene), broadcast=True)

@socketio.on('scene_change')
def handle_scene_change(data):
    project_id = data.get('project_id')
    scene_id = data.get('scene_id')
    if project_id and scene_id:
        emit('scene_change', {
            'project_id': project_id,
            'scene_id': scene_id,
            'transition': data.get('transition', 'fade'),
            'duration': data.get('duration', 1.0)
        }, broadcast=True)

@socketio.on('get_first_scene')
def handle_get_first_scene(data):
    project_id = data.get('project_id')
    if project_id:
        project = Project.query.get(project_id)
        if project and project.scenes:
            first_scene = project.scenes[0]
            emit('first_scene', scene_to_dict(first_scene))

@app.route('/api/dummy-scene')
def get_dummy_scene():
    """빈 객체가 없는 더미 씬을 반환합니다."""
    dummy_scene = {
        'id': 0,
        'name': 'Dummy Scene',
        'objects': [],  # 빈 객체 배열
        'project_id': 1
    }
    return jsonify(dummy_scene)

@app.route('/api/projects/<int:project_id>/upload/image', methods=['POST'])
def upload_image(project_id):
    # 단일/다중 이미지 업로드 지원
    if 'files' not in request.files:
        return jsonify({'error': 'No files part'}), 400
    files = request.files.getlist('files')
    overwrite = request.form.get('overwrite', 'false').lower() == 'true'
    project_lib_path = os.path.join(basedir, '..', 'projects', str(project_id), 'library', 'images')
    os.makedirs(project_lib_path, exist_ok=True)
    saved_files = []
    exists_files = []
    for file in files:
        if file and allowed_image_file(file.filename):
            #filename = secure_filename(file.filename)
            filename = safe_unicode_filename(file.filename)
            if not filename:
                continue
            save_path = os.path.join(project_lib_path, filename)
            if os.path.exists(save_path) and not overwrite:
                exists_files.append(filename)
                continue
            file.save(save_path)
            saved_files.append(filename)
    if exists_files and not overwrite:
        return jsonify({'exists': exists_files, 'uploaded': saved_files}), 409
    return jsonify({'uploaded': saved_files}), 200

def create_sprite_sheet(image_files, output_path):
    '''여러 이미지를 세로 1줄 sprite sheet로 합치고 저장'''
    images = [Image.open(f) for f in image_files]
    if not images:
        return None, None, None
    widths, heights = zip(*(img.size for img in images))
    max_width = max(widths)
    total_height = sum(heights)
    sheet = Image.new('RGBA', (max_width, total_height))
    y_offset = 0
    frame_sizes = []
    for img in images:
        sheet.paste(img, (0, y_offset))
        frame_sizes.append({'width': img.width, 'height': img.height})
        y_offset += img.height
    sheet.save(output_path)
    return len(images), frame_sizes, images[0].size if images else (0, [], (0,0))

@app.route('/api/projects/<int:project_id>/upload/sequence', methods=['POST'])
def upload_sequence(project_id):
    # 시퀀스 폴더(여러 이미지) 업로드: form-data로 files[], sequence_name
    sequence_name = request.form.get('sequence_name', 'sequence')
    files = request.files.getlist('files')
    if not files:
        return jsonify({'error': 'No files part'}), 400
    sequence_path = os.path.join(basedir, '..', 'projects', str(project_id), 'library', 'sequences', safe_unicode_filename(sequence_name))
    os.makedirs(sequence_path, exist_ok=True)
    temp_frame_paths = []
    overwrite = request.form.get('overwrite', 'false').lower() == 'true'
    for file in files:
        if file and allowed_image_file(file.filename):
            filename = safe_unicode_filename(file.filename)
            if not filename:
                continue
            save_path = os.path.join(sequence_path, filename)
            if os.path.exists(save_path) and not overwrite:
                continue
            file.save(save_path)
            temp_frame_paths.append(save_path)
    if not temp_frame_paths:
        return jsonify({'error': 'No valid images uploaded'}), 400
    # sprite sheet 생성
    sprite_path = os.path.join(sequence_path, 'sprite.png')
    frame_count, frame_sizes, (frame_w, frame_h) = create_sprite_sheet(temp_frame_paths, sprite_path)
    # 메타데이터 저장
    meta = {
        'name': sequence_name,
        'sprite': 'sprite.png',
        'frame_count': frame_count,
        'frame_width': frame_w,
        'frame_height': frame_h,
        'frame_sizes': frame_sizes,
        'original_filenames': [os.path.basename(p) for p in temp_frame_paths]
    }
    with open(os.path.join(sequence_path, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    # 원본 프레임 삭제 (sprite, meta 제외)
    for p in temp_frame_paths:
        if os.path.exists(p):
            os.remove(p)
    return jsonify({'uploaded': ['sprite.png', 'meta.json'], 'sequence': sequence_name, 'meta': meta}), 200

@app.route('/api/projects/<int:project_id>/library/images', methods=['GET'])
def list_project_images(project_id):
    images_path = os.path.join(basedir, '..', 'projects', str(project_id), 'library', 'images')
    if not os.path.exists(images_path):
        return jsonify([])
    files = [f for f in os.listdir(images_path) if os.path.isfile(os.path.join(images_path, f))]
    return jsonify(files)

@app.route('/api/projects/<int:project_id>/library/sequences', methods=['GET'])
def list_project_sequences(project_id):
    sequences_path = os.path.join(basedir, '..', 'projects', str(project_id), 'library', 'sequences')
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

@app.route('/projects/<int:project_id>/library/images/<path:filename>')
def serve_project_image(project_id, filename):
    # URL 디코딩
    decoded_filename = unquote(filename)
    images_path = os.path.join(basedir, '..', 'projects', str(project_id), 'library', 'images')
    return send_from_directory(images_path, decoded_filename)

@app.route('/projects/<int:project_id>/library/sequences/<path:sequence_and_filename>')
def serve_project_sequence_frame(project_id, sequence_and_filename):
    # sequence_and_filename: '시퀀스명/프레임파일명.png'
    decoded_path = unquote(sequence_and_filename)
    sequences_path = os.path.join(basedir, '..', 'projects', str(project_id), 'library', 'sequences')
    return send_from_directory(sequences_path, decoded_path)

# --- Main Entry Point ---

# Railway에서 작동하도록 전역에서 초기화
with app.app_context():
    init_db()

# Railway에서 app 객체를 인식할 수 있도록
application = app

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=False)

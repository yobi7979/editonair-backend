#!/usr/bin/env python3
import os
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

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

# Initialize extensions
db = SQLAlchemy(app)

# Simple User model
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    def __repr__(self):
        return f'<User {self.username}>'

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
        # Test database connection
        user_count = User.query.count()
        return jsonify({
            "status": "success",
            "message": "Database connection successful",
            "user_count": user_count
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Database error: {str(e)}"
        }), 500

if __name__ == '__main__':
    with app.app_context():
        try:
            db.create_all()
            print("Database tables created successfully")
        except Exception as e:
            print(f"Error creating database tables: {e}")
    
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting app on port {port}")
    app.run(debug=False, host='0.0.0.0', port=port) 
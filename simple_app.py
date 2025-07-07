#!/usr/bin/env python3
import os
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/health')
def health_check():
    return jsonify({"status": "healthy", "message": "Simple app is working"}), 200

@app.route('/')
def home():
    return jsonify({"message": "EditOnAir Backend API", "status": "running"}), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting simple app on port {port}")
    app.run(debug=False, host='0.0.0.0', port=port) 
#!/usr/bin/env python3
"""
SQLite에서 PostgreSQL로 데이터 마이그레이션 스크립트
"""

import os
import sqlite3
import psycopg2
from urllib.parse import urlparse
from datetime import datetime

def get_database_url():
    """데이터베이스 URL 가져오기"""
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        db_url = 'postgresql://postgres:postgres@localhost:5432/editor'
    return db_url

def connect_postgres():
    """PostgreSQL 데이터베이스 연결"""
    db_url = get_database_url()
    parsed = urlparse(db_url)
    
    conn = psycopg2.connect(
        dbname=parsed.path[1:],
        user=parsed.username,
        password=parsed.password,
        host=parsed.hostname,
        port=parsed.port or 5432
    )
    return conn

def connect_sqlite():
    """SQLite 데이터베이스 연결"""
    db_path = os.path.join(os.path.dirname(__file__), 'editor_data.db')
    return sqlite3.connect(db_path)

def migrate_users():
    """사용자 데이터 마이그레이션"""
    sqlite_conn = connect_sqlite()
    pg_conn = connect_postgres()
    
    try:
        # SQLite에서 사용자 데이터 읽기
        sqlite_cur = sqlite_conn.cursor()
        sqlite_cur.execute('SELECT id, username, password_hash, email FROM users')
        users = sqlite_cur.fetchall()
        
        # PostgreSQL에 사용자 데이터 삽입
        pg_cur = pg_conn.cursor()
        for user in users:
            pg_cur.execute(
                'INSERT INTO users (id, username, password_hash, email) VALUES (%s, %s, %s, %s)',
                user
            )
        
        pg_conn.commit()
        print(f'Migrated {len(users)} users')
        
    finally:
        sqlite_conn.close()
        pg_conn.close()

def migrate_projects():
    """프로젝트 데이터 마이그레이션"""
    sqlite_conn = connect_sqlite()
    pg_conn = connect_postgres()
    
    try:
        # SQLite에서 프로젝트 데이터 읽기
        sqlite_cur = sqlite_conn.cursor()
        sqlite_cur.execute('SELECT id, name, created_at, updated_at FROM projects')
        projects = sqlite_cur.fetchall()
        
        # PostgreSQL에 프로젝트 데이터 삽입
        pg_cur = pg_conn.cursor()
        for project in projects:
            # 기본 사용자를 소유자로 설정
            pg_cur.execute('''
                INSERT INTO projects (id, name, created_at, updated_at, user_id)
                VALUES (%s, %s, %s, %s, 1)
            ''', project)
            
            # 프로젝트 권한 추가
            pg_cur.execute('''
                INSERT INTO project_permissions (project_id, user_id, permission_type)
                VALUES (%s, 1, 'owner')
            ''', (project[0],))
        
        pg_conn.commit()
        print(f'Migrated {len(projects)} projects')
        
    finally:
        sqlite_conn.close()
        pg_conn.close()

def migrate_scenes():
    """씬 데이터 마이그레이션"""
    sqlite_conn = connect_sqlite()
    pg_conn = connect_postgres()
    
    try:
        # SQLite에서 씬 데이터 읽기
        sqlite_cur = sqlite_conn.cursor()
        sqlite_cur.execute('SELECT id, project_id, name, data FROM scenes')
        scenes = sqlite_cur.fetchall()
        
        # PostgreSQL에 씬 데이터 삽입
        pg_cur = pg_conn.cursor()
        for scene in scenes:
            pg_cur.execute(
                'INSERT INTO scenes (id, project_id, name, data) VALUES (%s, %s, %s, %s)',
                scene
            )
        
        pg_conn.commit()
        print(f'Migrated {len(scenes)} scenes')
        
    finally:
        sqlite_conn.close()
        pg_conn.close()

def migrate_all():
    """전체 데이터 마이그레이션 실행"""
    print('Starting migration...')
    print(f'Target database: {get_database_url()}')
    
    # 순서대로 마이그레이션 실행
    migrate_users()
    migrate_projects()
    migrate_scenes()
    
    print('Migration completed successfully')

if __name__ == '__main__':
    migrate_all() 
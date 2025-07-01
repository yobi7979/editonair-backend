#!/usr/bin/env python3
"""
SQLite에서 PostgreSQL로 데이터 마이그레이션 스크립트
"""

import os
import sys
import json
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# 현재 디렉토리를 Python 경로에 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import app, db, Project, Scene, Object

def migrate_data():
    """SQLite 데이터를 PostgreSQL로 마이그레이션"""
    
    # SQLite 연결 (기존 DB)
    sqlite_engine = create_engine('sqlite:///editor_data.db')
    SQLiteSession = sessionmaker(bind=sqlite_engine)
    sqlite_session = SQLiteSession()
    
    # PostgreSQL 연결 (새 DB)
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("DATABASE_URL 환경변수가 설정되지 않았습니다.")
        return False
    
    # Railway PostgreSQL URL을 SQLAlchemy 형식으로 변환
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    
    postgres_engine = create_engine(database_url)
    PostgresSession = sessionmaker(bind=postgres_engine)
    postgres_session = PostgresSession()
    
    try:
        # PostgreSQL에서 테이블 생성
        with app.app_context():
            db.create_all()
        
        print("PostgreSQL 테이블 생성 완료")
        
        # SQLite에서 데이터 읽기
        print("SQLite에서 데이터 읽는 중...")
        
        # Projects
        projects = sqlite_session.execute(text("SELECT * FROM project")).fetchall()
        print(f"Found {len(projects)} projects")
        
        for project_row in projects:
            # PostgreSQL에 프로젝트 삽입
            new_project = Project(
                id=project_row.id,
                name=project_row.name,
                created_at=project_row.created_at,
                updated_at=project_row.updated_at
            )
            postgres_session.add(new_project)
        
        # Scenes
        scenes = sqlite_session.execute(text("SELECT * FROM scene")).fetchall()
        print(f"Found {len(scenes)} scenes")
        
        for scene_row in scenes:
            new_scene = Scene(
                id=scene_row.id,
                name=scene_row.name,
                order=scene_row.order,
                project_id=scene_row.project_id,
                created_at=scene_row.created_at,
                updated_at=scene_row.updated_at
            )
            postgres_session.add(new_scene)
        
        # Objects
        objects = sqlite_session.execute(text("SELECT * FROM object")).fetchall()
        print(f"Found {len(objects)} objects")
        
        for object_row in objects:
            new_object = Object(
                id=object_row.id,
                name=object_row.name,
                type=object_row.type,
                order=object_row.order,
                properties=object_row.properties,
                in_motion=object_row.in_motion,
                out_motion=object_row.out_motion,
                timing=object_row.timing,
                scene_id=object_row.scene_id,
                created_at=object_row.created_at,
                updated_at=object_row.updated_at,
                locked=getattr(object_row, 'locked', False),
                visible=getattr(object_row, 'visible', True)
            )
            postgres_session.add(new_object)
        
        # 변경사항 커밋
        postgres_session.commit()
        print("데이터 마이그레이션 완료!")
        
        # 결과 확인
        project_count = postgres_session.query(Project).count()
        scene_count = postgres_session.query(Scene).count()
        object_count = postgres_session.query(Object).count()
        
        print(f"마이그레이션 결과:")
        print(f"- Projects: {project_count}")
        print(f"- Scenes: {scene_count}")
        print(f"- Objects: {object_count}")
        
        return True
        
    except Exception as e:
        print(f"마이그레이션 중 오류 발생: {e}")
        postgres_session.rollback()
        return False
    
    finally:
        sqlite_session.close()
        postgres_session.close()

if __name__ == "__main__":
    if migrate_data():
        print("마이그레이션이 성공적으로 완료되었습니다!")
    else:
        print("마이그레이션에 실패했습니다.")
        sys.exit(1) 
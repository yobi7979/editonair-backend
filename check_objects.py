from app import app, db, Project, Scene, Object
import json

def check_objects():
    with app.app_context():
        # 모든 프로젝트 확인
        projects = Project.query.all()
        print("데이터베이스의 모든 프로젝트:")
        for project in projects:
            print(f"- {project.name} (ID: {project.id})")
        
        # 모든 씬 확인
        scenes = Scene.query.all()
        print("\n데이터베이스의 모든 씬:")
        for scene in scenes:
            print(f"- {scene.name} (ID: {scene.id}, 프로젝트: {scene.project_id})")
        
        # Scene 4 찾기
        scene = Scene.query.filter_by(name='Scene 4').first()
        if not scene:
            print("Scene 4를 찾을 수 없습니다.")
            return

        # Scene 4의 모든 텍스트 객체 확인
        print(f"\nScene 4의 모든 텍스트 객체:")
        for obj in scene.objects:
            if obj.type == 'text':
                print(f"\n객체 ID: {obj.id}")
                print(f"이름: {obj.name}")
                print(f"내용: {json.loads(obj.properties)['content'] if obj.properties else '없음'}")
                print(f"속성: {json.loads(obj.properties) if obj.properties else '없음'}")

if __name__ == '__main__':
    check_objects() 
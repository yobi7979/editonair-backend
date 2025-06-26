from app import db, User
from werkzeug.security import generate_password_hash

username = 'admin'
password = 'admin1234'  # 원하는 비밀번호로 변경 가능

if not User.query.filter_by(username=username).first():
    admin = User(username=username, password_hash=generate_password_hash(password), is_admin=True)
    db.session.add(admin)
    db.session.commit()
    print('관리자 계정 생성 완료')
else:
    print('이미 해당 아이디가 존재합니다.') 
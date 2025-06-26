#!/bin/bash
# 백엔드 폴더로 이동 후 git add, commit, push를 자동으로 실행하는 스크립트

# 스크립트 위치(backend 폴더)로 이동
cd "$(dirname "$0")"

git add .
now=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "자동 커밋: $now"
git push

echo "백엔드 코드가 깃허브에 푸시되었습니다!" 
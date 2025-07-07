@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

:: 백엔드 코드를 안전하게 GitHub에 푸시하는 배치 스크립트
echo [36m백엔드 코드 GitHub 푸시 스크립트[0m
echo.

:: Git 저장소 초기화 (없는 경우)
if not exist .git (
    echo [36mGit 저장소 초기화...[0m
    git init
    git remote add origin https://github.com/yobi7979/editonair-backend.git
)

:: Python 캐시 파일 제거
echo [36mPython 캐시 파일을 제거합니다...[0m
for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d"
del /s /q *.pyc 2>nul

:: 변경된 파일 확인
echo.
echo [36m변경된 파일 목록:[0m
git status --porcelain

:: 커밋 메시지 입력받기
echo.
set /p commit_msg="커밋 메시지를 입력하세요 (기본: 자동 커밋): "
if "!commit_msg!"=="" (
    for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
    set commit_msg=자동 커밋: !datetime:~0,4!-!datetime:~4,2!-!datetime:~6,2! !datetime:~8,2!:!datetime:~10,2!:!datetime:~12,2!
)

:: 변경사항 커밋 및 푸시
git add .
git commit -m "!commit_msg!"

:: main 브랜치로 강제 푸시
echo [33mmain 브랜치로 강제 푸시를 실행합니다...[0m
git push -f origin main

if !errorlevel! equ 0 (
    echo.
    echo [32m백엔드 코드가 성공적으로 깃허브에 푸시되었습니다![0m
    echo [36mRailway 배포가 자동으로 시작됩니다. Railway 대시보드에서 배포 상태를 확인하세요.[0m
) else (
    echo.
    echo [31m오류: GitHub 푸시 중 문제가 발생했습니다.[0m
)

echo.
echo [90m아무 키나 누르면 종료됩니다...[0m
pause > nul 
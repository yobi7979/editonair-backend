# 프로젝트 백업 및 복구 가이드

## 1. 백업 방법

### 1-1. 수동 백업
1. PowerShell을 관리자 권한으로 실행합니다.
2. 프로젝트 루트(`graphics-editor`)로 이동합니다.
3. 다음 명령어를 실행합니다:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; ./backup.ps1 | Tee-Object -FilePath backup.log
   ```
   - `backups/` 폴더에 날짜별로 백업이 생성됩니다.
   - 실행 로그는 `backup.log` 파일에 저장됩니다.

### 1-2. 백업 내용
- `src/` : 프론트엔드 소스코드
- `backend/` : 백엔드 소스코드 및 DB 백업 스크립트
- `package.json`, `package-lock.json`, `backend/requirements.txt` : 의존성 파일
- 주요 설정 파일(`vite.config.js`, `tailwind.config.js` 등)
- `README.md` 등 문서
- (존재할 경우) `backend/instance/graphics_editor.db` : SQLite 데이터베이스 파일

### 1-3. 주의사항
- **SQLite DB 파일**은 서버가 실행 중일 때 백업하면 손상될 수 있으니, 가능하면 서버를 중지 후 백업하세요.
- DB 파일이 없으면 DB 백업은 건너뜁니다.

---

## 2. 복구 방법

### 2-1. 전체 복구
1. 원하는 백업 폴더(예: `backups/20250618_101243/`)의 내용을 프로젝트 루트에 덮어씁니다.
   - 기존 파일을 모두 삭제 후 복사하는 것이 안전합니다.
2. (DB 복구가 필요하다면) `backend/instance/graphics_editor.db` 파일도 함께 복사합니다.
3. 의존성 설치:
   - 프론트엔드:
     ```bash
     npm install
     ```
   - 백엔드:
     ```bash
     pip install -r backend/requirements.txt
     ```
4. 서버를 재시작합니다.

### 2-2. 부분 복구
- 소스코드, 설정, DB 등 필요한 부분만 개별적으로 복사해도 됩니다.

---

## 3. 백업 로그 관리
- 백업 실행 시 `backup.log` 파일에 로그를 저장하면, 백업 성공/실패 내역을 추적할 수 있습니다.
- 예시:
  ```powershell
  ./backup.ps1 | Tee-Object -FilePath backup.log
  ```
- 로그 파일은 필요에 따라 별도 보관하거나, 주기적으로 정리하세요.

---

## 4. 기타
- 자동화, 원격 백업, 추가 보안 등 고급 백업이 필요하다면 별도 스크립트/도구를 활용하세요. 
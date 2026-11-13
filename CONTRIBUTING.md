# 개발 참여 안내

## 처음 실행

팀 개발 버전은 Node.js **24.22.3**으로 고정했습니다. `.nvmrc`가 버전의 기준 파일입니다. Python이나 가상환경, API 키, 데이터베이스 설정은 필요하지 않습니다.

```sh
npm ci
npm start
```

`http://localhost:8081`을 Chrome에서 엽니다. 포트가 사용 중이면 `npm start -- 9000`처럼 다른 포트를 선택하세요. nvm을 사용한다면 먼저 `nvm install`, `nvm use`를 실행합니다. Windows에서는 [nvm-windows](https://github.com/nvm-windows/nvm)를 설치한 뒤 다음 명령을 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\use-node.ps1
npm.cmd ci
npm.cmd run doctor
npm.cmd start
```

Windows용 스크립트는 작업 폴더와 무관하게 저장소의 `.nvmrc`를 읽고, 설치·버전 전환 실패나 PATH의 다른 Node 설치가 우선하는 경우 오류를 표시합니다. 실행 정책 우회는 해당 프로세스에만 적용됩니다. nvm-windows 없이 동일 버전을 직접 설치해도 됩니다.

모든 OS에서 `npm run doctor`로 정확한 팀 버전인지 확인할 수 있습니다. `npm start`와 `npm run dev`도 같은 확인을 자동 수행하며 버전이 다르면 전환 방법을 안내하고 중단합니다. Windows에서는 실행 정책에 따라 `npm.ps1` 대신 `npm.cmd`를 사용하면 됩니다. 고정 버전을 바꿀 때는 `.nvmrc`를 수정하고 `npm ci`, 단위·브라우저 테스트를 다시 확인합니다. `.gitattributes`는 소스 줄바꿈과 모델·WASM 바이너리 처리를 통일합니다.

## 검증

```sh
npm test
```

단위 테스트에는 실제 장치나 브라우저 설치가 필요하지 않습니다.

브라우저 검증은 CI에서 실행하지 않고 로컬에서 수행합니다. 처음 실행할 때만 Chromium을 설치합니다.

```sh
npm run setup:browser
npm run test:browser
```

브라우저 테스트는 임시 포트의 서버를 자동 시작하고 종료합니다. 별도 서버나 Python이 필요하지 않습니다. 결과 이미지는 `.artifacts/`에 저장되며 Git에서 제외됩니다. 실제 카메라·마이크는 가상 입력으로 대체합니다.

필요한 검증만 실행할 수도 있습니다.

```sh
npm run test:browser:review
npm run test:browser:gaze
npm run test:browser:print
```

Linux에서 브라우저 시스템 라이브러리가 없으면 `npx playwright install --with-deps chromium`을 사용합니다. 이미 설치한 Chrome으로 확인하려면 `PLAYWRIGHT_CHANNEL=chrome` 환경변수를 설정하세요. PowerShell에서는 `$env:PLAYWRIGHT_CHANNEL = "chrome"`로 설정한 뒤 검증 명령을 실행합니다. 기본 경로는 Playwright가 설치한 Chromium입니다.

## 변경 위치

| 작업 | 파일 |
|---|---|
| 개인별 시선·음성 기준 | `js/config.js`, `js/analysis/` |
| 장치 접근 | `js/sensors/` |
| 화면 흐름·기록·복기 | `js/ui/`, `js/media-recorder.js` |
| 디자인 토큰·배치 | `css/tokens.css`, `css/app.css` |
| 재사용 UI | `js/ui/components.js`, `/styleguide.html` |
| 개발 서버 | `scripts/serve.mjs` |

측정값은 사용자의 관찰을 돕기 위한 정보입니다. 자동 수행 점수·등급·칭찬·행동 권고나 외부 평가 기능을 추가하지 않습니다. 영상·음성·메모는 외부 서비스로 전송하지 않습니다.

## PR 전 확인

1. 변경 이유와 실제 동작 차이를 설명합니다.
2. 계산·센서·기록 변경은 관련 회귀 테스트를 추가하고 `npm test`를 실행합니다.
3. 화면 변경은 데모와 작은 화면을 확인하고 관련 브라우저 검증을 로컬에서 실행합니다.
4. `vendor/`의 모델·WASM·CSS는 실행에 필요하므로 저장소에 포함합니다. 교체 시 출처·버전·라이선스도 확인합니다.
5. 패키지를 변경하면 `package.json`과 `package-lock.json`을 함께 커밋합니다. 설치된 `node_modules/`, `.venv/`, `.artifacts/`, 개인 환경변수 파일은 커밋하지 않습니다.

GitHub Actions는 Ubuntu와 Windows 모두에서 `.nvmrc`의 동일한 버전으로 환경 확인과 단위 테스트만 수행합니다. Windows에서는 PowerShell 스크립트의 버전 확인 경로도 검증합니다. 브라우저 검증은 로컬에서 수행하며, 실제 카메라의 인식 정확도는 사용자가 별도로 확인해야 합니다.

## Python 서버를 쓰고 싶은 경우

기존 `scripts/serve.py`도 남아 있습니다. Python 표준 라이브러리만 사용하므로 pip 설치나 가상환경이 필요하지 않습니다.

```sh
python3 scripts/serve.py 9000
```

팀 표준 실행 경로는 Node.js의 `npm start`입니다. 향후 Python 외부 패키지가 생기면 그때 별도 의존성 관리와 가상환경 설정을 추가합니다.

# Wayward CloudSave — Google Drive (WML / v0.6.3)

**대상:** Wayward WML  
**버전:** 0.6.3

Google Drive `appDataFolder`에 기존 CloudSave 형식으로 세이브를 저장하는 WML 모드입니다. 0.6.3은 0.6.2의 게임 세이브·암호화·Drive 파일 형식을 그대로 유지하면서 Android 런처와 정적 인증 페이지의 서로 다른 응답 계약을 하나의 검증된 팝업 경로로 연결합니다.

## 인증 구성

- **Android 공식 런처:** 게임 모드는 사용자 클릭 안에서 `window.open()`을 동기 호출합니다. 런처의 document-start `wayward-google-auth-bridge.js`가 `https://jeiky224.github.io/cloud/auth-061.html` 팝업을 가로채 `WMLHost.startGoogleDriveAuthWithPolicy(nonce, forceSelectAccount)`를 호출하고, nonce가 포함된 네이티브 결과를 팝업의 `MessageEvent`로 반환합니다. CloudSave는 이벤트의 정확한 Origin, popup source, 48자리 nonce, 응답 형식과 토큰을 검증합니다. 모드가 WMLHost 인증 API를 직접 호출하거나 결과를 별도 폴링하지 않습니다.
- **일반 브라우저:** 같은 `auth-061.html` 정적 페이지에서 Google Identity Services Token Model을 실행합니다. 이 경로는 version 1 ready/hello 핸드셰이크 후 일회성 `accessToken`을 반환합니다. 0.7.x 페이지 소유 세션 브리지와 혼합하지 않습니다.
- **Drive API:** 게임 페이지가 Google Drive API를 직접 호출합니다. 별도 백엔드, Worker, OAuth Client Secret, Refresh Token 중계는 추가하지 않습니다.
- **토큰:** access token은 현재 페이지 메모리에만 둡니다. URL, localStorage, sessionStorage, 게임 세이브 및 로그에 저장하지 않습니다.

연결되지 않은 상태의 버튼 문구는 **구글 계정으로 연결**입니다. 로그인 유지 설정 UI는 없습니다. 일반 연결은 가능한 범위에서 기존 Google 브라우저 세션과 승인을 재사용하도록 요청합니다. Android 런처의 기존 승인도 사용자가 **구글 계정으로 연결**을 눌렀을 때 확인하므로, 모드 창을 여는 순간 별도 네이티브 인증 작업을 시작해 사용자 클릭과 경쟁하지 않습니다.

브라우저의 GIS Token Model access token은 장기 로그인 토큰이 아닙니다. 브라우저 세션이 유지되더라도 토큰 만료 후에는 사용자 동작을 통한 새 토큰 발급이 필요할 수 있습니다.

## 로그아웃

- 로그아웃은 메모리 access token과 Android 런처의 해당 토큰 캐시를 정리하고, 명시적 로그아웃 표식을 남깁니다.
- 다음 연결은 웹에서 `prompt: 'select_account'`, Android 런처에서 `forceSelectAccount=true`를 요청합니다.
- 일반 로그아웃은 Google 앱 권한 철회와 다릅니다. 권한 철회는 별도 동작이며, 철회 성공 응답을 확인하지 못하면 성공으로 표시하지 않습니다.
- 로그아웃 표식과 이전 연결 표식에는 비밀이 아닌 상태값만 저장합니다. localStorage를 사용할 수 없으면 sessionStorage를 시도합니다. 두 저장소가 모두 차단된 환경에서는 현재 실행 중 메모리 상태만 보장할 수 있습니다.

## 지원 환경과 제한

인증 페이지는 HTTPS GitHub Pages에서 실행되고, 게임 창과 일회성 nonce를 확인한 뒤 토큰을 반환합니다.

- HTTP: localhost, 127.0.0.1, 0.0.0.0, LAN IP
- HTTPS: 일반 브라우저 및 지원되는 Android WebView
- `file://`: opaque Origin(`null`)을 대상으로 할 때만 메시지 targetOrigin을 제한적으로 `*`로 사용합니다. 인증 페이지는 opener Window, 실제 메시지 Origin, nonce, 메시지 종류와 응답 형식을 함께 검증합니다. 브라우저가 팝업 또는 opener 통신을 차단하면 성공으로 처리하지 않고 오류와 재시도 안내를 표시합니다.

지원 완료 여부는 브라우저·Android 기기별 실환경 테스트 결과로 별도 판정해야 합니다. 자동 테스트는 실제 Google 계정 인증, 권한 동의, 팝업 정책, Drive 요청을 대신하지 않습니다.

## 저장목록 성능

목록 표시는 저장 파일 본문을 다운로드하거나 복호화하지 않습니다.

- 계정 식별용 Drive `about.get(fields=user(permissionId))`와 슬롯 목록 `files.list`를 병렬 실행합니다.
- `files.list`는 `appDataFolder`, `trashed=false`, 파일명 prefix 조건, 최소 메타데이터 필드를 사용하고 pageSize 1000으로 요청합니다.
- 목록 캐시는 Drive `permissionId`의 SHA-256 키로 계정별 분리합니다. 파일 ID·이름·수정 시각·크기와 CloudSave 전용 `appProperties`의 요약·메모 존재 여부만 저장합니다. 평문 메모 미리보기는 브라우저의 영구 캐시에 기록하지 않습니다.
- 캐시가 있으면 현재 연결 계정의 permissionId를 확인한 뒤 먼저 표시하고, 최신 Drive 목록으로 갱신합니다. localStorage가 막히면 sessionStorage, 둘 다 사용할 수 없으면 현재 페이지 메모리 캐시로 동작합니다.
- 전체 목록에서 파일 본문을 일괄 다운로드하지 않습니다. 기존 메모를 보존하기 위한 덮어쓰기 또는 실제 불러오기에서 사용자가 선택한 단일 슬롯만 읽습니다.
- 목록 요청은 동일 계정에서 병합하고, 로그아웃·계정 변경 시 이전 요청을 abort/generation으로 무효화합니다.

콘솔의 `[Wayward CloudSave] metadata list metrics`에는 API 호출 수, 응답 바이트, Drive 요청 시간, JSON 파싱 시간, 슬롯 수, 본문 다운로드 수, 복호화 시간, 캐시 첫 표시 시간, 전체 표시 시간, 렌더링 시간이 기록됩니다.


## 세이브 정보와 메모

- 저장 버튼을 누른 시점의 게임 네이티브 세이브 스냅샷을 기준으로 표시 제목을 생성합니다. 게임 `state`와 네이티브 `modData`를 함께 탐색하므로 특정 대형 모드 ID나 단일 데이터 구조를 하드코딩하지 않습니다.
- 진행일, 재화, 활성 캐릭터 이름, 단계·챕터·관계도 등 실제 스냅샷에 존재하는 의미 있는 필드를 자동 탐색합니다. 존재하지 않는 항목은 임의의 기본값으로 만들지 않습니다.
- 예시 표시: `히나 진행일: 12 · 98골드 · 하녀 출신`. 날짜와 시각은 Drive의 실제 수정 시각을 원본 로컬 세이브와 같은 한국어 오전/오후 형식으로 표시합니다.
- 요약과 짧은 메모 미리보기는 해당 CloudSave 앱만 읽을 수 있는 Drive `appProperties`에 저장합니다. 전체 메모 본문은 계속 암호화된 세이브 스냅샷 안에 보존합니다.
- 저장목록에서는 암호화된 세이브 본문을 일괄 다운로드하지 않습니다. 제목 옆 `[메모 내용]`을 누르면 해당 슬롯 하나만 다운로드·복호화하여 전체 메모를 게임 내 팝업으로 표시합니다.
- 이전 버전에서 만들어 `appProperties`가 없는 저장도 `[메모 보기]`로 열 수 있습니다. 해당 메모를 열면 그 슬롯의 요약 메타데이터를 보충 저장해 다음 목록부터 표시합니다.
- 메모 미리보기는 Drive 앱 전용 메타데이터에만 두고 브라우저의 영구 로컬 메타데이터 캐시에는 남기지 않습니다.


## 세이브 호환성

- Google Drive 경로: 기존 `appDataFolder`
- 파일명 및 슬롯 ID: 기존 `wayward-cloud-slot-{slot}.json`
- 기존 JSON envelope, AES-256-GCM 암호화·복호화, 스냅샷 직렬화 및 게임 복원 흐름 유지
- `crypto.js`는 0.6.1 기준 파일과 바이트 단위로 동일하게 유지
- 새 저장, 덮어쓰기, 선택 슬롯 불러오기, 삭제는 기존 API와 파일 구조 사용

자동 암호화에 내장된 키는 공개 모드 소스에서 추출 가능하므로 강한 기밀성의 근거로 취급하지 마세요. 이전 passphrase 방식 저장 파일은 저장 당시 비밀번호가 필요할 수 있습니다.

## 설치

1. 배포된 `cloud-save` 폴더를 게임의 `wml/mods/` 안에 복사합니다.
2. `wml/mods/mods.js`의 `WML.enable([...])`에 `"cloud-save"`가 있는지 확인합니다. 없을 때만 기존 항목을 보존해 추가합니다.
3. `crypto.js`, `mod.js`, `README.md`, `INSTALL.txt`가 같은 `cloud-save` 폴더에 있어야 합니다.
4. 최신 공식 Android 런처는 위의 네이티브 인증 인터페이스를 제공합니다. 해당 메서드가 없는 환경은 브라우저 GIS 경로를 시도합니다.
5. 모드를 다시 로드하고 **클라우드세이브 (Google Drive)** 를 엽니다.

실제 Google 실계정 인증·Drive save/load·Android·브라우저 매트릭스 테스트 결과는 배포 전 별도 검증 보고서에서 확인하세요.

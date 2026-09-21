# Verse8 에디터·배포 규칙

GitLab `develop`에 푸시한 코드는 **Verse8 에디터에서 곧바로, 어느 컴퓨터에서나** 떠야 한다. 2026-09-18에 겪은 문제와
해결책을 정리했다. 사람이든 AI든 이 저장소에서 작업하기 전에 읽는다.

## 저장소 구조

| 원격 | 브랜치 | 용도 |
|---|---|---|
| `origin` (GitHub, **공개**) | `master` | 실제 작업 기록 |
| `gitlab` (gitlab.verse8.io/anjshdkdl99/traitor-hunt) | `develop` | Verse8 배포용. **푸시하면 자동 배포**된다 |

- 작업은 `master`에서 하고, 끝날 때마다 `master`를 로컬 `develop`에 병합해 두 곳에 푸시한다. 직접 배포(`@agent8/deploy`)는 하지 않는다.
- `develop`은 처음에 Verse8 템플릿에서 시작해 `master`와 공통 기록이 없었다(첫 병합에 `--allow-unrelated-histories`). **강제 푸시 금지. `develop`을 `master`에 병합하지 않는다.**
- 게임 에셋(`public/assets/models/*.glb`, `public/assets/ui/`)은 **`develop`에만** 커밋한다. GitHub는 공개라서 Unity 에셋 약관(파일 자체 재배포 금지) 때문에 `master`에서는 무시한다. `master`에서 에셋을 추가·변경하면 같은 푸시에서 `develop`에도 넣는다.

### 새 컴퓨터에서 설정

```bash
git remote add gitlab https://oauth2:<GitLab 토큰>@gitlab.verse8.io/anjshdkdl99/traitor-hunt.git
git fetch gitlab
git branch develop gitlab/develop
# master 작업 폴더에서도 게임이 돌도록 에셋만 꺼내 온다 (master에서는 무시되는 파일이라 커밋되지 않는다)
git checkout gitlab/develop -- public/assets/models public/assets/ui
git restore --staged public/assets
```

토큰은 `.git/config`의 원격 주소에만 둔다. 파일·문서·커밋에 쓰지 않는다.

## 푸시 전 점검표

1. 커밋 **직전에** `npx tsc -b`, `npx vitest run`, `npm run server:test`. (`tests/`는 DOM 타입이 없는 설정으로도 검사된다.)
2. `develop`에서 `git ls-files -o -i --exclude-standard`: 게임이 불러오는 파일이 무시되고 있으면 안 된다.
3. `master`를 `develop`에 병합하고, **`develop`만 체크아웃한 깨끗한 폴더**(`git worktree`)에서 `npx vite build`와 `npx tsc -b`.
   `dist/assets/models`에 매니페스트의 GLB가 모두 있고 `dist/index.html`에 `GAME_SIZE_RESPONSE`가 있는지 본다.
4. 푸시하고 에디터를 열어 새로고침한다(에디터를 열어야 새 코드를 받아 오는 것으로 보인다). 미리보기 주소에서 콘솔 오류가 없고,
   메뉴가 보이고, `/src/main.tsx`가 `/src/index.css?v=…`를 불러오고, 문서 스크롤 크기가 화면 크기와 같은지 확인한다.

## 지우면 안 되는 것

- `.agent8.lock`, `.env`: Verse8 프로젝트 ID(공개 정보). 바꾸면 배포된 게임과 서버 데이터에서 끊긴다.
- `index.html`
  - 에디터가 보내는 `REQUEST_GAME_SIZE`에 `GAME_SIZE_RESPONSE`로 답하는 스크립트(템플릿에 있던 것. 크기가 바뀔 때만 보고).
  - React가 뜨기 전 로딩 화면.
  - 16:9 무대와 캔버스 크기를 정하는 인라인 CSS: `index.css`가 늦거나 없어도 캔버스가 무한히 커지지 않게 한다.
- `src/main.tsx`: `import "./storageFallback"`을 **가장 먼저**, 앱 전체를 `ErrorBoundary`로 감싼다.
  에디터는 다른 사이트 안의 iframe이라 localStorage가 막힐 수 있는데, `@agent8/gameserver`는 불러오는 순간 localStorage를 건드려 앱이 뜨기도 전에 죽는다.
- `vite.config.ts`
  - `cssCacheBust()` 플러그인: 에디터 컨테이너는 **`.css`를 4시간 캐시**(`Cache-Control: max-age=14400`)해서, 템플릿 시절 CSS를 캐시한 브라우저에선 스타일 없이 검은 화면이 떴다. 개발 서버에서 CSS 주소에 수정 시각을 붙인다.
  - `resolve.dedupe`와 `optimizeDeps.include`(React와 SDK), `base: "./"`, 에셋 폴더 감시 제외.
- Verse8 템플릿의 Tailwind/PostCSS 설정은 넣지 않는다(`postcss.config.js`가 빌드를 깬다).
- 템플릿과 병합할 때 "우리 것"을 통째로 택하지 않는다. 템플릿의 플랫폼 연결 부분을 지킨다.

## 서버

- 공식 문서(docs.verse8.io/docs/gameserver/sdk/structuredProject): `server/src/server.ts` 구조를 지원한다.
  푸시하면 플랫폼이 `server/dist/server.js`로 빌드해 배포한다. 루트에 `server.js`가 있으면 그쪽이 우선한다.
- 플랫폼은 `npm run build`를 돌리고 `dist/`를 올린다.

## 미리보기가 깨졌을 때

1. 에디터 미리보기 주소(`https://agent8-container-….agent8.verse8.net`)를 직접 열어 콘솔과 네트워크를 본다.
2. 사용자가 보낸 화면과 똑같이 재현한다(스타일 제거, 창 크기, 새로고침). 2026-09-18의 검은 화면은 `index.css`만 빼 보고 재현했다.
3. 같은 사용자의 Verse8 게임과 비교한다: `dungeon-warden`(3D·three.js·React, `vite.config.ts` 주석과 커밋 기록에 에디터 문제가 모두 있다), `Find bug`(`docs/DEPLOY.md`).

## 로컬에서 Verse8 없이 연습 모드 보기

`.env` 때문에 로컬 개발 서버도 Verse8 미리보기 서버에 붙는다. 서버 없이 보려면 `.env.offline.local`에
`VITE_AGENT8_VERSE=`(빈 값)를 두고 `npm run dev -- --mode offline`으로 띄운다(`.claude/launch.json`의 `traitor-hunt-offline`).
이 파일은 `.git/info/exclude`로 로컬에서만 무시한다.

## 저장한 데이터는 모두 공개다

Verse8 클라이언트 SDK의 `subscribeGlobalUserState(account)`와 `subscribeGlobalCollection(id)`는 **계정 ID나 컬렉션
이름만 알면 누구나** 읽는다. 서버 런타임(`@agent8/gameserver-node`)에는 클라이언트가 못 읽는 저장소가 없다.
그래서 `userState`의 친구 목록·초대·마지막 접속 시각, 매치 비밀값 컬렉션 모두 "이름을 못 맞춘다"는 수준의
가림막만 있다. 새 기능에 개인 정보를 넣기 전에 이 점을 감안한다(2026-09-21 확인, 막지 않기로 결정).

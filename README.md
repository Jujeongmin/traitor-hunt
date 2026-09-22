# Grove Hunters (초록숲 사냥꾼)

숲을 무대로 한 웹 MMORPG. 마을에서 시작해 숲 필드 1(무료), 숲 필드 2, 버섯왕의 공터(정식판)로 나아가며 몬스터를
사냥해 레벨을 올린다. 직업 6개, 서버마다 캐릭터 여러 개, 채널당 10명. Verse8 배포 대상,
Vite + React + TypeScript + Three.js. (저장소 이름 `traitor-hunt`는 예전 작업명이다.)

- 기획: [docs/superpowers/specs/2026-09-17-traitor-hunt-design.md](docs/superpowers/specs/2026-09-17-traitor-hunt-design.md)
- 구현 계획: [docs/superpowers/plans/](docs/superpowers/plans/)
- 에셋 출처와 라이선스: [docs/licenses/asset-provenance.md](docs/licenses/asset-provenance.md)

## 현재 상태

Plan 1 완료: 혼자 던전 방을 1인칭으로 걸어다니며 AKM으로 좀비를 쏠 수 있다.
Plan 2 완료: 서버가 4인 매치 규칙(방 찾기, 배신자 배정, 빙의, 연결 대미지, 사격, 탈출, 승패)과 판 결과 기록을 처리한다.
Plan 3 진행 중: 타이틀에서 "연습"을 누르면 봇 3명과 한 판을 할 수 있다(서버 코드를 브라우저 안에서 그대로 돌린다). 온라인 매치는 Verse8 프로젝트 연결 뒤에 열린다.
Plan 4 완료: 시간 제한 없는 협동 모험(룬 조각 → 장치 → 봉인 해제와 몬스터 물결 → 보스 → 탈출), 발판에 모여 배신자를 지목하는 "몸으로 투표", 사람처럼 움직이는 연습 봇.
조작: WASD 이동, 클릭 사격, E 상호작용, F 탈출, 배신자는 Q 빙의 · R 해제.
플레이어 캐릭터는 Adventure Character(코스튬 3종: 탐험가·수색대·복면 대원)에 Human Soldier Animations의 소총 동작을 입혔다.

## 3D 모델은 이 저장소에 없다

게임이 쓰는 모델은 Unity Asset Store 무료 에셋을 변환한 것이고, 에셋 약관이 에셋 파일을 따로 배포하는 것을 금지한다.
그래서 `public/assets/models/*.glb`는 저장소에서 제외되어 있고 목록(`manifest.json`)만 있다. 모델을 만들려면:

1. Unity Asset Store에서 [에셋 목록](docs/licenses/asset-provenance.md)의 에셋을 직접 받아 Unity 프로젝트(`../My project`)에 가져온다.
2. Unity 에디터에서 그 프로젝트를 닫고 `npm run export-glb` (Unity 6000.5.2f1 필요, 결과는 `art-src/_glb`).
3. `npm run models` (결과는 `public/assets/models`).
4. `node scripts/extract-ui.mjs` (UI 조각과 아이콘, 결과는 `public/assets/ui`, 저장소에서 제외).

## 실행

```bash
npm install
npm run dev
```

```bash
npm test
```

서버(Verse8 GameServer, `server/`):

```bash
npm run server:install
npm run server:test
```

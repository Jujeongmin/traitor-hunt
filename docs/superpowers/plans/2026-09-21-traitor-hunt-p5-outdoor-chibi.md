# P5: 야외·치비 전환

결정일 2026-09-21. 연령 등급을 낮추고 흔한 에셋(KayKit) 느낌을 피하려고 화풍과 무대를 바꾼다.

## 결정

| 항목 | 전 | 후 |
|---|---|---|
| 무대 | 지하 유적(벽·천장·횃불) | 야외 필드(숲·바위·절벽이 경계, 하늘·햇빛) |
| 시점 | 1인칭 | 3인칭(어깨 뒤 카메라, 화면 중앙 조준선) |
| 플레이어 | Adventure Character(사실적) | RPG Tiny Hero Duo PBR Polyart (Dungeon Mason) |
| 무기 | AKM | 직업 선택: 마법사(지팡이, 빠르고 약함) / 궁수(활, 느리고 셈) |
| 몬스터 | Zombie(사실적) | Mini Legion Grunt·Footman, 보스 Mini Legion Rock Golem |
| 배경 에셋 | Decrepit Dungeon LITE | Low Poly Environment - Nature Free (Polytope Studio) |

모두 Unity Asset Store 무료, Standard Unity Asset Store EULA. 엔진 제한 없음(2026-09-21 약관 원문 확인).
받은 뒤 패키지 안 readme/LICENSE를 확인해 `docs/licenses/asset-provenance.md`에 적는다.

## 규칙은 그대로

배신자·빙의·투표·목표 단계(열쇠 → 촛대 → 봉인 → 보스 → 탈출)와 서버 권위 구조는 바꾸지 않는다.
격자 맵(`levelLayout.ts`)도 유지한다: `#` 칸은 벽 대신 나무·바위·절벽으로 그리고, 천장을 없앤다.

## 순서

1. 직업 규칙: `PlayerClass`와 무기 수치, 서버가 쏜 사람의 직업으로 피해·연사 간격을 판정. 매치가 자리마다 직업을 싣는다(코스튬과 같은 방식).
2. 3인칭 카메라: 어깨 뒤 카메라, 벽에 걸리면 당겨짐, 조준은 카메라 광선, 내 몸이 보임.
3. 직업 선택 UI: 코스튬 메뉴를 직업·캐릭터 선택으로 바꾼다.
4. (에셋 도착 후) GLB 변환, 캐릭터·몬스터 교체, 애니메이션 이름 연결, 발사체 이펙트(마법탄·화살).
5. (에셋 도착 후) 야외 렌더: 하늘·해·안개, `#` 칸 자연물 배치, 목표물 모델 교체(열쇠·촛대·제단·출구).
6. 음악: 지하 앰비언트 대신 야외 곡으로 교체 검토.

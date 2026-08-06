# 새김 배치도 · 다대포 해변 맥주 축제

하나의 Firebase 프로젝트(`saegim-garden`)에 정적 사이트 3개와 Cloud Functions를 함께 호스팅합니다. 빌드 과정이 필요한 코드는 없습니다 — 각 폴더가 그대로 배포 대상입니다.

| 폴더 | 앱 | Firebase Hosting 타깃 | 배포 URL |
| --- | --- | --- | --- |
| `hosting-editor/` | 배치도 편집기 (주최측) | `app` | `saegim-garden.web.app` |
| `hosting-festival/` | 축제 참가자 앱 | `festival` | `dadaepo-festival.web.app` |
| `hosting-monitor/` | 운영자 실시간 모니터 (공지·일정·참가자 현황) | `monitor` | `saegim-qr.web.app` |
| `functions/` | Cloud Functions (참가자 등록·스탬프 발급) | — | — |
| `legacy-map-viewer/` | 미사용 초기 설계 산출물 (Next.js) | 배포 제외 | — |

## 다대포 해변 맥주 축제 · 해변 가요제 모바일 앱

- 로컬 확인: `cd hosting-festival && python -m http.server 8092`
- Firebase Hosting 타깃: `festival` (`dadaepo-festival.web.app`)
- 비로그인 QR 스탬프 설계: [`docs/festival-login-development-guide.md`](docs/festival-login-development-guide.md)

명세서 기준 1차 참여 흐름은 로그인 화면 없이 Firebase 익명 인증으로 시작합니다. 실제 Firebase UID를 쓰려면 콘솔에서 `Authentication > Sign-in method > Anonymous`를 먼저 켜야 합니다.

## 배포

```bash
npx firebase-tools deploy --only hosting:app        # 배치도 편집기
npx firebase-tools deploy --only hosting:festival   # 참가자 앱
npx firebase-tools deploy --only hosting:monitor    # 운영자 모니터
npx firebase-tools deploy --only firestore:rules    # Firestore 보안 규칙
npx firebase-tools deploy --only functions          # Cloud Functions
```

## legacy-map-viewer

`DESIGN.md`에 적힌 초기 설계(Next.js `/view` 라우트로 지도 뷰어를 만드는 방식)의 산출물입니다. 축제 참가자 앱이 자체 지도 UI를 갖추면서 더 이상 쓰이지 않아 배포 대상에서 제외했습니다. 자세한 내용은 [`legacy-map-viewer/README.md`](legacy-map-viewer/README.md) 참고.

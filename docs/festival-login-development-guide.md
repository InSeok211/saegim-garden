# 다대포 비로그인 QR 스탬프 개발 가이드

이 문서는 `hosting-festival` 모바일 앱을 비로그인 QR 스탬프 구조로 전환하기 위한 개발 기준이다.
기준 문서는 `C:/Users/새김/Downloads/다대포_비로그인_QR스탬프_개발명세서.md`이다.

## 1. 1차 구현 범위

- 로그인, 회원가입, 비밀번호 입력 화면 제거
- 첫 화면은 `스탬프 투어 시작하기` 단일 행동으로 구성
- 내부적으로 Firebase Anonymous Authentication 사용
- Anonymous Auth가 꺼져 있는 로컬 개발 환경에서는 임시 `local-*` UID로 흐름 검증
- 화면 표시 참가번호는 `A00000` 형식으로 표시
- 기존 지도, 스탬프판, QR 스캔 화면은 유지

## 2. 현재 구현 상태

### 완료

- 비로그인 시작 화면
- 익명 참가권 생성 함수 `startAnonymousEntry`
- Firebase 익명 로그인 시도 함수 `ensureAnonymousUser`
- 로컬 개발용 fallback UID
- 참가번호 표시
- 메인 화면의 참여 방식 표시: `비로그인 QR 참여 · Axxxxx`
- 익명 참여 저장 경로 초안: `events/{eventId}/participants/{uid}`

### 아직 Cloud Functions 전 단계

현재 참가번호는 클라이언트에서 임시 산출한다.
운영에서는 Cloud Functions의 `registerParticipant`에서 Firestore Transaction으로 발급해야 한다.

현재 스탬프 저장은 기존 로컬 기록을 유지하면서 Firestore 초안 경로로 동기화만 시도한다.
운영에서는 `claimStamp` 함수에서 QR 토큰, 중복 적립, 완료 처리, 경품 교환권을 검증해야 한다.

## 3. Firebase 콘솔 필수 설정

1. `Authentication > Sign-in method > Anonymous` 사용 설정
2. Firestore 데이터베이스 생성
3. 운영 전 App Check 등록
4. Cloud Functions 리전은 `asia-northeast3`
5. Firestore 리전은 `asia-northeast3`

현재 로컬 검증에서는 Anonymous Auth가 꺼져 있으면 `auth/admin-restricted-operation`이 발생하고, 앱은 로컬 개발용 UID로 진행한다.

## 4. 운영 데이터 모델

```text
events/{eventId}
events/{eventId}/participants/{uid}
events/{eventId}/participants/{uid}/stamps/{pointId}
events/{eventId}/stampPoints/{pointId}
events/{eventId}/rewards/{rewardId}
systemCounters/{eventId}
idempotency/{requestId}
```

## 5. 다음 개발 순서

1. Firebase Anonymous Auth 콘솔에서 켜기
2. `registerParticipant` Cloud Function 추가
3. 참가번호 발급을 클라이언트 임시 산출에서 함수 호출로 교체
4. `claimStamp` Cloud Function 추가
5. QR 스캔 결과를 직접 `addStamp`하지 않고 `claimStamp` 호출로 교체
6. 완료 시 경품 교환권 UI 추가
7. 운영자 경품 지급 화면 추가

## 6. 완료 판단

- 사용자는 로그인 화면 없이 시작한다.
- 새 브라우저에서는 새 익명 참가자가 생성된다.
- 같은 브라우저 재접속 시 같은 참가번호가 유지된다.
- 참가번호 발급 실패가 스탬프판 진입을 막지 않는다.
- 운영 전에는 Cloud Functions가 모든 핵심 쓰기를 통제한다.


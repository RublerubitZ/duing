# 마이페이지 설정(/me/settings) 기능화 설계

- 날짜: 2026-06-15
- 범위: 회원 탈퇴 연결(A) + 알림 설정 정직화(B) + 프로필 수정(이름·전화) + 비밀번호 변경(변경 후 재로그인 강제).

## 목표

대부분 목업이던 `/me/settings`의 핵심 동작을 실제로 만든다. 회원 탈퇴를 기존 백엔드에 연결하고, 동작하지 않는 알림 토글을 정직하게 표기하며, 프로필(이름·전화번호) 수정과 비밀번호 변경 기능을 새로 추가한다.

## 빌드 순서 (PR 분리)

1. **백엔드 PR** — 프로필 수정 + 비밀번호 변경 API
2. **프론트 PR** — `/me/settings` (A 탈퇴 + B 알림정직화 + 프로필수정 UI + 비번변경 UI). 백엔드 PR 머지 후 착수.

## 백엔드 (UserController 자기 수정 엔드포인트)

가입 검증 패턴(`SignupRequest`)을 재사용한다. 두 메서드 모두 `User` 엔티티에 도메인 메서드를 추가하고 `GeneralUserService`(`@Transactional`)에서 호출.

### 1. 프로필 수정 — `PATCH /api/v1/users/me` → 204
- Body `UpdateProfileRequest { name, phone }`.
  - `name`: `@NotBlank @Size(max = 50)`
  - `phone`: `@NotBlank @Pattern("^010-\\d{4}-\\d{4}$")`
- `User.updateProfile(String name, String phone)` 추가 → `userService.updateProfile(UpdateProfileCommand)`.
- 수정 대상은 **이름·전화번호만.** 학번은 불변, 이메일은 가입 인증값이라 변경 시 재인증 플로우 필요 → 범위 밖.

### 2. 비밀번호 변경 — `PATCH /api/v1/users/me/password` → 204
- Body `ChangePasswordRequest { currentPassword, newPassword }`.
  - `currentPassword`: `@NotBlank`
  - `newPassword`: `@NotBlank @Pattern(<가입 비밀번호 정규식>)`
- 절차: `findByIdForUpdate(userId)`(행 잠금, logout/withdraw 와 동일) → `passwordEncoder.matches(current, hash)` 실패 시 `InvalidCurrentPasswordException`(400) → 새 비번이 기존과 같으면(`matches(new, hash)`) `SamePasswordException`(400) → `User.changePassword(encode(new))` → **`User.bumpTokenVersion()`로 발급된 모든 토큰 무효화(변경 후 재로그인 강제).**
- 신규 예외: `UserException.InvalidCurrentPasswordException`(400, "현재 비밀번호가 일치하지 않습니다."), `UserException.SamePasswordException`(400, "새 비밀번호가 기존 비밀번호와 달라야 합니다.").

## 프론트엔드 (`/me/settings`)

`client.users.updateProfile / changePassword / withdraw` + 훅 추가.

- **A 회원 탈퇴:** "회원 탈퇴" → 확인 다이얼로그(되돌릴 수 없음 경고) → `DELETE /users/me` → 성공 시 세션 정리 + React Query 캐시 비우기 + 홈 이동 + 토스트. **회장 409**는 다이얼로그에 메시지 노출.
- **B 알림 정직화:** 동작하지 않는 토글 5개 + 오해 문구 제거 → "준비 중" 플레이스홀더(인앱 알림은 실제 존재함을 안내).
- **프로필 수정:** "수정" → 모달(이름·전화 입력, 클라이언트 검증) → `PATCH /users/me` → `users.me` 무효화 + 토스트.
- **비밀번호 변경:** "변경하기" → 모달(현재·새·새 확인) → `PATCH /users/me/password` → **성공 시 세션 정리 + "비밀번호가 변경되었어요. 다시 로그인해 주세요" 토스트 + `/login` 이동(재로그인 강제).** 현재 비번 불일치(400)는 모달에 사유 노출.

## 테스트

- 백엔드: 프로필 수정 성공·이름공백/전화형식 검증실패 / 비번변경 성공(+token_version 증가)·현재비번불일치(400)·동일비번(400).
- 프론트: 탈퇴(확인→세션정리·홈 / 회장 409 메시지), 알림 플레이스홀더 노출, 프로필 모달(검증→PATCH→토스트), 비번 모달(성공→세션정리·/login 이동 / 현재비번 불일치 에러 노출).

## Out of Scope

- 이메일 변경 + 재인증.
- 다른 기기 "선택적" 세션 관리 UI(비번 변경은 전체 무효화로 처리).
- 죽은 탭/CTA/기타 정리(C), 다크모드, 데이터 다운로드.
- 알림 preferences 백엔드·전달 채널(이메일 회원가입 전용).

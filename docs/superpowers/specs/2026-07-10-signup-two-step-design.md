# 회원가입 2-step 리팩토링 설계서

- 작성일: 2026-07-10
- 대상: `frontend/apps/web/app/(auth)/signup/**`
- 배경: MO 인증 전환(백엔드 #618·프론트 #620) 이후 회원가입은 단일 폼에 휴대폰 MO 인증 + 프로필 입력이 한 화면에 모두 있다. 사용자 제공 목업을 바탕으로 **① 휴대폰 인증 → ② 기본 정보** 2-step 마법사로 재구성한다.
- 관련: 백엔드 계약 무변경(`POST /auth/signup {studentId,name,password,grade,college,major,verificationToken,termsOfServiceAgreed,privacyPolicyAgreed}`).

## 1. 목표

- 단일 폼을 **2-step 마법사**로 분리: Step 1은 휴대폰 MO 인증만, Step 2는 나머지 프로필 입력.
- 목업의 **레이아웃·흐름**(스텝 인디케이터, 인증 완료 배지, 이전/다음 버튼, "전체 동의" 약관 UI)을 반영하되, **아이콘·입력·컴포넌트는 현재 코드베이스 패턴을 그대로 재사용**한다(목업의 AuthShell/Icon.*/TxtInput 인라인 스타일 시스템은 채택하지 않는다).
- 백엔드 계약·검증(zod `signupSchema`)·상태 관리(`signup-state` useReducer, `usePhoneVerification`)는 유지하고 `step` 상태만 추가한다.

## 2. 구조

`SignupFormPanel`이 **상태·스텝·제출을 소유하는 오케스트레이터**가 되고, 스텝 내용을 두 프레젠테이션 컴포넌트로 분리한다(각 파일 한 가지 책임, 큰 단일 폼 파일 방지).

```
signup/_components/
├── SignupFormPanel.tsx      오케스트레이터 — useReducer 상태·usePhoneVerification·step·handleSubmit 소유,
│                            상단 nav·badge·에러·스텝 인디케이터, step 값에 따라 Step1/Step2 렌더
├── SignupStepVerify.tsx     Step 1 — PhoneVerificationField + (verified 시) [다음] 버튼 (신규)
├── SignupStepProfile.tsx    Step 2 — 인증 완료 배지 + 프로필 필드 + 약관 + [이전][가입] (신규)
├── SignupStepIndicator.tsx  2칸 프로그레스 바 + ① 휴대폰 인증 / ② 기본 정보 (신규, 소형)
├── PhoneVerificationField.tsx  (기존 재사용, 무변경)
├── CollegeSelect.tsx / TermsAgreement.tsx / PhoneInput.tsx  (기존 재사용, 무변경)
```

- `SignupStepVerify`/`SignupStepProfile`/`SignupStepIndicator`는 **dumb 컴포넌트** — 상태·핸들러를 프롭으로 받는다. 상태 머신·검증·제출은 전부 `SignupFormPanel`에 남는다.
- `SignupStepProfile`가 받는 프롭이 많아지므로(폼 필드 다수), 값·onChange를 개별 프롭이 아니라 **`state`(SignupFormState) + `setField` + 파생값(passwordMismatch/studentIdMismatch) + phoneVerification 요약**을 묶어 전달한다(기존 SignupFormPanel 내부 관례와 동일한 setField 패턴).

## 3. Step 1 — 휴대폰 인증 (`SignupStepVerify`)

- 내용: 기존 `PhoneVerificationField` 하나(번호 입력 → 인증 시작 → QR(PC)/딥링크(모바일) → "문자를 보냈어요" → 폴링 → VERIFIED). 프롭은 현재 `SignupFormPanel`이 넘기던 것 그대로 위임.
- **[다음] 버튼**: `phoneVerification.verified === true`일 때만 필드 아래에 노출·활성. 클릭 → `onNext()`(부모가 `setStep(2)`).
  - 미인증(idle/issued/waiting/expired) 상태에서는 [다음]을 **렌더하지 않는다**(verified일 때만 노출). 인증 자체가 Step 1의 완료 조건이라 별도 비활성 버튼을 미리 보여주지 않는다.
- 상단 카피(목업 준용): "문자로 코드를 보내주세요" 등 — 현재 문구 톤 유지.

## 4. Step 2 — 기본 정보 (`SignupStepProfile`)

- 상단: **"✓ 인증 완료" 컴팩트 배지** + 인증된 번호(`state.phone` 또는 `phoneVerification` 요약). 목업의 MOVerified 자리. (재인증하려면 [이전]으로.)
- 필드 순서(목업 흐름 반영):
  1. **이름** — 기존 name 입력(IconPerson).
  2. **단과대학·학과** — `CollegeSelect`(college enum 드롭다운) + 학과명 텍스트 입력. 목업은 하나로 보이나 백엔드가 college(enum)+major(string)를 따로 받으므로 분리 유지.
  3. **[학번 | 학년]** 그리드 — 학번(8자리 numeric) + `GradeSelect`. ⚠️ 목업엔 학년이 없지만 백엔드 필수라 유지(학번 옆 배치).
  4. **학번 확인** — 학번 재입력(불일치 시 인라인 경고). 학번은 가입 후 수정 불가라 확인받음.
  5. **[비밀번호 | 비밀번호 확인]** 그리드 — 기존 그대로(불일치 인라인 경고).
  6. **약관** — 기존 `TermsAgreement`(이용약관·개인정보 2개 + "전체 동의" 마스터 + 보기 링크). 만14세·마케팅은 **범위 밖**(백엔드 미저장).
- 하단 버튼: **[이전]**(→ `onBack()` = `setStep(1)`, 인증 보존) + **[가입하고 두잉 시작하기]**(→ 부모 handleSubmit).

## 5. 상태·검증·인터랙션 흐름

- 상태: 기존 `signup-state`(useReducer, SignupFormState) + `usePhoneVerification(state.phone)` + 신규 `const [step, setStep] = useState<1|2>(1)`. `signupSchema`(zod) 검증 로직·`handleSubmit`·403 복귀는 현행 유지.
- **전환(1→2)**: Step 1의 [다음]은 `phoneVerification.verified`일 때만 활성 → 클릭 시 `setStep(2)`. (자동 전환 아님 — 승인된 결정 ⓐ.)
- **뒤로(2→1)**: [이전] → `setStep(1)`. `usePhoneVerification` 상태는 부모에 살아 있어 인증이 보존되고, Step 1은 verified 상태(✓ + [다음])로 다시 보인다. 다른 번호로 재인증하면 훅의 phone-change 리셋이 동작해 재인증 흐름으로 전환된다(기존 로직).
- **제출**: Step 2의 [가입]이 기존 `handleSubmit` 호출 — 비번·학번 일치 선검사 → `signupSchema.safeParse`(verificationToken 포함) → `signup.mutateAsync` → `/login?next=/me`. 403 `PHONE_NOT_VERIFIED`면 `phoneVerification.reset()` + 에러 + **Step 1로 복귀**(재인증 유도). 에러 배너는 현재 위치(폼 상단, 오케스트레이터)에서 표시.
- **엣지**: verified 상태에서 [다음] 눌러 Step 2에 있다가, 세션 완료창(30분) 초과로 서버가 403을 주면 위 403 처리가 Step 1로 되돌린다.

## 6. 테스트

기존 `apps/web/test/(auth)/signup/` 통합·컴포넌트 테스트를 2-step에 맞게 갱신 + 신규:
- Step 1: 미인증 시 [다음] 비활성/미노출, 인증(VERIFIED) 후 [다음] 노출·활성 → 클릭 시 Step 2 렌더.
- [이전]: Step 2 → Step 1 복귀 시 인증 상태 보존(다시 verified 뷰).
- Step 2: 필수 필드·비번/학번 불일치 검증, 제출 해피패스(기존 `AuthControllerSignupTest` FE 대응 — signup mutation 호출 인자에 verificationToken 포함), 403 시 Step 1 복귀.
- 스텝 인디케이터: step에 따라 ①②·프로그레스 바 강조 반영.
- 기존 signup 통합 테스트(폴링·stale·MO 필드)는 Step 1 흐름으로 감싸 재사용.

## 7. Out of Scope

- 만 14세 이상·마케팅 수신 약관(백엔드 저장 필드 없음 — 추가 시 별도 백엔드 작업).
- 로그인 페이지, 백엔드(`signup` 계약·검증), MO 인증 로직 자체.
- 목업의 AuthShell/Icon.*/TxtInput 인라인 스타일 시스템 채택(현 컴포넌트·Tailwind 클래스 유지).
- 필드 유효성 실시간(blur) 검증 도입 등 현행에 없던 UX 신규.

## 8. 결정 총람

| 항목 | 결정 | 근거 |
|---|---|---|
| 약관 항목 | 현행 2개(이용약관·개인정보) 유지, 목업의 "전체 동의"·보기 UI만 반영 | 만14세·마케팅은 백엔드 미저장 — 안 받는 게 맞음(ⓐ) |
| Step 1→2 전환 | 인증 완료 시 [다음] 버튼 노출·클릭(자동 전환 아님) | 비동기 인증 완료에 확인 한 박자·명시적 이동(ⓐ) |
| [이전] 동작 | 인증 상태 보존, Step 1 verified 뷰로 복귀 | 부모 훅에 상태 존속, 재인증도 허용 |
| 학년(grade) | 유지(목업 누락이나 백엔드 필수), 학번 옆 배치 | 계약 필수 필드 |
| 단과대학·학과 | CollegeSelect(enum)+학과 텍스트 분리 유지 | 백엔드 college+major 별도 |
| 컴포넌트 분리 | 오케스트레이터 + Step1/Step2/Indicator 3개 신규 | 파일별 단일 책임, 단일 폼 비대화 방지 |

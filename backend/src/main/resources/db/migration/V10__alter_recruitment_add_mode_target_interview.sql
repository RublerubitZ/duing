-- application_mode: SELF | EXTERNAL.  SELF 는 자체 폼(RecruitmentForm 행 존재).
-- external_form_url: EXTERNAL 일 때 필수 (CHECK 로 강제).
-- use_interview: true 면 상태 전이가 UNDER_REVIEW → INTERVIEW_PENDING → ACCEPTED/REJECTED.
-- target_role: 합격(ACCEPTED) 시 부여될 ClubMember.role. OFFICER 모집은 기존 동아리 MEMBER 만 지원 가능.

ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS application_mode   VARCHAR(20) NOT NULL DEFAULT 'SELF';
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS external_form_url  VARCHAR(500);
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS use_interview      BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS target_role        VARCHAR(20) NOT NULL DEFAULT 'MEMBER';

ALTER TABLE recruitment ADD CONSTRAINT chk_recruitment_external_url
    CHECK (application_mode = 'SELF' OR external_form_url IS NOT NULL);

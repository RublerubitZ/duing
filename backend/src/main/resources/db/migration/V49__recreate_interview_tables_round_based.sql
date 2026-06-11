-- 면접 도메인 라운드 중심 재설계 (스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §4)
-- 출시 전 · 운영 데이터 없음 — drop & recreate. V45 의 uk_application_id_recruitment_id 는 무해하므로 유지.
DROP TABLE IF EXISTS interview_availability;
DROP TABLE IF EXISTS interview_schedule;
DROP TABLE IF EXISTS interview_slot;
DROP TABLE IF EXISTS interview_config;

-- 1. InterviewRound — 면접 도메인의 새 중심
CREATE TABLE interview_round (
    id                       BIGSERIAL PRIMARY KEY,
    recruitment_id           BIGINT NOT NULL REFERENCES recruitment(id) ON DELETE RESTRICT,
    title                    VARCHAR(100) NOT NULL,
    status                   VARCHAR(20) NOT NULL
                             CHECK (status IN ('DRAFT', 'COLLECTING', 'ASSIGNING', 'SCHEDULED', 'CANCELLED')),
    -- DRAFT 동안 nullable, DRAFT→COLLECTING 발송 전이 시 NOT NULL 검증은 서비스 가드 (BE#5)
    availability_deadline    TIMESTAMP WITH TIME ZONE,
    location                 VARCHAR(200),
    assignment_completed_at  TIMESTAMP WITH TIME ZONE,
    -- MVP 는 Availability 요청/재알림 dedupKey 생성용. 향후 NotificationLog/InterviewRoundNotification 테이블로 이관 가능.
    request_sequence         INTEGER NOT NULL DEFAULT 0,
    -- 자동배정/확정/취소 동시 실행 race 차단용 낙관적 락 (application.version 전례 — V37)
    version                  BIGINT NOT NULL DEFAULT 0,
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at               TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_interview_round_recruitment_status
    ON interview_round (recruitment_id, status);
-- 모집당 DRAFT 라운드 최대 1개 (V38 active-recruitment partial unique 전례)
CREATE UNIQUE INDEX uq_interview_round_draft_per_recruitment
    ON interview_round (recruitment_id)
    WHERE status = 'DRAFT' AND deleted_at IS NULL;

-- 2. InterviewRoundMember — 멤버십 + 응답 상태 단일 머신
CREATE TABLE interview_round_member (
    id                             BIGSERIAL PRIMARY KEY,
    round_id                       BIGINT NOT NULL REFERENCES interview_round(id) ON DELETE RESTRICT,
    application_id                 BIGINT NOT NULL REFERENCES application(id) ON DELETE RESTRICT,
    status                         VARCHAR(30) NOT NULL
                                   CHECK (status IN ('INVITED', 'RESPONDED', 'NO_AVAILABLE_SLOT', 'ASSIGNED', 'EXCLUDED')),
    alternative_availability_text  VARCHAR(500),
    created_at                     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at                     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at                     TIMESTAMP WITH TIME ZONE,
    -- 일반 unique: 멤버는 soft delete 하지 않고 EXCLUDED 로 종결 → composite FK 타겟으로 사용 가능
    CONSTRAINT uk_interview_round_member UNIQUE (round_id, application_id)
);
CREATE INDEX idx_interview_round_member_application
    ON interview_round_member (application_id);

-- 3. InterviewSlot — recruitment_id → round_id 로 repoint
CREATE TABLE interview_slot (
    id          BIGSERIAL PRIMARY KEY,
    round_id    BIGINT NOT NULL REFERENCES interview_round(id) ON DELETE RESTRICT,
    start_time  TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time    TIMESTAMP WITH TIME ZONE NOT NULL,
    capacity    INTEGER NOT NULL CHECK (capacity > 0),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMP WITH TIME ZONE,
    CHECK (end_time > start_time),
    UNIQUE (id, round_id)   -- composite FK 타겟 (V45 패턴)
);
CREATE INDEX idx_interview_slot_round_start
    ON interview_slot (round_id, start_time);

-- 4. InterviewAvailability — 라운드 멤버의 슬롯-고르기 응답
CREATE TABLE interview_availability (
    id              BIGSERIAL PRIMARY KEY,
    round_id        BIGINT NOT NULL,
    application_id  BIGINT NOT NULL,
    slot_id         BIGINT NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMP WITH TIME ZONE,
    -- 슬롯-라운드 정합
    FOREIGN KEY (slot_id, round_id)
        REFERENCES interview_slot(id, round_id) ON DELETE RESTRICT,
    -- 라운드 멤버만 응답 가능
    FOREIGN KEY (round_id, application_id)
        REFERENCES interview_round_member(round_id, application_id) ON DELETE RESTRICT
);
-- soft delete 후 재응답 허용 (V46 패턴)
CREATE UNIQUE INDEX uq_interview_availability_active
    ON interview_availability (application_id, slot_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_interview_availability_slot
    ON interview_availability (slot_id);

-- 5. InterviewSchedule — 라운드 내 최종 1:1 배정
CREATE TABLE interview_schedule (
    id              BIGSERIAL PRIMARY KEY,
    round_id        BIGINT NOT NULL,
    application_id  BIGINT NOT NULL,
    slot_id         BIGINT NOT NULL,
    -- status='CANCELLED' 은 MVP 미사용 (재배정은 soft delete 경로). future 재면접용 예약값.
    status          VARCHAR(20) NOT NULL CHECK (status IN ('ASSIGNED', 'CANCELLED')),
    assigned_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (slot_id, round_id)
        REFERENCES interview_slot(id, round_id) ON DELETE RESTRICT,
    FOREIGN KEY (round_id, application_id)
        REFERENCES interview_round_member(round_id, application_id) ON DELETE RESTRICT
);
-- 자동배정 재실행 시 soft delete 후 재생성 허용. 전역 UNIQUE 였던 application_id 는 per-round 로 완화 (스펙 §4)
CREATE UNIQUE INDEX uq_interview_schedule_active_per_round
    ON interview_schedule (round_id, application_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_interview_schedule_slot
    ON interview_schedule (slot_id);

-- 1. InterviewConfig
CREATE TABLE interview_config (
    id                        BIGSERIAL PRIMARY KEY,
    recruitment_id            BIGINT NOT NULL UNIQUE
                              REFERENCES recruitment(id) ON DELETE RESTRICT,
    availability_deadline     TIMESTAMP WITH TIME ZONE NOT NULL,
    assignment_completed_at   TIMESTAMP WITH TIME ZONE,
    created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at                TIMESTAMP WITH TIME ZONE
);

-- 2. InterviewSlot
CREATE TABLE interview_slot (
    id              BIGSERIAL PRIMARY KEY,
    recruitment_id  BIGINT NOT NULL REFERENCES recruitment(id) ON DELETE RESTRICT,
    start_time      TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time        TIMESTAMP WITH TIME ZONE NOT NULL,
    capacity        INTEGER NOT NULL CHECK (capacity > 0),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMP WITH TIME ZONE,
    CHECK (end_time > start_time),
    UNIQUE (id, recruitment_id)
);
CREATE INDEX idx_interview_slot_recruitment_start
    ON interview_slot (recruitment_id, start_time);

-- application 에 composite FK target 추가
ALTER TABLE application
    ADD CONSTRAINT uk_application_id_recruitment_id UNIQUE (id, recruitment_id);

-- 3. InterviewAvailability
CREATE TABLE interview_availability (
    id              BIGSERIAL PRIMARY KEY,
    application_id  BIGINT NOT NULL,
    slot_id         BIGINT NOT NULL,
    recruitment_id  BIGINT NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMP WITH TIME ZONE,
    UNIQUE (application_id, slot_id),
    FOREIGN KEY (application_id, recruitment_id)
        REFERENCES application(id, recruitment_id) ON DELETE RESTRICT,
    FOREIGN KEY (slot_id, recruitment_id)
        REFERENCES interview_slot(id, recruitment_id) ON DELETE RESTRICT
);
CREATE INDEX idx_interview_availability_slot
    ON interview_availability (slot_id);

-- 4. InterviewSchedule
CREATE TABLE interview_schedule (
    id              BIGSERIAL PRIMARY KEY,
    application_id  BIGINT NOT NULL UNIQUE,
    slot_id         BIGINT NOT NULL,
    recruitment_id  BIGINT NOT NULL,
    status          VARCHAR(20) NOT NULL
                    CHECK (status IN ('ASSIGNED', 'CANCELLED')),
    assigned_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (application_id, recruitment_id)
        REFERENCES application(id, recruitment_id) ON DELETE RESTRICT,
    FOREIGN KEY (slot_id, recruitment_id)
        REFERENCES interview_slot(id, recruitment_id) ON DELETE RESTRICT
);
CREATE INDEX idx_interview_schedule_slot ON interview_schedule (slot_id);

-- 동아리당 LEADER 는 최대 1명 (soft-delete 호환). 어드민 강제 지정 동시성 결함의 DB 레벨 방어선.
CREATE UNIQUE INDEX IF NOT EXISTS uk_club_member_leader_active
    ON club_member (club_id)
    WHERE role = 'LEADER' AND deleted_at IS NULL;

-- 공지 작성자/소유 경계. 클럽이 작성한 공지(createForClub)에만 owning_club_id 를 부여하고,
-- 관리자 다중대상 브로드캐스트는 NULL 로 남긴다. leader 의 수정/삭제는 owning_club_id 가
-- 자신의 클럽과 일치할 때만 허용되므로, 관리자 공지는 대상 클럽 운영진이 변조할 수 없다.
ALTER TABLE notice ADD COLUMN owning_club_id BIGINT;

-- 기존 단일대상 CLUB_SCOPED 공지는 클럽이 작성한 것으로 보고 백필한다(다중대상=관리자=NULL 유지).
UPDATE notice n
   SET owning_club_id = (
        SELECT ntc.club_id FROM notice_target_club ntc WHERE ntc.notice_id = n.id LIMIT 1)
 WHERE n.visibility = 'CLUB_SCOPED'
   AND n.deleted_at IS NULL
   AND (SELECT COUNT(*) FROM notice_target_club ntc2 WHERE ntc2.notice_id = n.id) = 1;

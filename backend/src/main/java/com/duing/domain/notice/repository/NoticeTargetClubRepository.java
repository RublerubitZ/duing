package com.duing.domain.notice.repository;

import com.duing.domain.notice.entity.NoticeTargetClub;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NoticeTargetClubRepository
        extends JpaRepository<NoticeTargetClub, NoticeTargetClub.NoticeTargetClubId> {

    List<NoticeTargetClub> findAllByIdNoticeId(Long noticeId);

    @Modifying
    @Query("DELETE FROM NoticeTargetClub t WHERE t.id.noticeId = :noticeId")
    void deleteAllByNoticeId(@Param("noticeId") Long noticeId);
}

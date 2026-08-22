package com.duing.domain.notice.service;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.service.dto.command.CreateClubNoticeCommand;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateClubNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeAdminSummaryQuery;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import com.duing.domain.user.entity.UserRole;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface NoticeService {

    Long create(CreateNoticeCommand command);

    void update(UpdateNoticeCommand command);

    void delete(Long noticeId);

    /**
     * 인증 주체(비로그인이면 role=null)로 뷰어 스코프를 조립한다 — 소속·임원 동아리 조회는 서비스가 소유한다.
     * 가시성 판정에 쓰이는 스코프가 화면마다 달리 조립되면 권한 구멍이 생기므로 조립 지점은 여기 하나뿐이다.
     */
    ViewerScope resolveViewerScope(Long userId, UserRole role);

    Notice getVisible(Long noticeId, ViewerScope viewer);

    /** 공지 상세의 대상 동아리 id 목록 (CLUB_SCOPED 가 아니면 빈 목록). */
    List<Long> findTargetClubIds(Long noticeId);

    Page<Notice> searchFeed(NoticeSearchCondition condition, ViewerScope viewer, Pageable pageable);

    /**
     * 공지 카드/상세의 출처 라벨용 — owningClubId 집합으로 동아리명을 한 번에 조회한다(N+1 방지).
     * null id 는 무시하고, 소프트삭제·미존재 동아리는 결과에서 빠진다(호출 측에서 null 라벨로 처리).
     */
    Map<Long, String> findClubNamesByIds(Collection<Long> clubIds);

    /** 어드민 공지 목록 — Notice 엔티티 노출 없이 평탄화된 Query DTO 페이지를 반환한다. */
    Page<NoticeAdminSummaryQuery> listForAdmin(NoticeAdminSearchCondition condition, Pageable pageable);

    /** LEADER/OFFICER 가 본인 클럽 CLUB_SCOPED+ALL_MEMBERS 공지를 생성. */
    Long createForClub(CreateClubNoticeCommand command);

    /** LEADER/OFFICER 가 본인 클럽 공지를 수정. */
    void updateForClub(UpdateClubNoticeCommand command);

    /** LEADER 가 본인 클럽 공지를 삭제 (soft). */
    void deleteForClub(Long clubId, Long noticeId);

    /** 회원이 본 클럽 공지 페이지 조회 (서버 강제 정렬). */
    Page<Notice> findClubScopedForMember(Long clubId, Pageable pageable);

    /** 회원이 본 클럽 공지 단건 상세 조회 (본문 포함, 동아리 작성 공지만). */
    Notice getClubScopedForMember(Long clubId, Long noticeId);
}

package com.duing.domain.clubaudit.service;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubaudit.service.dto.query.AdminClubActivityEventRow;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연(ADMIN) 동아리 활동 이력 조회(활동 이력 스펙 §2.3). 권한은 컨트롤러의 {@code @PreAuthorize} 가 담당한다.
 * 동아리 존재 검사는 하지 않는다 — 폐쇄(soft-delete)된 동아리의 이력도 읽혀야 한다. 열람 감사도 남기지 않는다(개인정보 없음).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminClubActivityQueryService implements AdminClubActivityQueryService {

    /** 이 콘솔이 싣는 종류 — 회비는 회비 콘솔, 가입 요청 3종은 학생 행위자라 싣지 않는다(요구 5). */
    static final Set<ClubAuditEventType> ACTIVITY_EVENT_TYPES = Set.of(
            ClubAuditEventType.CLUB_STATUS_CHANGED,
            ClubAuditEventType.CLUB_CLOSED,
            ClubAuditEventType.JOIN_LINK_CREATED,
            ClubAuditEventType.JOIN_LINK_REGENERATED,
            ClubAuditEventType.JOIN_LINK_REVOKED);

    private final ClubAuditEventRepository clubAuditEventRepository;
    private final UserRepository userRepository;

    @Override
    public Page<AdminClubActivityEventRow> getActivityEvents(Long clubId, List<ClubAuditEventType> types,
                                                             Pageable pageable) {
        // 기간 필터는 두지 않는다(스펙 §2.3) — 술어는 null 경계를 무조건으로 처리한다.
        Page<ClubAuditEvent> events = clubAuditEventRepository.searchEvents(
                clubId, activityTypesOf(types), null, null, pageable);
        Map<Long, String> actorNames = actorNamesOf(events.getContent());
        return events.map(event -> toRow(event, actorNames));
    }

    /**
     * 미지정 → 허용 5종 전체, 지정 → 허용 집합과 교집합. 전부 허용 밖이면 빈 목록이 되고
     * 리포지토리가 빈 페이지를 돌려준다 — "미지정" 과 "전부 허용 밖" 을 구분하는 것이 핵심이다.
     */
    private static Collection<ClubAuditEventType> activityTypesOf(List<ClubAuditEventType> requestedTypes) {
        if (requestedTypes == null || requestedTypes.isEmpty()) {
            return ACTIVITY_EVENT_TYPES;
        }
        return requestedTypes.stream().filter(ACTIVITY_EVENT_TYPES::contains).distinct().toList();
    }

    /** actor 이름은 한 번에 모아 해석한다(N+1 방지). 탈퇴(soft delete) 회원은 조회되지 않아 이름이 비어 나간다. */
    private Map<Long, String> actorNamesOf(List<ClubAuditEvent> events) {
        return userRepository.findAllById(
                        events.stream().map(ClubAuditEvent::getActorUserId).distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));
    }

    private static AdminClubActivityEventRow toRow(ClubAuditEvent event, Map<Long, String> actorNames) {
        return new AdminClubActivityEventRow(
                event.getId(),
                event.getEventType(),
                event.getActorUserId(),
                actorNames.get(event.getActorUserId()),
                event.getCreatedAt(),
                event.getReason(),
                event.getRecruitmentId(),
                event.getJoinCodeId(),
                event.getDetail());
    }
}

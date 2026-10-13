package com.duing.domain.recruitment.service;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.PendingApplicationStatsRow;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.repository.OperatorActivityRow;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentDetailQuery;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentListItem;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentRow;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentSearchCondition;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentSort;
import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연(ADMIN) 모집 조회. 권한은 컨트롤러의 {@code @PreAuthorize} 와 URL 레이어 백스톱이 담당하므로
 * 운영진 가드({@code requireManager})는 호출하지 않는다 — admin 은 전 동아리 접근이 정당하다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminRecruitmentQueryService implements AdminRecruitmentQueryService {

    private static final String LINK_STATUS_ACTIVE = "ACTIVE";
    private static final String LINK_STATUS_EXPIRED = "EXPIRED";
    private static final String LINK_STATUS_EXHAUSTED = "EXHAUSTED";

    /**
     * 오래 방치된 순 — 저장 상태 OPEN 먼저(false 가 앞), 그 안에서 가장 오래된 미처리 지원서 순, 미처리가 없으면 뒤.
     * 안정 정렬이라 동률은 리포지토리가 준 최신순이 그대로 남는다.
     */
    private static final Comparator<AdminRecruitmentListItem> STALENESS_ORDER = Comparator
            .comparing((AdminRecruitmentListItem listItem) ->
                    listItem.recruitmentRow().recruitment().getStatus() != RecruitmentStatus.OPEN)
            .thenComparing(AdminRecruitmentListItem::oldestPendingSubmittedAt,
                    Comparator.nullsLast(Comparator.naturalOrder()));

    private final RecruitmentRepository recruitmentRepository;
    private final ApplicationRepository applicationRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubJoinCodeRepository clubJoinCodeRepository;
    private final ClubJoinRequestRepository clubJoinRequestRepository;
    private final Clock clock;

    /**
     * 행마다 쿼리하지 않고 미처리 통계(모집 id 들)와 운영진 접속(동아리 id 들)을 한 번씩 배치 조회해 조립한다.
     * 목록은 페이지네이션이 없어 방치순 정렬을 서비스에서 해도 전체 순서가 맞다.
     */
    @Override
    public List<AdminRecruitmentListItem> search(AdminRecruitmentSearchCondition searchCondition) {
        List<AdminRecruitmentRow> recruitmentRows = recruitmentRepository.searchForAdmin(searchCondition);
        if (recruitmentRows.isEmpty()) {
            // 배치 조회의 IN () 을 피한다.
            return List.of();
        }
        Map<Long, PendingApplicationStatsRow> pendingStatsByRecruitmentId = applicationRepository
                .findPendingStatsByRecruitmentIds(recruitmentRows.stream()
                        .map(recruitmentRow -> recruitmentRow.recruitment().getId())
                        .toList())
                .stream()
                .collect(Collectors.toMap(PendingApplicationStatsRow::getRecruitmentId, Function.identity()));
        Map<Long, OperatorActivityRow> operatorActivityByClubId = clubMemberRepository
                .findOperatorActivityByClubIds(recruitmentRows.stream()
                        .map(recruitmentRow -> recruitmentRow.recruitment().getClub().getId())
                        .distinct()
                        .toList())
                .stream()
                .collect(Collectors.toMap(OperatorActivityRow::getClubId, Function.identity()));

        List<AdminRecruitmentListItem> listItems = recruitmentRows.stream()
                .map(recruitmentRow -> toListItem(recruitmentRow,
                        pendingStatsByRecruitmentId.get(recruitmentRow.recruitment().getId()),
                        operatorActivityByClubId.get(recruitmentRow.recruitment().getClub().getId())))
                .toList();
        return searchCondition.sort() == AdminRecruitmentSort.STALE
                ? listItems.stream().sorted(STALENESS_ORDER).toList()
                : listItems;
    }

    /**
     * 외부 폼 모집은 미처리 두 값이 해당 없음(null), 자체 폼은 통계 행이 없으면 0건·시각 없음이다.
     * 운영진 접속은 세션 사용(seoul regime)과 로그인(system regime)을 각각 절대시각으로 바꾼 뒤 늦은 값이다 —
     * 벽시계 그대로 비교하면 prod(JVM=UTC)에서 9시간 어긋난다.
     */
    private static AdminRecruitmentListItem toListItem(AdminRecruitmentRow recruitmentRow,
                                                       PendingApplicationStatsRow pendingStats,
                                                       OperatorActivityRow operatorActivity) {
        Instant operatorsLastActiveAt = operatorActivity == null ? null : laterOf(
                TimeMapper.seoulWallClockToInstant(operatorActivity.getLastSessionUsedAt()),
                TimeMapper.systemWallClockToInstant(operatorActivity.getLastLoginAt()));
        if (recruitmentRow.recruitment().getApplicationMode() == ApplicationMode.EXTERNAL) {
            return new AdminRecruitmentListItem(recruitmentRow, null, null, operatorsLastActiveAt);
        }
        if (pendingStats == null) {
            return new AdminRecruitmentListItem(recruitmentRow, 0L, null, operatorsLastActiveAt);
        }
        return new AdminRecruitmentListItem(recruitmentRow, pendingStats.getPendingCount(),
                TimeMapper.systemWallClockToInstant(pendingStats.getOldestSubmittedAt()), operatorsLastActiveAt);
    }

    /** 둘 중 늦은 시각 — 한쪽만 있으면 그 값, 둘 다 없으면 null. */
    private static Instant laterOf(Instant first, Instant second) {
        if (first == null || second == null) {
            return first == null ? second : first;
        }
        return first.isAfter(second) ? first : second;
    }

    @Override
    public AdminRecruitmentDetailQuery getDetail(Long recruitmentId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        AdminRecruitmentRow recruitmentRow = new AdminRecruitmentRow(
                recruitment,
                recruitment.getClub().getName(),
                applicationRepository.countByRecruitmentId(recruitmentId),
                LocalDate.now(clock));

        JoinCodeQuery activeJoinCode = findActiveJoinCode(recruitment);
        return new AdminRecruitmentDetailQuery(recruitmentRow, activeJoinCode,
                activeJoinCode == null ? null : resolveLinkStatus(recruitment, activeJoinCode));
    }

    /**
     * 운영진 상태 카드와 같은 조립을 쓴다({@code JoinCodeQuery.from}) — 수치 계산이 두 벌이 되면
     * 같은 링크를 보는 두 화면의 숫자가 갈린다. 폐기된 코드는 활성 조회에서 이미 빠진다.
     *
     * <p>{@code JoinCodeService.findActive} 로는 위임하지 않는다 — 그쪽은 운영진 가드
     * ({@code requireManager} + 모집 소속 대조)를 거치므로, 동아리 소속이 아닌 총동연이 호출하면
     * 전 동아리 상세가 403·404 로 막힌다. 가드 없는 변형을 새로 열면 IDOR 표면이 늘어난다.
     */
    private JoinCodeQuery findActiveJoinCode(Recruitment recruitment) {
        if (recruitment.getApplicationMode() != ApplicationMode.EXTERNAL) {
            return null;
        }
        return clubJoinCodeRepository.findByRecruitmentIdAndRevokedAtIsNull(recruitment.getId())
                .map(activeCode -> JoinCodeQuery.from(activeCode,
                        clubJoinRequestRepository.countByJoinCodeId(activeCode.getId()),
                        clubJoinRequestRepository.countByJoinCodeIdAndStatus(
                                activeCode.getId(), JoinRequestStatus.PENDING),
                        LocalDateTime.now(clock)))
                .orElse(null);
    }

    /**
     * 링크 상태는 {@code ClubJoinCode.isUsable} 과 같은 기준으로 판정한다 — 화면이 "사용 가능"으로
     * 읽는 상태와 실제 사용 가능 여부가 어긋나면 안 된다. 모집이 마감됐는데 종료 스탬프가 없어
     * 기한을 알 수 없으면 만료로 본다(fail-closed).
     */
    private String resolveLinkStatus(Recruitment recruitment, JoinCodeQuery joinCodeQuery) {
        if (joinCodeQuery.usedCount() >= joinCodeQuery.maxUses()) {
            return LINK_STATUS_EXHAUSTED;
        }
        if (recruitment.isEffectivelyOpen(LocalDate.now(clock))) {
            return LINK_STATUS_ACTIVE;
        }
        LocalDateTime joinExpiresAt = joinCodeQuery.joinExpiresAt();
        return joinExpiresAt == null || LocalDateTime.now(clock).isAfter(joinExpiresAt)
                ? LINK_STATUS_EXPIRED
                : LINK_STATUS_ACTIVE;
    }
}

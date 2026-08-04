package com.duing.domain.recruitment.service;

import com.duing.domain.application.repository.ApplicationRepository;
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
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentRow;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentSearchCondition;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
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

    private final RecruitmentRepository recruitmentRepository;
    private final ApplicationRepository applicationRepository;
    private final ClubJoinCodeRepository clubJoinCodeRepository;
    private final ClubJoinRequestRepository clubJoinRequestRepository;
    private final Clock clock;

    @Override
    public List<AdminRecruitmentRow> search(AdminRecruitmentSearchCondition searchCondition) {
        return recruitmentRepository.searchForAdmin(searchCondition);
    }

    @Override
    public AdminRecruitmentDetailQuery getDetail(Long recruitmentId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        AdminRecruitmentRow recruitmentRow = new AdminRecruitmentRow(
                recruitment,
                recruitment.getClub().getName(),
                applicationRepository.countByRecruitmentId(recruitmentId));

        JoinCodeQuery activeJoinCode = findActiveJoinCode(recruitment);
        return new AdminRecruitmentDetailQuery(recruitmentRow, activeJoinCode,
                activeJoinCode == null ? null : resolveLinkStatus(recruitment, activeJoinCode));
    }

    /**
     * 운영진 상태 카드와 같은 조립을 쓴다({@code JoinCodeQuery.from}) — 수치 계산이 두 벌이 되면
     * 같은 링크를 보는 두 화면의 숫자가 갈린다. 폐기된 코드는 활성 조회에서 이미 빠진다.
     */
    private JoinCodeQuery findActiveJoinCode(Recruitment recruitment) {
        if (recruitment.getApplicationMode() != ApplicationMode.EXTERNAL) {
            return null;
        }
        return clubJoinCodeRepository.findByRecruitmentIdAndRevokedAtIsNull(recruitment.getId())
                .map(activeCode -> JoinCodeQuery.from(activeCode,
                        clubJoinRequestRepository.countByJoinCodeId(activeCode.getId()),
                        clubJoinRequestRepository.countByJoinCodeIdAndStatus(
                                activeCode.getId(), JoinRequestStatus.PENDING)))
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
        if (recruitment.getStatus() == RecruitmentStatus.OPEN) {
            return LINK_STATUS_ACTIVE;
        }
        LocalDateTime joinExpiresAt = joinCodeQuery.joinExpiresAt();
        return joinExpiresAt == null || LocalDateTime.now(clock).isAfter(joinExpiresAt)
                ? LINK_STATUS_EXPIRED
                : LINK_STATUS_ACTIVE;
    }
}

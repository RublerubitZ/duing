package com.duing.domain.application.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatusHistory;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.application.service.dto.query.AdminApplicantListQuery;
import com.duing.domain.application.service.dto.query.AdminApplicantSort;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.stats.repository.RecruitmentStatsRepositoryCustom;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연(ADMIN) 지원자 조회. 권한은 컨트롤러의 {@code @PreAuthorize} 와 URL 레이어 백스톱이 담당하므로
 * 운영진 가드({@code requireManager})는 호출하지 않는다 — admin 은 전 동아리 접근이 정당하다.
 *
 * <p>기존 운영진 서비스는 내부에서 운영진 가드를 부르기 때문에 재사용할 수 없다. 재사용 경계는
 * 리포지토리와 쿼리 DTO 조립이며, 이 서비스는 그 위에 얇게 얹힌다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminApplicationQueryService implements AdminApplicationQueryService {

    private final ApplicationRepository applicationRepository;
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final RecruitmentStatsRepositoryCustom recruitmentStatsRepository;
    private final ClubAuditEventRepository clubAuditEventRepository;

    /**
     * 상태별 건수는 운영진 통계 화면과 같은 groupBy 쿼리를 그대로 쓴다 — 같은 모집을 보는 두 화면의
     * 숫자가 갈리지 않게 하기 위해서다. 검색·필터는 목록에만 걸리고 건수는 모집 전체 기준을 유지한다.
     */
    @Override
    public AdminApplicantListQuery getApplicants(Long recruitmentId, ApplicantSearchCondition condition,
                                                 AdminApplicantSort sort) {
        // 미존재·삭제된 모집은 상세와 같이 404 로 답한다 — 없는 모집에 "지원자 0명"을 돌려주면
        // 모집이 사라진 것과 아무도 지원하지 않은 것이 같은 응답이 된다(#880).
        // 외부 폼 모집은 존재하되 지원 데이터가 없는 정상 상태이므로 그대로 빈 목록이다.
        if (!recruitmentRepository.existsById(recruitmentId)) {
            throw new RecruitmentException.RecruitmentNotFoundException();
        }
        return new AdminApplicantListQuery(
                recruitmentStatsRepository.findSummaryByRecruitmentId(recruitmentId),
                applicationRepository.searchApplicantsForAdmin(
                        recruitmentId, condition, sort == AdminApplicantSort.OLDEST));
    }

    /**
     * 열람 감사를 같은 트랜잭션에 남기므로 조회지만 쓰기 트랜잭션이다 — readOnly 로 두면 실제 PG 에서
     * INSERT 가 거부된다. 목록 조회는 신원 요약만 보므로 감사 대상이 아니다.
     */
    @Override
    @Transactional
    public ApplicantDetailQuery getApplicationDetail(Long applicationId, Long adminUserId) {
        Application application = applicationRepository.findWithRecruitmentAndClubById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        List<ApplicationStatusHistory> historyRows =
                applicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(applicationId);

        Recruitment recruitment = application.getRecruitment();
        clubAuditEventRepository.save(ClubAuditEvent.adminApplicationView(
                recruitment.getClub().getId(), recruitment.getId(), applicationId, adminUserId));

        return ApplicantDetailQuery.fromWithHistory(application, historyRows);
    }
}

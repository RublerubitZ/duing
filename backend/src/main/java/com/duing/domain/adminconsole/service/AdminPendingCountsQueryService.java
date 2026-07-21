package com.duing.domain.adminconsole.service;

import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.repository.ReportRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연 관리자 콘솔 사이드바 뱃지용 미처리 건수 집계.
 *
 * <p>"무엇이 미처리인가" 는 도메인 규칙이므로 전부 여기서 정한다. 프론트가 도메인별 상태값을 알고
 * 목록 API 를 상태별로 세는 방식이면 상태가 하나 늘 때마다 프론트를 고쳐야 하고, 1:1 문의처럼
 * 미처리가 두 상태에 걸친 경우 화면마다 정의가 갈린다.
 *
 * <p>여러 도메인을 가로지르는 읽기 전용 집계라 특정 도메인 패키지에 두지 않고 콘솔 전용 패키지에 둔다.
 * 각 도메인의 소프트 삭제(@SQLRestriction)는 파생 count 쿼리에도 그대로 적용되므로 별도 조건이 필요 없다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminPendingCountsQueryService {

    /**
     * 답변이 나가지 않은 문의 = 접수(RECEIVED) + 처리 중(IN_PROGRESS).
     * IN_PROGRESS 는 관리자가 답변을 쓰기 시작했을 뿐 아직 등록 전이라, 운영자 관점에서는 여전히 처리 대상이다.
     */
    private static final List<FederationInquiryStatus> UNANSWERED_INQUIRY_STATUSES =
            List.of(FederationInquiryStatus.RECEIVED, FederationInquiryStatus.IN_PROGRESS);

    /**
     * 조치가 필요한 예약 = 승인 대기(PENDING) + 충돌(CONFLICT).
     * CONFLICT 는 승인 이후 겹침이 드러나 되돌아온 상태로, 엔티티도 이 둘에서만 재승인을 허용한다.
     * 뱃지가 PENDING 만 세면 방치된 충돌 건이 사이드바에서 보이지 않는다.
     */
    private static final List<BookingStatus> ACTION_REQUIRED_BOOKING_STATUSES =
            List.of(BookingStatus.PENDING, BookingStatus.CONFLICT);

    private final ClubRepository clubRepository;
    private final FacilityBookingRepository facilityBookingRepository;
    private final FederationInquiryRepository federationInquiryRepository;
    private final PromotionRequestRepository promotionRequestRepository;
    private final ReportRepository reportRepository;
    private final LeaderSuccessionRequestRepository leaderSuccessionRequestRepository;

    public AdminPendingCountsQuery getPendingCounts() {
        return AdminPendingCountsQuery.of(
                clubRepository.countByStatus(ClubStatus.PENDING_APPROVAL),
                facilityBookingRepository.countByStatusIn(ACTION_REQUIRED_BOOKING_STATUSES),
                federationInquiryRepository.countByStatusIn(UNANSWERED_INQUIRY_STATUSES),
                promotionRequestRepository.countByStatus(PromotionRequestStatus.PENDING),
                reportRepository.countByStatus(ReportStatus.PENDING),
                leaderSuccessionRequestRepository.countByStatus(SuccessionStatus.PENDING)
        );
    }
}

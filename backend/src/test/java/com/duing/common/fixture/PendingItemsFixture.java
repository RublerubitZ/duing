package com.duing.common.fixture;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 운영 중단 동아리의 남은 미결(결과 미정 지원서·대기 가입 신청) 테스트 공용 — 판정(ClubRepositoryImpl)·정리 실행·내 지원 표시
 * 테스트가 같은 데이터 모양을 쓰도록 한 곳에 둔다. ClubStaffFixture 처럼 저장까지 하고 리포지토리는 호출 측이 넘긴다.
 * 모집은 모두 면접 사용 모집이다 — 면접 대기(INTERVIEW_PENDING)를 도메인 전이로 만들 수 있게.
 */
public final class PendingItemsFixture {

    // 동아리 이름·모집 제목·링크 코드가 테스트 안에서 겹치지 않게 하는 시퀀스(UserFixture 와 같은 방식).
    private static final AtomicLong SEQUENCE = new AtomicLong(System.nanoTime());

    private PendingItemsFixture() {
    }

    /** 이름이 유일한 동아리를 지정 상태로 저장한다 — 승인 절차를 건너뛰고 상태만 바꾼다(ClubStaffFixture 전례). */
    public static Club saveClub(ClubRepository clubRepository, ClubStatus status) {
        Club club = ClubFixture.academic("남은미결동아리" + SEQUENCE.incrementAndGet());
        ReflectionTestUtils.setField(club, "status", status);
        return clubRepository.save(club);
    }

    /** 면접 사용 모집을 저장한다. closed 면 마감(CLOSED)으로 둔다 — 운영 중단 전환이 진행 중 모집을 닫은 모양. */
    public static Recruitment saveRecruitment(RecruitmentRepository recruitmentRepository, Club club,
                                              LocalDate today, boolean closed) {
        Recruitment recruitment = Recruitment.createWithOptions(club, "남은미결모집" + SEQUENCE.incrementAndGet(), null,
                today.minusDays(10), today.plusDays(10), 10, ApplicationMode.SELF, null, true,
                TargetRole.MEMBER, null, null, false);
        if (closed) {
            recruitment.close(today.atTime(9, 0));
        }
        return recruitmentRepository.save(recruitment);
    }

    /** 지원서를 도메인 전이로 목표 상태까지 만들어 저장한다(면접 사용 모집 기준 — 합격은 면접 대기를 거친다). */
    public static Application saveApplication(ApplicationRepository applicationRepository, Recruitment recruitment,
                                              User applicant, ApplicationStatus status) {
        Application application = Application.submit(recruitment, applicant, List.of());
        switch (status) {
            case SUBMITTED -> {
            }
            case ON_HOLD, INTERVIEW_PENDING, REJECTED -> application.transitionTo(status, true);
            case ACCEPTED -> {
                application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
                application.transitionTo(ApplicationStatus.ACCEPTED, true);
            }
        }
        return applicationRepository.save(application);
    }

    /** 모집 가입 링크를 발급해 저장한다 — 모집당 활성 링크는 하나라(uk_club_join_code_active_per_recruitment) 모집마다 한 번만 부른다. */
    public static ClubJoinCode saveJoinCode(ClubJoinCodeRepository clubJoinCodeRepository, Club club,
                                            Recruitment recruitment) {
        String code = String.format("P%05d", SEQUENCE.incrementAndGet() % 100_000);
        return clubJoinCodeRepository.save(ClubJoinCode.issue(club, recruitment, code, 1, 30, 7, null));
    }

    /** 대기 가입 신청 — 실제 접수처럼 링크 자리를 하나 확보한 뒤 저장한다(거절 때 환급을 확인할 수 있게). */
    public static ClubJoinRequest savePendingJoinRequest(ClubJoinCodeRepository clubJoinCodeRepository,
                                                         ClubJoinRequestRepository clubJoinRequestRepository,
                                                         Club club, ClubJoinCode joinCode, User requester) {
        ClubJoinCode storedJoinCode = clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow();
        storedJoinCode.tryConsume();
        clubJoinCodeRepository.save(storedJoinCode);
        return clubJoinRequestRepository.save(ClubJoinRequest.pending(club, requester, storedJoinCode));
    }

    /** 이미 처리된(승인·거절) 가입 신청 — 정리 대상이 아님을 보는 대조군. 자리는 확보하지 않는다. */
    public static ClubJoinRequest saveProcessedJoinRequest(ClubJoinRequestRepository clubJoinRequestRepository,
                                                           Club club, ClubJoinCode joinCode, User requester,
                                                           User reviewer, JoinRequestStatus processedStatus,
                                                           LocalDateTime reviewedAt) {
        ClubJoinRequest joinRequest = ClubJoinRequest.pending(club, requester, joinCode);
        if (processedStatus == JoinRequestStatus.APPROVED) {
            joinRequest.approve(reviewer, reviewedAt);
        } else {
            joinRequest.reject(reviewer, reviewedAt);
        }
        return clubJoinRequestRepository.save(joinRequest);
    }
}

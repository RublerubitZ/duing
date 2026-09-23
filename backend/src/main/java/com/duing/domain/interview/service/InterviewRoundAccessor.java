package com.duing.domain.interview.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.ClosedRecruitmentPolicy;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 라운드 조회 + 운영진 권한 검증 헬퍼 — 3번째 사용처(배정 서비스)가 생겨 rule of three 로 추출.
 *
 * <p><b>새 활동을 여는 쓰기는 {@link #requireManagerForWriteByRoundId}/{@link #getForWrite} 를 쓴다</b> — 권한과
 * 함께 모집 마감까지 본다. {@link #requireManagerByRoundId}/{@link #getWithManagerAuth} 는 마감을 보지 않으며,
 * 조회와 <b>마감 후에도 허용되는 정리 쓰기(라운드 취소)</b>가 이쪽을 쓴다 — 마감된 모집의 라운드도
 * 열람·정리는 계속 되어야 하기 때문이다. 취소를 쓰기 가드로 "정리"하면 자동 마감으로 남은 라운드를
 * 아무도 치울 수 없는 교착이 되살아난다.
 *
 * <p><b>잠금 조회가 필요한 경로는 {@code ...ByRoundId}/{@code ...BySlotId} 로 인가를 먼저 끝낸 뒤 잠근다</b> —
 * 잠금 뒤에 인가하면 인증만 된 사용자가 임의 라운드·슬롯 행을 트랜잭션 동안 잠글 수 있다(#839).
 * 이 메서드들은 스칼라 projection 만 읽어 잠금 대상 엔티티를 1차 캐시에 올리지 않는다.
 *
 * <p>비멤버는 {@code requireManagerOrHidden} 으로 진입 리소스의 404(라운드 경로는 RoundNotFound, 슬롯 경로는
 * SlotNotFound)로 수렴한다 — 미존재와 같은 응답이어야 id 열거 오라클이 되지 않는다(#835).
 */
@Component
@RequiredArgsConstructor
public class InterviewRoundAccessor {

    private final InterviewRoundRepository interviewRoundRepository;
    private final InterviewSlotRepository interviewSlotRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;

    public InterviewRound getWithManagerAuth(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundRepository.findById(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        requireManager(round, currentUserId);
        return round;
    }

    /**
     * 조회용 — 권한만 본다. 마감된 모집의 라운드도 열람은 계속 허용한다(아카이브).
     */
    public void requireManager(InterviewRound round, Long currentUserId) {
        clubAuthService.requireManagerOrHidden(currentUserId,
                resolveRecruitment(round.getRecruitmentId()).getClub().getId(), InterviewException.RoundNotFound::new);
    }

    /** 잠금 전 인가(조회·정리 쓰기용) — {@link #requireManager} 와 같은 의미를 라운드 id 로 본다. */
    public void requireManagerByRoundId(Long roundId, Long currentUserId) {
        Recruitment recruitment = resolveRecruitment(findRecruitmentIdOrThrow(roundId));
        clubAuthService.requireManagerOrHidden(currentUserId, recruitment.getClub().getId(),
                InterviewException.RoundNotFound::new);
    }

    /** 잠금 전 인가(쓰기용) — 권한 확인과 모집 마감 정책 검사를 라운드 id 만으로 수행한다. */
    public void requireManagerForWriteByRoundId(Long roundId, Long currentUserId) {
        requireManagerForWrite(resolveRecruitment(findRecruitmentIdOrThrow(roundId)), currentUserId,
                InterviewException.RoundNotFound::new);
    }

    /** 잠금 전 인가(슬롯 쓰기용) — 슬롯의 소속 라운드를 projection 으로 찾아 쓰기 인가한다. */
    public void requireManagerForWriteBySlotId(Long slotId, Long currentUserId) {
        Long roundId = interviewSlotRepository.findRoundIdById(slotId)
                .orElseThrow(InterviewException.SlotNotFound::new);
        // 비멤버·소속 라운드 미존재 모두 슬롯 미존재와 같은 SlotNotFound 로 — RoundNotFound 로 답하면 문구 차이가 슬롯 존재를 드러낸다.
        Long recruitmentId = interviewRoundRepository.findRecruitmentIdById(roundId)
                .orElseThrow(InterviewException.SlotNotFound::new);
        requireManagerForWrite(resolveRecruitment(recruitmentId), currentUserId,
                InterviewException.SlotNotFound::new);
    }

    /**
     * 쓰기용 — 권한 + 모집 마감 여부를 함께 본다.
     *
     * <p>마감된 모집에서 허용되는 유일한 쓰기는 남은 지원서의 최종 결과 확정이고, 면접 라운드 운영은
     * 거기 포함되지 않는다. 가드가 없으면 마감 후에도 일정을 바꾸고 라운드를 확정해 <b>학생에게 면접
     * 알림이 계속 나간다</b> — 정작 그 면접 결과를 반영하려는 순간에야 막히던 모순을 없앤다.
     */
    private void requireManagerForWrite(Recruitment recruitment, Long currentUserId,
                                        Supplier<? extends RuntimeException> hiddenAs) {
        clubAuthService.requireManagerOrHidden(currentUserId, recruitment.getClub().getId(), hiddenAs);
        ClosedRecruitmentPolicy.requireOpen(recruitment);
    }

    /** 쓰기 경로에서 라운드 조회까지 함께 하는 진입점. */
    public InterviewRound getForWrite(Long roundId, Long currentUserId) {
        InterviewRound round = interviewRoundRepository.findById(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
        requireManagerForWrite(resolveRecruitment(round.getRecruitmentId()), currentUserId,
                InterviewException.RoundNotFound::new);
        return round;
    }

    private Long findRecruitmentIdOrThrow(Long roundId) {
        return interviewRoundRepository.findRecruitmentIdById(roundId)
                .orElseThrow(InterviewException.RoundNotFound::new);
    }

    private Recruitment resolveRecruitment(Long recruitmentId) {
        return recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    }
}

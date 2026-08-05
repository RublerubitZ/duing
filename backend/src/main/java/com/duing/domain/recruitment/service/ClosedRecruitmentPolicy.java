package com.duing.domain.recruitment.service;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.exception.RecruitmentException;

/**
 * 마감(CLOSED)된 모집에서 무엇을 허용할지 정하는 단일 지점.
 *
 * <p>마감은 아카이브 전환이라 새 활동을 막는다. 평가 작성·삭제, 면접 라운드 생성·수정·취소·발송·
 * 리마인드, 슬롯 CRUD, 배정·확정, 지원자의 가능 시간 응답, 지원자 철회, 그리고 아래 최종 결과 확정을
 * 뺀 상태 변경이 모두 이 판정을 경유한다(문구가 갈리는 지원자 대면 경로는 {@link #isClosed} 를 직접 쓴다).
 *
 * <p>라운드 운영을 막지 않으면 마감 후에도 일정을 바꾸고 라운드를 확정해 <b>학생에게 면접 알림이
 * 계속 나간다</b> — 정작 그 결과를 반영하려는 순간에야 막히는 모순이 생긴다.
 *
 * <p>단 하나의 예외가 <b>남은 지원서의 최종 결과 확정</b>이다. 마감 시점에 결정되지 않은 지원을
 * 아무도 처리할 수 없으면 지원자는 결과를 영영 받지 못하고 운영진도 손댈 수 없는 교착이 된다.
 * 마감을 유발하는 6개 경로 중 4개는 자동이거나 제3자(신규 모집 등록 시 자동 마감·총동연 강제 마감·
 * replaceActive·동아리 운영 중단)라
 * "마감 전에 심사를 끝낸다"는 전제를 운영진이 항상 지킬 수 있는 것도 아니다.
 *
 * <p>판정은 저장된 status 기준이다. 마감일이 지났어도 수동 마감 전이면 심사 진행 중이므로 전 기능이
 * 그대로 열려 있다.
 */
public final class ClosedRecruitmentPolicy {

    private ClosedRecruitmentPolicy() {
    }

    public static boolean isClosed(Recruitment recruitment) {
        return recruitment.getStatus() == RecruitmentStatus.CLOSED;
    }

    /**
     * 마감된 모집에서는 허용되지 않는 쓰기 — 새 활동 전반에 건다.
     * 지원자 대면 경로는 같은 판정을 쓰되 문구가 다른 예외를 던지므로 {@link #isClosed} 를 직접 쓴다.
     */
    public static void requireOpen(Recruitment recruitment) {
        if (isClosed(recruitment)) {
            throw new RecruitmentException.ClosedRecruitmentReadOnlyException();
        }
    }

    /**
     * 마감된 모집에서 허용되는 유일한 상태 변경 — 최종 결과(합격·불합격) 확정.
     *
     * <p>보류로 미루거나 면접 대상으로 올리는 것은 마감 후 진행할 수 없는 심사 단계라 계속 막는다.
     * 이미 결과가 나온 지원을 다시 바꾸는 것은 상태 머신이 별도로 거부한다.
     */
    public static void requireFinalizingOnly(Recruitment recruitment, ApplicationStatus targetStatus) {
        if (isClosed(recruitment) && !targetStatus.isTerminal()) {
            throw new RecruitmentException.ClosedRecruitmentReadOnlyException();
        }
    }
}

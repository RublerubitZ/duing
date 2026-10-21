package com.duing.domain.recruitment.service;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.interview.entity.RoundStatus;
import java.util.List;

/**
 * 기간 종료 모집의 조건부 자동 마감 — 시스템 잡 전용이라 운영진 권한 확인이 없다.
 *
 * <p>마감 조건(전부 만족): 저장 상태 OPEN·삭제 안 됨, 종료일이 있고 종료일 다음 날부터
 * {@link RecruitmentAutoClosePolicy#GRACE_DAYS}일이 지났다({@link RecruitmentAutoClosePolicy#endedBefore}),
 * 결과 없는 지원({@link ApplicationStatus#activeSet()})이 0건, 진행 중 면접 라운드({@link RoundStatus#inProgressSet()})가
 * 0개. 남은 심사·면접이 없는 모집이라 마감해도 운영진이 잃는 작업이 없다 — 마감 뒤에는 모집 수정(종료일 연장 포함)·
 * 평가 입력·라운드 운영이 막히므로({@link ClosedRecruitmentPolicy}) 그런 일은 유예 기간 안에 끝낸다.
 */
public interface RecruitmentAutoCloseService {

    /** 기간 조건(OPEN·삭제 안 됨·종료일 유예 경과)만 본 후보 id — 지원·라운드 조건은 {@link #closeIfSettled} 가 본다. */
    List<Long> findCandidateIds();

    /** 잠금 아래 마감 조건 전체를 다시 확인해 마감한다. 마감했으면 true, 조건 불충족·이미 마감·없음이면 false. */
    boolean closeIfSettled(Long recruitmentId);
}

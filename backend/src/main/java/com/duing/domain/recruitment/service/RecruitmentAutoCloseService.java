package com.duing.domain.recruitment.service;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.service.dto.query.AutoCloseOutlookQuery;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 기간 종료 모집의 조건부 자동 마감과 그 전망.
 *
 * <p>마감 조건(전부 만족): 저장 상태 OPEN·삭제 안 됨, 종료일이 있고 종료일 다음 날부터
 * {@link RecruitmentAutoClosePolicy#GRACE_DAYS}일이 지났다({@link RecruitmentAutoClosePolicy#closesOn}),
 * 결과 없는 지원({@link ApplicationStatus#activeSet()} — 지원자 목록처럼 탈퇴한 지원자의 지원서는 빼고)이 0건, 결과를 기다리는 면접
 * 대상(제외 안 됨·결과 없음·지원 삭제와 지원자 탈퇴 아님)이 남은 진행 중 면접 라운드({@link RoundStatus#inProgressSet()})가 0개 — 그런 라운드의
 * 지원은 결과 없는 지원에도 잡혀 라운드 조건이 혼자 막는 일은 없다. 남은 심사·면접이 없는 모집이라 마감해도 운영진이 잃는 작업이 없다 —
 * 마감 뒤에는 모집 수정(종료일 연장 포함)·평가 입력·라운드 운영이 막히므로({@link ClosedRecruitmentPolicy}) 그런 일은 유예 기간 안에 끝낸다.
 *
 * <p>이 조건은 {@link AutoCloseOutlookQuery} 하나로 계산한다 — 잡({@link #closeIfSettled})과 화면용 전망
 * ({@link #findOutlook}·{@link #findOutlooks})이 같은 집계 쿼리와 같은 조립을 쓴다. 잡은 시스템 작업이라 권한을 보지 않고,
 * 화면용 두 메서드도 권한을 보지 않는다 — 호출자가 먼저 확인한다.
 */
public interface RecruitmentAutoCloseService {

    /** 기간 조건(OPEN·삭제 안 됨·종료일 유예 경과)만 본 후보 id — 지원·라운드 조건은 {@link #closeIfSettled} 가 본다. */
    List<Long> findCandidateIds();

    /** 잠금 아래 마감 조건 전체를 다시 확인해 마감한다. 마감했으면 true, 조건 불충족·이미 마감·없음이면 false. */
    boolean closeIfSettled(Long recruitmentId);

    /**
     * 화면용 자동 마감 전망(단건, 오늘은 서버 시계). 만료-OPEN 이 아니거나 자동 마감이 꺼져 있으면 비어 있다 —
     * 꺼진 동안(롤백 등) "자동 마감 예정"이라고 하면 거짓이 되므로 화면은 옛 동작으로 돌아간다.
     */
    Optional<AutoCloseOutlookQuery> findOutlook(Recruitment recruitment);

    /**
     * 화면용 자동 마감 전망(묶음) — 키는 만료-OPEN 모집 id 뿐이다. 자동 마감이 꺼져 있으면 빈 맵이다.
     * {@code today} 는 호출자가 다른 판정(표시 상태 등)에 쓴 값과 같은 것을 넘긴다.
     */
    Map<Long, AutoCloseOutlookQuery> findOutlooks(Collection<Recruitment> recruitments, LocalDate today);
}

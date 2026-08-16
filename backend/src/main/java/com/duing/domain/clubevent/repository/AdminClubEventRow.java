package com.duing.domain.clubevent.repository;

import java.time.LocalDateTime;

/**
 * 총동연 캘린더용 전 동아리 일정 한 건(동아리명 포함).
 * {@link ClubEventRepository#findWindowAllClubs(LocalDateTime, LocalDateTime)} 의 JPQL 생성자 프로젝션 결과.
 */
public record AdminClubEventRow(Long eventId, Long clubId, String clubName, String title,
                                LocalDateTime startAt, LocalDateTime endAt, String location) {}

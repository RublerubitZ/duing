package com.duing.global.frontend.event;

/**
 * 동아리 공개 상세({@code /clubs/{id}})의 서버 HTML(시드 포함)이 바뀌는 커밋 — 정보 수정(리더·총동연)·중앙 전환·
 * 사진 등록/삭제/순서/캡션·회장 변경에서 발행한다(#1356). 상태 전이·폐쇄는 기존 운영 이벤트({@code ClubStatusChangedEvent}·{@code ClubClosedEvent})를
 * 리스너가 그대로 구독한다. 발행은 반드시 {@code @Transactional} 안에서 한다 — 밖이면 AFTER_COMMIT 리스너에 닿지 않고 로그 없이 버려진다.
 */
public record ClubPublicPageChangedEvent(Long clubId) {
}

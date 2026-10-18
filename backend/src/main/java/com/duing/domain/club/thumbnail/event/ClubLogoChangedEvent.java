package com.duing.domain.club.thumbnail.event;

/**
 * 동아리 로고가 바뀐 커밋(총동연 등록·리더 수정·총동연 수정) — 커밋 뒤 전용 실행기가 썸네일을 만든다(스펙 §4.3).
 * {@code changedByUserId} 는 썸네일 추적 행의 업로더다. 총동연 등록 커맨드에는 행위자 id 가 없어 null 이고, 그때 생성기는
 * 시스템 표식(0)을 쓴다. 비우기(clear)·같은 URL 재전송에는 발행하지 않는다.
 * 발행은 반드시 {@code @Transactional} 안에서 한다 — 밖이면 AFTER_COMMIT 리스너에 닿지 않고 로그 없이 버려진다.
 */
public record ClubLogoChangedEvent(Long clubId, String logoUrl, Long changedByUserId) {
}

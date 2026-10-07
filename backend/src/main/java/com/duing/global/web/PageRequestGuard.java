package com.duing.global.web;

import com.duing.global.exception.InvalidPageRequestException;
import org.springframework.data.domain.Pageable;

/**
 * 클라이언트가 지정한 페이지의 오프셋(page × size)을 int 범위로 제한한다.
 *
 * <p>Spring Data JPA 리포지토리(파생 쿼리·JPQL {@code @Query}·{@code findAll(Pageable)})는 오프셋이 int 최대값을
 * 넘으면 원인 없는 InvalidDataAccessApiUsageException 을 던지고, 전역 핸들러가 이를 500 으로 응답한다. 그런
 * 리포지토리에 클라이언트 Pageable 을 넘기는 엔드포인트는 호출 전에 이 가드로 {@link InvalidPageRequestException}(400)을
 * 낸다. (QueryDSL 경로는 오프셋을 int 최대값으로 잘라 빈 페이지를 돌려주므로 이 가드가 필요 없다.)
 */
public final class PageRequestGuard {

    private PageRequestGuard() {
    }

    public static void assertOffsetWithinInt(Pageable pageable) {
        if (pageable.isPaged() && pageable.getOffset() > Integer.MAX_VALUE) {
            throw new InvalidPageRequestException();
        }
    }
}

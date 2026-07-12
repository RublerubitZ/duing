package com.duing.global.web;

import com.duing.global.exception.InvalidSortException;
import java.util.Set;
import org.springframework.data.domain.Sort;

/**
 * 클라이언트가 지정한 정렬(sort)을 허용된 속성 집합으로 제한한다.
 *
 * <p>클라이언트 sort 를 그대로 쿼리에 넘기는 엔드포인트(특히 JPQL {@code @Query} + Pageable)는, 존재하지
 * 않거나 의도치 않은 속성이 지정되면 Spring Data/Hibernate 가 예외를 던진다. 허용 목록으로 미리 걸러
 * 허용되지 않은 속성은 {@link InvalidSortException}(400)으로 명확히 거부하고, 쿼리에는 안전한 정렬만
 * 도달하게 한다. (공개 목록 API 는 서버 고정 정렬만 쓰므로 이 검증이 필요 없다.)
 */
public final class SortWhitelist {

    private SortWhitelist() {
    }

    public static void assertAllowed(Sort sort, Set<String> allowedProperties) {
        for (Sort.Order order : sort) {
            if (!allowedProperties.contains(order.getProperty())) {
                throw new InvalidSortException(order.getProperty());
            }
        }
    }
}

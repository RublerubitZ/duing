package com.duing.global.exception;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.hibernate.query.sqm.PathElementException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.data.mapping.PropertyReferenceException;
import org.springframework.data.util.TypeInformation;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 정렬(sort) 파라미터가 존재하지 않는 속성을 가리켜 데이터 접근 계층이 예외를 던질 때, 화이트리스트가
 * 없는(전역 백스톱만 있는) 엔드포인트에서도 500 이 아니라 400 으로 응답하는지 검증한다. 파생 쿼리는
 * PropertyReferenceException, JPQL @Query 는 Hibernate PathElementException 으로 각각 다르게 올라온다.
 */
class GlobalExceptionHandlerSortTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new SortStubController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("sort 파라미터가 있는 요청의 파생 쿼리 정렬 오류(PropertyReferenceException)는 400 과 정렬 안내로 응답한다")
    void propertyReferenceExceptionWithSortParamMapsTo400() throws Exception {
        mockMvc.perform(get("/sort-stub/property-reference").param("sort", "bogus"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("지원하지 않는 정렬 조건입니다."));
    }

    @Test
    @DisplayName("sort 파라미터가 있는 요청의 JPQL @Query 정렬 오류(Hibernate PathElementException 래핑)도 400 으로 응답한다")
    void invalidSortInJpqlQueryWithSortParamMapsTo400() throws Exception {
        mockMvc.perform(get("/sort-stub/jpql-path").param("sort", "bogus"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("지원하지 않는 정렬 조건입니다."));
    }

    @Test
    @DisplayName("sort 파라미터 없이 발생한 경로 오류(PathElementException)는 서버측 회귀로 보고 500 을 유지한다")
    void pathElementExceptionWithoutSortParamStays500() throws Exception {
        // 정적 쿼리가 스키마 드리프트·엔티티 리네임으로 깨진 경우 — 클라이언트 sort 가 없으므로 400 으로
        // 위장하지 않고 500 + 스택트레이스로 알린다(관측성 유지).
        mockMvc.perform(get("/sort-stub/jpql-path"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("서버 오류가 발생했습니다."));
    }

    @Test
    @DisplayName("정렬과 무관한 실제 데이터 접근 API 오용은 500 을 유지한다")
    void genuineApiMisuseStays500() throws Exception {
        mockMvc.perform(get("/sort-stub/generic-misuse"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("서버 오류가 발생했습니다."));
    }

    @RestController
    static class SortStubController {

        @GetMapping("/sort-stub/property-reference")
        String propertyReference() {
            throw new PropertyReferenceException("bogus", TypeInformation.of(String.class), List.of());
        }

        @GetMapping("/sort-stub/jpql-path")
        String jpqlPath() {
            throw new InvalidDataAccessApiUsageException("invalid sort",
                    new IllegalArgumentException(new PathElementException("Could not resolve attribute 'bogus'")));
        }

        @GetMapping("/sort-stub/generic-misuse")
        String genericMisuse() {
            throw new InvalidDataAccessApiUsageException("real misuse", new IllegalStateException("bug"));
        }
    }
}

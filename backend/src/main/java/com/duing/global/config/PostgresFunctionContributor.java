package com.duing.global.config;

import org.hibernate.boot.model.FunctionContributions;
import org.hibernate.boot.model.FunctionContributor;
import org.hibernate.type.BasicType;
import org.hibernate.type.StandardBasicTypes;

/**
 * PostgreSQL 전용 배열 함수를 Hibernate HQL 에 등록한다.
 * <p>
 * {@code array_overlap_text(arr, csv)} 는 {@code (arr && string_to_array(csv, ','))} 로
 * 펼쳐져, text[] 컬럼이 콤마로 join 된 검색 문자열과 한 원소라도 겹치는지 검사한다.
 * <p>
 * {@code array_overlap_csv(csv1, csv2)} 는 {@code (string_to_array(nullif(csv1, ''), ',') && string_to_array(csv2, ','))} 로
 * 펼쳐져, CSV TEXT 컬럼끼리 한 원소라도 겹치는지 검사한다. 빈 문자열은 NULL 로 정규화.
 * HQL 이 {@code ARRAY[...]} literal 을 파싱하지 못해 일반 문자열을 받는 형태로 우회한다.
 * <p>
 * {@code hourly_shuffle(source, bucket)} 는 md5 기반 deterministic random — 같은 (source, bucket)
 * 이면 항상 같은 [0,1] 값을 낸다. 추천순 정렬의 시간 순환 성분(설계:
 * docs/superpowers/specs/2026-08-11-club-explore-recommended-sort-design.md).
 * md5 hex 앞 8자를 int 로 읽어 부호비트를 지우고 INT_MAX 로 나눈다 — 테스트의 Java 복제 구현과
 * 반드시 동치를 유지해야 한다.
 * <p>
 * 호출 예: {@code function('array_overlap_text', club.tags, '축구,러닝')}
 * 호출 예: {@code function('array_overlap_csv', club.activeDays, 'MONDAY,WEDNESDAY')}
 * 호출 예: {@code function('array_to_string', club.tags, ',')}
 * 호출 예: {@code hourly_shuffle(club.id, '2026081109')} — 산술 컨텍스트에서 반환 타입이 필요하므로
 * JPA {@code function('...')} 문법이 아닌 직접 호출로 쓴다(전자는 등록된 반환 타입을 무시한다).
 */
public class PostgresFunctionContributor implements FunctionContributor {

    @Override
    public void contributeFunctions(FunctionContributions functionContributions) {
        BasicType<Boolean> booleanType = functionContributions
                .getTypeConfiguration()
                .getBasicTypeRegistry()
                .resolve(StandardBasicTypes.BOOLEAN);
        BasicType<String> stringType = functionContributions
                .getTypeConfiguration()
                .getBasicTypeRegistry()
                .resolve(StandardBasicTypes.STRING);

        functionContributions.getFunctionRegistry().registerPattern(
                "array_overlap_text",
                "(?1 && string_to_array(?2, ','))",
                booleanType
        );

        functionContributions.getFunctionRegistry().registerPattern(
                "array_overlap_csv",
                "(string_to_array(nullif(?1, ''), ',') && string_to_array(?2, ','))",
                booleanType
        );

        functionContributions.getFunctionRegistry().registerPattern(
                "array_to_string",
                "array_to_string(?1, ?2)",
                stringType
        );

        BasicType<Double> doubleType = functionContributions
                .getTypeConfiguration()
                .getBasicTypeRegistry()
                .resolve(StandardBasicTypes.DOUBLE);

        // ?1 이 숫자여도 PG 의 anynonarray || text 오버로드가 텍스트로 이어붙인다.
        functionContributions.getFunctionRegistry().registerPattern(
                "hourly_shuffle",
                "((('x' || substr(md5(?1 || ':' || ?2), 1, 8))::bit(32)::int & 2147483647) / 2147483647.0)",
                doubleType
        );
    }
}

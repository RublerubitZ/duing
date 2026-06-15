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
 * 호출 예: {@code function('array_overlap_text', club.tags, '축구,러닝')}
 * 호출 예: {@code function('array_overlap_csv', club.activeDays, 'MONDAY,WEDNESDAY')}
 * 호출 예: {@code function('array_to_string', club.tags, ',')}
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
    }
}
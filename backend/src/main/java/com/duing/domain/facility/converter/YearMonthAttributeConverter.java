package com.duing.domain.facility.converter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;

/**
 * {@link YearMonth} ↔ {@code VARCHAR(7)}('YYYY-MM') JPA 컨버터.
 *
 * <p>엔티티 필드에 {@code @Convert(converter = YearMonthAttributeConverter.class)} 로 명시 적용한다.
 * JPQL 파라미터 바인딩에는 컨버터가 적용되지만 네이티브 쿼리는 우회하므로, 이 도메인의 벌크 삭제는
 * JPQL(@Modifying @Query)로 작성해 YearMonth 파라미터가 문자열로 변환되게 한다.
 */
@Converter
public class YearMonthAttributeConverter implements AttributeConverter<YearMonth, String> {

    private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("yyyy-MM");

    @Override
    public String convertToDatabaseColumn(YearMonth attribute) {
        return attribute == null ? null : attribute.format(FORMAT);
    }

    @Override
    public YearMonth convertToEntityAttribute(String dbData) {
        return dbData == null ? null : YearMonth.parse(dbData, FORMAT);
    }
}

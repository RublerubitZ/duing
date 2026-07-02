package com.duing.domain.facility.converter;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.YearMonth;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class YearMonthAttributeConverterTest {

    private final YearMonthAttributeConverter converter = new YearMonthAttributeConverter();

    @Test
    @DisplayName("YearMonth 를 YYYY-MM 문자열로 저장하고 null 은 null 로 보존한다")
    void convertToDatabaseColumn() {
        assertThat(converter.convertToDatabaseColumn(YearMonth.of(2026, 7))).isEqualTo("2026-07");
        assertThat(converter.convertToDatabaseColumn(YearMonth.of(2026, 12))).isEqualTo("2026-12");
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
    }

    @Test
    @DisplayName("YYYY-MM 문자열을 YearMonth 로 복원하고 null 은 null 로 보존한다")
    void convertToEntityAttribute() {
        assertThat(converter.convertToEntityAttribute("2026-07")).isEqualTo(YearMonth.of(2026, 7));
        assertThat(converter.convertToEntityAttribute("2026-12")).isEqualTo(YearMonth.of(2026, 12));
        assertThat(converter.convertToEntityAttribute(null)).isNull();
    }
}

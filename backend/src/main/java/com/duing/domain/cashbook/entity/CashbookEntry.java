package com.duing.domain.cashbook.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "cashbook_entry")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE cashbook_entry SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class CashbookEntry extends BaseEntity {

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_type", nullable = false, length = 10)
    private CashbookEntryType entryType;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 10)
    private CashbookSource source;

    @Enumerated(EnumType.STRING)
    @Column(name = "category_code", nullable = false, length = 20)
    private CashbookCategory categoryCode;

    @Column(name = "custom_category", length = 40)
    private String customCategory;

    @Column(nullable = false)
    private Long amount;

    @Column(nullable = false, length = 100)
    private String description;

    @Column(name = "transaction_date", nullable = false)
    private LocalDate transactionDate;

    @Column(length = 200)
    private String memo;

    @Column(name = "attachment_url", length = 500)
    private String attachmentUrl;

    @Column(name = "bank_transaction_id")
    private Long bankTransactionId;

    @Column(nullable = false)
    private boolean excluded;

    @Builder(access = AccessLevel.PRIVATE)
    private CashbookEntry(Long clubId, CashbookEntryType entryType, CashbookSource source,
                          CashbookCategory categoryCode, String customCategory, Long amount,
                          String description, LocalDate transactionDate, String memo,
                          Long bankTransactionId) {
        this.clubId = clubId;
        this.entryType = entryType;
        this.source = source;
        this.categoryCode = categoryCode;
        this.customCategory = customCategory;
        this.amount = amount;
        this.description = description;
        this.transactionDate = transactionDate;
        this.memo = memo;
        this.bankTransactionId = bankTransactionId;
    }

    public static CashbookEntry createManual(Long clubId, CashbookEntryType entryType,
                                             CashbookCategory categoryCode, String customCategory, Long amount,
                                             String description, LocalDate transactionDate, String memo) {
        return CashbookEntry.builder()
                .clubId(clubId).entryType(entryType).source(CashbookSource.MANUAL)
                .categoryCode(categoryCode).customCategory(customCategory).amount(amount)
                .description(description).transactionDate(transactionDate).memo(memo)
                .build();
    }

    /** MANUAL 항목 전체 수정(유형은 불변). */
    public void updateManual(CashbookCategory categoryCode, String customCategory, Long amount,
                             String description, LocalDate transactionDate, String memo) {
        this.categoryCode = categoryCode;
        this.customCategory = customCategory;
        this.amount = amount;
        this.description = description;
        this.transactionDate = transactionDate;
        this.memo = memo;
    }

    /** BANK_API 항목 보정(카테고리·메모만, 금액·날짜·유형·설명 불변). */
    public void updateCategoryAndMemo(CashbookCategory categoryCode, String customCategory, String memo) {
        this.categoryCode = categoryCode;
        this.customCategory = customCategory;
        this.memo = memo;
    }

    /** 집계 제외 플래그 설정(true=집계 제외). 메타 정보라 BANK_API·MANUAL 무관하게 변경 가능. */
    public void updateExcluded(boolean excluded) {
        this.excluded = excluded;
    }

    public boolean isBankApi() {
        return source == CashbookSource.BANK_API;
    }
}

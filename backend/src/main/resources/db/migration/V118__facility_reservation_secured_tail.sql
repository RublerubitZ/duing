-- 물결 꼬리(기본 확보 시간 표기) 신호 보존(행 단위 정밀 분류 스펙 §1). 기존 행은 원본 소실로 false —
-- 다음 크롤 주기의 updateCrawledDetails 갱신으로 자연 치유된다(fail-closed: 치유 전엔 차단).
ALTER TABLE facility_reservation ADD COLUMN secured_tail BOOLEAN NOT NULL DEFAULT false;

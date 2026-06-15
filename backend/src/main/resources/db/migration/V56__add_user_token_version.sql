-- 토큰 폐기용 버전. 로그인 시 발급 토큰에 이 값을 클레임으로 싣고, 매 요청 검증 시 DB 값과 비교해
-- 불일치(로그아웃·강제 폐기로 증가)면 거부한다. 이 변경 이전에 발급된 토큰은 클레임이 없어 0 으로 간주된다.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

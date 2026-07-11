type Props = {
  className?: string;
};

/**
 * 회원가입 Step1 안내 일러스트. `public/duing-signup.svg` 아트워크를 인라인.
 * viewBox 높이를 660 으로 확장해 폰 하단까지 전체가 보이도록 한다.
 * 예시 수신번호(1666-3538)·코드(5WAVK4YZ)는 설명용 고정값이며 실제 값이 아니다.
 */
export function SignupIllustration({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 860 660"
      role="img"
      aria-label="문자로 코드를 보내 본인 인증하는 방법 안내"
      fontFamily="Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    >
      <defs>
        <clipPath id="signup-illus-phone">
          <rect x="210" y="30" width="470" height="620" rx="40" />
        </clipPath>
        <filter id="signup-illus-card" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="20" floodColor="#1F4A36" floodOpacity="0.16" />
        </filter>
        <filter id="signup-illus-btn" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#2E8B57" floodOpacity="0.4" />
        </filter>
      </defs>

      <g>
        <rect x="210" y="30" width="470" height="620" rx="40" fill="#FFFFFF" stroke="#E5E2DA" strokeWidth="3" />
        <g clipPath="url(#signup-illus-phone)">
          <rect x="210" y="30" width="470" height="96" fill="#F0EDE5" />
          <line x1="210" y1="126" x2="680" y2="126" stroke="#E5E2DA" strokeWidth="1" />
          <text x="445" y="90" textAnchor="middle" fontSize="21" fontWeight="700" fill="#2F3433">
            새로운 메시지
          </text>
          <text x="238" y="178" fontSize="18" fill="#6F7574">
            받는 사람 :<tspan fill="#1F4A36" fontWeight="800" dx="4">1666-3538</tspan>
          </text>
        </g>
      </g>

      <g filter="url(#signup-illus-card)">
        <rect x="40" y="300" width="660" height="182" rx="26" fill="#FFFFFF" />
      </g>
      <text x="76" y="350" fontSize="25" fontWeight="700">
        <tspan fill="#6F7574">[</tspan>
        <tspan fill="#1F4A36">두잉</tspan>
        <tspan fill="#6F7574">] 인증문자 보내기</tspan>
      </text>
      <text
        x="76"
        y="436"
        fontSize="44"
        fontWeight="700"
        fill="#2F3433"
        letterSpacing="7"
        fontFamily="'JetBrains Mono', ui-monospace, Menlo, monospace"
      >
        5WAVK4YZ
      </text>

      <circle cx="628" cy="391" r="42" fill="#E8EEE8" />
      <circle cx="628" cy="391" r="30" fill="#2E8B57" filter="url(#signup-illus-btn)" />
      <path
        d="M628 406 V376 M614 390 l14 -14 l14 14"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <g filter="url(#signup-illus-card)">
        <rect x="520" y="176" width="310" height="100" rx="18" fill="#1F4A36" />
        <path d="M560 276 h32 l-16 22 z" fill="#1F4A36" />
      </g>
      <text x="675" y="214" textAnchor="middle" fontSize="23" fontWeight="500" fill="#FFFFFF">
        입력된 문자를 보내면
      </text>
      <text x="675" y="248" textAnchor="middle" fontSize="23" fill="#FFFFFF">
        <tspan fontWeight="800">본인인증</tspan>
        <tspan fontWeight="500">이 됩니다!</tspan>
      </text>
    </svg>
  );
}

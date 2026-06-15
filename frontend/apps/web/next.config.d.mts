// next.config.mjs 는 런타임 JS 라 타입이 없다. 테스트/타입체크에서 설정 객체를 타입 안전하게
// 다루기 위해 기본 export 를 Next 의 NextConfig 로 선언한다(런타임에는 영향 없는 d.ts).
import type { NextConfig } from 'next';

declare const nextConfig: NextConfig;
export default nextConfig;

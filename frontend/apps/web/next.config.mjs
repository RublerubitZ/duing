/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 모노레포 워크스페이스 패키지를 Next 가 트랜스파일하도록 설정
  transpilePackages: [
    '@duing/api',
    '@duing/hooks',
    '@duing/schemas',
    '@duing/storage',
    '@duing/stores',
    '@duing/types',
  ],
  typedRoutes: true,
};

export default nextConfig;

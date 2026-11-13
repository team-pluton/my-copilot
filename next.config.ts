import type { NextConfig } from "next";

/**
 * 공모전 **시연 사이트**다 — 서버가 할 일이 없다.
 *
 * 정적으로 내보내면(out/) 어디에나 올릴 수 있고(Vercel·GitHub Pages·USB),
 * 심사장에서 네트워크가 불안해도 로컬 파일로 띄울 수 있다. 함수가 없으니
 * 요금도 없다. 덕아웃에서 "요청 하나가 함수 하나"로 값을 치른 것을 여기서
 * 반복할 이유가 없다.
 */
const nextConfig: NextConfig = {
  output: "export",
  // 정적 내보내기에는 이미지 최적화 서버가 없다
  images: { unoptimized: true },
  // out/demo.html 이 아니라 out/demo/index.html 로 — 정적 호스팅에서 /demo 가 바로 열린다
  trailingSlash: true,
  // 왼쪽 아래 N 배지 — 시연 캡처·녹화에 찍혀서 끈다 (개발에서만 뜨는 것)
  devIndicators: false,
};

export default nextConfig;

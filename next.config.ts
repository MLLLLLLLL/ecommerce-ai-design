import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 开发模式默认只允许 localhost 请求 dev 资源（JS chunk / HMR），
  // 通过局域网 IP（如手机、其他设备访问）时资源会被阻断，页面只剩 SSR 静态
  // HTML 导致所有交互失效。此处放行本机局域网访问地址。
  allowedDevOrigins: [
    '172.26.224.1',
    '172.26.128.1',
    '192.168.31.209',
    '192.168.83.1',
    '192.168.65.1',
  ],
};

export default nextConfig;

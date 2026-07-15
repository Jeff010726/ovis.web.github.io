# OVIS Device Manager

OVIS 设备管理网页。第一阶段提供设备识别、连接和断线检测。

## 本地开发

```bash
npm install
npm run dev
```

网页会并发探测 `192.168.42.1` 至 `192.168.57.1` 的设备接口，每个地址
使用 `8080/api/v1/device/info`。地址池定义在
`src/features/device/device.api.ts`，搜索结果不会写入 `localStorage`。

## 构建

```bash
npm run build
```

Vite 的默认部署基础路径为 `/ovis-manager-web/`。当前 GitHub 仓库名为
`OVIS_WEB`，部署工作流会在构建时覆盖为 `/OVIS_WEB/`，以匹配实际的
GitHub Pages 项目路径。

# OVIS Device Manager

OVIS 设备管理网页。第一阶段提供设备识别、连接和断线检测。

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

设备 API 地址由 `VITE_DEVICE_API_URL` 配置，默认示例为：

```text
http://192.168.42.1:8080/api/v1
```

## 构建

```bash
npm run build
```

Vite 的默认部署基础路径为 `/ovis-manager-web/`。当前 GitHub 仓库名为
`OVIS_WEB`，部署工作流会在构建时覆盖为 `/OVIS_WEB/`，以匹配实际的
GitHub Pages 项目路径。

首次部署前，在 GitHub 仓库的 `Settings > Secrets and variables > Actions`
中添加 Repository variable：

```text
VITE_DEVICE_API_URL=http://192.168.42.1:8080/api/v1
```

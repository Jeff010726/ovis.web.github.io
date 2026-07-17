# OVIS Device Manager

OVIS 设备管理网页，提供设备发现、连接、断线检测和设备配置。

## 本地开发

```bash
npm install
npm run dev
```

网页先通过 WebUSB 授权 OVIS 复合 USB 设备。设备未配置网络时，用户填写
`192.168.X.1` 中的 `X`；网页拒绝当前连接设备使用重复的 `/24` 网段，通过两阶段
事务保存后再搜索设备 API。板端 DHCP 自动为 PC 的 NCM 网卡分配同网段地址，PC
不需要创建网桥。

未配置设备使用 `PID 0x100E` 的独立 WebUSB 配置模式；保存后立即重新枚举为
`PID 0x100D` 的 `NCM + UVC` 运行设备。设备后续启动会直接恢复已保存地址，不再
加载 WebUSB 配置接口，也不再要求重复配置。网页在提交前把地址写入 `localStorage`，
搜索时优先探测这些自定义地址，同时保留
`192.168.42.1` 至 `192.168.57.1` 作为兼容地址池。首次使用时，用户需要通过
Chrome 或 Edge 的 USB 选择器逐台授权；已授权设备可由
`navigator.usb.getDevices()` 重新获取。

连接设备后，网页从选中设备的 `apiBaseUrl` 读取配置能力和当前配置，支持
视频码流、OSD 与智能检测参数的校验、保存、应用、任务轮询和恢复默认。
当前配置接口不携带登录或认证信息。

配置应用期间会把设备 ID、地址、任务 ID、目标 revision 和开始时间保存到
`sessionStorage`。设备重启断网后，网页只重连相同 `device_id`，并在 90 秒内
通过任务结果和配置 revision 确认应用或回滚；刷新页面不会中断该流程。

## 构建

```bash
npm run build
```

Vite 和 GitHub Pages 部署均使用根路径 `/`，用于自定义域名
`ovis.aimorelogy.com`。仓库通过 GitHub Actions 发布，因此自定义域名应在
仓库的 `Settings > Pages > Custom domain` 中配置，而不是依赖仓库内的
`CNAME` 文件。

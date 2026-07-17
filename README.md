# OVIS Device Manager

OVIS 设备管理网页，提供设备发现、连接、断线检测和设备配置。

## 本地开发

```bash
npm install
npm run dev
```

“搜索设备”会同时扫描 `192.168.0.1` 至 `192.168.255.1` 的 Manager API，并通过
`navigator.usb.getDevices()` 读取已经授权的未初始化设备。两类设备按
`device_id` 合并显示；同一设备同时由网络和 WebUSB 发现时，以已初始化的网络设备
为准。浏览器无法静默发现从未授权的 USB 设备，因此页面另有需要用户点击触发的
“授权 USB 设备”操作。

未初始化设备进入独立初始化页面，用户填写 `192.168.X.1` 中的 `X`。网页先根据
已验证的网络设备检查网段占用，再单独探测目标地址，并通过 `navigator.locks`
避免多个页面同时分配相同网段。提交完成后每 2 秒轮询新地址，最长等待 90 秒，
只有返回相同 `device_id` 才进入现有设备配置页。

未配置设备使用 `PID 0x100E` 的独立 WebUSB 配置模式；保存后立即重新枚举为
`PID 0x100D` 的 `NCM + UVC` 运行设备。设备后续启动会直接恢复已保存地址，不再
加载 WebUSB 配置接口，也不再要求重复配置。网页在提交成功后把地址写入
`localStorage`，后续搜索会优先探测历史成功地址和上次连接地址。首次使用时，用户需要通过
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

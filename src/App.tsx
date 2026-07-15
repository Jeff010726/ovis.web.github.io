import { Box, CircleHelp, Github } from "lucide-react";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { DeviceConnector } from "./features/device/DeviceConnector";
import { useDeviceConnection } from "./features/device/useDeviceConnection";

function App() {
  const connection = useDeviceConnection();

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="./" aria-label="OVIS Manager 首页">
          <span className="brand__symbol">
            <span />
          </span>
          <span className="brand__wordmark">OVIS</span>
          <span className="brand__divider" />
          <span className="brand__product">DEVICE MANAGER</span>
        </a>
        <div className="app-header__actions">
          <ConnectionStatus state={connection.state} />
          <a
            className="icon-button"
            href="https://github.com/Jeff010726/OVIS_WEB"
            target="_blank"
            rel="noreferrer"
            aria-label="打开 GitHub 仓库"
            title="GitHub 仓库"
          >
            <Github size={17} />
          </a>
          <button className="icon-button" type="button" aria-label="帮助" title="帮助">
            <CircleHelp size={17} />
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="page-heading">
          <div>
            <span className="page-heading__kicker">DEVICE CONTROL INTERFACE</span>
            <h1>设备连接</h1>
          </div>
          <div className="phase-mark">
            <Box size={15} />
            <span>PHASE 01</span>
            <strong>IDENTIFY & CONNECT</strong>
          </div>
        </div>

        <section className="workspace-panel" aria-label="设备连接工作区">
          <div className="workspace-panel__rail">
            <span>OVIS / LOCAL NETWORK</span>
            <span>API V1</span>
          </div>
          <DeviceConnector
            state={connection.state}
            device={connection.device}
            error={connection.error}
            connectedAt={connection.connectedAt}
            onConnect={() => void connection.connect()}
            onDisconnect={connection.disconnect}
            onRetry={() => void connection.retry()}
          />
        </section>
      </main>

      <footer className="app-footer">
        <span>OVIS DEVICE MANAGER</span>
        <span>LOCAL CONNECTION PROTOCOL</span>
        <span>BUILD 01</span>
      </footer>
    </div>
  );
}

export default App;

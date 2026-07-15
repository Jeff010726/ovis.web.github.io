import { ConnectionStatus } from "./components/ConnectionStatus";
import { DeviceConnector } from "./features/device/DeviceConnector";
import { useDeviceConnection } from "./features/device/useDeviceConnection";

function App() {
  const connection = useDeviceConnection();

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="./" aria-label="OVIS Manager 首页">
          <span className="brand__wordmark">OVIS</span>
          <span className="brand__divider" />
          <span className="brand__product">DEVICE MANAGER</span>
        </a>
        <div className="app-header__actions">
          <ConnectionStatus state={connection.state} />
        </div>
      </header>

      <main className="main-content">
        <div className="page-heading">
          <h1>设备连接</h1>
        </div>

        <section className="workspace-panel" aria-label="设备连接工作区">
          <DeviceConnector
            state={connection.state}
            devices={connection.devices}
            selectedDevice={connection.selectedDevice}
            device={connection.device}
            error={connection.error}
            connectedAt={connection.connectedAt}
            onScan={() => void connection.scan()}
            onCancelScan={connection.cancelScan}
            onSelectDevice={connection.selectDevice}
            onConnect={() => void connection.connect()}
            onDisconnect={connection.disconnect}
            onRescan={() => void connection.rescan()}
            onRetry={() => void connection.retry()}
          />
        </section>
      </main>
    </div>
  );
}

export default App;

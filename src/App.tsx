import { useTranslation } from "react-i18next";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { DeviceConnector } from "./features/device/DeviceConnector";
import { useDeviceConnection } from "./features/device/useDeviceConnection";

function App() {
  const { t } = useTranslation();
  const connection = useDeviceConnection();
  const isConfigurationView =
    connection.state === "connected" || connection.state === "recovering";

  return (
    <div
      className={`app-shell ${isConfigurationView ? "app-shell--configuration" : ""}`}
    >
      <header className="app-header">
        <a className="brand" href="./" aria-label={t("app.home")}>
          <img
            className="brand__company-logo"
            src={`${import.meta.env.BASE_URL}images/aimorelogy-logo.png`}
            alt=""
          />
          <span className="brand__wordmark">OVIS</span>
          <span className="brand__divider" />
          <span className="brand__product">DEVICE MANAGER</span>
        </a>
        <div className="app-header__actions">
          <LanguageSwitcher />
          <ConnectionStatus
            state={connection.state}
            applicationLocked={connection.applicationLocked}
          />
        </div>
      </header>

      <main className="main-content">
        <section
          className={`workspace-panel ${isConfigurationView ? "workspace-panel--configuration" : ""}`}
          aria-label={t("app.workspace")}
        >
          <DeviceConnector
            state={connection.state}
            devices={connection.devices}
            selectedDevice={connection.selectedDevice}
            device={connection.device}
            error={connection.error}
            connectedAt={connection.connectedAt}
            applicationLocked={connection.applicationLocked}
            onScan={() => void connection.scan()}
            onCancelScan={connection.cancelScan}
            onSelectDevice={connection.selectDevice}
            onConnect={() => void connection.connect()}
            onManualConnect={(ipAddress) =>
              void connection.connectManualAddress(ipAddress)
            }
            onDisconnect={connection.disconnect}
            onRescan={() => void connection.rescan()}
            onRetry={() => void connection.retry()}
            onApplicationLockChange={connection.setApplicationLocked}
            onDeviceRecovered={connection.adoptRecoveredDevice}
          />
        </section>
      </main>
    </div>
  );
}

export default App;

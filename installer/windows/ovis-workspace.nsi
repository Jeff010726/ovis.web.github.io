Unicode true
RequestExecutionLevel admin
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "x64.nsh"

!define PRODUCT_NAME "OVIS Workspace Support"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "Aimorelogy"
!define PRODUCT_WEB_SITE "https://ovis.aimorelogy.com"
!define PRODUCT_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\OVISWorkspaceSupport"

!define WEB_APP_POLICY "[{$\"url$\":$\"https://ovis.aimorelogy.com/$\",$\"default_launch_container$\":$\"window$\",$\"create_desktop_shortcut$\":true,$\"custom_name$\":$\"OVIS Workspace$\"}]"
!define MANAGED_CONFIG_POLICY "[{$\"origin$\":$\"https://ovis.aimorelogy.com$\",$\"managed_configuration_url$\":$\"https://ovis.aimorelogy.com/managed/ovis-workspace-policy-v1.json$\",$\"managed_configuration_hash$\":$\"4e0436a4ad1a5dbf10bda92b3548b982935a755b83227c3f4de2104202ca9d5a$\"}]"
!define WEBUSB_POLICY "[{$\"devices$\":[{$\"vendor_id$\":13126,$\"product_id$\":4110}],$\"urls$\":[$\"https://ovis.aimorelogy.com$\"]}]"

Name "${PRODUCT_NAME}"
OutFile "..\..\public\downloads\OVIS-Workspace-Setup-v1.exe"
InstallDir "$PROGRAMFILES64\Aimorelogy\OVIS Workspace Support"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=1033 "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey /LANG=1033 "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey /LANG=1033 "FileDescription" "OVIS Workspace browser policy installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${PRODUCT_VERSION}"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_LINK "Open OVIS Workspace"
!define MUI_FINISHPAGE_LINK_LOCATION "${PRODUCT_WEB_SITE}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

!macro WriteOvisPolicies REGVIEW
  SetRegView ${REGVIEW}
  WriteRegStr HKLM "SOFTWARE\Policies\Google\Chrome" "WebAppInstallForceList" "${WEB_APP_POLICY}"
  WriteRegStr HKLM "SOFTWARE\Policies\Google\Chrome" "ManagedConfigurationPerOrigin" "${MANAGED_CONFIG_POLICY}"
  WriteRegStr HKLM "SOFTWARE\Policies\Google\Chrome" "WebUsbAllowDevicesForUrls" "${WEBUSB_POLICY}"
  WriteRegStr HKLM "SOFTWARE\Policies\Microsoft\Edge" "WebAppInstallForceList" "${WEB_APP_POLICY}"
  WriteRegStr HKLM "SOFTWARE\Policies\Microsoft\Edge" "ManagedConfigurationPerOrigin" "${MANAGED_CONFIG_POLICY}"
  WriteRegStr HKLM "SOFTWARE\Policies\Microsoft\Edge" "WebUsbAllowDevicesForUrls" "${WEBUSB_POLICY}"
!macroend

!macro RemoveOvisPolicies REGVIEW
  SetRegView ${REGVIEW}
  DeleteRegValue HKLM "SOFTWARE\Policies\Google\Chrome" "WebAppInstallForceList"
  DeleteRegValue HKLM "SOFTWARE\Policies\Google\Chrome" "ManagedConfigurationPerOrigin"
  DeleteRegValue HKLM "SOFTWARE\Policies\Google\Chrome" "WebUsbAllowDevicesForUrls"
  DeleteRegValue HKLM "SOFTWARE\Policies\Microsoft\Edge" "WebAppInstallForceList"
  DeleteRegValue HKLM "SOFTWARE\Policies\Microsoft\Edge" "ManagedConfigurationPerOrigin"
  DeleteRegValue HKLM "SOFTWARE\Policies\Microsoft\Edge" "WebUsbAllowDevicesForUrls"
!macroend

Section "OVIS browser policies" SEC_POLICIES
  SetShellVarContext all
  SetOutPath "$INSTDIR"
  File /oname=ovis-workspace-browser-policies.json "..\policies\ovis-workspace-browser-policies.json"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ${If} ${RunningX64}
    !insertmacro WriteOvisPolicies 64
  ${EndIf}
  !insertmacro WriteOvisPolicies 32

  SetRegView 32
  WriteRegStr HKLM "${PRODUCT_UNINSTALL_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${PRODUCT_UNINSTALL_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${PRODUCT_UNINSTALL_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${PRODUCT_UNINSTALL_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr HKLM "${PRODUCT_UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKLM "${PRODUCT_UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${PRODUCT_UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  ${If} ${RunningX64}
    !insertmacro RemoveOvisPolicies 64
  ${EndIf}
  !insertmacro RemoveOvisPolicies 32
  SetRegView 32
  DeleteRegKey HKLM "${PRODUCT_UNINSTALL_KEY}"
  Delete "$INSTDIR\ovis-workspace-browser-policies.json"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd

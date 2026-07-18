#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$root_dir/public/downloads"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ovis-workspace-installers.XXXXXX")"
policy_source="$root_dir/installer/policies/ovis-workspace-browser-policies.json"

mkdir -p "$output_dir" "$work_dir/deb/DEBIAN"

cp "$root_dir/installer/linux/control" "$work_dir/deb/DEBIAN/control"
for policy_dir in \
  etc/opt/chrome/policies/managed \
  etc/chromium/policies/managed \
  etc/opt/edge/policies/managed; do
  mkdir -p "$work_dir/deb/$policy_dir"
  cp "$policy_source" "$work_dir/deb/$policy_dir/ovis-workspace.json"
done
dpkg-deb --root-owner-group --build "$work_dir/deb" \
  "$output_dir/OVIS-Workspace-Setup-v1.deb"

cp "$root_dir/installer/macos/OVIS-Workspace-Setup-v1.mobileconfig" \
  "$output_dir/OVIS-Workspace-Setup-v1.mobileconfig"

if ! command -v makensis >/dev/null 2>&1; then
  echo "makensis is required to build the Windows installer" >&2
  exit 1
fi
(
  cd "$root_dir/installer/windows"
  makensis -V2 ovis-workspace.nsi
)

(
  cd "$output_dir"
  sha256sum \
    OVIS-Workspace-Setup-v1.exe \
    OVIS-Workspace-Setup-v1.deb \
    OVIS-Workspace-Setup-v1.mobileconfig \
    > SHA256SUMS
)

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const downloads = new URL("../public/downloads/", import.meta.url);
const artifacts = [
  { name: "OVIS-Workspace-Setup-v1.exe", magic: "MZ", minimumSize: 100_000 },
  { name: "OVIS-Workspace-Setup-v1.deb", magic: "!<arch>\n", minimumSize: 1_000 },
  {
    name: "OVIS-Workspace-Setup-v1.mobileconfig",
    magic: "<?xml",
    minimumSize: 4_000,
  },
];

const checksumFile = await readFile(new URL("SHA256SUMS", downloads), "utf8");
const checksums = new Map(
  checksumFile
    .trim()
    .split("\n")
    .map((line) => {
      const [hash, name] = line.trim().split(/\s+/, 2);
      return [name, hash];
    }),
);

for (const artifact of artifacts) {
  const bytes = await readFile(new URL(artifact.name, downloads));
  if (bytes.byteLength < artifact.minimumSize) {
    throw new Error(`${artifact.name} is unexpectedly small`);
  }
  if (!bytes.subarray(0, artifact.magic.length).equals(Buffer.from(artifact.magic))) {
    throw new Error(`${artifact.name} has an invalid file signature`);
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (checksums.get(artifact.name) !== actual) {
    throw new Error(`${artifact.name} does not match SHA256SUMS`);
  }
  console.log(`${artifact.name} SHA-256: ${actual}`);
}

const mobileconfig = await readFile(
  new URL("OVIS-Workspace-Setup-v1.mobileconfig", downloads),
  "utf8",
);
for (const requiredValue of [
  "com.google.Chrome",
  "com.microsoft.Edge",
  "WebAppInstallForceList",
  "ManagedConfigurationPerOrigin",
  "WebUsbAllowDevicesForUrls",
  "https://ovis.aimorelogy.com",
  "<integer>13126</integer>",
  "<integer>4110</integer>",
]) {
  if (!mobileconfig.includes(requiredValue)) {
    throw new Error(`mobileconfig is missing ${requiredValue}`);
  }
}

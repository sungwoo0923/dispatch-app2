import fs from "fs";

const file = new URL("./package.json", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(file, "utf-8"));

let [major, minor, patch] = pkg.version.split(".").map(Number);

// 🔥 PATCH 증가
// 교체 후
patch += 1;

// 🔥 patch 30 초과 → minor 올리고 patch 1
if (patch > 30) {
  patch = 1;
  minor += 1;
}

// 🔥 minor 30 초과 → major 올리고 minor 1
if (minor > 30) {
  minor = 1;
  major += 1;
}

pkg.version = `${major}.${minor}.${patch}`;

fs.writeFileSync(file, JSON.stringify(pkg, null, 2));

console.log("✅ Version updated:", pkg.version);
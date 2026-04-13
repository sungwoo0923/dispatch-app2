import fs from "fs";

const file = new URL("./package.json", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(file, "utf-8"));

let [major, minor, patch] = pkg.version.split(".").map(Number);

// 🔥 PATCH 증가
patch += 1;

pkg.version = `${major}.${minor}.${patch}`;

fs.writeFileSync(file, JSON.stringify(pkg, null, 2));

console.log("✅ Version updated:", pkg.version);
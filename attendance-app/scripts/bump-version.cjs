// Runs automatically before every `npm run build` (npm's implicit "pre"
// hook). Bumps the minor version 1..30, then rolls over into the next major
// version (v1.30 -> v2.1) so a deploy's version number always visibly moves,
// letting anyone confirm a new build actually went out just by reading it
// off the login screen.
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "version.json");
const current = JSON.parse(fs.readFileSync(file, "utf8"));

let { major, minor } = current;
minor += 1;
if (minor > 30) {
  minor = 1;
  major += 1;
}

fs.writeFileSync(file, JSON.stringify({ major, minor }, null, 2) + "\n");
console.log(`Version bumped to v${major}.${minor}`);

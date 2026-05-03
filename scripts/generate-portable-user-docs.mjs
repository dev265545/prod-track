/**
 * Writes bilingual user docs + changelog into portable/docs/ before zipping.
 * Env: VERSION (e.g. 0.1.26) — optional, defaults to root package.json version.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = process.env.VERSION?.trim() || pkg.version;
const outDir = path.join(root, "portable", "docs");

function gitRecentChangelog(max = 35) {
  try {
    const lines = execSync(
      `git log -n ${max} --pretty=format:%h%x09%s`,
      { cwd: root, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    return lines
      .map((line) => {
        const tab = line.indexOf("\t");
        const h = tab >= 0 ? line.slice(0, tab) : line;
        const s = tab >= 0 ? line.slice(tab + 1) : "";
        return `- \`${h}\` ${s}`;
      })
      .join("\n");
  } catch {
    return "- _(Git history unavailable in this environment)_";
  }
}

const commitsMd = gitRecentChangelog();

const userGuideEn = `# ProdTrack portable — user guide (English)

**Version ${version}**

## 1. Unzip

- Extract the ZIP anywhere you like (Desktop is fine).
- Keep the \`portable\` folder structure as-is. You must have \`portable/web/\` including \`wasm/sql-wasm.wasm\`.

## 2. Start the local server

- **Windows:** double-click \`portable/Start-ProdTrack.cmd\` (or run it from a terminal).
- **Linux / macOS:** in a terminal, \`cd\` to the folder that contains \`portable/\`, then:
  - \`chmod +x portable/Start-ProdTrack.sh\` (first time only)
  - \`./portable/Start-ProdTrack.sh\`

A small local HTTP server starts and your browser should open (Chrome or another Chromium-based browser is recommended).

## 3. Database file (.db)

- The app runs in the browser with **sql.js** and may ask you to **pick your database file** using the **File System Access API** (folder or \`.db\` file), depending on your flow.
- Grant permission when the browser prompts so ProdTrack can read/write your \`.db\`.
- If you do not have a database yet, follow the app’s onboarding / empty state to create or attach one.

## 4. Troubleshooting

- If the page is blank, check the terminal for errors and confirm \`portable/web/index.html\` exists.
- Use a recent browser; older browsers may lack required APIs.
`;

const userGuideHi = `# ProdTrack पोर्टेबल — उपयोगकर्ता गाइड (हिन्दी)

**संस्करण ${version}**

## 1. ज़िप खोलें

- ज़िप को कहीं भी निकालें (डेस्कटॉप ठीक है)।
- \`portable\` फ़ोल्डर की संरचना न बदलें। \`portable/web/\` के अंदर \`wasm/sql-wasm.wasm\` ज़रूरी है।

## 2. लोकल सर्वर चालू करें

- **Windows:** \`portable/Start-ProdTrack.cmd\` पर डबल-क्लिक करें (या टर्मिनल से चलाएँ)।
- **Linux / macOS:** टर्मिनल में उस फ़ोल्डर में जाएँ जहाँ \`portable/\` है, फिर:
  - पहली बार: \`chmod +x portable/Start-ProdTrack.sh\`
  - \`./portable/Start-ProdTrack.sh\`

एक छोटा HTTP सर्वर चलेगा और ब्राउज़र खुलना चाहिए (Chrome या Chromium आधारित ब्राउज़र बेहतर है)।

## 3. डेटाबेस फ़ाइल (.db)

- ऐप ब्राउज़र में **sql.js** के साथ चलता है और **File System Access API** से आपसे **फ़ोल्डर या \`.db\` फ़ाइल** चुनने को कह सकता है।
- जब ब्राउज़र अनुमति माँगे, **Allow** करें ताकि ProdTrack आपकी \`.db\` पढ़/लिख सके।
- अगर अभी तक डेटाबेस नहीं है, तो ऐप में दिखने वाले निर्देशों से नया बनाएँ या जोड़ें।

## 4. समस्या निवारण

- पेज खाली हो तो टर्मिनल में त्रुटि देखें और जाँचें कि \`portable/web/index.html\` मौजूद है।
- नया ब्राउज़र उपयोग करें; पुराने ब्राउज़र में ज़रूरी API नहीं मिल सकतीं।
`;

const changelogEn = `# Changelog highlights (English)

**ProdTrack ${version}** — recent commits (newest first):

${commitsMd}

_Full history: see Git history / GitHub commits for this repository._
`;

const changelogHi = `# परिवर्तन सूची (हिन्दी)

**ProdTrack ${version}** — हाल के कमिट (नवीनतम पहले):

नीचे की पंक्तियाँ **तकनीकी विवरण अंग्रेज़ी में** हैं (Git संदेश वैसे ही रखे गए हैं):

${commitsMd}

_पूरी जानकारी: इस रिपॉज़िटरी में Git / GitHub कमिट इतिहास देखें।_
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "USER_GUIDE_EN.md"), userGuideEn, "utf8");
fs.writeFileSync(path.join(outDir, "USER_GUIDE_HI.md"), userGuideHi, "utf8");
fs.writeFileSync(path.join(outDir, "CHANGELOG_USER_EN.md"), changelogEn, "utf8");
fs.writeFileSync(path.join(outDir, "CHANGELOG_USER_HI.md"), changelogHi, "utf8");

console.log(`Wrote portable/docs/* for version ${version}`);

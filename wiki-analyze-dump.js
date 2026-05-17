/**
 * wiki-analyze-dump.js
 *
 * Analyzes a MediaWiki XML dump file — orders of magnitude faster than
 * the API crawler because there are no HTTP requests, no Cloudflare,
 * no rate limits.
 *
 * HOW TO GENERATE THE DUMP (run on the wiki server):
 *   cd /var/www/mediawiki   (or wherever MediaWiki is installed)
 *   php maintenance/dumpBackup.php --full --output=gzip:./dump.xml.gz
 *   # Or for just current revisions (smaller file, usually enough):
 *   php maintenance/dumpBackup.php --current --output=gzip:./dump.xml.gz
 *
 * TRANSFER TO YOUR MACHINE:
 *   scp user@wikiserver:/var/www/mediawiki/dump.xml.gz ./
 *   # Or run this script directly on the wiki server
 *
 * USAGE:
 *   node wiki-analyze-dump.js dump.xml.gz
 *   node wiki-analyze-dump.js dump.xml.gz --namespace 0
 *   node wiki-analyze-dump.js dump.xml.gz --save-wikitext
 *   node wiki-analyze-dump.js dump.xml      (uncompressed also works)
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const { stringify } = require("csv-stringify/sync");

// ─── Config ───────────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(__dirname, "wiki-analysis");

const args = process.argv.slice(2);
const dumpFile = args.find((a) => !a.startsWith("--"));
const NAMESPACE_FILTER = (() => {
  const i = args.indexOf("--namespace");
  return i !== -1 && args[i + 1] ? args[i + 1] : "0";
})();
const SAVE_WIKITEXT = args.includes("--save-wikitext");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i !== -1 && args[i + 1] ? parseInt(args[i + 1]) : null;
})();

if (!dumpFile || !fs.existsSync(dumpFile)) {
  console.error("Usage: node wiki-analyze-dump.js <dump.xml.gz> [--namespace 0] [--save-wikitext]");
  console.error("");
  console.error("Generate dump on wiki server:");
  console.error("  php maintenance/dumpBackup.php --current --output=gzip:./dump.xml.gz");
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ─── Content analysis (same logic as wiki-analyze.js) ────────────────────────

function detectPageType(wikitext, categories, byteSize) {
  if (!wikitext || byteSize === 0) return "stub";
  if (/^#REDIRECT/i.test(wikitext.trim())) return "redirect";
  if (byteSize < 100) return "stub";
  if (
    /{{[\s\S]{0,20}EventDetails/i.test(wikitext) ||
    /Pictures from the day/i.test(wikitext) ||
    /Presidential Daily Briefing/i.test(wikitext)
  ) return "event";

  const headingsLower = (wikitext.match(/^=+([^=]+)=+/gm) || [])
    .map((h) => h.replace(/=+/g, "").trim().toLowerCase());

  if (
    headingsLower.includes("pramana") ||
    (headingsLower.includes("transliteration") && headingsLower.includes("translation"))
  ) return "dharana";

  if (
    categories.some((c) => /press meet/i.test(c)) ||
    headingsLower.some((h) => h.includes("link to video") || h.includes("description"))
  ) return "press_meet";

  const tamilChars = (wikitext.match(/[஀-௿]/g) || []).length;
  if (tamilChars > 10) return "tamil";

  return "article";
}

function analyzeWikitext(wikitext, categories, byteSize) {
  const result = {
    pageType: detectPageType(wikitext, categories, byteSize),
    hasGallery: false,
    hasInfobox: false,
    hasEventDetails: false,
    hasTable: false,
    hasVideo: false,
    hasMultilingualContent: false,
    headings: [],
    externalLinkCount: 0,
    galleryImageCount: 0,
    internalLinkCount: 0,
    wordCount: 0,
    detectedTemplates: [],
    languages: [],
    eventDetails: {},
  };

  if (!wikitext) return result;

  result.hasGallery = /<gallery/i.test(wikitext);
  result.hasInfobox = /{{[^}]*[Ii]nfobox/i.test(wikitext);
  result.hasEventDetails = /{{[\s\S]{0,20}EventDetails/i.test(wikitext);
  result.hasTable = /{\|/.test(wikitext);
  result.hasVideo =
    /#evu:/i.test(wikitext) ||
    /youtube\.com|youtu\.be/i.test(wikitext) ||
    /{{[^}]*[Vv]ideo/i.test(wikitext);

  // Language detection
  const tamilChars = (wikitext.match(/[஀-௿]/g) || []).length;
  const devanagariChars = (wikitext.match(/[ऀ-ॿ]/g) || []).length;
  const langs = ["en"];
  if (tamilChars > 5) langs.push("ta");
  if (devanagariChars > 5) langs.push("sa");
  result.languages = langs;
  result.hasMultilingualContent = langs.length > 1;

  // Headings
  result.headings = [...wikitext.matchAll(/^(={1,6})([^=\n]+)\1/gm)].map((m) => ({
    level: m[1].length,
    text: m[2].trim(),
  }));

  result.externalLinkCount = (wikitext.match(/\[https?:\/\//gi) || []).length;
  result.internalLinkCount = (wikitext.match(/\[\[[^\]]+\]\]/g) || []).length;

  if (result.hasGallery) {
    const galleries = wikitext.match(/<gallery[^>]*>[\s\S]*?<\/gallery>/gi) || [];
    for (const g of galleries) {
      result.galleryImageCount += (g.match(/\.(jpg|jpeg|png|gif|webp)/gi) || []).length;
    }
  }

  // Parse EventDetails template fields
  if (result.hasEventDetails) {
    const m = wikitext.match(/{{[\s\S]{0,20}EventDetails\|([\s\S]*?)}}/i);
    if (m) {
      for (const pair of m[1].split("|")) {
        const [k, v] = pair.split("=");
        if (k && v !== undefined) result.eventDetails[k.trim()] = v.trim();
      }
    }
  }

  // Extract image links from wikitext
  result.imageLinks = [...wikitext.matchAll(/\[\[(?:File|Image):([^\]|]+)/gi)].map(
    (m) => m[1].trim()
  );

  // All template names
  result.detectedTemplates = [
    ...new Set(
      [...wikitext.matchAll(/{{([^|}\n]{1,60})/g)].map((m) => m[1].trim()).filter(Boolean)
    ),
  ];

  const plain = wikitext
    .replace(/{{[\s\S]*?}}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/[=\[\]{}|]/g, " ");
  result.wordCount = plain.split(/\s+/).filter(Boolean).length;

  return result;
}

// ─── XML dump parser (streaming, handles files of any size) ──────────────────

/**
 * MediaWiki XML dump structure:
 *
 * <mediawiki>
 *   <page>
 *     <title>Page Title</title>
 *     <ns>0</ns>
 *     <id>12345</id>
 *     <revision>
 *       <id>67890</id>
 *       <timestamp>2024-01-01T00:00:00Z</timestamp>
 *       <contributor><username>Editor</username></contributor>
 *       <text bytes="1234" xml:space="preserve">wikitext here</text>
 *     </revision>
 *   </page>
 * </mediawiki>
 *
 * We use a line-by-line state machine — no XML library needed, handles
 * multi-GB dumps without loading everything into memory.
 */
async function parseDump(filePath, onPage) {
  const isGzip = filePath.endsWith(".gz");
  const fileStream = fs.createReadStream(filePath);
  const stream = isGzip ? fileStream.pipe(zlib.createGunzip()) : fileStream;

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let inPage = false;
  let inRevision = false;
  let inText = false;
  let inContributor = false;
  let page = {};
  let textBuffer = [];
  let totalSeen = 0;

  for await (const line of rl) {
    const trimmed = line.trim();

    if (trimmed === "<page>") {
      inPage = true;
      page = { categories: [], templates: [], images: [] };
      continue;
    }

    if (!inPage) continue;

    if (trimmed === "</page>") {
      inPage = false;
      if (NAMESPACE_FILTER !== "all" && String(page.ns) !== NAMESPACE_FILTER) continue;
      totalSeen++;
      if (LIMIT && totalSeen > LIMIT) break;
      await onPage(page);
      continue;
    }

    if (trimmed === "<revision>") { inRevision = true; continue; }
    if (trimmed === "</revision>") { inRevision = false; continue; }
    if (trimmed === "<contributor>") { inContributor = true; continue; }
    if (trimmed === "</contributor>") { inContributor = false; continue; }

    // Simple field extraction
    const extract = (tag) => {
      const m = trimmed.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1] : null;
    };

    if (!inRevision) {
      if (trimmed.startsWith("<title>")) page.title = extract("title");
      if (trimmed.startsWith("<ns>")) page.ns = parseInt(extract("ns") || "0");
      if (trimmed.startsWith("<id>") && !page.id) page.id = parseInt(extract("id") || "0");
    }

    if (inContributor && trimmed.startsWith("<username>")) {
      page.lastEditor = extract("username");
    }

    if (inRevision && !inContributor) {
      if (trimmed.startsWith("<timestamp>")) page.lastEdited = extract("timestamp");
      if (trimmed.startsWith("<id>") && !page.revisionId) page.revisionId = extract("id");

      // Text tag — may span multiple lines
      if (trimmed.startsWith("<text")) {
        const bytesMatch = trimmed.match(/bytes="(\d+)"/);
        page.byteSize = bytesMatch ? parseInt(bytesMatch[1]) : 0;

        if (trimmed.includes("</text>")) {
          // Single-line text
          const m = trimmed.match(/<text[^>]*>([\s\S]*?)<\/text>/);
          page.wikitext = m ? m[1] : "";
        } else {
          inText = true;
          const afterTag = trimmed.replace(/^<text[^>]*>/, "");
          textBuffer = afterTag ? [afterTag] : [];
        }
        continue;
      }

      if (inText) {
        if (trimmed.endsWith("</text>")) {
          textBuffer.push(trimmed.slice(0, -7));
          page.wikitext = textBuffer.join("\n");
          textBuffer = [];
          inText = false;
        } else {
          textBuffer.push(line); // preserve original indentation in wikitext
        }
      }
    }
  }
}

// ─── Aggregate insights (same as wiki-analyze.js) ────────────────────────────

function buildInsights(pages) {
  const templateFreq = {};
  const categoryFreq = {};
  const pageTypeCount = {};
  const namespaceCount = {};
  const langCount = {};
  let totalWords = 0, totalImages = 0, pagesWithGallery = 0;
  let pagesWithEventDetails = 0, pagesWithInfobox = 0, pagesWithVideo = 0;

  for (const p of pages) {
    namespaceCount[p.ns] = (namespaceCount[p.ns] || 0) + 1;
    if (!p.contentAnalysis) continue;
    const a = p.contentAnalysis;

    pageTypeCount[a.pageType] = (pageTypeCount[a.pageType] || 0) + 1;
    totalWords += a.wordCount || 0;
    totalImages += (a.imageLinks || []).length;
    if (a.hasGallery) pagesWithGallery++;
    if (a.hasEventDetails) pagesWithEventDetails++;
    if (a.hasInfobox) pagesWithInfobox++;
    if (a.hasVideo) pagesWithVideo++;

    for (const lang of a.languages || []) {
      langCount[lang] = (langCount[lang] || 0) + 1;
    }
    for (const t of a.detectedTemplates || []) {
      templateFreq[t] = (templateFreq[t] || 0) + 1;
    }
    for (const c of p.categories || []) {
      categoryFreq[c] = (categoryFreq[c] || 0) + 1;
    }
  }

  return {
    totalPages: pages.length,
    namespaceBreakdown: namespaceCount,
    pageTypeBreakdown: pageTypeCount,
    languageBreakdown: langCount,
    pagesWithGallery,
    pagesWithEventDetails,
    pagesWithInfobox,
    pagesWithVideo,
    totalWords,
    avgWordsPerPage: pages.length ? Math.round(totalWords / pages.length) : 0,
    totalImages,
    topTemplates: Object.entries(templateFreq)
      .sort((a, b) => b[1] - a[1]).slice(0, 100)
      .map(([name, count]) => ({ name, count })),
    topCategories: Object.entries(categoryFreq)
      .sort((a, b) => b[1] - a[1]).slice(0, 100)
      .map(([name, count]) => ({ name, count })),
    migrationComplexity: {
      redirect: pageTypeCount.redirect || 0,
      stub: pageTypeCount.stub || 0,
      event: pageTypeCount.event || 0,
      dharana: pageTypeCount.dharana || 0,
      press_meet: pageTypeCount.press_meet || 0,
      tamil: pageTypeCount.tamil || 0,
      article: pageTypeCount.article || 0,
    },
  };
}

function buildCsvRows(pages) {
  const header = [
    "PageID", "Title", "Namespace", "PageType", "URL", "LastEditor",
    "LastEdited", "ByteSize", "WordCount", "Languages", "Categories",
    "HasGallery", "GalleryImages", "HasInfobox", "HasEventDetails",
    "HasVideo", "InternalLinks", "ExternalLinks", "Headings",
    "EventType", "ParticipantsCount", "VolunteersCount",
  ];

  const rows = [header];
  for (const p of pages) {
    const a = p.contentAnalysis || {};
    const url = `https://nithyanandapedia.org/wiki/${encodeURIComponent(
      (p.title || "").replace(/ /g, "_")
    )}`;
    rows.push([
      p.id, p.title, p.ns, a.pageType || "",
      url, p.lastEditor || "", p.lastEdited || "", p.byteSize || 0,
      a.wordCount || 0, (a.languages || []).join(", "),
      (p.categories || []).join(" | "),
      a.hasGallery ? "YES" : "no", a.galleryImageCount || 0,
      a.hasInfobox ? "YES" : "no", a.hasEventDetails ? "YES" : "no",
      a.hasVideo ? "YES" : "no",
      a.internalLinkCount || 0, a.externalLinkCount || 0,
      (a.headings || []).map((h) => `${"=".repeat(h.level)}${h.text}`).join(" | "),
      a.eventDetails?.eventType || "",
      a.eventDetails?.participantsCount || "",
      a.eventDetails?.volunteersCount || "",
    ]);
  }
  return stringify(rows);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  ensureOutputDir();

  log(`Reading dump: ${dumpFile}`);
  log(`Namespace filter: ${NAMESPACE_FILTER}`);
  log(`Save wikitext: ${SAVE_WIKITEXT}`);
  if (LIMIT) log(`Limit: ${LIMIT} pages`);
  log("Parsing...");

  const pages = [];
  let count = 0;
  const startTime = Date.now();

  await parseDump(dumpFile, async (page) => {
    count++;
    if (count % 500 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      log(`  ${count} pages processed (${elapsed}s elapsed)`);
    }

    // Extract categories from wikitext (dump doesn't include them in metadata)
    const wikitextCategories = page.wikitext
      ? [...page.wikitext.matchAll(/\[\[Category:([^\]|]+)/gi)].map((m) => m[1].trim())
      : [];

    page.categories = wikitextCategories;

    const analysis = analyzeWikitext(page.wikitext || "", page.categories, page.byteSize || 0);
    page.contentAnalysis = analysis;

    // Optionally strip wikitext to save disk space
    if (!SAVE_WIKITEXT && !["event", "dharana", "press_meet"].includes(analysis.pageType)) {
      page.wikitext = `[${page.byteSize}b]`;
    }

    pages.push(page);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Parsed ${pages.length} pages in ${elapsed}s`);

  log("Building insights...");
  const insights = buildInsights(pages);

  log("Writing output files...");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "report.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), source: "xml-dump", dumpFile, insights, pages }, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "insights.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), source: "xml-dump", ...insights }, null, 2)
  );
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.csv"), buildCsvRows(pages));

  log("");
  log("=== Output ===");
  log(`  wiki-analysis/insights.json`);
  log(`  wiki-analysis/summary.csv`);
  log(`  wiki-analysis/report.json`);
  log("");
  log(`=== Results (${elapsed}s) ===`);
  log(`Total pages:      ${insights.totalPages}`);
  log(`Page types:       ${JSON.stringify(insights.pageTypeBreakdown)}`);
  log(`Languages:        ${JSON.stringify(insights.languageBreakdown)}`);
  log(`Event pages:      ${insights.pagesWithEventDetails}`);
  log(`With galleries:   ${insights.pagesWithGallery}`);
  log(`With video:       ${insights.pagesWithVideo}`);
  log(`Top 5 templates:  ${insights.topTemplates.slice(0, 5).map((t) => `${t.name}(${t.count})`).join(", ")}`);
  log(`Top 5 categories: ${insights.topCategories.slice(0, 5).map((c) => `${c.name}(${c.count})`).join(", ")}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });

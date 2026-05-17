/**
 * MediaWiki Analysis Script — nithyanandapedia.org
 *
 * Crawls all pages and produces:
 *   wiki-analysis/report.json    full structured data per page
 *   wiki-analysis/summary.csv    per-page summary (open in Google Sheets)
 *   wiki-analysis/insights.json  aggregate stats: templates, categories, page types
 *
 * Usage:
 *   node wiki-analyze.js                      full crawl, main namespace
 *   node wiki-analyze.js --limit 100          test with first N pages
 *   node wiki-analyze.js --namespace all      include all namespaces
 *   node wiki-analyze.js --resume             resume from last checkpoint
 *   node wiki-analyze.js --save-all-wikitext  include raw wikitext for every page
 */

require("dotenv").config();
const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
const fs = require("fs");
const path = require("path");
const { stringify } = require("csv-stringify/sync");

// ─── Config ───────────────────────────────────────────────────────────────────

const API_URL = "https://nithyanandapedia.org/api.php";
const OUTPUT_DIR = path.join(__dirname, "wiki-analysis");
const CHECKPOINT_FILE = path.join(OUTPUT_DIR, "checkpoint.json");

const DELAY_MS = 1500;          // polite gap between every request
const CONTENT_DELAY_MS = 1500;  // same — origin is overloaded, don't hammer it
const REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRIES = 5;
// Cloudflare says retry_after: 60s on 502. Use 65s minimum, then back off further.
const RETRY_BACKOFF_MS = [65000, 90000, 120000, 180000, 300000];

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const hasFlag = (flag) => args.includes(flag);

const LIMIT = getArg("--limit", null);
const NAMESPACE = getArg("--namespace", "0");
const RESUME = hasFlag("--resume");
const SAVE_ALL_WIKITEXT = hasFlag("--save-all-wikitext");

// ─── HTTP client ──────────────────────────────────────────────────────────────

const cookieJar = new tough.CookieJar();
const api = wrapper(
  axios.create({
    baseURL: API_URL,
    withCredentials: true,
    jar: cookieJar,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Browser-like UA — avoids bot-blocking on some wiki configs
      "User-Agent":
        "Mozilla/5.0 (compatible; WikiMigrationBot/1.0; research purposes)",
    },
  })
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function saveCheckpoint(data) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"));
}

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function withRetry(fn, label) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      const isRetryable =
        status === 502 || status === 503 || status === 429 ||
        err.code === "ECONNABORTED" || err.code === "ECONNRESET" ||
        err.message.includes("timeout");

      if (!isRetryable || attempt === MAX_RETRIES) throw err;

      // Respect Cloudflare's retry_after if present (in seconds)
      const cfRetryAfter = err.response?.data?.retry_after;
      const wait = cfRetryAfter
        ? cfRetryAfter * 1000 + 2000   // add 2s buffer on top of CF's suggestion
        : RETRY_BACKOFF_MS[attempt];

      log(`  502/timeout on "${label}" — waiting ${Math.round(wait / 1000)}s before retry ${attempt + 1}/${MAX_RETRIES}`);
      await sleep(wait);
    }
  }
}

// ─── MediaWiki API ────────────────────────────────────────────────────────────

async function fetchAllPageTitles(namespace) {
  log(`Fetching all page titles (namespace: ${namespace})...`);
  const titles = [];
  let apcontinue = null;

  do {
    const params = {
      action: "query",
      list: "allpages",
      aplimit: 500,
      format: "json",
    };
    if (namespace !== "all") params.apnamespace = namespace;
    if (apcontinue) params.apcontinue = apcontinue;

    const res = await withRetry(() => api.get("", { params }), "allpages");
    const data = res.data;

    if (data.query?.allpages) {
      for (const page of data.query.allpages) {
        titles.push({ pageid: page.pageid, title: page.title, ns: page.ns });
      }
    }

    apcontinue = data.continue?.apcontinue ?? null;
    if (LIMIT && titles.length >= parseInt(LIMIT)) break;
    if (apcontinue) await sleep(DELAY_MS);
  } while (apcontinue);

  return LIMIT ? titles.slice(0, parseInt(LIMIT)) : titles;
}

async function fetchPageContent(title) {
  const res = await withRetry(
    () =>
      api.get("", {
        params: {
          action: "query",
          prop: "revisions|categories|images|links|templates|info",
          titles: title,
          rvprop: "content|timestamp|user|size",
          rvslots: "main",
          cllimit: 100,
          imlimit: 100,
          lllimit: 100,
          tllimit: 100,
          inprop: "url|displaytitle",
          format: "json",
        },
      }),
    title
  );

  const pages = res.data.query?.pages;
  if (!pages) return null;

  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;

  const rev = page.revisions?.[0];
  const wikitext = rev?.slots?.main?.["*"] ?? "";

  return {
    pageid: page.pageid,
    title: page.title,
    displayTitle: page.displaytitle || page.title,
    url: page.fullurl || "",
    lastEditor: rev?.user ?? "",
    lastEdited: rev?.timestamp ?? "",
    byteSize: rev?.size ?? 0,
    wikitext,
    categories: (page.categories || []).map((c) => c.title.replace(/^Category:/, "")),
    images: (page.images || []).map((i) => i.title),
    internalLinks: (page.links || []).map((l) => l.title),
    templates: (page.templates || []).map((t) => t.title.replace(/^Template:/, "")),
  };
}

// ─── Content type detection ───────────────────────────────────────────────────

/**
 * Classify a page into one of several known content types found on nithyanandapedia.
 *
 * Types (in priority order):
 *   redirect        — page body is just #REDIRECT
 *   stub            — < 100 bytes, no real content
 *   event           — has EventDetails template or "Pictures from the day" gallery
 *   dharana         — has PRAMANA / Transliteration / Translation section structure
 *   press_meet      — has "Press Meets" category or "Link to Video" section
 *   tamil           — majority of content is Tamil script
 *   article         — general knowledge article (catch-all)
 */
function detectPageType(wikitext, categories, byteSize, templates) {
  if (!wikitext || byteSize === 0) return "stub";
  if (/^#REDIRECT/i.test(wikitext.trim())) return "redirect";
  if (byteSize < 100) return "stub";

  if (
    /{{[\s\S]{0,20}EventDetails/i.test(wikitext) ||
    /Pictures from the day/i.test(wikitext) ||
    /Presidential Daily Briefing/i.test(wikitext)
  )
    return "event";

  const headingsLower = (wikitext.match(/^=+([^=]+)=+/gm) || [])
    .map((h) => h.replace(/=+/g, "").trim().toLowerCase());

  if (
    headingsLower.includes("pramana") ||
    (headingsLower.includes("transliteration") && headingsLower.includes("translation"))
  )
    return "dharana";

  if (
    categories.some((c) => /press meet/i.test(c)) ||
    headingsLower.some((h) => h.includes("link to video") || h.includes("description"))
  )
    return "press_meet";

  // Tamil script detection: more than 10 Tamil unicode chars
  const tamilChars = (wikitext.match(/[஀-௿]/g) || []).length;
  if (tamilChars > 10) return "tamil";

  return "article";
}

// ─── Wikitext analysis ────────────────────────────────────────────────────────

function analyzeWikitext(wikitext, categories, byteSize, templates) {
  const result = {
    pageType: detectPageType(wikitext, categories, byteSize, templates),
    hasGallery: false,
    hasInfobox: false,
    hasEventDetails: false,
    hasTable: false,
    hasExternalLinks: false,
    hasVideo: false,
    hasMultilingualContent: false,
    headings: [],
    externalLinkCount: 0,
    galleryImageCount: 0,
    wordCount: 0,
    detectedTemplates: [],
    languages: [],
  };

  if (!wikitext) return result;

  result.hasGallery = /<gallery/i.test(wikitext);
  result.hasInfobox = /{{[^}]*[Ii]nfobox/i.test(wikitext);
  result.hasEventDetails = /{{[\s\S]{0,20}EventDetails/i.test(wikitext);
  result.hasTable = /{\|/.test(wikitext);
  result.hasExternalLinks = /\[https?:\/\//i.test(wikitext);
  result.hasVideo =
    /#evu:/i.test(wikitext) ||
    /youtube\.com|youtu\.be/i.test(wikitext) ||
    /{{[^}]*[Vv]ideo/i.test(wikitext);

  // Language detection
  const tamilChars = (wikitext.match(/[஀-௿]/g) || []).length;
  const devanagariChars = (wikitext.match(/[ऀ-ॿ]/g) || []).length;
  const langs = ["en"];
  if (tamilChars > 5) langs.push("ta");
  if (devanagariChars > 5) langs.push("sa"); // Sanskrit/Hindi
  result.languages = langs;
  result.hasMultilingualContent = langs.length > 1;

  // Headings
  const headingMatches = [...wikitext.matchAll(/^(={1,6})([^=\n]+)\1/gm)];
  result.headings = headingMatches.map((m) => ({
    level: m[1].length,
    text: m[2].trim(),
  }));

  result.externalLinkCount = (wikitext.match(/\[https?:\/\//gi) || []).length;

  // Gallery image count
  if (result.hasGallery) {
    const galleries = wikitext.match(/<gallery[^>]*>[\s\S]*?<\/gallery>/gi) || [];
    for (const g of galleries) {
      result.galleryImageCount += (g.match(/\.(jpg|jpeg|png|gif|webp)/gi) || []).length;
    }
  }

  // Templates from wikitext (catches inline parser functions too)
  const tplMatches = [...wikitext.matchAll(/{{([^|}\n]{1,60})/g)];
  result.detectedTemplates = [
    ...new Set(tplMatches.map((m) => m[1].trim()).filter(Boolean)),
  ];

  // Word count
  const plain = wikitext
    .replace(/{{[\s\S]*?}}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/[=\[\]{}|]/g, " ");
  result.wordCount = plain.split(/\s+/).filter(Boolean).length;

  return result;
}

// ─── Aggregate insights ───────────────────────────────────────────────────────

function buildInsights(pages) {
  const templateFreq = {};
  const categoryFreq = {};
  const pageTypeCount = {};
  const namespaceCount = {};
  const langCount = {};
  let totalWords = 0;
  let totalImages = 0;
  let pagesWithGallery = 0;
  let pagesWithEventDetails = 0;
  let pagesWithInfobox = 0;
  let pagesWithVideo = 0;
  let pagesWithErrors = 0;

  for (const p of pages) {
    if (p.error) { pagesWithErrors++; continue; }

    namespaceCount[p.ns] = (namespaceCount[p.ns] || 0) + 1;
    if (!p.contentAnalysis) continue;

    const a = p.contentAnalysis;
    pageTypeCount[a.pageType] = (pageTypeCount[a.pageType] || 0) + 1;

    totalWords += a.wordCount || 0;
    totalImages += (p.images || []).length;
    if (a.hasGallery) pagesWithGallery++;
    if (a.hasEventDetails) pagesWithEventDetails++;
    if (a.hasInfobox) pagesWithInfobox++;
    if (a.hasVideo) pagesWithVideo++;

    for (const lang of a.languages || []) {
      langCount[lang] = (langCount[lang] || 0) + 1;
    }

    const allTpls = [
      ...(p.templates || []),
      ...(a.detectedTemplates || []),
    ];
    for (const t of allTpls) {
      const key = t.trim();
      if (key) templateFreq[key] = (templateFreq[key] || 0) + 1;
    }

    for (const c of p.categories || []) {
      categoryFreq[c] = (categoryFreq[c] || 0) + 1;
    }
  }

  const successPages = pages.filter((p) => !p.error);

  return {
    totalPages: pages.length,
    totalSuccess: successPages.length,
    totalErrors: pagesWithErrors,
    namespaceBreakdown: namespaceCount,
    pageTypeBreakdown: pageTypeCount,
    languageBreakdown: langCount,
    pagesWithGallery,
    pagesWithEventDetails,
    pagesWithInfobox,
    pagesWithVideo,
    totalWords,
    avgWordsPerPage: successPages.length
      ? Math.round(totalWords / successPages.length)
      : 0,
    totalImages,
    avgImagesPerPage: successPages.length
      ? (totalImages / successPages.length).toFixed(2)
      : 0,
    topTemplates: Object.entries(templateFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([name, count]) => ({ name, count })),
    topCategories: Object.entries(categoryFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([name, count]) => ({ name, count })),
    migrationComplexity: {
      redirect: (pageTypeCount.redirect || 0),
      stub: (pageTypeCount.stub || 0),
      simple: successPages.filter(
        (p) =>
          p.contentAnalysis &&
          !p.contentAnalysis.hasGallery &&
          !p.contentAnalysis.hasInfobox &&
          !p.contentAnalysis.hasEventDetails &&
          p.contentAnalysis.pageType !== "redirect" &&
          p.contentAnalysis.pageType !== "stub"
      ).length,
      moderate: successPages.filter(
        (p) =>
          p.contentAnalysis &&
          (p.contentAnalysis.hasInfobox || p.contentAnalysis.hasEventDetails) &&
          !p.contentAnalysis.hasGallery
      ).length,
      complex: successPages.filter(
        (p) => p.contentAnalysis?.hasGallery
      ).length,
    },
  };
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function buildCsvRows(pages) {
  const header = [
    "PageID", "Title", "Namespace", "PageType", "URL", "LastEditor",
    "LastEdited", "ByteSize", "WordCount", "Languages", "Categories",
    "TemplateCount", "ImageCount", "InternalLinkCount", "HasGallery",
    "GalleryImageCount", "HasInfobox", "HasEventDetails", "HasVideo",
    "HasTable", "ExternalLinks", "Headings", "Complexity", "Error",
  ];

  const rows = [header];

  for (const p of pages) {
    const a = p.contentAnalysis || {};
    const complexity = p.error
      ? "error"
      : a.pageType === "redirect" ? "redirect"
      : a.pageType === "stub" ? "stub"
      : a.hasGallery ? "complex"
      : a.hasInfobox || a.hasEventDetails ? "moderate"
      : "simple";

    rows.push([
      p.pageid,
      p.title,
      p.ns ?? "",
      a.pageType || (p.error ? "error" : ""),
      p.url || "",
      p.lastEditor || "",
      p.lastEdited || "",
      p.byteSize ?? "",
      a.wordCount ?? "",
      (a.languages || []).join(", "),
      (p.categories || []).join(" | "),
      (p.templates || []).length,
      (p.images || []).length,
      (p.internalLinks || []).length,
      a.hasGallery ? "YES" : "no",
      a.galleryImageCount ?? 0,
      a.hasInfobox ? "YES" : "no",
      a.hasEventDetails ? "YES" : "no",
      a.hasVideo ? "YES" : "no",
      a.hasTable ? "YES" : "no",
      a.externalLinkCount ?? 0,
      (a.headings || []).map((h) => `${"=".repeat(h.level)}${h.text}`).join(" | "),
      complexity,
      p.error || "",
    ]);
  }

  return stringify(rows);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  ensureOutputDir();

  let allPageMeta;
  let processedPages = [];
  let startIndex = 0;

  if (RESUME) {
    const checkpoint = loadCheckpoint();
    if (checkpoint) {
      log(`Resuming from checkpoint: ${checkpoint.processedPages.length} pages done`);
      allPageMeta = checkpoint.allPageMeta;
      processedPages = checkpoint.processedPages;
      startIndex = checkpoint.processedPages.length;
    } else {
      log("No checkpoint found — starting fresh.");
    }
  }

  if (!allPageMeta) {
    allPageMeta = await fetchAllPageTitles(NAMESPACE);
    log(`Found ${allPageMeta.length} pages to analyze`);
  }

  const total = allPageMeta.length;

  for (let i = startIndex; i < total; i++) {
    const meta = allPageMeta[i];
    log(`[${i + 1}/${total}] ${meta.title}`);

    try {
      const content = await fetchPageContent(meta.title);
      if (content) {
        content.ns = meta.ns;
        content.contentAnalysis = analyzeWikitext(
          content.wikitext,
          content.categories,
          content.byteSize,
          content.templates
        );

        // Keep full wikitext only for event/dharana pages, or if --save-all-wikitext
        const keepWikitext =
          SAVE_ALL_WIKITEXT ||
          ["event", "dharana", "press_meet"].includes(content.contentAnalysis.pageType);

        processedPages.push({
          ...content,
          wikitext: keepWikitext
            ? content.wikitext
            : `[${content.byteSize}b — rerun with --save-all-wikitext]`,
        });
      } else {
        processedPages.push({ ...meta, error: "missing_or_not_found" });
      }
    } catch (err) {
      log(`  FAILED: ${err.message}`);
      processedPages.push({ ...meta, error: err.message });
    }

    await sleep(CONTENT_DELAY_MS);

    if ((i + 1) % 25 === 0) {
      saveCheckpoint({ allPageMeta, processedPages });
      log(`  Checkpoint saved (${processedPages.length}/${total} pages)`);
    }
  }

  log("Building insights...");
  const insights = buildInsights(processedPages);

  log("Writing report.json...");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "report.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), insights, pages: processedPages },
      null,
      2
    )
  );

  log("Writing insights.json...");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "insights.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), ...insights }, null, 2)
  );

  log("Writing summary.csv...");
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.csv"), buildCsvRows(processedPages));

  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);

  log("");
  log("=== Output files ===");
  log(`  ${OUTPUT_DIR}/insights.json  ← start here`);
  log(`  ${OUTPUT_DIR}/summary.csv    ← open in Google Sheets`);
  log(`  ${OUTPUT_DIR}/report.json    ← full data for import script`);
  log("");
  log("=== Summary ===");
  log(`Total pages:      ${insights.totalPages} (${insights.totalSuccess} ok, ${insights.totalErrors} errors)`);
  log(`Page types:       ${JSON.stringify(insights.pageTypeBreakdown)}`);
  log(`Languages:        ${JSON.stringify(insights.languageBreakdown)}`);
  log(`With galleries:   ${insights.pagesWithGallery}`);
  log(`With EventDetail: ${insights.pagesWithEventDetails}`);
  log(`With video embeds:${insights.pagesWithVideo}`);
  log(`Avg words/page:   ${insights.avgWordsPerPage}`);
  log(`Complexity:       ${JSON.stringify(insights.migrationComplexity)}`);
  log(`Top templates:    ${insights.topTemplates.slice(0, 5).map((t) => `${t.name}(${t.count})`).join(", ")}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

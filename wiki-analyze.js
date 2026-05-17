/**
 * MediaWiki Analysis Script
 *
 * Crawls all pages from nithyanandapedia.org and produces:
 *   - wiki-analysis/report.json   (full structured data)
 *   - wiki-analysis/summary.csv   (per-page summary for spreadsheet review)
 *   - wiki-analysis/insights.json (aggregate stats: templates, categories, patterns)
 *
 * Usage:
 *   node wiki-analyze.js
 *   node wiki-analyze.js --limit 100          # test with first 100 pages
 *   node wiki-analyze.js --namespace 0        # only main namespace (default)
 *   node wiki-analyze.js --namespace all      # all namespaces
 *   node wiki-analyze.js --resume             # resume from last checkpoint
 */

require("dotenv").config();
const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
const fs = require("fs");
const path = require("path");
const { stringify } = require("csv-stringify/sync");

// ─── Config ──────────────────────────────────────────────────────────────────

const API_URL = "https://nithyanandapedia.org/api.php";
const OUTPUT_DIR = path.join(__dirname, "wiki-analysis");
const CHECKPOINT_FILE = path.join(OUTPUT_DIR, "checkpoint.json");
const BATCH_SIZE = 50;       // pages per API request
const DELAY_MS = 300;        // polite delay between requests (ms)
const CONTENT_DELAY_MS = 150;

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const hasFlag = (flag) => args.includes(flag);

const LIMIT = getArg("--limit", null);
const NAMESPACE = getArg("--namespace", "0"); // 0 = main articles
const RESUME = hasFlag("--resume");

// ─── HTTP client with cookie jar (same pattern as existing server.js) ────────

const cookieJar = new tough.CookieJar();
const api = wrapper(
  axios.create({
    baseURL: API_URL,
    withCredentials: true,
    jar: cookieJar,
    timeout: 30000,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  })
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── MediaWiki API calls ──────────────────────────────────────────────────────

async function fetchAllPageTitles(namespace) {
  log(`Fetching all page titles in namespace ${namespace}...`);
  const titles = [];
  let apcontinue = null;

  do {
    const params = {
      action: "query",
      list: "allpages",
      aplimit: 500,
      apnamespace: namespace === "all" ? undefined : namespace,
      format: "json",
    };
    if (apcontinue) params.apcontinue = apcontinue;

    const res = await api.get("", { params });
    const data = res.data;

    if (data.query && data.query.allpages) {
      for (const page of data.query.allpages) {
        titles.push({ pageid: page.pageid, title: page.title, ns: page.ns });
      }
    }

    apcontinue = data.continue ? data.continue.apcontinue : null;

    if (LIMIT && titles.length >= parseInt(LIMIT)) break;
    if (apcontinue) await sleep(DELAY_MS);
  } while (apcontinue);

  if (LIMIT) return titles.slice(0, parseInt(LIMIT));
  return titles;
}

async function fetchPageContent(title) {
  const res = await api.get("", {
    params: {
      action: "query",
      prop: "revisions|categories|images|links|templates|info",
      titles: title,
      rvprop: "content|timestamp|user|size",
      rvslots: "main",
      cllimit: 50,
      imlimit: 50,
      lllimit: 50,
      tllimit: 50,
      inprop: "url|displaytitle",
      format: "json",
    },
  });

  const pages = res.data.query && res.data.query.pages;
  if (!pages) return null;

  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;

  const rev = page.revisions && page.revisions[0];
  const wikitext = rev && rev.slots && rev.slots.main && rev.slots.main["*"];

  return {
    pageid: page.pageid,
    title: page.title,
    displayTitle: page.displaytitle || page.title,
    url: page.fullurl || "",
    lastEditor: rev ? rev.user : "",
    lastEdited: rev ? rev.timestamp : "",
    byteSize: rev ? rev.size : 0,
    wikitext: wikitext || "",
    categories: (page.categories || []).map((c) => c.title.replace("Category:", "")),
    images: (page.images || []).map((i) => i.title),
    internalLinks: (page.links || []).map((l) => l.title),
    templates: (page.templates || []).map((t) => t.title.replace("Template:", "")),
  };
}

// ─── Content analysis helpers ─────────────────────────────────────────────────

function analyzeWikitext(wikitext) {
  const analysis = {
    hasGallery: false,
    hasInfobox: false,
    hasEventDetails: false,
    hasTable: false,
    hasExternalLinks: false,
    headings: [],
    externalLinkCount: 0,
    galleryImageCount: 0,
    wordCount: 0,
    templateNames: [],
  };

  if (!wikitext) return analysis;

  analysis.hasGallery = /<gallery/i.test(wikitext);
  analysis.hasInfobox = /{{[^}]*[Ii]nfobox/i.test(wikitext);
  analysis.hasEventDetails = /{{[^}]*EventDetails/i.test(wikitext);
  analysis.hasTable = /{\|/.test(wikitext);
  analysis.hasExternalLinks = /\[https?:\/\//i.test(wikitext);

  // Extract headings
  const headingMatches = [...wikitext.matchAll(/^(={1,6})([^=]+)\1/gm)];
  analysis.headings = headingMatches.map((m) => ({
    level: m[1].length,
    text: m[2].trim(),
  }));

  // Count external links
  analysis.externalLinkCount = (wikitext.match(/\[https?:\/\//gi) || []).length;

  // Count gallery images
  if (analysis.hasGallery) {
    const galleryContent = wikitext.match(/<gallery[^>]*>([\s\S]*?)<\/gallery>/gi) || [];
    for (const g of galleryContent) {
      analysis.galleryImageCount += (g.match(/\.(jpg|jpeg|png|gif|webp)/gi) || []).length;
    }
  }

  // Extract template names from wikitext
  const templateMatches = [...wikitext.matchAll(/{{([^|}\n]+)/g)];
  analysis.templateNames = [...new Set(templateMatches.map((m) => m[1].trim()))];

  // Word count (rough)
  const plainText = wikitext
    .replace(/{{[\s\S]*?}}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/[=\[\]{}|]/g, " ");
  analysis.wordCount = plainText.split(/\s+/).filter(Boolean).length;

  return analysis;
}

// ─── Aggregate insights ───────────────────────────────────────────────────────

function buildInsights(pages) {
  const templateFreq = {};
  const categoryFreq = {};
  const namespaceCount = {};
  let totalWords = 0;
  let totalImages = 0;
  let pagesWithGallery = 0;
  let pagesWithEventDetails = 0;
  let pagesWithInfobox = 0;

  for (const p of pages) {
    // Namespace
    namespaceCount[p.ns] = (namespaceCount[p.ns] || 0) + 1;

    if (!p.contentAnalysis) continue;
    const a = p.contentAnalysis;

    totalWords += a.wordCount || 0;
    totalImages += (p.images || []).length;
    if (a.hasGallery) pagesWithGallery++;
    if (a.hasEventDetails) pagesWithEventDetails++;
    if (a.hasInfobox) pagesWithInfobox++;

    for (const t of [...(p.templates || []), ...(a.templateNames || [])]) {
      const key = t.trim();
      if (key) templateFreq[key] = (templateFreq[key] || 0) + 1;
    }

    for (const c of p.categories || []) {
      categoryFreq[c] = (categoryFreq[c] || 0) + 1;
    }
  }

  const topTemplates = Object.entries(templateFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([name, count]) => ({ name, count }));

  const topCategories = Object.entries(categoryFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([name, count]) => ({ name, count }));

  return {
    totalPages: pages.length,
    namespaceBreakdown: namespaceCount,
    pagesWithGallery,
    pagesWithEventDetails,
    pagesWithInfobox,
    totalWords,
    avgWordsPerPage: pages.length ? Math.round(totalWords / pages.length) : 0,
    totalImages,
    avgImagesPerPage: pages.length ? (totalImages / pages.length).toFixed(2) : 0,
    topTemplates,
    topCategories,
    migrationComplexity: {
      simple: pages.filter(
        (p) => p.contentAnalysis && !p.contentAnalysis.hasGallery && !p.contentAnalysis.hasInfobox && !p.contentAnalysis.hasEventDetails
      ).length,
      moderate: pages.filter(
        (p) => p.contentAnalysis && (p.contentAnalysis.hasInfobox || p.contentAnalysis.hasEventDetails) && !p.contentAnalysis.hasGallery
      ).length,
      complex: pages.filter((p) => p.contentAnalysis && p.contentAnalysis.hasGallery).length,
    },
  };
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function buildCsvRows(pages) {
  const rows = [
    [
      "PageID", "Title", "Namespace", "URL", "LastEditor", "LastEdited",
      "ByteSize", "WordCount", "Categories", "TemplateCount", "ImageCount",
      "InternalLinkCount", "HasGallery", "GalleryImageCount", "HasInfobox",
      "HasEventDetails", "HasTable", "ExternalLinks", "Headings", "Complexity",
    ],
  ];

  for (const p of pages) {
    const a = p.contentAnalysis || {};
    const complexity =
      a.hasGallery ? "complex"
      : a.hasInfobox || a.hasEventDetails ? "moderate"
      : "simple";

    rows.push([
      p.pageid,
      p.title,
      p.ns,
      p.url,
      p.lastEditor,
      p.lastEdited,
      p.byteSize,
      a.wordCount || 0,
      (p.categories || []).join(" | "),
      (p.templates || []).length,
      (p.images || []).length,
      (p.internalLinks || []).length,
      a.hasGallery ? "YES" : "no",
      a.galleryImageCount || 0,
      a.hasInfobox ? "YES" : "no",
      a.hasEventDetails ? "YES" : "no",
      a.hasTable ? "YES" : "no",
      a.externalLinkCount || 0,
      (a.headings || []).map((h) => `${"=".repeat(h.level)}${h.text}`).join(" | "),
      complexity,
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
      log(`Resuming from checkpoint: ${checkpoint.processedPages.length} pages already done`);
      allPageMeta = checkpoint.allPageMeta;
      processedPages = checkpoint.processedPages;
      startIndex = checkpoint.processedPages.length;
    } else {
      log("No checkpoint found, starting fresh.");
    }
  }

  if (!allPageMeta) {
    allPageMeta = await fetchAllPageTitles(NAMESPACE);
    log(`Found ${allPageMeta.length} pages to analyze`);
  }

  const total = allPageMeta.length;

  for (let i = startIndex; i < total; i++) {
    const meta = allPageMeta[i];
    log(`[${i + 1}/${total}] Fetching: ${meta.title}`);

    try {
      const content = await fetchPageContent(meta.title);
      if (content) {
        content.ns = meta.ns;
        content.contentAnalysis = analyzeWikitext(content.wikitext);
        // Strip wikitext from main report to keep file size manageable
        // Save wikitext separately only for pages that have event content
        const wikitextForReport =
          content.contentAnalysis.hasEventDetails || content.contentAnalysis.hasGallery
            ? content.wikitext
            : `[${content.byteSize} bytes — run with --save-all-wikitext to include]`;
        processedPages.push({ ...content, wikitext: wikitextForReport });
      } else {
        processedPages.push({ ...meta, error: "not_found_or_missing" });
      }
    } catch (err) {
      log(`  ERROR on "${meta.title}": ${err.message}`);
      processedPages.push({ ...meta, error: err.message });
    }

    await sleep(CONTENT_DELAY_MS);

    // Checkpoint every 100 pages
    if ((i + 1) % 100 === 0) {
      saveCheckpoint({ allPageMeta, processedPages });
      log(`  Checkpoint saved (${processedPages.length} pages)`);
    }
  }

  log("Building insights...");
  const insights = buildInsights(processedPages);

  log("Writing report.json...");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "report.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), insights, pages: processedPages }, null, 2)
  );

  log("Writing insights.json...");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "insights.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), ...insights }, null, 2)
  );

  log("Writing summary.csv...");
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.csv"), buildCsvRows(processedPages));

  // Clean up checkpoint on success
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);

  log("Done! Output files:");
  log(`  ${OUTPUT_DIR}/insights.json  ← start here`);
  log(`  ${OUTPUT_DIR}/summary.csv    ← open in Google Sheets`);
  log(`  ${OUTPUT_DIR}/report.json    ← full structured data`);
  log("");
  log("=== Quick Summary ===");
  log(`Total pages:          ${insights.totalPages}`);
  log(`With galleries:       ${insights.pagesWithGallery}`);
  log(`With EventDetails:    ${insights.pagesWithEventDetails}`);
  log(`With Infoboxes:       ${insights.pagesWithInfobox}`);
  log(`Avg words/page:       ${insights.avgWordsPerPage}`);
  log(`Migration complexity:`);
  log(`  Simple:   ${insights.migrationComplexity.simple}`);
  log(`  Moderate: ${insights.migrationComplexity.moderate}`);
  log(`  Complex:  ${insights.migrationComplexity.complex}`);
  log(`Top 5 templates:      ${insights.topTemplates.slice(0, 5).map((t) => `${t.name}(${t.count})`).join(", ")}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

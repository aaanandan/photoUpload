# Migration Run Guide
## Nithyanandapedia → Payload CMS

A step-by-step guide to running the analysis and migration tools.  
Pick the section that matches your access level.

---

## Quick Reference

| What you have | Best method | Time |
|---|---|---|
| Only wiki credentials | [Method 1 — API Crawl](#method-1--api-crawl) | 4–8 hours |
| SSH to wiki server | [Method 2 — XML Dump](#method-2--xml-dump-recommended) | 10 minutes |
| SSH + DB access | [Method 2](#method-2--xml-dump-recommended) + [Method 3](#method-3--direct-mysql-stats) | 10 minutes + 10 seconds |

---

## Prerequisites (all methods)

### On your machine (where you run the import)

```bash
# 1. Pull the latest code
git pull origin claude/summarize-repo-n7QgB

# 2. Install dependencies (only needed once)
npm install

# 3. Copy the example env file and fill in your credentials
cp .env.example .env   # or create .env manually — see below
```

**.env file minimum required fields:**
```env
# Wiki credentials (needed for Method 1 only)
WIKI_USERNAME=your_wiki_bot_username
WIKI_PASSWORD=your_wiki_bot_password

# Domain used to build image URLs in the report
DOMAIN=https://nithyanandapedia.org
```

---

## Method 1 — API Crawl

**Use when:** You only have wiki login credentials, no server access.  
**Downside:** Slow (~1.5s per page), hits Cloudflare 502 errors on a loaded server.

### 1a. Test run first (20 pages)

Always test before the full crawl to confirm connectivity.

```bash
node wiki-analyze.js --limit 20
```

Expected output:
```
[07:13:01] Fetching all page titles (namespace: 0)...
[07:13:02] Found 20 pages to analyze
[07:13:02] [1/20] "Dharana on the Light"
[07:13:03] [2/20] "Benefits of Dharana"
...
[07:13:40] Done!
```

Check the output folder:
```
wiki-analysis/
  insights.json   ← open this first
  summary.csv     ← open in Google Sheets
  report.json     ← full data
```

### 1b. Full crawl

```bash
node wiki-analyze.js --save-all-wikitext
```

> **Tip:** Run this in a `screen` or `tmux` session so it survives SSH disconnects.

```bash
# Using screen
screen -S wiki-crawl
node wiki-analyze.js --save-all-wikitext
# Detach: Ctrl+A then D
# Reattach later: screen -r wiki-crawl
```

### 1c. Resume an interrupted crawl

If it stops (502 error, network drop, server restart), resume from the last checkpoint:

```bash
node wiki-analyze.js --resume
```

Checkpoints are saved every 25 pages to `wiki-analysis/checkpoint.json`.  
The checkpoint is deleted automatically when the crawl completes successfully.

### 1d. Crawl a specific namespace

```bash
# Main articles only (default)
node wiki-analyze.js --namespace 0

# All namespaces (includes Templates, User pages, Talk pages)
node wiki-analyze.js --namespace all
```

---

## Method 2 — XML Dump (Recommended)

**Use when:** You have SSH access to the wiki server.  
**Why:** Completes in minutes instead of hours. No Cloudflare, no rate limits, no 502s.

### Step 1 — Find the MediaWiki install on the server

```bash
ssh user@wikiserver

# Find MediaWiki
find / -name "LocalSettings.php" 2>/dev/null
# Common locations:
#   /var/www/html/
#   /var/www/mediawiki/
#   /var/www/nithyanandapedia/
#   /srv/www/
```

```bash
# Once found, go there
cd /var/www/mediawiki   # replace with your actual path
```

### Step 2 — Generate the XML dump

```bash
# Current revisions only (recommended — smaller file, has everything you need)
php maintenance/dumpBackup.php --current --output=gzip:/tmp/wiki-dump.xml.gz

# Watch progress — it prints page count as it runs
# Expected time: 5–20 minutes depending on wiki size
```

> **If `maintenance/` is not there**, try:
> ```bash
> php maintenance/run.php dumpBackup --current --output=gzip:/tmp/wiki-dump.xml.gz
> # (MediaWiki 1.40+ moved scripts under maintenance/run.php)
> ```

> **If you want full revision history** (larger file, usually not needed for migration):
> ```bash
> php maintenance/dumpBackup.php --full --output=gzip:/tmp/wiki-dump-full.xml.gz
> ```

### Step 3 — Transfer the dump to your machine

```bash
# Exit the wiki server
exit

# Download the dump (from your local machine)
scp user@wikiserver:/tmp/wiki-dump.xml.gz ./

# Check the file size — gives you an idea of wiki scale
ls -lh wiki-dump.xml.gz
```

### Step 4 — Run the local analyzer

```bash
# Basic run (saves wikitext for event/dharana/press_meet pages)
node wiki-analyze-dump.js wiki-dump.xml.gz

# Save wikitext for ALL pages (larger output, better for debugging)
node wiki-analyze-dump.js wiki-dump.xml.gz --save-wikitext

# Limit to a namespace
node wiki-analyze-dump.js wiki-dump.xml.gz --namespace 0

# Quick test — first 100 pages only
node wiki-analyze-dump.js wiki-dump.xml.gz --limit 100
```

Expected output:
```
[07:13:01] Reading dump: wiki-dump.xml.gz
[07:13:01] Namespace filter: 0
[07:13:01] Parsing...
[07:13:05]   500 pages processed (4s elapsed)
[07:13:09]   1000 pages processed (8s elapsed)
...
[07:15:30] Parsed 8432 pages in 149.3s
[07:15:30] Building insights...
[07:15:31] Writing output files...

=== Results (149.3s) ===
Total pages:      8432
Page types:       {"event":1823,"dharana":412,"article":3201,...}
Event pages:      1823
With galleries:   1654
```

### Step 5 — Copy all images (while you wait or after)

```bash
# Copy all uploaded media (skip auto-generated thumbnails)
rsync -avz --progress --exclude='thumb/' \
  user@wikiserver:/var/www/mediawiki/images/ \
  ./wiki-images/

# Check what you got
du -sh wiki-images/
ls wiki-images/ | head -20
```

---

## Method 3 — Direct MySQL Stats

**Use when:** You have database access to the wiki server.  
**Best for:** Instant aggregate numbers — total page count, template usage, image inventory.  
**Run alongside Method 2,** not instead of it.

### Run the SQL analysis

```bash
# Option A: Run directly on the wiki server
ssh user@wikiserver
mysql -u root -p wikidb < /path/to/wiki-mysql-analysis.sql > results.txt
cat results.txt

# Option B: Pipe through SSH without interactive login
ssh user@wikiserver "mysql -u root -pYOURPASSWORD wikidb" \
  < wiki-mysql-analysis.sql > wiki-db-stats.txt

# Option C: If you have a MySQL tunnel (port 3306 forwarded locally)
mysql -h 127.0.0.1 -P 3306 -u root -p wikidb < wiki-mysql-analysis.sql
```

> **Find the DB name and credentials** in `LocalSettings.php`:
> ```bash
> grep -E "wgDB(name|user|password)" /var/www/mediawiki/LocalSettings.php
> ```

### What the SQL report tells you

```
=== Page counts by namespace ===
namespace  | page_count | total_bytes
-----------+------------+------------
0 (Main)   | 8432       | 145MB
10 (Templ) | 312        | 2MB
6 (File)   | 4821       | 1MB (metadata only)

=== Top 5 templates ===
EventDetails   → 1823 pages
Infobox        → 412 pages
...

=== File inventory ===
total_files | total_mb | avg_kb_per_file
4821        | 8420 MB  | 1789 KB

=== Migration Readiness Summary ===
total_main_pages | redirects | stubs | event_pages | total_media_files | total_media_mb
8432             | 231       | 89    | 1823        | 4821              | 8420
```

---

## Reading the Output Files

After any method, you get three files in `wiki-analysis/`:

### `insights.json` — Start here

```json
{
  "totalPages": 8432,
  "pageTypeBreakdown": {
    "event": 1823,
    "dharana": 412,
    "press_meet": 98,
    "tamil": 203,
    "article": 3201,
    "redirect": 231,
    "stub": 89
  },
  "languageBreakdown": { "en": 7800, "ta": 412, "sa": 220 },
  "pagesWithGallery": 1654,
  "pagesWithEventDetails": 1823,
  "pagesWithVideo": 98,
  "topTemplates": [
    { "name": "EventDetails", "count": 1823 },
    ...
  ],
  "topCategories": [
    { "name": "Satsang", "count": 921 },
    ...
  ]
}
```

### `summary.csv` — Open in Google Sheets

One row per page. Columns:
`PageID | Title | PageType | LastEditor | ByteSize | WordCount | Languages | Categories | HasGallery | HasEventDetails | HasVideo | Complexity`

**Useful filters to apply in Sheets:**
- Filter `PageType = event` → all event pages to migrate
- Filter `HasGallery = YES` → complex pages needing image handling
- Filter `Complexity = error` → pages that failed, need manual check

### `report.json` — Input to the import script

Full structured data per page. Used directly by `wiki-import.js` (Phase 2).

---

## Sharing Results

After a successful run, commit and push so the analysis is available to the team:

```bash
git add wiki-analysis/
git commit -m "Add full wiki analysis results ($(date +%Y-%m-%d))"
git push origin claude/summarize-repo-n7QgB
```

---

## Troubleshooting

### `php maintenance/dumpBackup.php` — permission denied
```bash
sudo php maintenance/dumpBackup.php --current --output=gzip:/tmp/wiki-dump.xml.gz
# Or run as www-data:
sudo -u www-data php maintenance/dumpBackup.php --current --output=gzip:/tmp/wiki-dump.xml.gz
```

### `php maintenance/dumpBackup.php` — command not found
```bash
# Try the full path
which php   # find php binary
php8.1 maintenance/dumpBackup.php ...   # use versioned binary if needed
```

### `scp` transfer fails or is slow
```bash
# Use rsync instead — it can resume
rsync -avz --progress user@wikiserver:/tmp/wiki-dump.xml.gz ./
```

### `node wiki-analyze-dump.js` — out of memory on very large dumps
```bash
# Increase Node heap size (default is ~1.5GB)
node --max-old-space-size=4096 wiki-analyze-dump.js wiki-dump.xml.gz
```

### API crawl keeps hitting 502
The Cloudflare layer is protecting an overloaded origin. Options:
1. Run during off-peak hours (night time in the server's timezone)
2. Use Method 2 (XML dump) — bypasses Cloudflare entirely
3. The script already waits 65s after each 502 and retries up to 5 times

### MySQL: `Access denied`
```bash
# Check credentials in LocalSettings.php
grep -E "wgDB" /var/www/mediawiki/LocalSettings.php

# Try connecting manually to verify
mysql -u wikiuser -p wikidb -e "SHOW TABLES;"
```

### `rsync` images — disk space check first
```bash
# Check image directory size on server before transferring
ssh user@wikiserver "du -sh /var/www/mediawiki/images/"

# Check available space locally
df -h .
```

---

## Full Server Access Checklist

```
[ ] SSH access confirmed: ssh user@wikiserver works
[ ] MediaWiki path found: find / -name "LocalSettings.php"
[ ] DB credentials noted: grep wgDB LocalSettings.php
[ ] Enough disk space locally for: dump file + images
[ ] screen or tmux available for long-running commands
[ ] npm install done on local machine
[ ] .env file created with DOMAIN set
```

---

*For questions about the migration spec, see `WIKI_MIGRATION_SPEC.md`.  
For Payload CMS collection schema, see §4 of the spec.*

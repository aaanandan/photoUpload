# Nithyanandapedia → Payload CMS Migration Spec

> **Purpose:** This document describes the data source (MediaWiki), the known data model, and the requirements for the Payload CMS side to receive migrated content. Share this with the Payload repo to design collections and an import endpoint.

---

## 1. Source System — Nithyanandapedia

- **Type:** MediaWiki instance
- **URL:** https://nithyanandapedia.org
- **API:** https://nithyanandapedia.org/api.php (standard MediaWiki REST API)
- **Access:** Requires authentication (wiki username/password via bot login flow)
- **Content type:** Event documentation pages — each page describes one real-world event held at a Kailasa/Nithyananda center around the world

---

## 2. How Pages Are Created (Current Flow)

The existing `photoUpload` app writes wiki pages via the MediaWiki API after a volunteer uploads event photos. Understanding this creation flow reveals the exact data shape of every page.

### 2.1 Page Title Format

```
{place} On {startDate}
```

Example: `Singapore On 2024-03-15T10:00:00`

### 2.2 Page Structure (Wikitext Template)

```mediawiki
__NOTOC__

='''{place} on {startDate}'''=

==''{activityType}''==

{{EventDetails|
participantsCount={livesEnriched}|
eventType={eventType}|
foodServedInEvent=|
mealsCount=|
volunteersCount={volunteerCount}|
eventDuration=
}}

{description}

=='''Presidential Daily Briefing'''==

{pdb_image_urls}   ← up to 10 image URLs (paths 0–9)

=='''Pictures from the day'''==

<div id="event_pictures">
<gallery mode=packed-hover heights=200px>
{image_urls_10_to_19}
{image_urls_20_to_29}
{image_urls_30_to_39}
{image_urls_40_plus}
</gallery>
</div>

[[Category:{activityType}]]
[[Category:{eventType}]]
```

### 2.3 Source Fields (from upload form → wiki)

| Wiki field | Source field | Notes |
|---|---|---|
| Page title | `place` + `startDate` | Combined as "{place} On {startDate}" |
| H1 heading | `place` + `startDate` | Human-readable title |
| H2 subheading | `activityType` | Comma-separated activity tags |
| `EventDetails.participantsCount` | `livesEnriched` | Number of lives enriched |
| `EventDetails.eventType` | `eventType` | e.g. "Satsang", "Temple Program" |
| `EventDetails.volunteersCount` | `volunteerCount` | Number of volunteers |
| Body text | `description` | Free text description |
| Presidential Briefing section | `presidentialBriefing` | Separate text field |
| Gallery images (0–9) | `files[0–9]` | Used as PDB / hero images |
| Gallery images (10–19) | `files[10–19]` | `UploadMorePictures1` |
| Gallery images (20–29) | `files[20–29]` | `UploadMorePictures2` |
| Gallery images (30–39) | `files[30–39]` | `UploadMorePictures3` |
| Gallery images (40+) | `files[40+]` | `UploadMorePictures4` |
| Categories | `activityType`, `eventType` | One category per comma-separated value |

### 2.4 Additional Fields (stored in MongoDB + Google Sheet, NOT in wiki)

These fields exist in the source system but were never written to the wiki. They should be included in Payload if possible:

| Field | Description |
|---|---|
| `email` | Uploader's email |
| `eventName` | Human-readable event name |
| `place` | Location / Kailasa center name |
| `country`, `state`, `city`, `zipcode` | Geographic breakdown (partially filled) |
| `startDate` | ISO datetime of event |
| `timestamp` | Unix timestamp of upload |
| `presidentialBriefing` | Separate narrative field |
| `activityType` | Comma-separated activity categories |
| `eventType` | Single entity type |
| `livesEnriched` | Attendance count |
| `volunteerCount` | Volunteer count |
| `description` | Event description body |

---

## 3. Migration Approach

### Phase 1 — Analysis (script: `wiki-analyze.js`)

Run on a server with API access to nithyanandapedia.org:

```bash
# Test (first 20 pages)
node wiki-analyze.js --limit 20

# Full crawl
node wiki-analyze.js

# Resume if interrupted
node wiki-analyze.js --resume
```

Produces in `wiki-analysis/`:
- `insights.json` — aggregate stats (template usage, categories, complexity)
- `summary.csv` — one row per page (open in Google Sheets to review)
- `report.json` — full structured data per page

### Phase 2 — Import (script to be built after Payload schema is confirmed)

The import script will:
1. Read `report.json` from the analysis phase
2. Parse each wiki page's wikitext to extract structured fields
3. `POST` to the Payload CMS REST API to create documents
4. Track success/failure per page with a resumable checkpoint

---

## 4. Required Payload CMS Collections

### 4.1 `events` (primary collection)

This is the main collection — one document per wiki page.

```typescript
// Suggested Payload collection shape
{
  slug: string,               // slugified page title — used as stable ID for dedup
  title: string,              // "{place} On {startDate}"
  place: string,              // location / Kailasa center
  eventName: string,
  eventDate: Date,
  eventType: string,          // e.g. "Satsang", "Temple Program"
  activityTypes: string[],    // parsed from comma-separated activityType
  description: richText,      // or text — body of the page
  presidentialBriefing: richText,
  participantsCount: number,
  volunteerCount: number,
  uploaderEmail: string,
  country: string,
  state: string,
  city: string,

  // Images — stored as relationships to a media collection
  pdbImages: Media[],         // files[0–9]  — Presidential Daily Briefing
  galleryImages: Media[],     // files[10+] — event gallery

  // Migration metadata
  wikiPageId: number,         // original MediaWiki page ID
  wikiUrl: string,            // original page URL
  wikiLastEditor: string,
  wikiLastEdited: Date,
  migratedAt: Date,
}
```

### 4.2 `media` (or reuse Payload's built-in Media collection)

Payload has a built-in media collection. The migration script will need to either:
- **Option A:** Upload each image file to Payload media (requires images to be publicly accessible from nithyanandapedia.org)
- **Option B:** Store image URLs as strings and let a separate job download/re-upload them
- **Option C:** Store URLs only (fastest migration, no re-hosting)

**Recommendation: Option B** — store URLs now, download in a second pass.

### 4.3 `categories` (optional, or use tags)

If Payload is using a relational category/tag system:

```typescript
{
  name: string,    // e.g. "Satsang", "Temple Program", "Pada Puja"
  slug: string,
  type: "activityType" | "eventType"
}
```

---

## 5. Payload API Requirements

The import script will call these endpoints. Payload must expose them:

| Operation | Endpoint | Notes |
|---|---|---|
| Auth | `POST /api/users/login` | Or API key header |
| Create event | `POST /api/events` | Returns created doc ID |
| Upload media | `POST /api/media` | multipart/form-data |
| Check for duplicate | `GET /api/events?where[slug][equals]={slug}` | Skip if already imported |
| Create category | `POST /api/categories` | Only if using relational tags |

### 5.1 Auth

The import script will read credentials from `.env`:

```env
PAYLOAD_URL=https://your-payload-instance.com
PAYLOAD_EMAIL=admin@example.com
PAYLOAD_PASSWORD=yourpassword
# OR
PAYLOAD_API_KEY=your-api-key
```

---

## 6. Data Complexity Classification

Based on page structure, each wiki page falls into one of three migration complexity tiers:

| Tier | Criteria | Expected % |
|---|---|---|
| **Simple** | Plain text, no gallery, no infobox | ~20% |
| **Moderate** | Has `EventDetails` template or infobox, no gallery | ~30% |
| **Complex** | Has `<gallery>` block with images | ~50% |

> The exact breakdown will be confirmed after running `wiki-analyze.js` on the live wiki.

---

## 7. Wikitext Parsing Notes

The import script will use these regex/parsing rules to extract structured data from raw wikitext:

```
EventDetails template:
  /{{EventDetails\|([\s\S]*?)}}/
  Fields split by |, values by =

Gallery images:
  /<gallery[^>]*>([\s\S]*?)<\/gallery>/gi
  Each line is a file path

Categories:
  /\[\[Category:([^\]]+)\]\]/g

H1 title:
  /^=+'''([^']+)'''/m

H2 sections:
  /^==+'''?([^=']+)'''?==/gm

Presidential Briefing:
  Content between ==Presidential Daily Briefing== and next ==
```

---

## 8. Migration Script Interface (to be built)

```bash
# Dry run — shows what would be imported, no writes
node wiki-import.js --dry-run

# Full import
node wiki-import.js

# Resume interrupted import
node wiki-import.js --resume

# Import a single page by title (for testing)
node wiki-import.js --page "Singapore On 2024-03-15"
```

Output:
- `wiki-import/import-log.json` — success/failure per page
- `wiki-import/failed.json` — pages that need manual review
- Console progress with ETA

---

## 9. Open Questions for Payload Repo

Before the import script can be finalized, the Payload team needs to answer:

1. **What is the exact collection slug?** (e.g. `events`, `articles`, `pages`)
2. **What field names does the collection use?** (share the collection config file)
3. **Is media handled by Payload's built-in media collection or an external S3 bucket?**
4. **Is there an existing API key, or should the script use email/password login?**
5. **Should `activityType` and `eventType` be free-text strings, or relational to a `categories` collection?**
6. **Is rich text using Payload's Lexical editor or Slate?** (affects how description/body is formatted in the POST payload)
7. **Is deduplication needed?** (i.e., can we run the import multiple times safely, or is it one-shot?)

---

## 10. File Reference

| File | Purpose |
|---|---|
| `wiki-analyze.js` | Phase 1: crawls the wiki and produces analysis reports |
| `wiki-analysis/insights.json` | Aggregate stats from the crawl |
| `wiki-analysis/summary.csv` | Per-page summary — share with stakeholders |
| `wiki-analysis/report.json` | Full data used as input to the import script |
| `server.js` (lines 328–381) | Original wiki page creation logic — source of truth for data shape |
| `WIKI_MIGRATION_SPEC.md` | This document |

---

*Generated from codebase analysis of the `photoUpload` repository. Run `wiki-analyze.js` on a server with API access to nithyanandapedia.org to populate the quantitative sections.*

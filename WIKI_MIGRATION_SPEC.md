# Nithyanandapedia → Payload CMS Migration Spec

> **Purpose:** This document describes the source wiki, the actual content types found in it, and what the Payload CMS side needs to receive migrated content. Share this file with the Payload repo to design collections and an import endpoint.
>
> **Updated:** Based on analysis of a 20-page test crawl (see `wiki-analysis/`). Run the full crawl to validate counts across all pages.

---

## 1. Source System

| Property | Value |
|---|---|
| Type | MediaWiki |
| URL | https://nithyanandapedia.org |
| API | https://nithyanandapedia.org/api.php |
| Auth | Bot login (wiki username + password via `lgtoken` flow) |
| Access restriction | API is IP-allowlisted — must run from a trusted server |
| Languages | English + Tamil (at minimum); Sanskrit/Devanagari also present |

---

## 2. Actual Content Types Found

> **Critical finding:** The wiki is NOT just an event photo archive. It is a multi-purpose knowledge wiki with at least 6 distinct content types. Each type has a different structure and maps to a different Payload collection or content shape.

### 2.1 Content Type: `event`

Pages documenting real-world events at Kailasa centers. Created by the `photoUpload` app.

**Detection:** Has `{{EventDetails|...}}` template, OR contains the phrase "Pictures from the day" or "Presidential Daily Briefing".

**Page title format:** `{place} On {startDate}`
Example: `Singapore On 2024-03-15T10:00:00`

**Wikitext structure:**
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

{pdb_image_url_1}, {pdb_image_url_2}, ...   ← up to 10 direct image URLs

=='''Pictures from the day'''==

<div id="event_pictures">
<gallery mode=packed-hover heights=200px>
{image_url_10}
{image_url_11}
...
</gallery>
</div>

[[Category:{activityType}]]
[[Category:{eventType}]]
```

**Extracted fields:**

| Wiki field | Source | Payload field |
|---|---|---|
| Page title | `place` + `startDate` | `title` |
| H1 | `place` + `startDate` | `title` |
| H2 subheading | `activityType` | `activityTypes[]` |
| `EventDetails.participantsCount` | `livesEnriched` | `participantsCount` |
| `EventDetails.eventType` | `eventType` | `eventType` |
| `EventDetails.volunteersCount` | `volunteerCount` | `volunteerCount` |
| `EventDetails.foodServedInEvent` | form field | `foodServed` |
| `EventDetails.mealsCount` | form field | `mealsCount` |
| `EventDetails.eventDuration` | form field | `eventDuration` |
| Body text | `description` | `description` (rich text) |
| Presidential Briefing section | `presidentialBriefing` | `presidentialBriefing` (rich text) |
| First 10 image URLs | `files[0–9]` | `pdbImages[]` |
| Gallery image URLs | `files[10+]` | `galleryImages[]` |
| `[[Category:X]]` | `activityType`, `eventType` | `tags[]` |

---

### 2.2 Content Type: `dharana`

Spiritual technique articles. The most common type in the first alphabetical pages. Structured with Sanskrit source text, transliteration, and English translation.

**Detection:** Has a `==PRAMANA==` heading, OR has both `==Transliteration==` and `==Translation==` headings.

**Wikitext structure:**
```mediawiki
='''{technique name}'''=

==PRAMANA==
{Sanskrit or Tamil source verse}

==Transliteration==
{romanised transliteration}

==Translation==
{English translation}

==Benefits==
{optional benefits section}

[[Category:Dharana]]
```

**Extracted fields:**

| Section | Payload field |
|---|---|
| H1 title | `title` |
| PRAMANA section | `sourceText` (plain text, preserves script) |
| Transliteration section | `transliteration` |
| Translation section | `translation` (rich text) |
| Benefits section | `benefits` (rich text) |
| All categories | `tags[]` |

---

### 2.3 Content Type: `press_meet`

Testimonial or press coverage pages. Short pages with a description and a video link.

**Detection:** Has `[[Category:Press Meets]]`, OR has a `==Link to Video:==` heading, OR has `==Description==` + is short.

**Wikitext structure:**
```mediawiki
='''{title}'''=

==Description==
{text description}

==Link to Video:==
{{#evu: {video_url} }}     ← embedded video template
```

**Note on `#evu:` template:** This is a MediaWiki extension template for embedding external video (likely YouTube). The URL inside needs to be extracted and stored as a plain URL in Payload.

**Extracted fields:**

| Section | Payload field |
|---|---|
| H1 title | `title` |
| Description section | `description` (rich text) |
| `#evu:` URL | `videoUrl` |
| Categories | `tags[]` |

---

### 2.4 Content Type: `tamil`

Pages where the primary content is in Tamil script. May overlap with other types (e.g., a Tamil-language dharana article). Needs special handling for:
- Tamil Unicode characters in titles (URL encoding required)
- Right-to-left-adjacent rendering concerns
- Tamil category names (e.g., `[[Category:தமிழ்]]`)

**Example found:** `"13 மே - 2 ஜூன், 2017"` — a Tamil newsletter/publication page with sections in Tamil.

**Recommended approach:** Store as `article` type with `language: "ta"` field. Do not try to parse Tamil section structure — store as raw rich text.

---

### 2.5 Content Type: `redirect`

Pages that are just `#REDIRECT [[Target page title]]`. These should **not** be imported as content — they should be resolved to their target and either skipped or stored as a URL alias.

**Recommended approach:** Skip during import; log all redirects in a separate `redirects.json` file for the Payload team to handle via slug aliases.

---

### 2.6 Content Type: `stub`

Pages with fewer than 100 bytes. Often incomplete or placeholder pages. Review manually before importing.

---

### 2.7 Content Type: `article` (catch-all)

General knowledge articles that don't fit the above patterns. Import as a generic rich-text document.

---

## 3. Reliability Issues Found in Test Crawl

> **Important for Payload team:** The wiki server is unstable. In a 20-page test, 6 pages (30%) failed with either a timeout or HTTP 502.

| Issue | Count (from 20-page test) |
|---|---|
| HTTP 502 (Bad Gateway) | 5 pages |
| Request timeout (>30s) | 1 page |
| Success | 14 pages |

**Implication:** The import script must be designed for partial success. The Payload API must support:
- Idempotent upserts (so the script can safely re-run and skip already-imported pages)
- A stable unique key per page — use `wikiPageId` (the integer MediaWiki page ID)

The analysis script has been updated with retry logic (up to 4 retries, exponential backoff: 2s → 4s → 8s → 16s) and a 45-second timeout.

---

## 4. Required Payload CMS Collections

### 4.1 `wiki-pages` (unified collection, recommended approach)

Rather than separate collections per type, use a single collection with a `contentType` discriminator field. This simplifies querying and keeps migration logic straightforward.

```typescript
{
  // --- Identity ---
  wikiPageId: number,          // MediaWiki integer page ID — UNIQUE, used for dedup/upsert
  slug: string,                // URL-safe slug derived from title
  title: string,               // display title
  contentType: 'event' | 'dharana' | 'press_meet' | 'article' | 'tamil' | 'stub',
  language: 'en' | 'ta' | 'sa' | string,  // primary language

  // --- Common fields ---
  categories: string[],        // raw wiki categories, stored as tags
  internalLinks: string[],     // wiki page titles this page links to
  wikiUrl: string,             // original source URL
  lastWikiEditor: string,
  lastWikiEditedAt: Date,
  migratedAt: Date,

  // --- Event-specific fields (populated when contentType === 'event') ---
  place: string,
  eventDate: Date,
  eventType: string,
  activityTypes: string[],
  participantsCount: number,
  volunteerCount: number,
  foodServed: boolean,
  mealsCount: number,
  eventDuration: string,
  uploaderEmail: string,
  description: richText,
  presidentialBriefing: richText,
  pdbImages: Media[],          // first 10 images (PDB section)
  galleryImages: Media[],      // remaining gallery images

  // --- Dharana-specific fields (populated when contentType === 'dharana') ---
  sourceText: string,          // PRAMANA section — Sanskrit/Tamil verse
  transliteration: string,
  translation: richText,
  benefits: richText,

  // --- Press meet fields (populated when contentType === 'press_meet') ---
  videoUrl: string,

  // --- Generic article body ---
  body: richText,              // used for article, tamil, and as fallback for others
}
```

### 4.2 `media` (Payload built-in)

Reuse Payload's built-in Media collection. Add these fields:
```typescript
{
  sourceWikiUrl: string,   // original image URL from the wiki
  altText: string,
  caption: string,
}
```

### 4.3 `redirects` (optional)

If Payload needs to serve old wiki URLs:
```typescript
{
  fromSlug: string,   // the redirect page title (slugified)
  toSlug: string,     // the target page title (slugified)
}
```

---

## 5. Payload API Requirements

### 5.1 Endpoints the import script will call

| Operation | Endpoint | Notes |
|---|---|---|
| Auth | `POST /api/users/login` | Returns JWT |
| Check for existing page | `GET /api/wiki-pages?where[wikiPageId][equals]={id}` | For dedup |
| Create page | `POST /api/wiki-pages` | |
| Update existing page | `PATCH /api/wiki-pages/{id}` | For re-runs |
| Upload media | `POST /api/media` | multipart/form-data |
| Create redirect | `POST /api/redirects` | Optional |

### 5.2 Environment variables needed by import script

```env
PAYLOAD_URL=https://your-payload-instance.com
PAYLOAD_EMAIL=admin@example.com
PAYLOAD_PASSWORD=yourpassword
# --- OR ---
PAYLOAD_API_KEY=your-api-key

# Source wiki credentials
WIKI_USERNAME=your_wiki_bot_username
WIKI_PASSWORD=your_wiki_bot_password
```

---

## 6. Image Migration Strategy

Images in the wiki are stored as direct URLs pointing to nithyanandapedia.org's file server. Three options:

| Option | Description | Effort | Recommended for |
|---|---|---|---|
| **A — URL only** | Store the original wiki image URLs as strings. No re-hosting. | Low | Quick first import; images may go dead if wiki is decommissioned |
| **B — Download + re-upload** | Script downloads each image, uploads to Payload media, replaces URL | Medium | Permanent migration — do after content import |
| **C — Direct S3 copy** | Copy files between S3 buckets if both use S3 | Low (if infra allows) | Best if Payload uses S3 storage |

**Recommended plan:** Do Option A first (import content with URLs), then run a separate media migration pass (Option B) once content is validated.

---

## 7. Migration Script Interface

### Phase 1 — Analysis (run on your server)

```bash
# Quick test (20 pages)
node wiki-analyze.js --limit 20

# Full crawl
node wiki-analyze.js

# Include raw wikitext for ALL pages (larger output, needed for full import)
node wiki-analyze.js --save-all-wikitext

# Resume if interrupted
node wiki-analyze.js --resume
```

### Phase 2 — Import (to be built after Payload schema confirmed)

```bash
# Dry run — shows what would be imported, no writes to Payload
node wiki-import.js --dry-run

# Full import
node wiki-import.js

# Resume interrupted import
node wiki-import.js --resume

# Single page test
node wiki-import.js --page "Singapore On 2024-03-15"

# Import only a specific content type
node wiki-import.js --type event
node wiki-import.js --type dharana
```

---

## 8. Open Questions for Payload Team

Answer these before the import script (`wiki-import.js`) can be built:

| # | Question | Why it matters |
|---|---|---|
| 1 | What is the exact collection slug? | Determines API endpoint paths |
| 2 | One collection with `contentType` field, or separate collections per type? | Changes the whole data model |
| 3 | Share the collection config file (TypeScript) | Ensures field names match exactly |
| 4 | Is rich text Lexical or Slate? | Determines the JSON format for body/description POSTs |
| 5 | Is media handled by Payload built-in, or an external S3 URL field? | Determines image migration approach |
| 6 | Auth: API key (preferred) or email/password JWT? | Simpler to use API key |
| 7 | Does the API support upsert by `wikiPageId`? | Required for safe re-runs |
| 8 | Should Tamil-script pages be imported at all, or deferred? | Scope decision |
| 9 | What should happen to redirects and stubs? | Skip, or create stub documents? |
| 10 | Is there a rate limit on the Payload API? | Import script needs to throttle accordingly |

---

## 9. File Reference

| File | Purpose |
|---|---|
| `wiki-analyze.js` | Phase 1: crawls wiki, produces analysis output |
| `wiki-analysis/insights.json` | Aggregate stats (page types, templates, languages) |
| `wiki-analysis/summary.csv` | Per-page table — open in Google Sheets |
| `wiki-analysis/report.json` | Full structured data — input to import script |
| `server.js:328–381` | Original wiki page creation code — source of truth for event page shape |
| `WIKI_MIGRATION_SPEC.md` | This document |

---

## 10. Known Issues / Edge Cases

| Issue | Impact | Mitigation |
|---|---|---|
| Wiki is IP-allowlisted | Script must run from a trusted server | Documented in §1 |
| 30% transient 502/timeout rate | Pages may be skipped in a single run | Retry logic + `--resume` flag |
| Tamil/Unicode titles | URL encoding required | Handled by MediaWiki API automatically |
| Titles with leading `"` quotes | First 20 pages all start with `"` — a wiki naming convention | Strip quotes in slug generation |
| Wikitext stripped for non-event pages by default | Full text not in `report.json` | Use `--save-all-wikitext` flag |
| `#evu:` video template | Non-standard, needs URL extraction | Handled in content type detection |
| Inline CSS in template (`#css:`) | Not real content — parser function | Detected and excluded from template frequency |
| Pages with 0 bytes | Likely deleted or access-restricted | Classified as `stub`, skipped in import |

---

*Last updated based on 20-page test crawl of nithyanandapedia.org (namespace 0, alphabetical start). Run the full `wiki-analyze.js` crawl to validate all counts and discover additional templates/categories.*

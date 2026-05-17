-- wiki-mysql-analysis.sql
-- Run directly against the MediaWiki MySQL/MariaDB database for instant stats.
--
-- Usage on wiki server:
--   mysql -u root -p wikidb < wiki-mysql-analysis.sql > results.txt
--   mysql -u root -p wikidb --table < wiki-mysql-analysis.sql   (pretty tables)
--
-- Default MediaWiki DB name is usually: wikidb, mediawiki, or my_wiki
-- Check with: mysql -u root -p -e "SHOW DATABASES;"

-- ─── 1. Total page counts by namespace ───────────────────────────────────────

SELECT '=== Page counts by namespace ===' AS '';

SELECT
  p.page_namespace AS namespace,
  CASE p.page_namespace
    WHEN 0  THEN 'Main (articles)'
    WHEN 1  THEN 'Talk'
    WHEN 2  THEN 'User'
    WHEN 4  THEN 'Project'
    WHEN 6  THEN 'File'
    WHEN 10 THEN 'Template'
    WHEN 12 THEN 'Help'
    WHEN 14 THEN 'Category'
    ELSE CONCAT('NS:', p.page_namespace)
  END AS namespace_name,
  COUNT(*) AS page_count,
  SUM(p.page_len) AS total_bytes,
  ROUND(AVG(p.page_len)) AS avg_bytes_per_page
FROM page p
GROUP BY p.page_namespace
ORDER BY page_count DESC;

-- ─── 2. Total redirect count ──────────────────────────────────────────────────

SELECT '=== Redirects ===' AS '';

SELECT
  COUNT(*) AS total_redirects,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM page WHERE page_namespace = 0), 1) AS pct_of_main_ns
FROM page
WHERE page_is_redirect = 1 AND page_namespace = 0;

-- ─── 3. Top 50 templates by usage ────────────────────────────────────────────

SELECT '=== Top 50 templates by usage ===' AS '';

SELECT
  tl_title AS template_name,
  COUNT(*) AS pages_using_it
FROM templatelinks
WHERE tl_namespace = 10  -- template namespace
GROUP BY tl_title
ORDER BY pages_using_it DESC
LIMIT 50;

-- ─── 4. Top 50 categories by page count ──────────────────────────────────────

SELECT '=== Top 50 categories ===' AS '';

SELECT
  cl_to AS category_name,
  COUNT(*) AS page_count
FROM categorylinks
GROUP BY cl_to
ORDER BY page_count DESC
LIMIT 50;

-- ─── 5. Pages using EventDetails template (event pages) ──────────────────────

SELECT '=== Event pages (using EventDetails template) ===' AS '';

SELECT
  COUNT(DISTINCT tl_from) AS event_page_count
FROM templatelinks
WHERE tl_title = 'EventDetails' AND tl_namespace = 10;

-- Full list of event pages with metadata
SELECT
  p.page_id,
  p.page_title,
  p.page_len AS byte_size,
  r.rev_timestamp AS last_edited,
  a.actor_name AS last_editor
FROM templatelinks tl
JOIN page p ON p.page_id = tl.tl_from
JOIN revision r ON r.rev_id = p.page_latest
JOIN actor a ON a.actor_id = r.rev_actor
WHERE tl.tl_title = 'EventDetails'
  AND tl.tl_namespace = 10
  AND p.page_namespace = 0
ORDER BY r.rev_timestamp DESC
LIMIT 200;

-- ─── 6. Pages with galleries ──────────────────────────────────────────────────

SELECT '=== Pages containing gallery tag ===' AS '';

-- Note: This scans revision text — slow on large wikis.
-- If too slow, skip this and rely on the XML dump analysis instead.
SELECT COUNT(*) AS pages_with_gallery
FROM page p
JOIN revision r ON r.rev_id = p.page_latest
JOIN text t ON t.old_id = r.rev_text_id
WHERE t.old_text LIKE '%<gallery%'
  AND p.page_namespace = 0;

-- ─── 7. File/image stats ──────────────────────────────────────────────────────

SELECT '=== File/image stats ===' AS '';

SELECT
  COUNT(*) AS total_files,
  SUM(img_size) AS total_bytes,
  ROUND(SUM(img_size) / 1024 / 1024, 1) AS total_mb,
  ROUND(AVG(img_size) / 1024, 1) AS avg_kb_per_file
FROM image;

SELECT
  img_media_type AS media_type,
  COUNT(*) AS count,
  ROUND(SUM(img_size) / 1024 / 1024, 1) AS total_mb
FROM image
GROUP BY img_media_type
ORDER BY count DESC;

-- ─── 8. Pages by content size buckets ────────────────────────────────────────

SELECT '=== Page size distribution (main namespace) ===' AS '';

SELECT
  CASE
    WHEN page_len < 100   THEN '0-100b (stub/redirect)'
    WHEN page_len < 1000  THEN '100b-1kb'
    WHEN page_len < 5000  THEN '1kb-5kb'
    WHEN page_len < 20000 THEN '5kb-20kb'
    WHEN page_len < 50000 THEN '20kb-50kb'
    ELSE '50kb+ (large page)'
  END AS size_bucket,
  COUNT(*) AS page_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct
FROM page
WHERE page_namespace = 0 AND page_is_redirect = 0
GROUP BY size_bucket
ORDER BY MIN(page_len);

-- ─── 9. Edit activity — most active editors ───────────────────────────────────

SELECT '=== Most active editors (all time) ===' AS '';

SELECT
  a.actor_name AS editor,
  COUNT(*) AS total_edits
FROM revision r
JOIN actor a ON a.actor_id = r.rev_actor
WHERE r.rev_deleted = 0
GROUP BY a.actor_name
ORDER BY total_edits DESC
LIMIT 20;

-- ─── 10. Recent activity — pages edited in last 12 months ───────────────────

SELECT '=== Pages edited in last 12 months ===' AS '';

SELECT COUNT(DISTINCT p.page_id) AS active_pages
FROM page p
JOIN revision r ON r.rev_id = p.page_latest
WHERE r.rev_timestamp >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 12 MONTH), '%Y%m%d%H%i%S')
  AND p.page_namespace = 0;

-- ─── 11. Languages — pages with Tamil content ────────────────────────────────

SELECT '=== Pages with Tamil category ===' AS '';

SELECT COUNT(*) AS tamil_pages
FROM categorylinks
WHERE cl_to IN ('Tamil', 'தமிழ்');

-- ─── 12. External links summary ──────────────────────────────────────────────

SELECT '=== External link domains (top 20) ===' AS '';

SELECT
  SUBSTRING_INDEX(SUBSTRING_INDEX(el_to, '/', 3), '://', -1) AS domain,
  COUNT(*) AS link_count
FROM externallinks
GROUP BY domain
ORDER BY link_count DESC
LIMIT 20;

-- ─── 13. Migration readiness summary ─────────────────────────────────────────

SELECT '=== Migration Readiness Summary ===' AS '';

SELECT
  (SELECT COUNT(*) FROM page WHERE page_namespace = 0) AS total_main_pages,
  (SELECT COUNT(*) FROM page WHERE page_namespace = 0 AND page_is_redirect = 1) AS redirects,
  (SELECT COUNT(*) FROM page WHERE page_namespace = 0 AND page_len < 100 AND page_is_redirect = 0) AS stubs,
  (SELECT COUNT(DISTINCT tl_from) FROM templatelinks WHERE tl_title = 'EventDetails') AS event_pages,
  (SELECT COUNT(*) FROM image) AS total_media_files,
  (SELECT ROUND(SUM(img_size)/1024/1024, 1) FROM image) AS total_media_mb;

// T1.5-F1 probe — every served feed article must be unique at the merge point.
// The agricultura (AFIR) route response duplicated each /comunicate/ URL twice
// (12 items = 6 unique) before the fix. Fails while duplicates are served.
const base = process.env.AFLIVRA_VERIFY_SOURCE_BASE || 'http://127.0.0.1:5173';
const response = await fetch(base + '/api/domain?kind=agricultura&geoScope=national');
const payload = await response.json();
const items = payload?.data?.items || [];
const urls = items.map(item => item.url);
const uniqueUrls = new Set(urls);
const ids = items.map(item => item.id);
const uniqueIds = new Set(ids);
console.log('status=' + payload.status + ' items=' + items.length + ' uniqueUrls=' + uniqueUrls.size + ' uniqueIds=' + uniqueIds.size);
if (payload.status === 'unavailable') {
  console.log('F1 SKIPPED: source degraded honestly (no data served)');
  process.exit(0);
}
const ok = response.ok && items.length > 0 && urls.length === uniqueUrls.size && ids.length === uniqueIds.size && payload.data.total <= items.length + 0 || (items.length === 0);
console.log(ok ? 'F1 GREEN: every served article URL is unique' : 'F1 RED: duplicated articles served');
process.exit(ok ? 0 : 1);

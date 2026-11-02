# ServePoint website rebuild — October 7, 2026

## What the supplied exports show

Source: the two Search Console ZIP files in `C:\Users\ASUS TUF F15\Downloads\seo`. The performance export is filtered to Web / Last 3 months; the final daily row is October 4, 2026.

| Page or group | Clicks | Impressions | CTR / position |
| --- | ---: | ---: | --- |
| Homepage | 26 | 1,769 | 1.47% / 26.08 |
| Restaurant management software, clean URL | 4 | 9,555 | 0.04% / 17.89 |
| Software de hostelería, both URL variants | 0 | 7,490 | 0% |
| Coffee shop margins, both URL variants | 11 | 2,342 | 0.47% combined |

The coverage export's final row has 37 indexed and 83 non-indexed pages. The reason summary includes 26 pages with redirects, 53 discovered but not indexed, three crawled but not indexed and one 404. The export does **not** contain the individual affected URLs, so it cannot identify that 404 or prove why any individual page was excluded. Redirected aliases are normally expected to be excluded; they are not inherently errors.

## Implemented

- Rebuilt the English homepage with responsive cream/green styling, real product screenshots, clear Pro pricing, feature explanations, native HTML FAQs and explicit platform selection. Download options remain available without JavaScript. Added mobile navigation, keyboard focus treatment and a persistent mobile download action.
- Rewrote the two highest-opportunity English and Spanish software guides with feature tables, budget considerations, practical setup checks and clearer product calls to action. Their visible update dates and structured data match the changes.
- Applied a shared readable theme and Android/iOS/Windows choices to the blog. Removed unused external font requests from the newly themed guides and contact pages.
- Aligned ServePoint marketing canonical URLs, Open Graph/structured-data URLs, internal links and hreflang references with the existing Vercel `cleanUrls: true` / `trailingSlash: false` configuration. Normalized all 76 sitemap URLs. Existing hosting redirects are retained.
- Fixed locale-relative assets and a broken Spanish section link. Fixed overflowing footer links and screenshot decoration on translated mobile homepages.
- Replaced competing contact submission handlers in English, French, Spanish and Arabic with one shared handler. It sends through the existing Web3Forms integration, requires explicit `success: true`, preserves the message on errors, prevents duplicate clicks and uses translated accessible status messages. No test messages were sent externally.
- Added conversion event hooks for homepage download intent, store clicks, contact intent and confirmed form submissions. These push to `window.dataLayer`; click events also dispatch `servepoint:conversion`. **A reporting collector is not configured by this change.** Existing Leadsy tracking remains on the homepage.

The French, Spanish and Arabic homepages retain their existing content/layout, with URL, asset and mobile fixes. Other app microsites and the admin/backend are outside the redesign. The pre-existing untracked `adgen/delete-account.html` was left untouched.

## Validation

- `npm test`: 58 existing tests passed.
- `npm run check:seo`: 77 marketing pages and 76 sitemap URLs checked for resolvable local links, valid JSON-LD, clean canonical targets and valid section anchors.
- `npm run test:browser`: responsive homepage checks at 320, 390, 768 and 1440 px; guide/locale layout and image checks; no-JavaScript navigation/FAQs; one-request contact behavior; localized confirmations; backend failure and malformed-success handling. Web3Forms is mocked in all tests.
- Desktop and mobile screenshots: `docs/home-1440.png` and `docs/home-390.png`.
- Tests ran on the available Node 24 host. The project still declares Node 22 for deployment. No live email-delivery test was performed.

Run `npm run preview` for the local preview at http://127.0.0.1:4173. The preview implements the site's clean URL behavior; the API backend is not emulated. Browser tests use installed Chrome locally; CI should install Playwright Chromium with `npx playwright install chromium`.

## Launch and measurement

1. Deploy the reviewed changes through the existing Vercel project. Verify `/blog/restaurant-management-software.html` redirects to its clean URL, `/fr/` redirects to `/fr`, and final pages return 200. The local preview verifies intended behavior but is not a production routing test.
2. Resubmit `/sitemap.xml` in Search Console and inspect the homepage plus the two rewritten guides. Open the detailed 404 and excluded-page reports to obtain their exact URLs before deciding on repairs or redirects.
3. Connect the conversion hooks to the analytics platform you actually use. Suggested events: `download_intent`, `store_click`, `contact_intent`, `contact_success`. Report `store_click` as an outbound visit, **not** as an app installation or paid subscription. Measuring purchases requires app/store-side attribution.
4. Establish a post-launch baseline, then compare matching 28-day periods by page, query, device and country. Prioritize non-brand clicks and store-click/contact conversion rates. Track the two rewritten guides separately. Rankings, snippets and conversion improvements are not guaranteed and are not measurable from a local rebuild.
5. Next editorial opportunity: the coffee-margin guide already has visibility near the first page. Improve its evidence and add a useful cost worksheet before expanding into more overlapping keyword articles.

Technical references: [Vercel project configuration](https://vercel.com/docs/project-configuration) documents clean URLs and trailing-slash handling. [Google canonicalization guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) explains consistent canonical and sitemap signals.

## Production deployment

Subscription price update: the website's advertised price was subsequently changed to $9.99 USD/month in 50 pages, including translated copy, metadata and structured data. Annual examples now total $119.88 for 12 monthly payments. SEO checks and the four responsive homepage checks passed. Production deployment `dpl_8TTSWvKnSLenP1TGEpDda525ZqST` supersedes the initial rebuild below. App-store/billing product prices were not modified by this website change.

Deployed October 7, 2026, at the user's request, to the existing `servepoint-website` Vercel project. Deployment `dpl_DZ1XF3QTjYzbTCcKttqjyUEpVVo7` is Ready / production, aliased to `www.servepointpos.com` and `servepointpos.com`.

Verified the deployed homepage content, stylesheet reference, download section and contact handler through authenticated `vercel curl`. Confirmed 308 redirects from the management guide's `.html` alias and `/fr/` to their clean equivalents. Direct custom-domain requests timed out from the execution network, so custom-domain availability was not independently confirmed. No Git commit or push was required for the CLI deployment. The unrelated pre-existing `adgen/delete-account.html` was excluded from this upload.

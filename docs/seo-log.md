# SEO log

One entry per monthly review. Source data: `seo-data/<month>/`, from `npm run gsc:export`.

## 2026-11-02: first review (changes not yet live)

### Baseline

Property: `https://www.servepointpos.com/`. October was not final when exported, so re-export it after Nov 4.

| Month | Clicks | Impressions | Avg. position |
| --- | ---: | ---: | ---: |
| 2026-08 | 24 | 7,011 | 33.1 |
| 2026-09 | 53 | 21,265 | 24.5 |
| 2026-10 (partial) | 43 | 19,046 | 19.6 |

Indexing on Nov 2, from URL Inspection of the 76 sitemap URLs and the `.html` versions of the unknown guides: 25 indexed, 7 alternate canonical, 14 discovered but not indexed, 25 guides unknown to Google. Five non-guide URLs (privacy and contact pages for apps) were also unknown and were not rechecked under `.html`.

### Findings

- **The Oct 7 rebuild was overwritten.** It was deployed with the Vercel CLI and never committed. The Oct 21 git push deployed the old committed files. Google's crawl records show clean canonicals on Oct 13 and `.html` canonicals again from Oct 22. The live site returned to `$5/mo` pricing, redirecting `.html` canonicals and a sitemap of redirecting URLs.
- **Mid-September drop, cause unknown.** `tpv-para-restaurante`, `software-hosteleria-tpv`, `qr-code-menu` and `caisse-enregistreuse-tactile-restaurant` lost most impressions from the week of Sep 14. Google last crawled them on Aug 25 to Sep 11 and they remain indexed. This came before the rebuild, so the rebuild did not cause it.
- **Site-wide rise from Oct 26.** Daily impressions went from about 550 to 1,500 across English guides. The cause is not known.
- **Weak internal linking.** 33 of 60 guides had one inbound link, from `/blog`.
- **Wording mismatch.** `cloud pos restaurant` ranked 13 while `cloud based restaurant pos` ranked 70.

### Changes made

- Added a Related guides block to all 60 guides and guide links to the four homepage footers. Minimum inbound links went from 1 to 4.
- Expanded restaurant management, bar, food truck, coffee margin, cloud and Dubai guides to match the queries they already appear for.
- Separated the Spanish pages: `software-hosteleria-tpv` covers the broad category and how a TPV works; `tpv-para-restaurante` covers choosing a TPV by business type.
- Shortened long meta descriptions on the changed pages and updated their dates and sitemap `lastmod`.
- Removed claims the homepage does not support from those pages: VAT receipts, QR menu, no transaction fee, multi-branch sync and "try free". The owner confirmed on Nov 2 that the app works without internet, so that claim stays, alongside the note that live sync between devices needs a connection.

### How to judge this at the next review

Compare a post-launch 28-day period with Oct 5 to Nov 1. Allow 4 to 8 weeks. Other changes in Google's results can move these numbers, so look for several signals moving together.

| Change | Early signal | Treat as failed if |
| --- | --- | --- |
| Internal links | Unknown guides drop from 25; last-crawl dates get newer | Unknown guides stay above 20 after 8 weeks |
| Clean canonicals | `.html` URLs stop appearing in the pages report | Google still picks `.html` canonicals after 8 weeks |
| Cloud wording | `cloud based restaurant pos` moves up from position 70 | It stays below position 50 |
| Bar and food truck content | Impressions hold and position improves | Position is flat or worse with lower impressions |
| Coffee worksheet | CTR on the page rises from 0.37% | CTR is flat at a similar position |
| Spanish split | Each page gains its own queries | They keep swapping the same queries |

### Open items

- Fix "Try ServePoint free" on the 27 guides not changed here. The homepage says downloading does not make Pro free.

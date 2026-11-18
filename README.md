# DFIR portfolio

A static website. You write Markdown, the build script turns it into plain HTML in `dist/`. No framework, one dependency (`marked`), and fonts are served locally. Cloudflare Pages Web Analytics may add its third-party script when enabled.

## Run it

```bash
npm install
npm run build      # writes the site to dist/
npm run preview    # builds, then serves http://localhost:4173
npm run check      # verifies every link, image, font and anchor in dist/
npm run launch     # builds, checks, and lists any placeholder content still on the site
```

Needs Node 18 or newer.

## Put your content in (the only part you need to do)

1. **`site.config.json`**: name, role, brand, intro, focus, tools, status, email, links, skills, certifications, training. This fills the home page, header, Skills, Certifications and Contact. Set `"brand"` to change the text beside the header icon; the `@` separates the two parts and is styled in the accent color.
2. **`content/about.md`**: your About page.
3. **`content/case-studies/`, `content/ctfs/` and `content/write-ups/`**: write-ups and other Markdown entries. Replace the samples or delete them.
4. **Settings to change at launch** (in `site.config.json`):
   - `"siteUrl"`: your public address, for example `"https://username.github.io/"`. Turns on the sitemap, canonical links and the share image. You can also set it with the `SITE_URL` environment variable.
   - `"showSampleNotes"`: set to `false` once the samples are gone.
   - `"photo"`: optional, for example `"me.jpg"`. Put the file in `src/`. It appears as your portrait on the About page; the homepage uses the recent-activity terminal instead.
   - `"cv"`: optional, for example `"assets/cv.pdf"`. Put the PDF in `content/assets/`. When set, a CV download link appears below the profile card on the About page and on the Contact page.
   - `"pgp"`: optional, paste your public key.
   - `"lang"`: `"en"` by default. Use `"ar"` for an Arabic site.
5. **Share image**: `content/assets/og-image.png` (1200 x 630) is shown when someone shares a link on LinkedIn or X. Replace it with your own.
6. Run `npm run launch`. It lists anything still left to change. When it prints "no placeholders found", you are ready to publish.

### Preview while editing

Run `npm run preview` from the project folder. It builds the site and serves it starting at `http://localhost:4173`; if that port is already in use, it tries the next 20 ports and prints the address it selected. To choose a different starting port, run `npm run preview -- --port 5000`. Unknown URLs show the custom 404 page. Keep that terminal open while you work. The preview watches `content/`, `src/` and `site.config.json`, rebuilds when they change, and automatically refreshes the browser.

On the Case studies, CTFs and Write-ups pages, selecting a tag updates the URL. Use **Copy filtered link** to share that category selection; opening the link restores the selected tag.

## Add a write-up

Create a file in `content/write-ups/` (or `content/case-studies/` for a full investigation, or `content/ctfs/` for a CTF challenge):

```markdown
---
title: Your title
date: 2026-11-02
category: Memory forensics
summary: One sentence shown on cards and in search results.
tags: [Memory, Malware]
tools: [Volatility 3]
attack: [T1055 Process Injection]
source: Lab, sample image
---

## Scenario

Text here.
```

Fields: `title` and `date` (YYYY-MM-DD) are required. `tags` become the filter buttons. `tools` and `attack` show as badges. Add `sample: true` to mark a placeholder, `draft: true` to hide a file.

Every `##` heading becomes an entry in the table of contents.

### Extra blocks

````markdown
:::callout Question to answer
Text inside the box. Normal Markdown works here.
:::

:::timeline
09:14 UTC | Short title | One line of detail
09:21 UTC | Next event | More detail
:::

```bash
$ command that starts with a dollar sign gets a prompt
# lines starting with # are shown as comments
```

![Alt text](assets/my-screenshot.png "Caption shown under the image")
````

Put images in `content/assets/`. Link to another page of your own site with a leading slash, for example `[About](/about.html)` or `[My other case](/case-studies/my-case/)`; without the slash the link breaks, and `npm run check` will tell you. Case studies, CTFs and write-ups are published at extensionless URLs such as `/case-studies/my-case/`. Tables, lists, links and `inline code` work as usual. Arabic and other right-to-left text lines up correctly paragraph by paragraph.

## Deploy for free

Publish the contents of `dist/` (or let a host build it).

- **GitHub Pages**: push the project to GitHub, open Settings, Pages, and choose "GitHub Actions". The workflow in `.github/workflows/pages.yml` builds, checks and publishes on every push to `main`. If the site lives at `username.github.io/repo-name`, set `"basePath": "/repo-name/"` and `"siteUrl": "https://username.github.io/repo-name/"` in `site.config.json`.
- **Netlify or Cloudflare Pages**: build command `npm run build`, output folder `dist`. Set `SITE_URL` as an environment variable, or fill in `siteUrl`. The build emits a `_headers` file with security response headers for hosts that support this format (including Cloudflare Pages); configure the equivalent headers in your host if it does not.
- **Any web host**: run `npm run build` and upload the contents of `dist/`.

After publishing, open the site on your phone, switch the theme, open a case study, and share a link to see the preview image.

## Before you publish a real case

- Remove names, addresses, hostnames, hashes and any detail that identifies a client
- Defang indicators (`example[.]com`)
- Get permission if the work was done for an employer or customer

## Notes

- Fonts (Inter and JetBrains Mono, SIL Open Font License) are served from the site itself, so visitors make no request to Google. Licenses are in `src/fonts/`.
- Pages ship with a strict Content Security Policy: no inline scripts or styles, with only Cloudflare Web Analytics allowed as an external script and connection. Enable Web Analytics in your Cloudflare Pages project's **Metrics** settings; Pages adds its snippet on the next deployment. `npm run check` fails if a page breaks the no-inline-script/style rule. If you add another external script or analytics provider, update the policy in `build.mjs` (`CSP`) with only the required sources.
- The build also emits HTTP security headers, including `frame-ancestors 'none'` and `X-Frame-Options: DENY` to prevent framing. These headers must be served by the hosting provider; the HTML CSP meta tag cannot enforce `frame-ancestors`.
- The build restricts cross-origin reads to the published Pages origin. If the site moves to a custom domain, update `Access-Control-Allow-Origin` in `build.mjs` to that origin and verify it on the deployed response.
- Without JavaScript the site still reads and navigates; only the search, filters, theme button and copy buttons need it.
- The theme button remembers the visitor's choice. Reloads and new pages open at the top; Back returns to where you were.
# Abdo-DFIR_Portofilo

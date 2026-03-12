# Auctorio — SEO Architecture

> Angular 20 SSR · Bilingual (EN default / ES) · Express 5

---

## 1. URL Structure

### Locale Strategy

- **English (default)**: root paths (`/`, `/use-cases`, `/faq`, `/contact`)
- **Spanish**: prefixed (`/es`, `/es/casos-de-uso`, `/es/faq`, `/es/contacto`)
- **x-default**: points to English variant

### Route Map

| Page | EN Path | ES Path |
|------|---------|---------|
| Home | `/` | `/es` |
| Use Cases | `/use-cases` | `/es/casos-de-uso` |
| Use Case Detail | `/use-cases/:slug` | `/es/casos-de-uso/:slug` |
| Examples | `/examples` | `/es/ejemplos` |
| Gallery | `/gallery` | `/es/galeria` |
| FAQ | `/faq` | `/es/faq` |
| Contact | `/contact` | `/es/contacto` |
| Built by Tecnoria | `/built-by-tecnoria` | `/es/creado-por-tecnoria` |
| Studio Login | `/studio/login` | `/studio/login` |

### Canonical & Alternate Links

Every public page renders:
- `<link rel="canonical" href="https://auctorio.com{path}" />`
- `<link rel="alternate" hreflang="en" href="https://auctorio.com{en_path}" />`
- `<link rel="alternate" hreflang="es" href="https://auctorio.com{es_path}" />`
- `<link rel="alternate" hreflang="x-default" href="https://auctorio.com{en_path}" />`

Managed by `SeoService.update()` in `src/app/services/seo.service.ts`.

---

## 2. Meta Tags

### Per-Page SEO Data

Defined in `marketing-content.ts` → `getLocalizedPageSeo(locale, pageKey)`.

Each page entry contains:
- `title` — keyword-rich, branded with "Auctorio —"
- `description` — benefit-focused, under 160 chars
- `keywords[]` — 3–4 target phrases

### index.html Defaults

```html
<html lang="en">
<title>Auctorio — AI Content Operations Platform for Publishers</title>
<meta name="description" content="...">
<meta name="theme-color" content="#090d12">
```

Angular SSR overwrites title and description per-route.

---

## 3. Structured Data (JSON-LD)

All schemas rendered server-side by `SeoService`.

### Global Schemas (every page)

| Schema | Purpose |
|--------|---------|
| `Organization` | Tecnoria as the brand creator |
| `SoftwareApplication` | Auctorio as a SaaS product |
| `WebSite` | Site-level metadata with search action |

### Per-Page Schemas

| Page | Schemas |
|------|---------|
| Home | `WebPage`, `Breadcrumb`, `FAQ`, `ImageObject` |
| Use Cases | `WebPage`, `Breadcrumb`, `ImageObject` |
| Use Case Detail | `WebPage`, `Breadcrumb`, `ImageObject` |
| Examples | `WebPage`, `Breadcrumb`, `ImageObject` |
| Gallery | `WebPage`, `Breadcrumb`, `ImageObject` (per asset) |
| FAQ | `FAQ`, `Breadcrumb` |
| Contact | `WebPage`, `Breadcrumb` |
| Built by Tecnoria | `WebPage`, `Breadcrumb`, `ImageObject` |

### FAQ Schema

Present on **both** the FAQ dedicated page and the homepage (which includes an FAQ section). Uses `FAQPage` type with `mainEntity` array:

```json
{
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What does Auctorio actually do?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "..."
      }
    }
  ]
}
```

All 8 FAQ entries per language include proper question marks — critical for Google's featured snippets.

---

## 4. Content Architecture

### Keyword Targeting by Page

| Page | Primary Keyword | Secondary Keywords |
|------|----------------|--------------------|
| Home | "ai content operations platform" | "content workflow for publishers", "editorial automation" |
| Use Cases | "content operations use cases" | "publisher workflow", "multi-site editorial" |
| Digital Publishers | "ai content platform digital publishers" | "editorial workflow automation" |
| Agencies & Brands | "content operations agencies brands" | "brand content program" |
| Multi-Site Editorial | "multi-site editorial operations" | "multi-site publishing workflow" |
| Examples | "ai content workflow examples" | "editorial automation examples" |
| Gallery | "ai generated editorial content" | "content operations assets" |
| FAQ | "auctorio faq", "content operations faq" | "editorial workflow questions" |
| Contact | "contact auctorio", "auctorio demo" | "content operations demo" |

### Internal Link Graph

```
Home ──→ Use Cases ──→ Use Case Detail
  │  ──→ Examples
  │  ──→ Gallery
  │  ──→ FAQ
  │  ──→ Contact (primary CTA)
  │
Footer ──→ Platform (home)
       ──→ Use Cases
       ──→ Examples
       ──→ Contact
       ──→ FAQ
       ──→ Built by Tecnoria
       ──→ tecnoria.com (external)
```

### User Intent Mapping

| Intent | Page | CTA |
|--------|------|-----|
| Informational ("what is AI content operations") | Home, FAQ | Learn more |
| Navigational ("auctorio platform") | Home | — |
| Commercial ("content operations platform comparison") | Use Cases, Examples | Request demo |
| Transactional ("auctorio demo", "auctorio pricing") | Contact | Send message |

---

## 5. Technical SEO

### SSR & Crawler Support

- **Server-Side Rendering**: All marketing pages render complete HTML on the server via `@angular/ssr` + Express 5
- **No client-only content**: All text, meta tags, and structured data present in initial HTML response
- **Hydration**: Angular hydration for interactive elements (menu, FAQ toggles)

### Performance Signals

| Signal | Implementation |
|--------|---------------|
| Preconnect | `<link rel="preconnect" href="https://fonts.googleapis.com">` |
| Font display | `font-display: swap` on Inter |
| Image optimisation | Responsive `srcset` (960w + 1600w), `loading="lazy"`, `decoding="async"` |
| Theme color | `<meta name="theme-color" content="#090d12">` |

### robots.txt Recommendations

```
User-agent: *
Allow: /
Disallow: /studio/
Sitemap: https://auctorio.com/sitemap.xml
```

### Sitemap Coverage

Should include all public routes in both locales (16 URLs):
- `/`, `/es` (home)
- `/use-cases`, `/es/casos-de-uso`
- `/use-cases/digital-publishers`, `/es/casos-de-uso/publishers-digitales`
- `/use-cases/agencies-brands`, `/es/casos-de-uso/agencias-marcas`
- `/use-cases/multi-site-editorial`, `/es/casos-de-uso/editorial-multi-site`
- `/examples`, `/es/ejemplos`
- `/gallery`, `/es/galeria`
- `/faq`, `/es/faq`
- `/contact`, `/es/contacto`
- `/built-by-tecnoria`, `/es/creado-por-tecnoria`

---

## 6. Open Graph & Social

Each page sets via `SeoService`:
- `og:title` — page title
- `og:description` — page description
- `og:url` — canonical URL
- `og:type` — "website"
- `og:image` — lead asset image when available
- `og:locale` — "en" or "es"
- `og:locale:alternate` — the other locale

---

## 7. Recommendations

### Short-Term
- [ ] Generate XML sitemap (automated from route config)
- [ ] Add robots.txt
- [ ] Submit sitemap to Google Search Console
- [ ] Set up Google Analytics 4 or Plausible
- [ ] Monitor Core Web Vitals post-deployment

### Medium-Term
- [ ] Add a blog/resources section for informational keywords
- [ ] Create comparison pages ("Auctorio vs X")
- [ ] Add testimonials with structured review data
- [ ] Implement breadcrumb UI component (schema already present)

### Long-Term
- [ ] Programmatic SEO for industry-specific landing pages
- [ ] Multilingual expansion beyond EN/ES
- [ ] Add `SpeakableSpecification` schema for voice search

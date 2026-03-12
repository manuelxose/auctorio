# Auctorio — Image Generation Log

> Generator: `scripts/generate-marketing-images.mjs`  
> Model: `black-forest-labs/FLUX.1-dev` via SiliconFlow API  
> Target: `apps/studio-web/public/marketing/`

---

## Status

**API key expired** at time of execution. The generation script is ready and tested. Re-run:

```bash
cd /var/www/auctorio
SILICONFLOW_API_KEY=sk-YOUR_KEY node scripts/generate-marketing-images.mjs
```

---

## Image Manifest

All images designed for the dark premium theme (`#090d12` background, `#4f8fff` blue accent, `#22d3a7` teal accent).

### 1. publisher-command-center

| Size | File | Dimensions |
|------|------|------------|
| Default | `publisher-command-center-1600.webp` | 1600×900 |
| Compact | `publisher-command-center-960.webp` | 960×540 |

**Prompt**: Premium dark-theme UI dashboard mockup for a content operations platform. Dark navy-black (#090d12) background. Glowing cards and panels with subtle blue (#4f8fff) and teal (#22d3a7) accent borders. Shows editorial pipeline view with article cards in "Draft", "Review" and "Published" columns. Kanban board layout. Minimalist sans-serif typography. Glass morphism translucent panels. Clean data visualization, small bar charts. Subtle grid pattern in the background. Professional SaaS product screenshot aesthetic.

**Negative**: bright, white background, colorful, cartoon, people, text heavy, blurry, amateur, stock

---

### 2. search-led-newsroom

| Size | File | Dimensions |
|------|------|------------|
| Default | `search-led-newsroom-1600.webp` | 1600×900 |
| Compact | `search-led-newsroom-960.webp` | 960×540 |

**Prompt**: Dark premium UI mockup of an SEO-focused editorial workspace. Dark background (#090d12). Central editor panel with content metrics. Left sidebar shows keyword clusters with blue (#4f8fff) sparkline charts. Right panel shows SERP preview cards. Subtle teal (#22d3a7) success indicators for ranking positions. Glass morphism panels with soft glow. Professional publishing platform aesthetic. Clean grid layout. Dark mode dashboard. No people. Ultra modern SaaS design.

**Negative**: bright, white, cartoon, people, stock, blurry, amateur, cluttered

---

### 3. multi-site-publishing-grid

| Size | File | Dimensions |
|------|------|------------|
| Default | `multi-site-publishing-grid-1600.webp` | 1600×900 |
| Compact | `multi-site-publishing-grid-960.webp` | 960×540 |

**Prompt**: Dark premium UI visualization of multi-site content distribution. Dark background (#090d12). Central hub node with radiating connections to 6 website cards arranged in a hexagonal pattern. Each card shows a mini site preview with blue (#4f8fff) and teal (#22d3a7) connection lines. Animated particle flow style connecting lines. Glass morphism cards. Network topology visualization aesthetic. Dark mode. No people. Professional SaaS data flow diagram.

**Negative**: bright, white, cartoon, people, stock, blurry, childish, flowchart arrows

---

### 4. editorial-qa-review

| Size | File | Dimensions |
|------|------|------------|
| Default | `editorial-qa-review-1600.webp` | 1600×900 |
| Compact | `editorial-qa-review-960.webp` | 960×540 |

**Prompt**: Dark premium UI mockup of an editorial review and approval workflow. Dark background (#090d12). Side-by-side diff view showing content changes. Left panel shows original, right panel shows AI-suggested edits with highlighted changes in teal (#22d3a7). Top bar shows review status badges. Bottom shows approval timeline with blue (#4f8fff) progress dots. Glass morphism. Clean code-review aesthetic. Dark mode. No people. Professional editorial tool interface.

**Negative**: bright, white, cartoon, people, stock, blurry, amateur

---

### 5. brand-content-program

| Size | File | Dimensions |
|------|------|------------|
| Default | `brand-content-program-1600.webp` | 1600×900 |
| Compact | `brand-content-program-960.webp` | 960×540 |

**Prompt**: Dark premium UI mockup of a brand content calendar and campaign planner. Dark background (#090d12). Calendar grid view with content blocks color-coded in blue (#4f8fff), teal (#22d3a7), and muted purple tones. Side panel shows campaign brief with brand guidelines. Circular progress indicators. Glass morphism translucent panels. Modern SaaS content planning tool. Dark mode dashboard. No people. Professional marketing platform aesthetic.

**Negative**: bright, white, cartoon, people, stock, blurry, amateur, cluttered

---

### 6. content-operations-showcase

| Size | File | Dimensions |
|------|------|------------|
| Default | `content-operations-showcase-1600.webp` | 1600×900 |
| Compact | `content-operations-showcase-960.webp` | 960×540 |

**Prompt**: Cinematic dark hero image for an AI content operations platform. Deep dark background (#090d12) with subtle radial gradient. Abstract geometric pattern of interconnected nodes and lines representing a content workflow graph. Blue (#4f8fff) primary glow, teal (#22d3a7) secondary accents. Subtle particle system. Isometric 3D floating UI cards showing article previews. Premium tech company hero section aesthetic. Ultra-clean. No people. No text. Futuristic but professional. Dark mode ambient.

**Negative**: bright, white, stock, people, text, logos, watermark, cartoon, busy

---

## Generation Parameters

| Parameter | Value |
|-----------|-------|
| Model | `black-forest-labs/FLUX.1-dev` |
| Inference steps | 28 |
| Guidance scale | 7.0 |
| Output format | WebP (via cwebp at q82) or PNG fallback |
| API endpoint | `https://api.siliconflow.cn/v1/images/generations` |

---

## Existing Images (Pre-Rework)

The current images are SVG-to-WebP conversions with abstract dark teal/amber aesthetics. They remain functional but don't match the new dark premium design system. Replace them by running the generation script with a valid API key.

| File | Size |
|------|------|
| publisher-command-center-1600.webp | 50KB |
| publisher-command-center-960.webp | 25KB |
| search-led-newsroom-1600.webp | 49KB |
| search-led-newsroom-960.webp | 26KB |
| multi-site-publishing-grid-1600.webp | 43KB |
| multi-site-publishing-grid-960.webp | 23KB |
| editorial-qa-review-1600.webp | 39KB |
| editorial-qa-review-960.webp | 19KB |
| brand-content-program-1600.webp | 52KB |
| brand-content-program-960.webp | 25KB |
| content-operations-showcase-1600.webp | 43KB |
| content-operations-showcase-960.webp | 21KB |

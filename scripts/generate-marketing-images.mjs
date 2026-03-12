#!/usr/bin/env node
/**
 * Auctorio — Premium Image Generation via SiliconFlow
 * Generates editorial-grade visuals for the dark premium redesign.
 *
 * Usage:  SILICONFLOW_API_KEY=sk-... node scripts/generate-marketing-images.mjs
 * Output: apps/studio-web/public/marketing/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'apps/studio-web/public/marketing');

const API_KEY = process.env.SILICONFLOW_API_KEY;
const API_URL = `${String(process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.com/v1').replace(/\/$/, '')}/images/generations`;
const MODEL = String(process.env.SILICONFLOW_IMAGE_MODEL || 'black-forest-labs/FLUX.2-pro').trim();

if (!API_KEY) {
  console.error('SILICONFLOW_API_KEY not set.');
  process.exit(1);
}

// ─── IMAGE MANIFEST ──────────────────────────────────────────

const IMAGES = [
  {
    slug: 'publisher-command-center',
    sizes: [
      { suffix: '1600', width: 1600, height: 900 },
      { suffix: '960',  width: 960,  height: 540 },
    ],
    prompt: `
      Premium dark-theme UI dashboard mockup for a content operations platform.
      Dark navy-black (#090d12) background. Glowing cards and panels with subtle
      blue (#4f8fff) and teal (#22d3a7) accent borders. Shows editorial pipeline
      view with article cards in "Draft", "Review" and "Published" columns.
      Kanban board layout. Minimalist sans-serif typography. Glass morphism
      translucent panels. Clean data visualization, small bar charts. Subtle grid
      pattern in the background. Professional SaaS product screenshot aesthetic.
      Ultra-clean, modern, dark mode. No people. No stock photography.
    `,
    negative: 'bright, white background, colorful, cartoon, people, text heavy, blurry, amateur, stock',
  },
  {
    slug: 'search-led-newsroom',
    sizes: [
      { suffix: '1600', width: 1600, height: 900 },
      { suffix: '960',  width: 960,  height: 540 },
    ],
    prompt: `
      Dark premium UI mockup of an SEO-focused editorial workspace.
      Dark background (#090d12). Central editor panel with content metrics.
      Left sidebar shows keyword clusters with blue (#4f8fff) sparkline charts.
      Right panel shows SERP preview cards. Subtle teal (#22d3a7) success
      indicators for ranking positions. Glass morphism panels with soft glow.
      Professional publishing platform aesthetic. Clean grid layout.
      Dark mode dashboard. No people. Ultra modern SaaS design.
    `,
    negative: 'bright, white, cartoon, people, stock, blurry, amateur, cluttered',
  },
  {
    slug: 'multi-site-publishing-grid',
    sizes: [
      { suffix: '1600', width: 1600, height: 900 },
      { suffix: '960',  width: 960,  height: 540 },
    ],
    prompt: `
      Dark premium UI visualization of multi-site content distribution.
      Dark background (#090d12). Central hub node with radiating connections to
      6 website cards arranged in a hexagonal pattern. Each card shows a mini
      site preview with blue (#4f8fff) and teal (#22d3a7) connection lines.
      Animated particle flow style connecting lines. Glass morphism cards.
      Network topology visualization aesthetic. Dark mode. No people.
      Professional SaaS data flow diagram.
    `,
    negative: 'bright, white, cartoon, people, stock, blurry, childish, flowchart arrows',
  },
  {
    slug: 'editorial-qa-review',
    sizes: [
      { suffix: '1600', width: 1600, height: 900 },
      { suffix: '960',  width: 960,  height: 540 },
    ],
    prompt: `
      Dark premium UI mockup of an editorial review and approval workflow.
      Dark background (#090d12). Side-by-side diff view showing content changes.
      Left panel shows original, right panel shows AI-suggested edits with
      highlighted changes in teal (#22d3a7). Top bar shows review status badges.
      Bottom shows approval timeline with blue (#4f8fff) progress dots.
      Glass morphism. Clean code-review aesthetic. Dark mode. No people.
      Professional editorial tool interface.
    `,
    negative: 'bright, white, cartoon, people, stock, blurry, amateur',
  },
  {
    slug: 'brand-content-program',
    sizes: [
      { suffix: '1600', width: 1600, height: 900 },
      { suffix: '960',  width: 960,  height: 540 },
    ],
    prompt: `
      Dark premium UI mockup of a brand content calendar and campaign planner.
      Dark background (#090d12). Calendar grid view with content blocks color-coded
      in blue (#4f8fff), teal (#22d3a7), and muted purple tones. Side panel shows
      campaign brief with brand guidelines. Circular progress indicators.
      Glass morphism translucent panels. Modern SaaS content planning tool.
      Dark mode dashboard. No people. Professional marketing platform aesthetic.
    `,
    negative: 'bright, white, cartoon, people, stock, blurry, amateur, cluttered',
  },
  {
    slug: 'content-operations-showcase',
    sizes: [
      { suffix: '1600', width: 1600, height: 900 },
      { suffix: '960',  width: 960,  height: 540 },
    ],
    prompt: `
      Cinematic dark hero image for an AI content operations platform.
      Deep dark background (#090d12) with subtle radial gradient. Abstract
      geometric pattern of interconnected nodes and lines representing a content
      workflow graph. Blue (#4f8fff) primary glow, teal (#22d3a7) secondary
      accents. Subtle particle system. Isometric 3D floating UI cards showing
      article previews. Premium tech company hero section aesthetic. Ultra-clean.
      No people. No text. Futuristic but professional. Dark mode ambient.
    `,
    negative: 'bright, white, stock, people, text, logos, watermark, cartoon, busy',
  },
];

// ─── GENERATION ──────────────────────────────────────────────

async function generateImage(prompt, negative, width, height) {
  const cleanPrompt = prompt.trim().replace(/\s+/g, ' ');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: cleanPrompt,
      negative_prompt: negative,
      image_size: `${width}x${height}`,
      num_inference_steps: 28,
      guidance_scale: 7.0,
      num_images: 1,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.images?.[0]?.url ?? data.data?.[0]?.url;
}

async function downloadAndConvert(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${res.status}`);

  const tmpPath = outPath.replace(/\.webp$/, '.png');
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmpPath, buf);

  // Convert to webp if cwebp is available, otherwise keep png
  try {
    execSync(`cwebp -q 82 "${tmpPath}" -o "${outPath}"`, { stdio: 'pipe' });
    fs.unlinkSync(tmpPath);
  } catch {
    // cwebp not available — rename png to webp (browsers handle it)
    fs.renameSync(tmpPath, outPath);
  }
}

async function main() {
  console.log('Auctorio Marketing Image Generator');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Model:  ${MODEL}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const log = [];

  for (const image of IMAGES) {
    for (const size of image.sizes) {
      const filename = `${image.slug}-${size.suffix}.webp`;
      const filepath = path.join(OUTPUT_DIR, filename);

      process.stdout.write(`  Generating ${filename} (${size.width}x${size.height})...`);

      try {
        const imageUrl = await generateImage(
          image.prompt,
          image.negative,
          size.width,
          size.height,
        );

        if (!imageUrl) throw new Error('No URL in response');

        await downloadAndConvert(imageUrl, filepath);
        const sizeKB = Math.round(fs.statSync(filepath).size / 1024);
        console.log(` OK ${sizeKB}KB`);

        log.push({
          slug: image.slug,
          size: `${size.width}x${size.height}`,
          file: filename,
          sizeKB,
          status: 'ok',
        });
      } catch (err) {
        console.log(` FAILED: ${err.message}`);
        log.push({
          slug: image.slug,
          size: `${size.width}x${size.height}`,
          file: filename,
          status: 'failed',
          error: err.message,
        });
      }
    }
  }

  // Write generation log
  const logPath = path.join(ROOT, 'apps/studio-web/image-generation-log.json');
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`\nLog written to ${logPath}`);

  const success = log.filter((l) => l.status === 'ok').length;
  const failed  = log.filter((l) => l.status === 'failed').length;
  console.log(`Done: ${success} ok, ${failed} failed out of ${log.length} total`);
}

main().catch(console.error);

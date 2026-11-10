import test from "node:test";
import assert from "node:assert/strict";
import {
  buildArticleJsonLd,
  buildFaqJsonLd,
  buildFeedArticle,
  feedFaqItems,
  feedSlug,
  htmlToMarkdown,
  slugifyTitle,
  type FeedArticleSource,
} from "../src/studio/integrations-feed";

const source = (overrides: Partial<FeedArticleSource> = {}): FeedArticleSource => ({
  id: "version-1",
  title: "Las 10 mejores series de 2026",
  excerpt: "<p>Un repaso a lo que llega este año.</p>",
  bodyHtml:
    '<h2>Streaming</h2><p>Netflix estrena <strong>nuevas</strong> temporadas y <a href="https://guiaprogramaciontv.com/guias/otra">otra guía</a>.</p><ul><li>Uno</li><li>Dos</li></ul>',
  seoTitle: "Las 10 mejores series de 2026 | Guía TV",
  seoDescription: "Las series que llegan en 2026, plataforma por plataforma.",
  publishedAt: new Date("2026-11-09T08:30:00.000Z"),
  updatedAt: new Date("2026-11-10T09:00:00.000Z"),
  project: {
    title: "Series 2026",
    primaryLanguage: "es",
    metadata: {
      slug: "mejores-series-2026",
      faqItems: [{ question: "¿Dónde verla?", answer: "En Netflix." }],
    },
    site: { name: "Guía TV", baseUrl: "https://guiaprogramaciontv.com" },
  },
  contentImage: { storagePath: "covers/series-2026.webp" },
  assetUrl: "https://auctorio.com/assets/covers/series-2026.webp",
  publishedUrl: "https://guiaprogramaciontv.com/guias/mejores-series-2026",
  ...overrides,
});

test("the slug is the project's approved slug and never empty", () => {
  assert.equal(feedSlug(source()), "mejores-series-2026");
  assert.equal(feedSlug(source({ project: { ...source().project, metadata: {} } })), "las-10-mejores-series-de-2026");
  assert.equal(feedSlug(source({ project: { ...source().project, metadata: {} }, title: null })), "series-2026");
  assert.equal(slugifyTitle("Películas y series: ¿qué ver?"), "peliculas-y-series-que-ver");
});

test("the article carries the contract fields a client stores", async () => {
  const article = await buildFeedArticle(source());

  assert.equal(article.id, "version-1");
  assert.equal(article.title, "Las 10 mejores series de 2026");
  assert.equal(article.meta_description, "Las series que llegan en 2026, plataforma por plataforma.");
  assert.equal(article.hero_image_url, "https://auctorio.com/assets/covers/series-2026.webp");
  assert.equal(article.languageCode, "es");
  assert.equal(article.publishedAt, "2026-11-09T08:30:00.000Z");
  assert.equal(article.published_url, "https://guiaprogramaciontv.com/guias/mejores-series-2026");
  assert.match(article.content_html, /<h2>Streaming<\/h2>/);
  assert.match(article.content_markdown, /## Streaming/);
  assert.match(article.content_markdown, /\[otra guía\]\(https:\/\/guiaprogramaciontv\.com\/guias\/otra\)/);
  assert.match(article.content_markdown, /- Uno\n- Dos/);
  assert.equal(article.faqJsonLd?.["@type"], "FAQPage");
  assert.equal(article.jsonLd["@type"], "Article");
});

test("the body that reaches the client is sanitized first", async () => {
  const article = await buildFeedArticle(
    source({ bodyHtml: '<p>Texto</p><script>alert(1)</script><p onclick="x()">Fin</p>' }),
  );

  assert.ok(!article.content_html.includes("script"));
  assert.ok(!article.content_html.includes("onclick"));
  assert.match(article.content_html, /Fin/);
});

test("the Markdown alternative covers the tags the sanitizer allows", () => {
  const markdown = htmlToMarkdown(
    "<h3>Sección</h3><p><em>Hoy</em> y <strong>mañana</strong><br>siguiente</p><blockquote>Cita</blockquote><ol><li>Uno</li><li>Dos</li></ol><hr><figure><img src=\"https://x.test/a.png\" alt=\"Portada\"><figcaption>Pie</figcaption></figure>",
  );

  assert.match(markdown, /^### Sección/m);
  assert.match(markdown, /_Hoy_ y \*\*mañana\*\*/);
  assert.match(markdown, /> Cita/);
  assert.match(markdown, /1\. Uno\n2\. Dos/);
  assert.match(markdown, /^---$/m);
  assert.match(markdown, /!\[Portada\]\(https:\/\/x\.test\/a\.png\)/);
  assert.match(markdown, /_Pie_/);
  assert.equal(htmlToMarkdown(""), "");
});

test("tables become a GitHub table instead of one run-on line", () => {
  const markdown = htmlToMarkdown(
    "<table><thead><tr><th>Plataforma</th><th>Precio</th></tr></thead><tbody><tr><td>Netflix</td><td>12 €</td></tr></tbody></table>",
  );

  assert.match(markdown, /\| Plataforma \| Precio \|/);
  assert.match(markdown, /\| --- \| --- \|/);
  assert.match(markdown, /\| Netflix \| 12 € \|/);
});

test("structured data drops empty fields and lists every answer", () => {
  const jsonLd = buildArticleJsonLd({
    title: "Título",
    description: "",
    image: "https://auctorio.com/assets/a.webp",
    publishedAt: "2026-11-09T08:30:00.000Z",
    modifiedAt: "2026-11-10T09:00:00.000Z",
    languageCode: "es",
    url: "https://guiaprogramaciontv.com/guias/x",
    publisherName: "Guía TV",
    publisherUrl: "https://guiaprogramaciontv.com",
  });

  assert.equal(jsonLd["@context"], "https://schema.org");
  assert.equal(jsonLd["@type"], "Article");
  assert.equal("description" in jsonLd, false);
  assert.deepEqual(jsonLd.image, ["https://auctorio.com/assets/a.webp"]);
  assert.deepEqual(jsonLd.author, { "@type": "Organization", name: "Guía TV" });
  assert.deepEqual(jsonLd.publisher, {
    "@type": "Organization",
    name: "Guía TV",
    url: "https://guiaprogramaciontv.com",
  });

  assert.equal(buildFaqJsonLd([]), null);
  const faq = buildFaqJsonLd(feedFaqItems(source()));
  assert.deepEqual(faq?.mainEntity, [
    { "@type": "Question", name: "¿Dónde verla?", acceptedAnswer: { "@type": "Answer", text: "En Netflix." } },
  ]);
});

test("a project without FAQ in its metadata yields no FAQPage", () => {
  const article = buildFaqJsonLd(feedFaqItems(source({ project: { ...source().project, metadata: null } })));
  assert.equal(article, null);
});

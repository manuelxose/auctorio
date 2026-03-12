export const BRAND_NAME = 'Auctorio';
export const BRAND_SIGNATURE = 'Designed and engineered by Tecnoria';
export const BRAND_TAGLINE =
  'AI content operations for publishers, editorial teams and multi-site content programs.';
export const BRAND_DESCRIPTION =
  'Auctorio helps publishers run briefs, editorial reviews, content workflows, examples, assets and multi-site publishing from one operating layer built for search performance.';
export const BRAND_DOMAIN_OBJECTIVE = 'https://auctorio.com';
export const STUDIO_BASE_PATH = '/studio';

export const CHAT_WIDGET_API_BASE_URL = 'https://tecnoriasl.com/chat-api';
export const CHAT_WIDGET_BASE_URL = 'https://tecnoriasl.com/chat-widget/';
export const CHAT_WIDGET_BRAND_LABEL = 'Auctorio by Tecnoria';
export const CHAT_WIDGET_SITE_KEYS = {
  en: 'auctorio-public-site-key',
  es: 'auctorio-public-site-key',
} as const;
export const CHAT_WIDGET_ENTRY_CONTEXT = {
  en: 'marketing-en',
  es: 'marketing-es',
} as const;

export const TECNORIA_LINKS = {
  home: 'https://tecnoriasl.com/',
  chatbotService: 'https://tecnoriasl.com/servicios/desarrollo-chatbots-empresas',
  caseStudies: 'https://tecnoriasl.com/casos-de-exito',
  contact: 'https://tecnoriasl.com/contacto',
};

export const SUPPORTED_MARKETING_LOCALES = ['en', 'es'] as const;

export type MarketingLocale = (typeof SUPPORTED_MARKETING_LOCALES)[number];
export type MarketingPageKey =
  | 'home'
  | 'use_cases'
  | 'examples'
  | 'gallery'
  | 'faq'
  | 'contact'
  | 'built_by_tecnoria';
export type UseCaseId =
  | 'digital_publishers'
  | 'agencies_brands'
  | 'multi_site_editorial';
export type ExampleId =
  | 'breaking_news_explainer'
  | 'evergreen_refresh'
  | 'multi_site_distribution'
  | 'editorial_qa_handoff';

export type SeoEntry = {
  title: string;
  description: string;
  keywords: string[];
};

export type MarketingNavigationItem = {
  key: MarketingPageKey;
  label: string;
  path: string;
};

export type MarketingHeroMetric = {
  value: string;
  label: string;
};

export type MarketingShowcaseAsset = {
  slug: string;
  defaultPath: string;
  compactPath: string;
  width: number;
  height: number;
  title: Record<MarketingLocale, string>;
  caption: Record<MarketingLocale, string>;
  alt: Record<MarketingLocale, string>;
  tags: Record<MarketingLocale, string[]>;
  relatedUseCases: UseCaseId[];
};

export type MarketingExample = {
  id: ExampleId;
  assetSlug: string;
  title: Record<MarketingLocale, string>;
  summary: Record<MarketingLocale, string>;
  bullets: Record<MarketingLocale, string[]>;
  eyebrow: Record<MarketingLocale, string>;
};

export type UseCaseEntry = {
  id: UseCaseId;
  slug: Record<MarketingLocale, string>;
  audience: Record<MarketingLocale, string>;
  name: Record<MarketingLocale, string>;
  summary: Record<MarketingLocale, string>;
  heroTitle: Record<MarketingLocale, string>;
  heroIntro: Record<MarketingLocale, string>;
  pains: Record<MarketingLocale, string[]>;
  outcomes: Record<MarketingLocale, string[]>;
  deliverables: Record<MarketingLocale, string[]>;
  seo: Record<MarketingLocale, SeoEntry>;
  assetSlugs: string[];
};

type MarketingRouteEntry = {
  key: MarketingPageKey;
  pathByLocale: Record<MarketingLocale, string>;
  labelByLocale: Record<MarketingLocale, string>;
  priority: number;
  changefreq: 'weekly' | 'monthly';
};

type HomeContent = {
  kicker: string;
  title: string;
  lead: string;
  primaryCta: string;
  secondaryCta: string;
  metrics: MarketingHeroMetric[];
  highlights: string[];
  problemEyebrow: string;
  problemTitle: string;
  painPoints: string[];
  platformEyebrow: string;
  platformTitle: string;
  capabilities: Array<{ title: string; body: string }>;
  workflowEyebrow: string;
  workflowTitle: string;
  workflowSteps: Array<{ title: string; body: string }>;
  examplesEyebrow: string;
  examplesTitle: string;
  galleryEyebrow: string;
  galleryTitle: string;
  useCasesEyebrow: string;
  useCasesTitle: string;
  authorityEyebrow: string;
  authorityTitle: string;
  authorityPoints: string[];
  faqEyebrow: string;
  faqTitle: string;
  finalEyebrow: string;
  finalTitle: string;
  finalLead: string;
};

export const MARKETING_ROUTES: MarketingRouteEntry[] = [
  {
    key: 'home',
    pathByLocale: { en: '/', es: '/es' },
    labelByLocale: { en: 'Platform', es: 'Plataforma' },
    priority: 1,
    changefreq: 'weekly',
  },
  {
    key: 'use_cases',
    pathByLocale: { en: '/use-cases', es: '/es/casos-de-uso' },
    labelByLocale: { en: 'Use cases', es: 'Casos de uso' },
    priority: 0.9,
    changefreq: 'weekly',
  },
  {
    key: 'examples',
    pathByLocale: { en: '/examples', es: '/es/ejemplos' },
    labelByLocale: { en: 'Examples', es: 'Ejemplos' },
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    key: 'gallery',
    pathByLocale: { en: '/gallery', es: '/es/galeria' },
    labelByLocale: { en: 'Gallery', es: 'Galeria' },
    priority: 0.7,
    changefreq: 'weekly',
  },
  {
    key: 'faq',
    pathByLocale: { en: '/faq', es: '/es/faq' },
    labelByLocale: { en: 'FAQ', es: 'FAQ' },
    priority: 0.6,
    changefreq: 'monthly',
  },
  {
    key: 'contact',
    pathByLocale: { en: '/contact', es: '/es/contacto' },
    labelByLocale: { en: 'Contact', es: 'Contacto' },
    priority: 0.9,
    changefreq: 'monthly',
  },
  {
    key: 'built_by_tecnoria',
    pathByLocale: { en: '/built-by-tecnoria', es: '/es/creado-por-tecnoria' },
    labelByLocale: { en: 'Built by Tecnoria', es: 'Creado por Tecnoria' },
    priority: 0.5,
    changefreq: 'monthly',
  },
];

const HOME_CONTENT: Record<MarketingLocale, HomeContent> = {
  en: {
    kicker: 'The operating system for content teams',
    title: 'Publish faster. Rank higher. Control everything.',
    lead:
      'Auctorio unifies editorial workflow, human review, asset management and multi-site publishing into one AI-powered operating layer — so your team stops juggling tools and starts shipping search-ready content at scale.',
    primaryCta: 'Request a demo',
    secondaryCta: 'See how it works',
    metrics: [
      {
        value: '4x',
        label: 'Faster time-to-publish from brief to live article across all destinations.',
      },
      {
        value: '100%',
        label: 'Human-in-the-loop: every piece reviewed and approved before publication.',
      },
      {
        value: 'Multi-site',
        label: 'One workflow publishes to multiple destinations with destination-specific rules.',
      },
    ],
    highlights: [
      'Unified operating layer — briefs, drafts, reviews, assets and publishing in one system.',
      'Search-performance built in — every output is structured for organic visibility.',
      'Scales without chaos — add sites, formats and team members without rebuilding workflows.',
    ],
    problemEyebrow: 'The broken status quo',
    problemTitle: 'Your content operation is fragmented. That\'s costing you rankings and speed.',
    painPoints: [
      'Briefs live in docs, drafts in Google Drive, reviews in Slack, publishing in WordPress. Nothing connects.',
      'SEO checks happen too late — after the content is written, not during the workflow.',
      'Multi-site publishing means copy-paste workflows, duplicated effort and inconsistent quality.',
    ],
    platformEyebrow: 'The platform',
    platformTitle: 'One system for the entire content lifecycle — from intent to indexed.',
    capabilities: [
      {
        title: 'Editorial workflow engine',
        body: 'Design custom workflows with stages for draft, review, approval and publishing. Every handoff is tracked, every decision is logged.',
      },
      {
        title: 'Search-ready by default',
        body: 'Automated SEO scoring, keyword mapping and structured output ensure every article is optimized before it goes live.',
      },
      {
        title: 'Integrated asset pipeline',
        body: 'Hero images, editorial visuals and brand assets are generated, reviewed and attached to content — not scattered across Figma and Drive.',
      },
      {
        title: 'Multi-site orchestration',
        body: 'Publish one piece to five sites with destination-specific rules, brand guidelines and performance tracking.',
      },
    ],
    workflowEyebrow: 'How it works',
    workflowTitle: 'From editorial intent to search-ready publication in four clear stages.',
    workflowSteps: [
      {
        title: '1. Define intent',
        body: 'Every project starts with a structured brief: target keyword, audience, format, publishing destinations and editorial guidelines.',
      },
      {
        title: '2. Create & iterate',
        body: 'AI-assisted drafting meets human editing. Content, visuals and metadata are created together inside the same workspace.',
      },
      {
        title: '3. Review & approve',
        body: 'Editors, SEO leads and stakeholders review in parallel. Feedback, changes and approval are tracked in one timeline.',
      },
      {
        title: '4. Publish & measure',
        body: 'One click sends content to all destinations. Publishing status, failures and indexation signals are tracked per project.',
      },
    ],
    examplesEyebrow: 'Real workflows',
    examplesTitle: 'See how teams use Auctorio to ship better content, faster.',
    galleryEyebrow: 'Visual identity',
    galleryTitle: 'Generated editorial visuals designed for premium digital publishing.',
    useCasesEyebrow: 'Who it\'s for',
    useCasesTitle: 'Built for publishers first. Proven for agencies, brands and multi-site operations.',
    authorityEyebrow: 'Built with intent',
    authorityTitle: 'Auctorio is engineered by Tecnoria — a team that ships AI products, not demos.',
    authorityPoints: [
      'Designed and engineered by Tecnoria as a productized solution for editorial workflow fragmentation.',
      'Trusted by teams that prioritize organic ranking, editorial governance and publishing velocity.',
      'Backed by real infrastructure: SSR, multi-tenant architecture and enterprise-grade security.',
    ],
    faqEyebrow: 'Common questions',
    faqTitle: 'Answers to the questions editorial teams ask before they evaluate.',
    finalEyebrow: 'Ready to transform your content operations?',
    finalTitle: 'Stop managing chaos. Start running a content engine.',
    finalLead:
      'Request a personalized demo and see how Auctorio can consolidate your editorial workflow, improve organic performance and accelerate multi-site publishing.',
  },
  es: {
    kicker: 'El sistema operativo para equipos de contenido',
    title: 'Publica más rápido. Posiciona mejor. Contrólalo todo.',
    lead:
      'Auctorio unifica el workflow editorial, la revisión humana, la gestión de assets y la publicación multi-site en una sola capa operativa con IA — para que tu equipo deje de hacer malabarismos entre herramientas y publique contenido optimizado a escala.',
    primaryCta: 'Solicitar demo',
    secondaryCta: 'Ver cómo funciona',
    metrics: [
      {
        value: '4x',
        label: 'Más rápido de brief a artículo publicado en todos los destinos.',
      },
      {
        value: '100%',
        label: 'Revisión humana: cada pieza revisada y aprobada antes de publicar.',
      },
      {
        value: 'Multi-site',
        label: 'Un workflow publica en múltiples destinos con reglas específicas por site.',
      },
    ],
    highlights: [
      'Capa operativa unificada — briefs, borradores, revisiones, assets y publicación en un solo sistema.',
      'SEO integrado de serie — cada salida estructurada para visibilidad orgánica.',
      'Escala sin caos — añade sites, formatos y personas sin rehacer workflows.',
    ],
    problemEyebrow: 'El problema real',
    problemTitle: 'Tu operativa de contenido está fragmentada. Eso te cuesta rankings y velocidad.',
    painPoints: [
      'Los briefs en docs, los borradores en Drive, las revisiones en Slack, la publicación en WordPress. Nada conecta.',
      'Los checks de SEO llegan cuando el contenido ya está escrito — demasiado tarde para ser útiles.',
      'Publicar en múltiples sites significa duplicar trabajo, copiar-pegar y perder consistencia.',
    ],
    platformEyebrow: 'La plataforma',
    platformTitle: 'Un solo sistema para todo el ciclo de vida del contenido — de la intención a la indexación.',
    capabilities: [
      {
        title: 'Motor de workflow editorial',
        body: 'Diseña workflows personalizados con fases de borrador, revisión, aprobación y publicación. Cada handoff queda registrado, cada decisión trazada.',
      },
      {
        title: 'Optimizado para SEO de serie',
        body: 'Scoring SEO automático, mapeo de keywords y salida estructurada garantizan que cada artículo esté optimizado antes de publicar.',
      },
      {
        title: 'Pipeline de assets integrado',
        body: 'Imágenes hero, visuales editoriales y assets de marca se generan, revisan y vinculan al contenido — no dispersos entre Figma y Drive.',
      },
      {
        title: 'Orquestación multi-site',
        body: 'Publica una pieza en cinco sites con reglas específicas por destino, directrices de marca y tracking de rendimiento.',
      },
    ],
    workflowEyebrow: 'Cómo funciona',
    workflowTitle: 'De la intención editorial a la publicación optimizada en cuatro fases claras.',
    workflowSteps: [
      {
        title: '1. Define la intención',
        body: 'Cada proyecto arranca con un brief estructurado: keyword objetivo, audiencia, formato, destinos y directrices editoriales.',
      },
      {
        title: '2. Crea e itera',
        body: 'Drafting asistido por IA más edición humana. Contenido, visuales y metadatos se crean juntos en el mismo espacio.',
      },
      {
        title: '3. Revisa y aprueba',
        body: 'Editores, responsables SEO y stakeholders revisan en paralelo. Feedback, cambios y aprobación en un solo timeline.',
      },
      {
        title: '4. Publica y mide',
        body: 'Un clic envía el contenido a todos los destinos. Estado de publicación, errores e indexación se rastrean por proyecto.',
      },
    ],
    examplesEyebrow: 'Workflows reales',
    examplesTitle: 'Así usan Auctorio los equipos para publicar mejor contenido, más rápido.',
    galleryEyebrow: 'Identidad visual',
    galleryTitle: 'Visuales editoriales generados para publicación digital premium.',
    useCasesEyebrow: 'Para quién',
    useCasesTitle: 'Diseñado para publishers. Probado en agencias, marcas y operaciones multi-site.',
    authorityEyebrow: 'Construido con intención',
    authorityTitle: 'Auctorio está diseñado por Tecnoria — un equipo que entrega productos de IA, no demos.',
    authorityPoints: [
      'Diseñado e implementado por Tecnoria como solución productizada a la fragmentación del workflow editorial.',
      'Elegido por equipos que priorizan el ranking orgánico, el gobierno editorial y la velocidad de publicación.',
      'Respaldado por infraestructura real: SSR, arquitectura multi-tenant y seguridad enterprise.',
    ],
    faqEyebrow: 'Preguntas frecuentes',
    faqTitle: 'Respuestas a lo que los equipos editoriales preguntan antes de evaluar.',
    finalEyebrow: '¿Listo para transformar tu operativa de contenido?',
    finalTitle: 'Deja de gestionar caos. Empieza a operar un motor de contenido.',
    finalLead:
      'Solicita una demo personalizada y descubre cómo Auctorio puede consolidar tu workflow editorial, mejorar el rendimiento orgánico y acelerar la publicación multi-site.',
  },
};

export const MARKETING_ASSETS: MarketingShowcaseAsset[] = [
  {
    slug: 'publisher-command-center',
    defaultPath: '/marketing/publisher-command-center-1600.webp',
    compactPath: '/marketing/publisher-command-center-960.webp',
    width: 1600,
    height: 900,
    title: {
      en: 'Publisher command center',
      es: 'Centro operativo editorial',
    },
    caption: {
      en: 'A visual for publisher-grade content workflows, approvals and search-ready publishing.',
      es: 'Una visual para workflows editoriales, aprobaciones y publicacion preparada para buscadores.',
    },
    alt: {
      en: 'Editorial operations command center visual for digital publishers and content workflow platform',
      es: 'Visual de centro operativo editorial para medios digitales y plataforma de workflow de contenido',
    },
    tags: {
      en: ['publishers', 'editorial workflow', 'content operations'],
      es: ['publishers', 'workflow editorial', 'operaciones de contenido'],
    },
    relatedUseCases: ['digital_publishers', 'multi_site_editorial'],
  },
  {
    slug: 'search-led-newsroom',
    defaultPath: '/marketing/search-led-newsroom-1600.webp',
    compactPath: '/marketing/search-led-newsroom-960.webp',
    width: 1600,
    height: 900,
    title: {
      en: 'Search-led newsroom',
      es: 'Redaccion orientada a SEO',
    },
    caption: {
      en: 'Shows how editorial planning, search visibility and review can live inside one workflow.',
      es: 'Muestra como la planificacion editorial, la visibilidad organica y la revision pueden vivir en un mismo workflow.',
    },
    alt: {
      en: 'Search led newsroom visual for AI content operations and editorial workflow software',
      es: 'Visual de redaccion orientada a SEO para operaciones de contenido y software de workflow editorial',
    },
    tags: {
      en: ['search performance', 'newsroom', 'editorial QA'],
      es: ['seo', 'redaccion', 'qa editorial'],
    },
    relatedUseCases: ['digital_publishers'],
  },
  {
    slug: 'multi-site-publishing-grid',
    defaultPath: '/marketing/multi-site-publishing-grid-1600.webp',
    compactPath: '/marketing/multi-site-publishing-grid-960.webp',
    width: 1600,
    height: 900,
    title: {
      en: 'Multi-site publishing grid',
      es: 'Malla de publicacion multi-site',
    },
    caption: {
      en: 'Represents one workflow distributing content across several destinations and sections.',
      es: 'Representa un mismo workflow distribuyendo contenido entre varios destinos y secciones.',
    },
    alt: {
      en: 'Multi site publishing visual for content workflow platform and editorial automation software',
      es: 'Visual de publicacion multi-site para plataforma de workflow de contenido y automatizacion editorial',
    },
    tags: {
      en: ['multi-site', 'publishing', 'governance'],
      es: ['multi-site', 'publicacion', 'gobierno editorial'],
    },
    relatedUseCases: ['multi_site_editorial', 'agencies_brands'],
  },
  {
    slug: 'editorial-qa-review',
    defaultPath: '/marketing/editorial-qa-review-1600.webp',
    compactPath: '/marketing/editorial-qa-review-960.webp',
    width: 1600,
    height: 900,
    title: {
      en: 'Editorial QA review',
      es: 'Revision editorial y QA',
    },
    caption: {
      en: 'Built for stories about review loops, approval stages and publishing confidence.',
      es: 'Pensada para ilustrar revisiones, aprobaciones y confianza antes de publicar.',
    },
    alt: {
      en: 'Editorial QA review visual for publisher workflow, approval process and content governance',
      es: 'Visual de revision editorial y QA para workflow publisher, aprobacion y gobierno de contenido',
    },
    tags: {
      en: ['review', 'approval', 'quality control'],
      es: ['revision', 'aprobacion', 'control de calidad'],
    },
    relatedUseCases: ['digital_publishers', 'agencies_brands'],
  },
  {
    slug: 'brand-content-program',
    defaultPath: '/marketing/brand-content-program-1600.webp',
    compactPath: '/marketing/brand-content-program-960.webp',
    width: 1600,
    height: 900,
    title: {
      en: 'Brand content program',
      es: 'Programa de contenido de marca',
    },
    caption: {
      en: 'Useful for agencies and brands running structured content production with governance.',
      es: 'Util para agencias y marcas que necesitan produccion de contenido estructurada y gobernada.',
    },
    alt: {
      en: 'Brand content program visual for agency content operations and multi format workflows',
      es: 'Visual de programa de contenido de marca para operaciones de contenido en agencia y workflows multi formato',
    },
    tags: {
      en: ['agencies', 'brands', 'content program'],
      es: ['agencias', 'marcas', 'programa de contenido'],
    },
    relatedUseCases: ['agencies_brands'],
  },
  {
    slug: 'content-operations-showcase',
    defaultPath: '/marketing/content-operations-showcase-1600.webp',
    compactPath: '/marketing/content-operations-showcase-960.webp',
    width: 1600,
    height: 900,
    title: {
      en: 'Content operations showcase',
      es: 'Showcase de operaciones de contenido',
    },
    caption: {
      en: 'A broad brand visual for examples, gallery pages and high-level positioning.',
      es: 'Una visual de marca para paginas de ejemplos, galeria y posicionamiento general.',
    },
    alt: {
      en: 'Content operations platform visual for AI content workflow and editorial automation product',
      es: 'Visual de plataforma de operaciones de contenido para workflow con IA y producto de automatizacion editorial',
    },
    tags: {
      en: ['content ops', 'product showcase', 'editorial platform'],
      es: ['content ops', 'showcase de producto', 'plataforma editorial'],
    },
    relatedUseCases: ['digital_publishers', 'agencies_brands', 'multi_site_editorial'],
  },
];

export const MARKETING_EXAMPLES: MarketingExample[] = [
  {
    id: 'breaking_news_explainer',
    assetSlug: 'search-led-newsroom',
    eyebrow: {
      en: 'Article workflow example',
      es: 'Ejemplo de workflow de articulo',
    },
    title: {
      en: 'Breaking-news explainer with review and search handoff',
      es: 'Explicador de actualidad con revision y handoff SEO',
    },
    summary: {
      en: 'Shows how one story can move from editorial brief to search-ready publishing without leaving the workflow.',
      es: 'Muestra como una historia puede pasar de brief editorial a publicacion optimizada sin salir del workflow.',
    },
    bullets: {
      en: [
        'One brief, one approval chain and one publishing state.',
        'Review notes, examples and assets remain attached to the story.',
        'Search intent and editorial quality are handled before publication.',
      ],
      es: [
        'Un brief, una cadena de aprobacion y un mismo estado de publicacion.',
        'Comentarios, ejemplos y assets permanecen unidos a la historia.',
        'La intencion de busqueda y la calidad editorial se trabajan antes de publicar.',
      ],
    },
  },
  {
    id: 'evergreen_refresh',
    assetSlug: 'editorial-qa-review',
    eyebrow: {
      en: 'Refresh workflow example',
      es: 'Ejemplo de refresh editorial',
    },
    title: {
      en: 'Evergreen refresh with editorial QA and structured revision',
      es: 'Refresh evergreen con QA editorial y revision estructurada',
    },
    summary: {
      en: 'Useful for publishers updating valuable evergreen pages without losing traceability or brand consistency.',
      es: 'Util para publishers que actualizan piezas evergreen sin perder trazabilidad ni consistencia de marca.',
    },
    bullets: {
      en: [
        'Revision feedback is stored inside the same project timeline.',
        'Quality checks make updates easier to approve and republish.',
        'Assets stay linked to the latest approved version.',
      ],
      es: [
        'El feedback de revision queda dentro del mismo timeline del proyecto.',
        'Los checks de calidad facilitan aprobar y volver a publicar.',
        'Los assets permanecen ligados a la ultima version aprobada.',
      ],
    },
  },
  {
    id: 'multi_site_distribution',
    assetSlug: 'multi-site-publishing-grid',
    eyebrow: {
      en: 'Distribution example',
      es: 'Ejemplo de distribucion',
    },
    title: {
      en: 'One content operation, several sites and destination rules',
      es: 'Una operativa, varias webs y reglas por destino',
    },
    summary: {
      en: 'Built around publisher groups and content networks that need one operating model across several sites.',
      es: 'Pensado para grupos editoriales y redes de contenido que necesitan un mismo modelo operativo para varias webs.',
    },
    bullets: {
      en: [
        'Publishing paths can differ by destination without rebuilding the content operation.',
        'Site rules, examples and assets remain attached to the same project.',
        'Teams keep visibility over draft sync, approvals and final publishing state.',
      ],
      es: [
        'Las rutas de publicacion pueden cambiar por destino sin rehacer la operativa de contenido.',
        'Reglas por site, ejemplos y assets siguen unidos al mismo proyecto.',
        'El equipo mantiene visibilidad sobre draft sync, aprobaciones y estado final.',
      ],
    },
  },
  {
    id: 'editorial_qa_handoff',
    assetSlug: 'publisher-command-center',
    eyebrow: {
      en: 'Editorial handoff example',
      es: 'Ejemplo de handoff editorial',
    },
    title: {
      en: 'Editorial QA handoff between writers, reviewers and publishing owners',
      es: 'Handoff de QA editorial entre redaccion, revision y responsables de publicacion',
    },
    summary: {
      en: 'Useful when content quality, governance and final publishing ownership cannot live in separate tools.',
      es: 'Util cuando la calidad, el gobierno editorial y la publicacion final no pueden vivir en herramientas separadas.',
    },
    bullets: {
      en: [
        'Review-first flows reduce weak approvals and late publishing errors.',
        'The same project stores examples, assets and publication records.',
        'Teams can reason about quality and publishing history from one place.',
      ],
      es: [
        'Los flujos review-first reducen aprobaciones debiles y errores tardios.',
        'El mismo proyecto guarda ejemplos, assets y registros de publicacion.',
        'El equipo puede razonar sobre calidad e historial de publicacion desde un solo lugar.',
      ],
    },
  },
];

export const USE_CASES: UseCaseEntry[] = [
  {
    id: 'digital_publishers',
    slug: {
      en: 'digital-publishers',
      es: 'publicadores-digitales',
    },
    audience: {
      en: 'Digital publishers, editorial desks and media operations',
      es: 'Publicadores digitales, redacciones y operaciones editoriales',
    },
    name: {
      en: 'Digital publishers',
      es: 'Publicadores digitales',
    },
    summary: {
      en: 'For editorial teams that need ranking, governance and publishing speed without turning content operations into manual chaos.',
      es: 'Para equipos editoriales que necesitan ranking, gobierno y velocidad de publicacion sin convertir la operativa en caos manual.',
    },
    heroTitle: {
      en: 'AI content operations that keep editorial control inside the newsroom.',
      es: 'Operaciones de contenido con IA que mantienen el control editorial dentro de la redaccion.',
    },
    heroIntro: {
      en: 'Auctorio gives publishers one structure for briefs, review notes, examples, visuals, approvals and publishing targets so content operations can scale without losing quality.',
      es: 'Auctorio da a los publishers una estructura unica para briefs, revisiones, ejemplos, visuales, aprobaciones y destinos de publicacion para escalar sin perder calidad.',
    },
    pains: {
      en: [
        'Editorial planning, search review and publishing live in disconnected tools.',
        'Featured visuals and quality checks arrive too late in the process.',
        'Teams struggle to preserve traceability when several people touch the same story.',
      ],
      es: [
        'La planificacion editorial, la revision SEO y la publicacion viven en herramientas desconectadas.',
        'Los visuales destacados y los checks de calidad llegan demasiado tarde.',
        'La trazabilidad se rompe cuando varias personas tocan la misma pieza.',
      ],
    },
    outcomes: {
      en: [
        'One publisher workflow for brief, review, approval and publishing.',
        'Search-ready output with stronger editorial visibility.',
        'Clearer traceability for content, assets and publishing history.',
      ],
      es: [
        'Un workflow publisher para brief, revision, aprobacion y publicacion.',
        'Salida mejor preparada para SEO y visibilidad organica.',
        'Trazabilidad mas clara para contenido, assets e historial de publicacion.',
      ],
    },
    deliverables: {
      en: [
        'Editorial project timelines',
        'Review-first approvals',
        'Search-ready publishing operations',
      ],
      es: [
        'Timelines editoriales por proyecto',
        'Aprobaciones review-first',
        'Operaciones de publicacion preparadas para SEO',
      ],
    },
    seo: {
      en: {
        title: 'AI content operations platform for digital publishers',
        description:
          'Auctorio helps digital publishers run editorial workflow, approvals, examples, assets and multi-site publishing from one AI content operations platform.',
        keywords: [
          'ai content operations platform for publishers',
          'content workflow platform for publishers',
          'editorial automation platform',
        ],
      },
      es: {
        title: 'Plataforma de operaciones de contenido con IA para publicadores digitales',
        description:
          'Auctorio ayuda a medios y publicadores digitales a coordinar workflow editorial, aprobaciones, ejemplos, assets y publicacion multi-site desde una sola plataforma.',
        keywords: [
          'plataforma de operaciones de contenido con ia',
          'workflow editorial para medios',
          'automatizacion editorial para publicadores',
        ],
      },
    },
    assetSlugs: ['publisher-command-center', 'search-led-newsroom', 'editorial-qa-review'],
  },
  {
    id: 'agencies_brands',
    slug: {
      en: 'agencies-brands',
      es: 'agencias-y-marcas',
    },
    audience: {
      en: 'Agency teams, content strategists and brand publishers',
      es: 'Equipos de agencia, estrategas de contenido y marcas editoriales',
    },
    name: {
      en: 'Agencies and brands',
      es: 'Agencias y marcas',
    },
    summary: {
      en: 'For teams that need structured content production, governance and reusable publishing workflows across several programs.',
      es: 'Para equipos que necesitan produccion estructurada, gobierno editorial y workflows reutilizables para varios programas.',
    },
    heroTitle: {
      en: 'A better operating layer for agency and brand content programs.',
      es: 'Una capa operativa mas solida para programas de contenido de agencia y marca.',
    },
    heroIntro: {
      en: 'Auctorio helps agencies and brands move from fragmented content production to one review-first workflow with examples, assets and publishing control.',
      es: 'Auctorio ayuda a agencias y marcas a pasar de una produccion fragmentada a un workflow review-first con ejemplos, assets y control de publicacion.',
    },
    pains: {
      en: [
        'Campaign content is recreated across briefs, docs and publishing tools.',
        'Approval paths become slower when content, examples and visuals are scattered.',
        'Teams struggle to create consistency across multiple brands or clients.',
      ],
      es: [
        'El contenido de campaña se reconstruye entre briefs, documentos y herramientas de publicacion.',
        'Las aprobaciones se vuelven lentas cuando contenido, ejemplos y visuales estan dispersos.',
        'Cuesta mantener consistencia entre varias marcas o clientes.',
      ],
    },
    outcomes: {
      en: [
        'More structured delivery for recurring content programs.',
        'Better alignment between strategy, review and publishing.',
        'Reusable workflows across clients, brands and content formats.',
      ],
      es: [
        'Entrega mas estructurada para programas de contenido recurrentes.',
        'Mejor alineacion entre estrategia, revision y publicacion.',
        'Workflows reutilizables entre clientes, marcas y formatos.',
      ],
    },
    deliverables: {
      en: [
        'Examples for web and campaign content',
        'Brand-safe review workflows',
        'Assets linked to approved publishing paths',
      ],
      es: [
        'Ejemplos para contenido web y de campaña',
        'Workflows de revision seguros para marca',
        'Assets ligados a rutas de publicacion aprobadas',
      ],
    },
    seo: {
      en: {
        title: 'AI content workflow platform for agencies and brands',
        description:
          'Auctorio gives agencies and brands a structured AI content workflow platform for review, examples, assets and multi-site publishing control.',
        keywords: [
          'ai content workflow platform for agencies',
          'content operations for brands',
          'editorial workflow software for content teams',
        ],
      },
      es: {
        title: 'Plataforma de workflow de contenido con IA para agencias y marcas',
        description:
          'Auctorio ofrece a agencias y marcas un workflow de contenido con revision, ejemplos, assets y control multi-site en una sola plataforma.',
        keywords: [
          'workflow de contenido con ia para agencias',
          'operaciones de contenido para marcas',
          'software editorial para equipos de contenido',
        ],
      },
    },
    assetSlugs: ['brand-content-program', 'editorial-qa-review', 'content-operations-showcase'],
  },
  {
    id: 'multi_site_editorial',
    slug: {
      en: 'multi-site-editorial',
      es: 'multi-site-editorial',
    },
    audience: {
      en: 'Editorial networks, platform owners and multi-site teams',
      es: 'Redes editoriales, owners de plataforma y equipos multi-site',
    },
    name: {
      en: 'Multi-site editorial operations',
      es: 'Operaciones editoriales multi-site',
    },
    summary: {
      en: 'For groups that need one publishing workflow across multiple sites, sections, destinations and editorial rules.',
      es: 'Para grupos que necesitan un mismo workflow de publicacion entre varias webs, secciones, destinos y reglas editoriales.',
    },
    heroTitle: {
      en: 'One operating model for content teams running several sites.',
      es: 'Un modelo operativo para equipos de contenido que gestionan varias webs.',
    },
    heroIntro: {
      en: 'Auctorio turns multi-site publishing from a coordination problem into a structured workflow with traceability, destination logic and reusable editorial operations.',
      es: 'Auctorio convierte la publicacion multi-site de un problema de coordinacion en un workflow estructurado con trazabilidad, logica por destino y operaciones reutilizables.',
    },
    pains: {
      en: [
        'Every destination has different rules, but the team has no shared operating layer.',
        'Publishing failures and draft sync issues are hard to trace across several sites.',
        'The same content operation gets rebuilt for each property.',
      ],
      es: [
        'Cada destino tiene reglas distintas, pero el equipo no tiene una capa operativa comun.',
        'Los fallos de publicacion y sincronizacion son dificiles de rastrear entre varias webs.',
        'La misma operativa se vuelve a montar para cada propiedad.',
      ],
    },
    outcomes: {
      en: [
        'Shared visibility across projects, sites and publishing outcomes.',
        'Cleaner traceability for approvals, assets and final publishing state.',
        'A reusable multi-site workflow instead of duplicated operations.',
      ],
      es: [
        'Visibilidad compartida entre proyectos, sites y resultados de publicacion.',
        'Trazabilidad mas limpia para aprobaciones, assets y estado final.',
        'Un workflow multi-site reutilizable en vez de operaciones duplicadas.',
      ],
    },
    deliverables: {
      en: [
        'Destination-aware publishing flows',
        'Site-level rules inside one operating system',
        'Examples, assets and publishing history in one timeline',
      ],
      es: [
        'Flujos de publicacion por destino',
        'Reglas por site dentro del mismo sistema operativo',
        'Ejemplos, assets e historial de publicacion en un solo timeline',
      ],
    },
    seo: {
      en: {
        title: 'Multi-site content workflow platform for editorial operations',
        description:
          'Auctorio helps multi-site teams manage editorial workflow, approvals, examples, assets and publishing traceability across several sites.',
        keywords: [
          'multi site content workflow platform',
          'editorial operations software',
          'multi site publishing workflow',
        ],
      },
      es: {
        title: 'Plataforma multi-site para workflow editorial y publicacion',
        description:
          'Auctorio ayuda a equipos multi-site a coordinar workflow editorial, aprobaciones, ejemplos, assets y trazabilidad de publicacion entre varias webs.',
        keywords: [
          'plataforma multi site para contenido',
          'software de operaciones editoriales',
          'workflow de publicacion multi-site',
        ],
      },
    },
    assetSlugs: ['multi-site-publishing-grid', 'publisher-command-center', 'content-operations-showcase'],
  },
];

export const FAQ_ENTRIES = {
  en: [
    {
      question: 'What exactly does Auctorio do?',
      answer:
        'Auctorio is an AI content operations platform that connects every stage of editorial work — from brief to publication — in one system. It replaces the fragmented stack of docs, spreadsheets, CMS plugins and communication tools that most teams rely on today.',
    },
    {
      question: 'Is Auctorio only for a single website?',
      answer:
        'No. Multi-site publishing is a core capability. One workflow can distribute content to multiple sites with destination-specific rules, brand guidelines and independent publishing controls.',
    },
    {
      question: 'How does human review work inside the platform?',
      answer:
        'Review-first operation is central to Auctorio. Every piece goes through a structured approval workflow where editors, SEO leads and stakeholders can review, annotate and approve before publication. Nothing publishes without human sign-off.',
    },
    {
      question: 'Does the public website expose the private infrastructure?',
      answer:
        'No. The public site explains the operating model, highlights use cases and provides marketing assets. All private infrastructure, AI providers and internal configurations remain fully protected behind the authenticated Studio.',
    },
    {
      question: 'Who builds and maintains Auctorio?',
      answer:
        'Auctorio is designed, engineered and maintained by Tecnoria. The product has its own brand identity so it can scale independently, but Tecnoria handles all engineering, delivery and commercial support.',
    },
    {
      question: 'How does Auctorio improve SEO performance?',
      answer:
        'Every content output is scored for search readiness: keyword mapping, heading structure, meta generation and content depth are evaluated before publishing. The workflow ensures SEO is part of creation, not an afterthought.',
    },
    {
      question: 'Can we integrate Auctorio with our existing CMS?',
      answer:
        'Auctorio operates as an editorial layer that sits above your CMS. It manages the workflow, and publishes to your WordPress, headless CMS or custom destinations via configured publishing paths.',
    },
    {
      question: 'What is the typical onboarding timeline?',
      answer:
        'Most teams are operational within two weeks. Onboarding includes workflow configuration, publishing path setup, team training and initial content migration support.',
    },
  ],
  es: [
    {
      question: '¿Qué hace exactamente Auctorio?',
      answer:
        'Auctorio es una plataforma de operaciones de contenido con IA que conecta cada fase del trabajo editorial — del brief a la publicación — en un solo sistema. Reemplaza la pila fragmentada de docs, hojas de cálculo, plugins de CMS y herramientas de comunicación que usan la mayoría de equipos.',
    },
    {
      question: '¿Auctorio sirve solo para una web?',
      answer:
        'No. La publicación multi-site es una capacidad central. Un mismo workflow puede distribuir contenido a múltiples sites con reglas específicas por destino, directrices de marca y controles independientes.',
    },
    {
      question: '¿Cómo funciona la revisión humana dentro de la plataforma?',
      answer:
        'La operativa review-first es central en Auctorio. Cada pieza pasa por un workflow de aprobación estructurado donde editores, responsables SEO y stakeholders pueden revisar, anotar y aprobar antes de publicar. Nada se publica sin aprobación humana.',
    },
    {
      question: '¿La web pública expone la infraestructura privada?',
      answer:
        'No. La web pública explica el modelo operativo, muestra casos de uso y aporta assets de marketing. Toda la infraestructura privada, proveedores de IA y configuraciones internas están protegidos detrás del Studio autenticado.',
    },
    {
      question: '¿Quién construye y mantiene Auctorio?',
      answer:
        'Auctorio está diseñado, desarrollado y mantenido por Tecnoria. El producto tiene identidad de marca propia para escalar de forma independiente, pero Tecnoria gestiona toda la ingeniería, entrega y soporte comercial.',
    },
    {
      question: '¿Cómo mejora Auctorio el rendimiento SEO?',
      answer:
        'Cada salida de contenido se evalúa en cuanto a preparación para buscadores: mapeo de keywords, estructura de headings, generación de metas y profundidad de contenido se analizan antes de publicar. El workflow asegura que el SEO sea parte de la creación, no una revisión tardía.',
    },
    {
      question: '¿Podemos integrar Auctorio con nuestro CMS actual?',
      answer:
        'Auctorio funciona como capa editorial que opera por encima de tu CMS. Gestiona el workflow y publica en tu WordPress, CMS headless o destinos personalizados mediante rutas de publicación configuradas.',
    },
    {
      question: '¿Cuál es el tiempo típico de onboarding?',
      answer:
        'La mayoría de equipos están operativos en dos semanas. El onboarding incluye configuración de workflows, setup de rutas de publicación, formación del equipo y soporte inicial de migración.',
    },
  ],
} as const;

export const HOME_EXAMPLE_IDS: ExampleId[] = [
  'breaking_news_explainer',
  'multi_site_distribution',
  'editorial_qa_handoff',
];

export const HOME_GALLERY_ASSET_SLUGS = [
  'publisher-command-center',
  'multi-site-publishing-grid',
  'content-operations-showcase',
];

// ── Contact page content ──────────────────────────────────────
export interface ContactContent {
  kicker: string;
  title: string;
  lead: string;
  formLabels: {
    name: string;
    email: string;
    company: string;
    message: string;
    submit: string;
  };
  infoTitle: string;
  infoItems: { label: string; value: string }[];
}

const CONTACT_CONTENT: Record<MarketingLocale, ContactContent> = {
  en: {
    kicker: 'Get in touch',
    title: 'Let\u2019s talk about your content operations',
    lead: 'Request a personalised demo or tell us about your publishing challenges. Our team typically responds within one business day.',
    formLabels: {
      name: 'Full name',
      email: 'Work email',
      company: 'Company / publication',
      message: 'How can we help?',
      submit: 'Send message',
    },
    infoTitle: 'Other ways to reach us',
    infoItems: [
      { label: 'Email', value: 'hello@auctorio.com' },
      { label: 'Response time', value: 'Within 24 hours' },
      { label: 'Demo', value: 'Free, personalised, 30 min' },
    ],
  },
  es: {
    kicker: 'Contacto',
    title: 'Hablemos sobre tus operaciones de contenido',
    lead: 'Solicita una demo personalizada o cuéntanos tus retos editoriales. Nuestro equipo responde en menos de un día laborable.',
    formLabels: {
      name: 'Nombre completo',
      email: 'Email profesional',
      company: 'Empresa / publicación',
      message: '\u00bfEn qué podemos ayudarte?',
      submit: 'Enviar mensaje',
    },
    infoTitle: 'Otras formas de contactarnos',
    infoItems: [
      { label: 'Email', value: 'hello@auctorio.com' },
      { label: 'Respuesta', value: 'En menos de 24 horas' },
      { label: 'Demo', value: 'Gratuita, personalizada, 30 min' },
    ],
  },
};

export function getMarketingContactContent(locale: MarketingLocale): ContactContent {
  return CONTACT_CONTENT[locale];
}

export function getMarketingHomeContent(locale: MarketingLocale): HomeContent {
  return HOME_CONTENT[locale];
}

export function getMarketingPath(locale: MarketingLocale, pageKey: MarketingPageKey): string {
  return MARKETING_ROUTES.find((route) => route.key === pageKey)?.pathByLocale[locale] || '/';
}

export function getMarketingLocaleFromPath(pathname: string): MarketingLocale {
  return pathname === '/es' || pathname.startsWith('/es/') ? 'es' : 'en';
}

export function getUseCasePath(locale: MarketingLocale, useCaseId: UseCaseId): string {
  const entry = USE_CASES.find((item) => item.id === useCaseId);
  if (!entry) {
    return getMarketingPath(locale, 'use_cases');
  }
  const base = getMarketingPath(locale, 'use_cases');
  return `${base}/${entry.slug[locale]}`;
}

export function getLocalizedUseCases(locale: MarketingLocale) {
  return USE_CASES.map((useCase) => ({
    ...useCase,
    localizedAudience: useCase.audience[locale],
    localizedName: useCase.name[locale],
    localizedSummary: useCase.summary[locale],
    localizedHeroTitle: useCase.heroTitle[locale],
    localizedHeroIntro: useCase.heroIntro[locale],
    localizedPains: useCase.pains[locale],
    localizedOutcomes: useCase.outcomes[locale],
    localizedDeliverables: useCase.deliverables[locale],
    localizedSeo: useCase.seo[locale],
    path: getUseCasePath(locale, useCase.id),
  }));
}

export function getUseCaseBySlug(locale: MarketingLocale, slug: string | null): UseCaseEntry | null {
  if (!slug) {
    return null;
  }
  return USE_CASES.find((entry) => entry.slug[locale] === slug) ?? null;
}

export function getAssetBySlug(slug: string): MarketingShowcaseAsset | null {
  return MARKETING_ASSETS.find((asset) => asset.slug === slug) ?? null;
}

export function getLocalizedAssets(locale: MarketingLocale, slugs?: string[]) {
  const assets = slugs?.length
    ? MARKETING_ASSETS.filter((asset) => slugs.includes(asset.slug))
    : MARKETING_ASSETS;
  return assets.map((asset) => ({
    ...asset,
    localizedTitle: asset.title[locale],
    localizedCaption: asset.caption[locale],
    localizedAlt: asset.alt[locale],
    localizedTags: asset.tags[locale],
  }));
}

export function getLocalizedExamples(locale: MarketingLocale) {
  return MARKETING_EXAMPLES.map((example) => ({
    ...example,
    localizedEyebrow: example.eyebrow[locale],
    localizedTitle: example.title[locale],
    localizedSummary: example.summary[locale],
    localizedBullets: example.bullets[locale],
    asset: getAssetBySlug(example.assetSlug),
  }));
}

export function getHomeExamples(locale: MarketingLocale) {
  return getLocalizedExamples(locale).filter((example) => HOME_EXAMPLE_IDS.includes(example.id));
}

export function getHomeAssets(locale: MarketingLocale) {
  return getLocalizedAssets(locale, HOME_GALLERY_ASSET_SLUGS);
}

export function getLocalizedFaqEntries(locale: MarketingLocale) {
  return [...FAQ_ENTRIES[locale]];
}

export function getMarketingNavigation(locale: MarketingLocale): MarketingNavigationItem[] {
  return MARKETING_ROUTES.filter((route) => route.key !== 'built_by_tecnoria' || locale === 'en')
    .map((route) => ({
      key: route.key,
      label: route.labelByLocale[locale],
      path: route.pathByLocale[locale],
    }))
    .filter((route) => route.key !== 'built_by_tecnoria' || locale === 'en')
    .concat(
      locale === 'en'
        ? [
            {
              key: 'built_by_tecnoria',
              label: 'Built by Tecnoria',
              path: getMarketingPath(locale, 'built_by_tecnoria'),
            },
          ]
        : [
            {
              key: 'built_by_tecnoria',
              label: 'Creado por Tecnoria',
              path: getMarketingPath(locale, 'built_by_tecnoria'),
            },
          ],
    )
    .filter(
      (entry, index, source) =>
        source.findIndex((candidate) => candidate.key === entry.key) === index,
    );
}

export function getLocalizedPageSeo(
  locale: MarketingLocale,
  pageKey: MarketingPageKey,
): SeoEntry {
  const routes = {
    home: {
      en: {
        title: 'Auctorio — AI content operations platform for publishers and editorial teams',
        description:
          'Auctorio unifies editorial workflow, human review, asset management and multi-site publishing into one AI-powered platform. Publish faster, rank higher, control everything.',
        keywords: [
          'ai content operations platform',
          'content workflow platform for publishers',
          'editorial automation platform',
          'multi-site publishing workflow',
        ],
      },
      es: {
        title: 'Plataforma de operaciones de contenido con IA para publishers y equipos editoriales',
        description:
          'Auctorio es una plataforma de operaciones de contenido con IA para gestionar workflow editorial, ejemplos, aprobaciones, assets y publicacion multi-site desde un sistema preparado para SEO.',
        keywords: [
          'plataforma de operaciones de contenido con ia',
          'workflow editorial para publishers',
          'plataforma de automatizacion editorial',
        ],
      },
    },
    use_cases: {
      en: {
        title: 'Use cases for AI content operations, editorial workflow and multi-site publishing',
        description:
          'Explore how Auctorio fits digital publishers, agency content programs and multi-site editorial operations.',
        keywords: [
          'ai content workflow use cases',
          'publisher workflow platform',
          'multi site editorial operations',
        ],
      },
      es: {
        title: 'Casos de uso para operaciones de contenido, workflow editorial y publicacion multi-site',
        description:
          'Explora como Auctorio encaja en publishers, programas de contenido para agencias y operaciones editoriales multi-site.',
        keywords: [
          'casos de uso de operaciones de contenido',
          'workflow editorial para publishers',
          'operaciones multi site',
        ],
      },
    },
    examples: {
      en: {
        title: 'Content workflow examples for publishers and editorial teams',
        description:
          'Review real examples of article workflow, editorial QA, multi-site distribution and review-first publishing with Auctorio.',
        keywords: [
          'content workflow examples',
          'publisher workflow examples',
          'editorial qa examples',
        ],
      },
      es: {
        title: 'Ejemplos de workflow de contenido para publishers y equipos editoriales',
        description:
          'Revisa ejemplos reales de workflow de articulo, QA editorial, distribucion multi-site y publicacion review-first con Auctorio.',
        keywords: [
          'ejemplos de workflow de contenido',
          'ejemplos de workflow editorial',
          'ejemplos de qa editorial',
        ],
      },
    },
    gallery: {
      en: {
        title: 'Editorial visuals gallery for AI content operations',
        description:
          'Browse generated editorial visuals used across Auctorio use cases, examples and product positioning pages.',
        keywords: [
          'editorial visuals gallery',
          'ai content operations visuals',
          'publisher content images',
        ],
      },
      es: {
        title: 'Galeria de visuales editoriales para operaciones de contenido con IA',
        description:
          'Explora visuales editoriales generados que apoyan los casos de uso, ejemplos y el posicionamiento publico de Auctorio.',
        keywords: [
          'galeria de visuales editoriales',
          'imagenes para operaciones de contenido',
          'galeria de contenido publisher',
        ],
      },
    },
    faq: {
      en: {
        title: 'FAQ — Common questions about Auctorio content operations platform',
        description:
          'Get answers about Auctorio: editorial workflow automation, multi-site publishing, human review, SEO integration, CMS compatibility and onboarding.',
        keywords: ['auctorio faq', 'content operations faq', 'editorial workflow questions'],
      },
      es: {
        title: 'FAQ — Preguntas frecuentes sobre la plataforma Auctorio',
        description:
          'Respuestas sobre Auctorio: automatización editorial, publicación multi-site, revisión humana, integración SEO, compatibilidad con CMS y onboarding.',
        keywords: ['faq auctorio', 'preguntas operaciones de contenido', 'faq workflow editorial'],
      },
    },
    contact: {
      en: {
        title: 'Contact Auctorio — Request a demo or talk to our team',
        description:
          'Get in touch with the Auctorio team to request a demo, discuss your editorial workflow needs or explore how multi-site content operations can work for your team.',
        keywords: ['contact auctorio', 'auctorio demo', 'editorial workflow consultation'],
      },
      es: {
        title: 'Contacto Auctorio — Solicita una demo o habla con nuestro equipo',
        description:
          'Contacta con el equipo de Auctorio para solicitar una demo, hablar de tus necesidades de workflow editorial o explorar cómo las operaciones multi-site pueden funcionar para tu equipo.',
        keywords: ['contacto auctorio', 'demo auctorio', 'consulta workflow editorial'],
      },
    },
    built_by_tecnoria: {
      en: {
        title: 'Built by Tecnoria',
        description:
          'Understand why Auctorio is positioned as a product brand and why Tecnoria remains visible as the team that designed and engineered it.',
        keywords: [
          'built by tecnoria',
          'auctorio by tecnoria',
          'tecnoria editorial product',
        ],
      },
      es: {
        title: 'Creado por Tecnoria',
        description:
          'Entiende por que Auctorio se presenta como marca de producto y por que Tecnoria sigue visible como el equipo que la diseña e implementa.',
        keywords: [
          'creado por tecnoria',
          'auctorio por tecnoria',
          'producto editorial tecnoria',
        ],
      },
    },
  } satisfies Record<MarketingPageKey, Record<MarketingLocale, SeoEntry>>;

  return routes[pageKey][locale];
}

export function getUseCaseSeo(locale: MarketingLocale, useCase: UseCaseEntry): SeoEntry {
  return useCase.seo[locale];
}

export function getAlternatePagePaths(pageKey: MarketingPageKey) {
  return {
    en: getMarketingPath('en', pageKey),
    es: getMarketingPath('es', pageKey),
  } satisfies Record<MarketingLocale, string>;
}

export function getUseCaseAlternatePaths(useCaseId: UseCaseId) {
  return {
    en: getUseCasePath('en', useCaseId),
    es: getUseCasePath('es', useCaseId),
  } satisfies Record<MarketingLocale, string>;
}

export function translateMarketingPath(pathname: string, targetLocale: MarketingLocale): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const locale = getMarketingLocaleFromPath(clean);

  const matchedRoute = MARKETING_ROUTES.find(
    (route) => route.pathByLocale.en === clean || route.pathByLocale.es === clean,
  );
  if (matchedRoute) {
    return matchedRoute.pathByLocale[targetLocale];
  }

  const normalizedPath = locale === 'es' ? clean.replace(/^\/es/, '') || '/' : clean;
  const useCase = getUseCaseBySlug(locale, normalizedPath.split('/').filter(Boolean).pop() || null);
  if (useCase && clean.startsWith(getMarketingPath(locale, 'use_cases'))) {
    return getUseCasePath(targetLocale, useCase.id);
  }

  if (clean.startsWith(STUDIO_BASE_PATH)) {
    return `${STUDIO_BASE_PATH}/login`;
  }

  return getMarketingPath(targetLocale, 'home');
}

export function getFooterResources(locale: MarketingLocale) {
  return {
    productTitle: locale === 'en' ? 'Product' : 'Producto',
    resourcesTitle: locale === 'en' ? 'Resources' : 'Recursos',
    authorshipTitle:
      locale === 'en'
        ? 'Designed and engineered by Tecnoria'
        : 'Diseñado e implementado por Tecnoria',
    legalCopy:
      locale === 'en'
        ? 'Auctorio is a product brand. Tecnoria is the design, engineering and delivery partner behind it.'
        : 'Auctorio es una marca de producto. Tecnoria es el partner de diseño, ingenieria y entrega que hay detras.',
  };
}

export function getPublicRouteEntries() {
  const entries = MARKETING_ROUTES.flatMap((route) =>
    SUPPORTED_MARKETING_LOCALES.map((locale) => ({
      locale,
      path: route.pathByLocale[locale],
      priority: route.priority,
      changefreq: route.changefreq,
      imageSlugs:
        route.key === 'home'
          ? HOME_GALLERY_ASSET_SLUGS
          : route.key === 'gallery'
            ? MARKETING_ASSETS.map((asset) => asset.slug)
            : route.key === 'examples'
              ? MARKETING_EXAMPLES.map((example) => example.assetSlug)
              : [],
    })),
  );

  const useCaseEntries = USE_CASES.flatMap((useCase) =>
    SUPPORTED_MARKETING_LOCALES.map((locale) => ({
      locale,
      path: getUseCasePath(locale, useCase.id),
      priority: 0.8,
      changefreq: 'weekly' as const,
      imageSlugs: useCase.assetSlugs,
    })),
  );

  return [...entries, ...useCaseEntries];
}

export function getImageSitemapEntries() {
  return getPublicRouteEntries()
    .map((entry) => ({
      ...entry,
      images: getLocalizedAssets(entry.locale, entry.imageSlugs).map((asset) => ({
        path: asset.defaultPath,
        title: asset.title[entry.locale],
        caption: asset.caption[entry.locale],
      })),
    }))
    .filter((entry) => entry.images.length > 0);
}

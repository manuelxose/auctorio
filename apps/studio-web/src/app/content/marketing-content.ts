import { BLOG_PATH, getArticle, getArticlePath, getArticles, getArticleTranslation } from './articles';
export const BRAND_NAME = 'Auctorio';
export const BRAND_SIGNATURE = 'Made by Tecnoria';
export const BRAND_TAGLINE = 'Editorial workflow software with AI for publishers, agencies and multi-site teams.';
export const BRAND_DESCRIPTION =
  'Auctorio is editorial workflow software: plan from search demand, draft with AI, review with editors and publish to every site and channel from one workspace.';
export const BRAND_DOMAIN_OBJECTIVE = 'https://auctorio.com';
export const STUDIO_BASE_PATH = '/studio';

export function getStudioLoginPath(): string {
  return `/login?entry=public`;
}

export const CHAT_WIDGET_API_BASE_URL = 'https://tecnoriasl.com/chat-api';
export const CHAT_WIDGET_BASE_URL = 'https://tecnoriasl.com/chat-widget/';
export const CHAT_WIDGET_BRAND_LABEL = 'Auctorio';
export const CHAT_WIDGET_SITE_KEYS = {
  en: 'auctorio-public-site-key',
  es: 'auctorio-public-site-key',
} as const;
export const CHAT_WIDGET_ENTRY_CONTEXT = {
  en: 'marketing-en',
  es: 'marketing-es',
} as const;

/** The company behind the product: credited once in the footer and in structured data. */
export const TECNORIA_LINKS = {
  home: 'https://tecnoriasl.com/',
  contact: 'https://tecnoriasl.com/contacto',
};

export const SUPPORTED_MARKETING_LOCALES = ['en', 'es'] as const;

export type MarketingLocale = (typeof SUPPORTED_MARKETING_LOCALES)[number];
export type MarketingPageKey =
  | 'home'
  | 'use_cases'
  | 'examples'
  | 'faq'
  | 'contact';
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
  key: MarketingPageKey | 'blog';
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
  useCasesEyebrow: string;
  useCasesTitle: string;
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
    changefreq: 'monthly',
  },
  {
    key: 'examples',
    pathByLocale: { en: '/examples', es: '/es/ejemplos' },
    labelByLocale: { en: 'Workflows', es: 'Flujos de trabajo' },
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    key: 'faq',
    pathByLocale: { en: '/faq', es: '/es/faq' },
    labelByLocale: { en: 'FAQ', es: 'Preguntas' },
    priority: 0.6,
    changefreq: 'monthly',
  },
  {
    key: 'contact',
    pathByLocale: { en: '/waitlist', es: '/es/lista-de-espera' },
    labelByLocale: { en: 'Waitlist', es: 'Lista de espera' },
    priority: 0.7,
    changefreq: 'monthly',
  },
];

const HOME_CONTENT: Record<MarketingLocale, HomeContent> = {
  en: {
    kicker: 'Editorial workflow software',
    title: 'The AI editorial workflow for publishers and newsrooms',
    lead:
      'Plan stories from search demand, draft with AI, review with your editors and publish to every site and social channel from one workspace. Nothing goes live without a person signing it off.',
    primaryCta: 'Join the waitlist',
    secondaryCta: 'See the workflows',
    metrics: [
      { value: 'One workspace', label: 'Planning, drafting, review and publishing in the same place.' },
      { value: 'Human sign-off', label: 'Every piece is approved by an editor before it is published.' },
      { value: 'Every channel', label: 'Websites, X, Instagram and partner feeds from one approval.' },
    ],
    highlights: [
      'Editorial plan ranked by search demand, coverage gaps and timeliness.',
      'Pre-publication checks for titles, meta descriptions, schema, images and sources.',
      'Publishing to WordPress, Ghost, webhooks and a pull feed for partner sites.',
    ],
    problemEyebrow: 'Why teams switch',
    problemTitle: 'Most newsrooms run on five tools that do not talk to each other.',
    painPoints: [
      'Briefs sit in documents, drafts in the CMS and approvals in chat threads, so nobody sees the whole story.',
      'Search checks happen after the article is written, when fixing the title or structure means rework.',
      'Publishing the same piece to several sites and channels is copy-paste work with a high error rate.',
    ],
    platformEyebrow: 'What Auctorio does',
    platformTitle: 'Everything between the idea and the published article.',
    capabilities: [
      {
        title: 'Editorial workflow',
        body: 'Draft, review, approval and publishing stages with an owner at each step and a full history of changes and decisions.',
      },
      {
        title: 'Search-ready by default',
        body: 'Topic research, title and meta suggestions, structured data and readiness checks run while the piece is being written.',
      },
      {
        title: 'Assets with the story',
        body: 'Lead images, alt text and social cards are produced, reviewed and stored with the article they belong to.',
      },
      {
        title: 'Multi-site publishing',
        body: 'One approval publishes to each site and channel with its own format, section, schedule and rules.',
      },
    ],
    workflowEyebrow: 'How it works',
    workflowTitle: 'From topic to published article in four steps.',
    workflowSteps: [
      {
        title: 'Plan',
        body: 'Auctorio ranks topics by search demand, coverage gaps and timeliness, and turns the chosen one into a structured brief.',
      },
      {
        title: 'Draft',
        body: 'Writers draft with AI assistance in the same workspace, with sources, images and metadata attached to the piece.',
      },
      {
        title: 'Review',
        body: 'Editors see the pre-publication checks, request changes or approve. Every comment and version is kept.',
      },
      {
        title: 'Publish',
        body: 'The approved piece goes to each destination on schedule. Failures are retried and reported, not lost.',
      },
    ],
    examplesEyebrow: 'Workflows',
    examplesTitle: 'How editorial teams use Auctorio day to day.',
    useCasesEyebrow: 'Who it is for',
    useCasesTitle: 'Built for publishers, agencies and teams running several sites.',
    faqEyebrow: 'Questions',
    faqTitle: 'What editorial teams ask us most.',
    finalEyebrow: 'Early access',
    finalTitle: 'Be among the first newsrooms on Auctorio.',
    finalLead:
      'Auctorio is opening in waves. Join the waitlist and we will invite your team as soon as a place opens.',
  },
  es: {
    kicker: 'Software de flujo editorial',
    title: 'El flujo editorial con IA para medios y redacciones',
    lead:
      'Planifica temas según la demanda de búsqueda, redacta con IA, revisa con tus editores y publica en todas tus webs y redes desde un único espacio. Nada se publica sin que una persona lo apruebe.',
    primaryCta: 'Únete a la lista de espera',
    secondaryCta: 'Ver los flujos',
    metrics: [
      { value: 'Un solo espacio', label: 'Planificación, redacción, revisión y publicación en el mismo sitio.' },
      { value: 'Aprobación humana', label: 'Cada pieza la aprueba un editor antes de publicarse.' },
      { value: 'Todos los canales', label: 'Webs, X, Instagram y feeds de socios con una sola aprobación.' },
    ],
    highlights: [
      'Plan editorial ordenado por demanda de búsqueda, huecos de cobertura y actualidad.',
      'Comprobaciones previas de título, meta descripción, datos estructurados, imágenes y fuentes.',
      'Publicación en WordPress, Ghost, webhooks y un feed para webs asociadas.',
    ],
    problemEyebrow: 'Por qué cambian los equipos',
    problemTitle: 'La mayoría de redacciones trabaja con cinco herramientas que no se hablan entre sí.',
    painPoints: [
      'Los encargos están en documentos, los borradores en el CMS y las aprobaciones en el chat: nadie ve la pieza completa.',
      'El SEO se revisa cuando el artículo ya está escrito, y corregir el título o la estructura obliga a rehacerlo.',
      'Publicar la misma pieza en varias webs y redes es copiar y pegar, con muchos errores.',
    ],
    platformEyebrow: 'Qué hace Auctorio',
    platformTitle: 'Todo lo que pasa entre la idea y el artículo publicado.',
    capabilities: [
      {
        title: 'Flujo editorial',
        body: 'Fases de borrador, revisión, aprobación y publicación con un responsable en cada paso y el historial completo de cambios.',
      },
      {
        title: 'Preparado para buscadores',
        body: 'Investigación de temas, propuestas de título y meta, datos estructurados y comprobaciones mientras se escribe.',
      },
      {
        title: 'Recursos junto a la pieza',
        body: 'La imagen principal, su texto alternativo y las tarjetas sociales se generan, revisan y guardan con su artículo.',
      },
      {
        title: 'Publicación en varias webs',
        body: 'Una aprobación publica en cada web y canal con su formato, sección, horario y reglas.',
      },
    ],
    workflowEyebrow: 'Cómo funciona',
    workflowTitle: 'Del tema al artículo publicado en cuatro pasos.',
    workflowSteps: [
      {
        title: 'Planifica',
        body: 'Auctorio ordena los temas por demanda de búsqueda, huecos de cobertura y actualidad, y convierte el elegido en un encargo estructurado.',
      },
      {
        title: 'Redacta',
        body: 'La redacción escribe con ayuda de IA en el mismo espacio, con fuentes, imágenes y metadatos unidos a la pieza.',
      },
      {
        title: 'Revisa',
        body: 'El editor ve las comprobaciones previas, pide cambios o aprueba. Se guardan todos los comentarios y versiones.',
      },
      {
        title: 'Publica',
        body: 'La pieza aprobada sale a cada destino a su hora. Si algo falla, se reintenta y se avisa.',
      },
    ],
    examplesEyebrow: 'Flujos de trabajo',
    examplesTitle: 'Cómo usan Auctorio los equipos editoriales cada día.',
    useCasesEyebrow: 'Para quién es',
    useCasesTitle: 'Pensado para medios, agencias y equipos con varias webs.',
    faqEyebrow: 'Preguntas',
    faqTitle: 'Lo que más nos preguntan los equipos editoriales.',
    finalEyebrow: 'Acceso anticipado',
    finalTitle: 'Sé de las primeras redacciones en Auctorio.',
    finalLead:
      'Auctorio abre por fases. Únete a la lista de espera y te invitaremos en cuanto haya plaza para tu equipo.',
  },
};

export const MARKETING_ASSETS: MarketingShowcaseAsset[] = [
  {
    slug: 'content-operations-showcase',
    defaultPath: '/marketing/content-operations-showcase-1600.webp',
    compactPath: '/marketing/content-operations-showcase-960.webp',
    width: 1600,
    height: 900,
    title: { en: 'Editorial dashboard', es: 'Panel editorial' },
    caption: {
      en: 'The Auctorio dashboard: pieces waiting for review, today’s schedule and search readiness across four sites.',
      es: 'El panel de Auctorio: piezas pendientes de revisión, la agenda del día y el estado SEO de cuatro webs.',
    },
    alt: {
      en: 'Auctorio editorial dashboard showing articles in review, scheduled posts and search readiness',
      es: 'Panel editorial de Auctorio con artículos en revisión, publicaciones programadas y estado SEO',
    },
    tags: { en: ['dashboard', 'editorial workflow'], es: ['panel', 'flujo editorial'] },
    relatedUseCases: ['digital_publishers', 'agencies_brands', 'multi_site_editorial'],
  },
  {
    slug: 'publisher-command-center',
    defaultPath: '/marketing/publisher-command-center-1600.webp',
    compactPath: '/marketing/publisher-command-center-960.webp',
    width: 1600,
    height: 900,
    title: { en: 'Content list', es: 'Listado de contenido' },
    caption: {
      en: 'Every piece across every site, with its status, channels, owner and last update.',
      es: 'Todas las piezas de todas las webs, con su estado, canales, responsable y última actualización.',
    },
    alt: {
      en: 'Auctorio content list with article status, publishing channels and owners across several sites',
      es: 'Listado de contenido de Auctorio con estado de cada artículo, canales y responsables en varias webs',
    },
    tags: { en: ['content', 'status'], es: ['contenido', 'estados'] },
    relatedUseCases: ['digital_publishers', 'multi_site_editorial'],
  },
  {
    slug: 'editorial-qa-review',
    defaultPath: '/marketing/editorial-qa-review-1600.webp',
    compactPath: '/marketing/editorial-qa-review-960.webp',
    width: 1600,
    height: 900,
    title: { en: 'Review and pre-publication checks', es: 'Revisión y comprobaciones previas' },
    caption: {
      en: 'An editor reviewing a draft next to its checks: SEO title, meta description, schema, alt text and sources.',
      es: 'Un editor revisa un borrador junto a sus comprobaciones: título SEO, meta descripción, schema, texto alternativo y fuentes.',
    },
    alt: {
      en: 'Article review screen in Auctorio with SEO, schema, image and source checks before approval',
      es: 'Pantalla de revisión de un artículo en Auctorio con comprobaciones de SEO, schema, imágenes y fuentes',
    },
    tags: { en: ['review', 'approval', 'SEO checks'], es: ['revisión', 'aprobación', 'comprobaciones SEO'] },
    relatedUseCases: ['digital_publishers', 'agencies_brands'],
  },
  {
    slug: 'multi-site-publishing-grid',
    defaultPath: '/marketing/multi-site-publishing-grid-1600.webp',
    compactPath: '/marketing/multi-site-publishing-grid-960.webp',
    width: 1600,
    height: 900,
    title: { en: 'Multi-site publishing', es: 'Publicación en varias webs' },
    caption: {
      en: 'One approved article sent to two websites, X, Instagram and a partner feed, each with its own rule and schedule.',
      es: 'Un artículo aprobado enviado a dos webs, X, Instagram y un feed de socios, cada uno con su regla y horario.',
    },
    alt: {
      en: 'Auctorio publications view with one article published to several websites and social channels',
      es: 'Vista de publicaciones de Auctorio con un artículo publicado en varias webs y redes sociales',
    },
    tags: { en: ['publishing', 'multi-site'], es: ['publicación', 'varias webs'] },
    relatedUseCases: ['multi_site_editorial', 'agencies_brands'],
  },
  {
    slug: 'search-led-newsroom',
    defaultPath: '/marketing/search-led-newsroom-1600.webp',
    compactPath: '/marketing/search-led-newsroom-960.webp',
    width: 1600,
    height: 900,
    title: { en: 'Editorial plan', es: 'Plan editorial' },
    caption: {
      en: 'Topics ranked by search demand, coverage gaps and timeliness, with the keywords behind each one.',
      es: 'Temas ordenados por demanda de búsqueda, huecos de cobertura y actualidad, con sus palabras clave.',
    },
    alt: {
      en: 'Auctorio editorial plan ranking story topics by search demand with target keywords',
      es: 'Plan editorial de Auctorio que ordena temas por demanda de búsqueda con sus palabras clave',
    },
    tags: { en: ['editorial plan', 'search demand'], es: ['plan editorial', 'demanda de búsqueda'] },
    relatedUseCases: ['digital_publishers'],
  },
  {
    slug: 'brand-content-program',
    defaultPath: '/marketing/brand-content-program-1600.webp',
    compactPath: '/marketing/brand-content-program-960.webp',
    width: 1600,
    height: 900,
    title: { en: 'Publishing calendar', es: 'Calendario de publicación' },
    caption: {
      en: 'A week of scheduled pieces across web, X and Instagram for every site in the workspace.',
      es: 'Una semana de piezas programadas en web, X e Instagram para todas las webs del espacio.',
    },
    alt: {
      en: 'Auctorio weekly publishing calendar with articles and social posts scheduled by channel',
      es: 'Calendario semanal de Auctorio con artículos y publicaciones sociales programadas por canal',
    },
    tags: { en: ['calendar', 'scheduling'], es: ['calendario', 'programación'] },
    relatedUseCases: ['agencies_brands', 'multi_site_editorial'],
  },
];

export const MARKETING_EXAMPLES: MarketingExample[] = [
  {
    id: 'breaking_news_explainer',
    assetSlug: 'search-led-newsroom',
    eyebrow: { en: 'Planning', es: 'Planificación' },
    title: {
      en: 'From search demand to a commissioned explainer',
      es: 'De la demanda de búsqueda a un explicativo encargado',
    },
    summary: {
      en: 'A budget announcement drives searches. The plan flags the gap, the desk commissions an explainer and an FAQ, and both ship the same morning.',
      es: 'Un anuncio de presupuestos dispara las búsquedas. El plan detecta el hueco, la sección encarga un explicativo y unas preguntas frecuentes, y ambos salen esa misma mañana.',
    },
    bullets: {
      en: [
        'Topics ranked by demand, coverage gaps and timeliness.',
        'The brief carries the target query, angle and destination.',
        'Related pieces are suggested for internal links.',
      ],
      es: [
        'Temas ordenados por demanda, huecos de cobertura y actualidad.',
        'El encargo incluye la búsqueda objetivo, el enfoque y el destino.',
        'Se sugieren piezas relacionadas para el enlazado interno.',
      ],
    },
  },
  {
    id: 'editorial_qa_handoff',
    assetSlug: 'editorial-qa-review',
    eyebrow: { en: 'Review', es: 'Revisión' },
    title: {
      en: 'Editor review with checks that block bad publishes',
      es: 'Revisión del editor con comprobaciones que frenan errores',
    },
    summary: {
      en: 'The section editor reviews the draft next to its checks. A missing alt text or an over-long title is fixed before approval, not after the piece is live.',
      es: 'El editor de sección revisa el borrador junto a sus comprobaciones. Un texto alternativo que falta o un título demasiado largo se corrige antes de aprobar, no con la pieza ya publicada.',
    },
    bullets: {
      en: [
        'Title, meta description, schema, images and sources checked.',
        'Comments and versions stay with the piece.',
        'Approval is recorded with the editor’s name.',
      ],
      es: [
        'Se comprueban título, meta descripción, schema, imágenes y fuentes.',
        'Los comentarios y versiones quedan con la pieza.',
        'La aprobación queda registrada con el nombre del editor.',
      ],
    },
  },
  {
    id: 'multi_site_distribution',
    assetSlug: 'multi-site-publishing-grid',
    eyebrow: { en: 'Distribution', es: 'Distribución' },
    title: {
      en: 'One approval, five destinations',
      es: 'Una aprobación, cinco destinos',
    },
    summary: {
      en: 'The approved explainer goes to the main site in full, to a sister site as a shorter cut, to X as a thread, to Instagram as a carousel and to a partner feed.',
      es: 'El explicativo aprobado sale completo en la web principal, en versión corta en una web hermana, como hilo en X, como carrusel en Instagram y en el feed de un socio.',
    },
    bullets: {
      en: [
        'Each destination has its own format, section and schedule.',
        'Failed publishes are retried and reported.',
        'The publication history stays on the piece.',
      ],
      es: [
        'Cada destino tiene su formato, sección y horario.',
        'Las publicaciones fallidas se reintentan y se avisan.',
        'El historial de publicación queda en la pieza.',
      ],
    },
  },
  {
    id: 'evergreen_refresh',
    assetSlug: 'brand-content-program',
    eyebrow: { en: 'Scheduling', es: 'Programación' },
    title: {
      en: 'A week of content planned across every channel',
      es: 'Una semana de contenido planificada en todos los canales',
    },
    summary: {
      en: 'Agencies and brand teams see every scheduled article and social post for all their sites in one calendar, and move pieces without breaking the plan.',
      es: 'Agencias y equipos de marca ven en un calendario todos los artículos y publicaciones sociales programados de sus webs, y mueven piezas sin romper el plan.',
    },
    bullets: {
      en: [
        'Week and month views across sites and channels.',
        'Evergreen pieces flagged for a refresh when they age.',
        'Drag a piece to reschedule every destination.',
      ],
      es: [
        'Vistas semanal y mensual de todas las webs y canales.',
        'Las piezas atemporales se marcan para actualizar cuando envejecen.',
        'Arrastra una pieza para reprogramar todos sus destinos.',
      ],
    },
  },
];

export const USE_CASES: UseCaseEntry[] = [
  {
    id: 'digital_publishers',
    slug: { en: 'digital-publishers', es: 'publicadores-digitales' },
    audience: {
      en: 'Digital publishers, newsrooms and editorial desks',
      es: 'Medios digitales, redacciones y secciones',
    },
    name: { en: 'Digital publishers', es: 'Medios digitales' },
    summary: {
      en: 'For newsrooms that need search traffic and publishing speed without losing editorial control.',
      es: 'Para redacciones que necesitan tráfico de búsqueda y velocidad sin perder el control editorial.',
    },
    heroTitle: {
      en: 'Editorial workflow software for digital newsrooms',
      es: 'Software de flujo editorial para redacciones digitales',
    },
    heroIntro: {
      en: 'Auctorio gives your desk one place to plan from search demand, draft, review and publish, so the newsroom moves faster and every piece still passes an editor.',
      es: 'Auctorio da a tu redacción un solo lugar para planificar según la demanda de búsqueda, redactar, revisar y publicar: se trabaja más rápido y cada pieza sigue pasando por un editor.',
    },
    pains: {
      en: [
        'Story planning, SEO review and publishing live in separate tools.',
        'Images and quality checks arrive at the last minute.',
        'Nobody can tell who changed what when several people touch a story.',
      ],
      es: [
        'La planificación, la revisión SEO y la publicación están en herramientas distintas.',
        'Las imágenes y las comprobaciones llegan en el último minuto.',
        'Nadie sabe quién cambió qué cuando varias personas tocan una pieza.',
      ],
    },
    outcomes: {
      en: [
        'One workflow from topic to published article.',
        'Search checks during writing instead of after publishing.',
        'A full history of versions, comments and approvals per piece.',
      ],
      es: [
        'Un único flujo del tema al artículo publicado.',
        'Comprobaciones SEO mientras se escribe, no después de publicar.',
        'Historial completo de versiones, comentarios y aprobaciones por pieza.',
      ],
    },
    deliverables: {
      en: ['Editorial plan from search demand', 'Review with pre-publication checks', 'Scheduled publishing to web and social'],
      es: ['Plan editorial según la demanda de búsqueda', 'Revisión con comprobaciones previas', 'Publicación programada en web y redes'],
    },
    seo: {
      en: {
        title: 'Editorial workflow software for newsrooms',
        description:
          'Plan from search demand, draft with AI, review with editors and publish to every site and channel. Editorial workflow software for digital publishers.',
        keywords: ['editorial workflow software', 'newsroom workflow', 'ai content operations for publishers'],
      },
      es: {
        title: 'Software de flujo editorial para redacciones',
        description:
          'Planifica según la demanda de búsqueda, redacta con IA, revisa con tus editores y publica en todas tus webs y redes. Software editorial para medios digitales.',
        keywords: ['software editorial para medios', 'flujo de trabajo redacción', 'plataforma de contenido con ia'],
      },
    },
    assetSlugs: ['search-led-newsroom', 'editorial-qa-review', 'publisher-command-center'],
  },
  {
    id: 'agencies_brands',
    slug: { en: 'agencies-brands', es: 'agencias-y-marcas' },
    audience: {
      en: 'Content agencies, strategists and brand publishing teams',
      es: 'Agencias de contenido, estrategas y equipos de marca',
    },
    name: { en: 'Agencies and brands', es: 'Agencias y marcas' },
    summary: {
      en: 'For teams producing content for several clients or brands who need consistent review and scheduling.',
      es: 'Para equipos que producen contenido para varios clientes o marcas y necesitan revisión y programación coherentes.',
    },
    heroTitle: {
      en: 'A content workflow for agencies and brand teams',
      es: 'Un flujo de contenido para agencias y equipos de marca',
    },
    heroIntro: {
      en: 'Run every client or brand from one workspace: shared briefs, client approval, brand rules per site and one calendar for everything that is scheduled.',
      es: 'Gestiona cada cliente o marca desde un espacio: encargos compartidos, aprobación del cliente, reglas de marca por web y un calendario para todo lo programado.',
    },
    pains: {
      en: [
        'Campaign content is rebuilt across briefs, documents and publishing tools.',
        'Client approvals stall when drafts and images live in different places.',
        'Keeping tone and rules consistent across brands depends on memory.',
      ],
      es: [
        'El contenido de campaña se rehace entre encargos, documentos y herramientas de publicación.',
        'Las aprobaciones del cliente se atascan cuando borradores e imágenes están en sitios distintos.',
        'Mantener el tono y las reglas de cada marca depende de la memoria del equipo.',
      ],
    },
    outcomes: {
      en: [
        'Repeatable workflows for recurring content programs.',
        'Client review in the same place as the draft.',
        'One calendar across clients, sites and channels.',
      ],
      es: [
        'Flujos repetibles para programas de contenido recurrentes.',
        'Revisión del cliente en el mismo lugar que el borrador.',
        'Un calendario para todos los clientes, webs y canales.',
      ],
    },
    deliverables: {
      en: ['Brand rules per site', 'Client approval steps', 'Shared publishing calendar'],
      es: ['Reglas de marca por web', 'Pasos de aprobación del cliente', 'Calendario de publicación compartido'],
    },
    seo: {
      en: {
        title: 'Content workflow software for agencies',
        description:
          'Briefs, client approval, brand rules and one publishing calendar for every client. Content workflow software for agencies and brand teams.',
        keywords: ['content workflow for agencies', 'content operations for brands', 'client approval workflow'],
      },
      es: {
        title: 'Software de flujo de contenido para agencias',
        description:
          'Encargos, aprobación del cliente, reglas de marca y un calendario de publicación para cada cliente. Software de contenido para agencias y marcas.',
        keywords: ['flujo de contenido para agencias', 'contenido para marcas', 'aprobación de contenido cliente'],
      },
    },
    assetSlugs: ['brand-content-program', 'editorial-qa-review', 'content-operations-showcase'],
  },
  {
    id: 'multi_site_editorial',
    slug: { en: 'multi-site-editorial', es: 'multi-site-editorial' },
    audience: {
      en: 'Media groups, editorial networks and multi-site teams',
      es: 'Grupos de medios, redes editoriales y equipos con varias webs',
    },
    name: { en: 'Multi-site operations', es: 'Varias webs' },
    summary: {
      en: 'For groups publishing the same work across several sites, each with its own sections and rules.',
      es: 'Para grupos que publican el mismo trabajo en varias webs, cada una con sus secciones y reglas.',
    },
    heroTitle: {
      en: 'Publish to several sites from one editorial workflow',
      es: 'Publica en varias webs desde un solo flujo editorial',
    },
    heroIntro: {
      en: 'Auctorio keeps one copy of each piece and publishes it to every site and channel with the right format, section and schedule, with a clear record of what went where.',
      es: 'Auctorio guarda una única versión de cada pieza y la publica en cada web y canal con su formato, sección y horario, con un registro claro de qué salió y dónde.',
    },
    pains: {
      en: [
        'Each site has its own rules but no shared place to manage them.',
        'Failed publishes and out-of-sync drafts are hard to trace.',
        'The same workflow is rebuilt for every property.',
      ],
      es: [
        'Cada web tiene sus reglas, pero no hay un lugar común para gestionarlas.',
        'Las publicaciones fallidas y los borradores desincronizados son difíciles de rastrear.',
        'El mismo flujo se vuelve a montar para cada web.',
      ],
    },
    outcomes: {
      en: [
        'One view of every site, piece and publication.',
        'Destination rules applied automatically on publish.',
        'Retries and alerts when a destination fails.',
      ],
      es: [
        'Una vista de todas las webs, piezas y publicaciones.',
        'Reglas por destino aplicadas al publicar.',
        'Reintentos y avisos cuando falla un destino.',
      ],
    },
    deliverables: {
      en: ['Rules per destination', 'Publication history per piece', 'Pull feed for partner sites'],
      es: ['Reglas por destino', 'Historial de publicación por pieza', 'Feed para webs asociadas'],
    },
    seo: {
      en: {
        title: 'Multi-site publishing for editorial teams',
        description:
          'Publish one approved piece to several sites and channels with rules per destination, retries and a full publication history.',
        keywords: ['multi-site publishing', 'multi site cms workflow', 'editorial operations software'],
      },
      es: {
        title: 'Publicación en varias webs para redacciones',
        description:
          'Publica una pieza aprobada en varias webs y canales con reglas por destino, reintentos e historial completo de publicación.',
        keywords: ['publicar en varias webs', 'gestión de varias webs', 'software de operaciones editoriales'],
      },
    },
    assetSlugs: ['multi-site-publishing-grid', 'publisher-command-center', 'content-operations-showcase'],
  },
];

export const FAQ_ENTRIES = {
  en: [
    {
      question: 'What is Auctorio?',
      answer:
        'Auctorio is editorial workflow software with AI assistance. Teams plan topics from search demand, draft, review and publish to their websites and social channels from one workspace.',
    },
    {
      question: 'Does anything publish without a person approving it?',
      answer:
        'No. AI helps with research, drafts, titles and images, but every piece goes through an editor’s approval before it is published. The approval is recorded with the editor’s name.',
    },
    {
      question: 'Which platforms can Auctorio publish to?',
      answer:
        'WordPress and Ghost through their REST APIs, any system that accepts a signed webhook, X and Instagram. Partner sites can also pull your published articles from a feed.',
    },
    {
      question: 'Can we manage several sites?',
      answer:
        'Yes. One workspace can hold several sites. Each destination keeps its own format, sections, schedule and rules, and one approval can publish to all of them.',
    },
    {
      question: 'How does Auctorio help with SEO?',
      answer:
        'The editorial plan ranks topics by search demand and coverage gaps. While writing, Auctorio suggests titles and meta descriptions, adds structured data and checks images, alt text and sources before approval.',
    },
    {
      question: 'Do we have to replace our CMS?',
      answer:
        'No. Auctorio sits on top of your CMS: it manages the editorial work and publishes to your existing sites.',
    },
    {
      question: 'Is Auctorio available in Spanish?',
      answer:
        'Yes. The public site is available in English and Spanish, and content can be planned and written in either language.',
    },
    {
      question: 'How do we get started?',
      answer:
        'Join the waitlist. When your place opens we connect a test site, set up your workflow stages and run one real piece from plan to publication with your team.',
    },
  ],
  es: [
    {
      question: '¿Qué es Auctorio?',
      answer:
        'Auctorio es un software de flujo editorial con asistencia de IA. Los equipos planifican temas según la demanda de búsqueda, redactan, revisan y publican en sus webs y redes desde un único espacio.',
    },
    {
      question: '¿Se publica algo sin que lo apruebe una persona?',
      answer:
        'No. La IA ayuda con la investigación, los borradores, los títulos y las imágenes, pero cada pieza pasa por la aprobación de un editor antes de publicarse, y esa aprobación queda registrada con su nombre.',
    },
    {
      question: '¿En qué plataformas puede publicar Auctorio?',
      answer:
        'En WordPress y Ghost mediante sus API REST, en cualquier sistema que acepte un webhook firmado, en X y en Instagram. Las webs asociadas también pueden recoger tus artículos publicados desde un feed.',
    },
    {
      question: '¿Podemos gestionar varias webs?',
      answer:
        'Sí. Un mismo espacio puede tener varias webs. Cada destino mantiene su formato, secciones, horario y reglas, y una sola aprobación puede publicar en todos.',
    },
    {
      question: '¿Cómo ayuda Auctorio con el SEO?',
      answer:
        'El plan editorial ordena los temas por demanda de búsqueda y huecos de cobertura. Mientras se escribe, Auctorio propone títulos y meta descripciones, añade datos estructurados y comprueba imágenes, textos alternativos y fuentes antes de aprobar.',
    },
    {
      question: '¿Tenemos que cambiar de CMS?',
      answer:
        'No. Auctorio trabaja por encima de tu CMS: gestiona el trabajo editorial y publica en tus webs actuales.',
    },
    {
      question: '¿Auctorio está en español?',
      answer:
        'Sí. La web pública está en inglés y en español, y el contenido se puede planificar y redactar en cualquiera de los dos idiomas.',
    },
    {
      question: '¿Cómo empezamos?',
      answer:
        'Únete a la lista de espera. Cuando haya plaza, conectamos una web de prueba, configuramos las fases de tu flujo y llevamos una pieza real del plan a la publicación con tu equipo.',
    },
  ],
} as const;

export const HOME_EXAMPLE_IDS: ExampleId[] = [
  'breaking_news_explainer',
  'editorial_qa_handoff',
  'multi_site_distribution',
];

export const HOME_GALLERY_ASSET_SLUGS = [
  'content-operations-showcase',
  'search-led-newsroom',
  'editorial-qa-review',
  'multi-site-publishing-grid',
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
    kicker: 'Early access',
    title: 'Join the Auctorio waitlist',
    lead: 'Auctorio is opening to editorial teams in waves. Tell us a little about your sites and we will invite you as soon as a place opens.',
    formLabels: {
      name: 'Full name',
      email: 'Work email',
      company: 'Company or publication',
      message: 'What do you publish, and on how many sites?',
      submit: 'Join the waitlist',
    },
    infoTitle: 'Other ways to reach us',
    infoItems: [
      { label: 'Email', value: 'hello@auctorio.com' },
      { label: 'Response time', value: 'Within one business day' },
      { label: 'Onboarding', value: 'We set up your first site with you' },
    ],
  },
  es: {
    kicker: 'Acceso anticipado',
    title: 'Únete a la lista de espera de Auctorio',
    lead: 'Auctorio se abre a equipos editoriales por fases. Cuéntanos un poco sobre tus webs y te invitaremos en cuanto haya plaza.',
    formLabels: {
      name: 'Nombre completo',
      email: 'Email profesional',
      company: 'Empresa o medio',
      message: '¿Qué publicáis y en cuántas webs?',
      submit: 'Unirme a la lista',
    },
    infoTitle: 'Otras formas de contactar',
    infoItems: [
      { label: 'Email', value: 'hello@auctorio.com' },
      { label: 'Respuesta', value: 'En un día laborable' },
      { label: 'Puesta en marcha', value: 'Configuramos contigo tu primera web' },
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
  const items: MarketingNavigationItem[] = MARKETING_ROUTES.filter((route) => route.key !== 'contact').map((route) => ({
    key: route.key,
    label: route.labelByLocale[locale],
    path: route.pathByLocale[locale],
  }));
  const blogPath = BLOG_PATH[locale];
  if (blogPath) {
    items.push({ key: 'blog', label: 'Blog', path: blogPath });
  }
  return items;
}

export function getLocalizedPageSeo(
  locale: MarketingLocale,
  pageKey: MarketingPageKey,
): SeoEntry {
  const routes = {
    home: {
      en: {
        title: 'AI Editorial Workflow Software for Publishers',
        description:
          'Plan from search demand, draft with AI, review with your editors and publish to every site and channel. Editorial workflow software for newsrooms.',
        keywords: ['editorial workflow software', 'ai content operations platform', 'multi-site publishing'],
      },
      es: {
        title: 'Software de flujo editorial con IA para medios',
        description:
          'Planifica según la demanda de búsqueda, redacta con IA, revisa con tus editores y publica en todas tus webs y redes. Software editorial para redacciones.',
        keywords: ['software editorial', 'flujo editorial con ia', 'publicar en varias webs'],
      },
    },
    use_cases: {
      en: {
        title: 'Use cases: AI editorial workflow & publishing',
        description:
          'How newsrooms, agencies and multi-site teams use Auctorio to plan, review and publish editorial content.',
        keywords: [
          'ai content workflow use cases',
          'publisher workflow platform',
          'multi site editorial operations',
        ],
      },
      es: {
        title: 'Casos de uso: flujo editorial con IA',
        description:
          'Cómo usan Auctorio las redacciones, las agencias y los equipos con varias webs para planificar, revisar y publicar.',
        keywords: ['casos de uso software editorial', 'flujo editorial para medios', 'gestión de varias webs'],
      },
    },
    examples: {
      en: {
        title: 'Editorial workflow examples',
        description:
          'Four real editorial workflows in Auctorio: planning from search demand, editor review with checks, multi-site distribution and scheduling.',
        keywords: ['editorial workflow examples', 'newsroom workflow', 'content approval workflow'],
      },
      es: {
        title: 'Ejemplos de flujo editorial',
        description:
          'Cuatro flujos editoriales reales en Auctorio: planificación según la búsqueda, revisión con comprobaciones, distribución en varias webs y programación.',
        keywords: ['ejemplos de flujo editorial', 'flujo de trabajo redacción', 'aprobación de contenidos'],
      },
    },
    faq: {
      en: {
        title: 'FAQ: editorial workflow software',
        description:
          'Answers about Auctorio: human approval, publishing to WordPress, Ghost, X and Instagram, multi-site management, SEO and getting started.',
        keywords: ['auctorio faq', 'editorial workflow software questions'],
      },
      es: {
        title: 'Preguntas frecuentes sobre Auctorio',
        description:
          'Respuestas sobre Auctorio: aprobación humana, publicación en WordPress, Ghost, X e Instagram, varias webs, SEO y cómo empezar.',
        keywords: ['preguntas auctorio', 'software editorial preguntas'],
      },
    },
    contact: {
      en: {
        title: 'Join the waitlist',
        description: 'Join the Auctorio waitlist for early access to AI editorial workflow software for publishers, agencies and multi-site teams.',
        keywords: ['auctorio waitlist', 'editorial workflow software early access'],
      },
      es: {
        title: 'Lista de espera',
        description: 'Únete a la lista de espera de Auctorio y accede antes al software de flujo editorial con IA para medios, agencias y equipos con varias webs.',
        keywords: ['lista de espera auctorio', 'acceso anticipado software editorial'],
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

  // Blog index ↔ blog index; an article without a translation falls back to the other blog index.
  if (clean.startsWith(`${BLOG_PATH[locale]}/`)) {
    const article = getArticle(locale, clean.slice(BLOG_PATH[locale].length + 1));
    const translation = article ? getArticleTranslation(article, targetLocale) : null;
    return translation ? getArticlePath(translation) : BLOG_PATH[targetLocale];
  }
  if (clean === BLOG_PATH.en || clean === BLOG_PATH.es) {
    return BLOG_PATH[targetLocale];
  }

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
    startTitle: locale === 'en' ? 'Get started' : 'Empezar',
    legalCopy:
      locale === 'en'
        ? 'Editorial workflow software for publishers, agencies and multi-site teams.'
        : 'Software de flujo editorial para medios, agencias y equipos con varias webs.',
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

  const blogEntries = SUPPORTED_MARKETING_LOCALES.flatMap((locale) => {
    const blogPath = BLOG_PATH[locale];
    if (!blogPath) {
      return [];
    }
    return [
      { locale, path: blogPath, priority: 0.7, changefreq: 'weekly' as const, imageSlugs: [] as string[] },
      ...getArticles(locale).map((article) => ({
        locale,
        path: getArticlePath(article),
        priority: 0.8,
        changefreq: 'monthly' as const,
        imageSlugs: [article.heroAssetSlug],
      })),
    ];
  });

  return [...entries, ...useCaseEntries, ...blogEntries];
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

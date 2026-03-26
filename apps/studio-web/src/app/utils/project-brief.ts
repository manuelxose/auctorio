import type {
  CreateProjectPayload,
  JsonRecord,
  ProjectGoal,
  StudioProjectDetailView,
} from '../models/studio.models';

export const PROJECT_BRIEF_METADATA_KEYS = [
  'briefSummary',
  'targetQuery',
  'audience',
  'angle',
  'tone',
  'cta',
  'sourceNotes',
  'requiredSections',
  'keywords',
  'categories',
  'author',
  'slug',
  'canonicalUrl',
  'featured',
] as const;

export type ProjectBriefEditorValue = {
  siteId: string;
  title: string;
  goal: ProjectGoal;
  primaryLanguage: string;
  briefSummary: string;
  targetQuery: string;
  audience: string;
  angle: string;
  tone: string;
  cta: string;
  sourceNotes: string;
  requiredSections: string;
  keywords: string;
  categories: string;
  author: string;
  slug: string;
  canonicalUrl: string;
  featured: boolean;
};

function asRecord(value: JsonRecord): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }

  return {};
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

function readList(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function toCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toLineList(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function withLineBullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function composeBriefSummary(value: ProjectBriefEditorValue): string {
  const sections = [
    value.briefSummary.trim(),
    [
      value.targetQuery.trim() ? `Target query: ${value.targetQuery.trim()}` : '',
      value.audience.trim() ? `Audience: ${value.audience.trim()}` : '',
      value.angle.trim() ? `Angle: ${value.angle.trim()}` : '',
      value.tone.trim() ? `Tone: ${value.tone.trim()}` : '',
      value.cta.trim() ? `CTA: ${value.cta.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    toLineList(value.requiredSections).length
      ? `Required sections:\n${withLineBullets(toLineList(value.requiredSections))}`
      : '',
    toLineList(value.sourceNotes).length
      ? `Facts and source notes:\n${withLineBullets(toLineList(value.sourceNotes))}`
      : '',
    toCommaSeparated(value.keywords).length
      ? `SEO keywords: ${toCommaSeparated(value.keywords).join(', ')}`
      : '',
    toCommaSeparated(value.categories).length
      ? `Publishing categories: ${toCommaSeparated(value.categories).join(', ')}`
      : '',
    [
      value.author.trim() ? `Author: ${value.author.trim()}` : '',
      value.slug.trim() ? `Preferred slug: ${value.slug.trim()}` : '',
      value.canonicalUrl.trim() ? `Canonical URL: ${value.canonicalUrl.trim()}` : '',
      value.featured ? 'Featured placement requested.' : '',
    ]
      .filter(Boolean)
      .join('\n'),
  ]
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.join('\n\n');
}

export function createEmptyProjectBriefEditorValue(): ProjectBriefEditorValue {
  return {
    siteId: '',
    title: '',
    goal: 'article',
    primaryLanguage: 'es',
    briefSummary: '',
    targetQuery: '',
    audience: '',
    angle: '',
    tone: '',
    cta: '',
    sourceNotes: '',
    requiredSections: '',
    keywords: '',
    categories: '',
    author: '',
    slug: '',
    canonicalUrl: '',
    featured: false,
  };
}

export function createProjectBriefEditorValueFromProject(
  project: Pick<
    StudioProjectDetailView,
    'siteId' | 'title' | 'goal' | 'primaryLanguage' | 'brief' | 'metadata'
  >,
): ProjectBriefEditorValue {
  const metadata = asRecord(project.metadata);

  return {
    siteId: project.siteId,
    title: project.title,
    goal: project.goal,
    primaryLanguage: project.primaryLanguage,
    briefSummary: readString(metadata, 'briefSummary') || project.brief,
    targetQuery: readString(metadata, 'targetQuery'),
    audience: readString(metadata, 'audience'),
    angle: readString(metadata, 'angle'),
    tone: readString(metadata, 'tone'),
    cta: readString(metadata, 'cta'),
    sourceNotes: readList(metadata, 'sourceNotes').join('\n'),
    requiredSections: readList(metadata, 'requiredSections').join('\n'),
    keywords: readList(metadata, 'keywords').join(', '),
    categories: readList(metadata, 'categories').join(', '),
    author: readString(metadata, 'author'),
    slug: readString(metadata, 'slug'),
    canonicalUrl: readString(metadata, 'canonicalUrl'),
    featured: readBoolean(metadata, 'featured'),
  };
}

export function buildProjectPayloadFromBriefEditor(
  value: ProjectBriefEditorValue,
  baseMetadata: JsonRecord = null,
): CreateProjectPayload {
  const mergedMetadata = asRecord(baseMetadata);
  const nextMetadata: Record<string, unknown> = {
    ...mergedMetadata,
  };

  const applyString = (key: (typeof PROJECT_BRIEF_METADATA_KEYS)[number], input: string) => {
    const normalized = input.trim();
    if (normalized) {
      nextMetadata[key] = normalized;
      return;
    }

    delete nextMetadata[key];
  };

  const applyList = (key: (typeof PROJECT_BRIEF_METADATA_KEYS)[number], input: string, parser: (value: string) => string[]) => {
    const parsed = parser(input);
    if (parsed.length > 0) {
      nextMetadata[key] = parsed;
      return;
    }

    delete nextMetadata[key];
  };

  applyString('briefSummary', value.briefSummary);
  applyString('targetQuery', value.targetQuery);
  applyString('audience', value.audience);
  applyString('angle', value.angle);
  applyString('tone', value.tone);
  applyString('cta', value.cta);
  applyList('sourceNotes', value.sourceNotes, toLineList);
  applyList('requiredSections', value.requiredSections, toLineList);
  applyList('keywords', value.keywords, toCommaSeparated);
  applyList('categories', value.categories, toCommaSeparated);
  applyString('author', value.author);
  applyString('slug', value.slug);
  applyString('canonicalUrl', value.canonicalUrl);

  if (value.featured) {
    nextMetadata['featured'] = true;
  } else {
    delete nextMetadata['featured'];
  }

  return {
    siteId: value.siteId.trim(),
    title: value.title.trim(),
    goal: value.goal,
    primaryLanguage: value.primaryLanguage.trim() || 'es',
    brief: composeBriefSummary(value),
    metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : null,
  };
}

export function getUnknownProjectMetadata(metadata: JsonRecord): Record<string, unknown> {
  const record = asRecord(metadata);
  const unknownEntries = Object.entries(record).filter(
    ([key]) => !(PROJECT_BRIEF_METADATA_KEYS as readonly string[]).includes(key),
  );

  return Object.fromEntries(unknownEntries);
}

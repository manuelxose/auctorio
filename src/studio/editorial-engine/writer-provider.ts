// Article writer provider seam (Phase 4). Production uses the shared text
// provider; tests inject a deterministic fake writer.

import { getTextProvider, type TextProvider, type TextUsage } from "../../infrastructure/ai/text";

export type WriterGenerationInput = {
  prompt: string;
  systemPrompt: string;
  maxTokens?: number;
  language: "es" | "en";
};

export type WriterGenerationResult = {
  output: string;
  provider: string;
  model: string;
  usage?: TextUsage;
};

export interface ArticleWriter {
  generate(input: WriterGenerationInput): Promise<WriterGenerationResult>;
}

export class DefaultArticleWriter implements ArticleWriter {
  constructor(private readonly provider: TextProvider) {}

  async generate(input: WriterGenerationInput): Promise<WriterGenerationResult> {
    const result = await this.provider.generate({
      prompt: input.prompt,
      systemPrompt: input.systemPrompt,
      ...(input.maxTokens ? { maxTokens: input.maxTokens } : {}),
      temperature: 0.7,
      responseFormat: { type: "json_object" },
    });
    return {
      output: result.output,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
    };
  }
}

export type ArticleWriterFactory = () => ArticleWriter;

let writerFactory: ArticleWriterFactory | null = null;

/** Override writer construction (deterministic CI fixtures). */
export function setArticleWriterFactory(factory: ArticleWriterFactory | null): void {
  writerFactory = factory;
}

export function getArticleWriter(): ArticleWriter {
  if (writerFactory) {
    return writerFactory();
  }
  return new DefaultArticleWriter(getTextProvider());
}

import { articlePipeline } from './article-pipeline';

const states = (stage: Parameters<typeof articlePipeline>[0]) => articlePipeline(stage).map((step) => step.state);

describe('articlePipeline', () => {
  it('starts an article without a version at the brief', () => {
    expect(states('awaiting_generation')).toEqual(['current', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo']);
  });

  it('marks the quality step as failed when QA blocks the article', () => {
    expect(states('qa_blocked')).toEqual(['done', 'done', 'failed', 'todo', 'todo', 'todo', 'todo']);
  });

  it('places an article waiting for review on the review step', () => {
    expect(states('needs_review')).toEqual(['done', 'done', 'done', 'current', 'todo', 'todo', 'todo']);
  });

  it('marks publishing as failed, keeping approval done', () => {
    expect(states('publish_failed')).toEqual(['done', 'done', 'done', 'done', 'done', 'failed', 'todo']);
  });

  it('completes every step once published', () => {
    expect(states('published').every((state) => state === 'done')).toBeTrue();
  });
});

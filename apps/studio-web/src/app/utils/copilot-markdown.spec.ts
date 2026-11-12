import { renderCopilotMarkdown } from './copilot-markdown';

describe('renderCopilotMarkdown', () => {
  it('escapes raw HTML from the model', () => {
    const html = renderCopilotMarkdown('<img src=x onerror=alert(1)> **ok**');

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<strong>ok</strong>');
  });

  it('renders lists, headings and fenced code', () => {
    const html = renderCopilotMarkdown('# Fixes\n- one\n- two\n\n1. first\n```\n<b>x</b>\n```');

    expect(html).toBe('<h4>Fixes</h4><ul><li>one</li><li>two</li></ul><ol><li>first</li></ol><pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>');
  });

  it('links Studio routes only and leaves external URLs as text', () => {
    const html = renderCopilotMarkdown('[Article](/studio/content/abc) and [x](https://evil.test)');

    expect(html).toContain('<a href="/studio/content/abc">Article</a>');
    expect(html).not.toContain('href="https://evil.test"');
  });
});

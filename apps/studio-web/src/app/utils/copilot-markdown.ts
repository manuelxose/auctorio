/**
 * Minimal, safe Markdown for copilot answers. The input is model output, so it
 * is escaped first and only a fixed set of constructs is turned back into HTML:
 * headings, lists, fenced and inline code, bold, and links to Studio routes.
 * External links stay as plain text. Angular's sanitizer still runs on [innerHTML].
 */
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((\/studio\/[A-Za-z0-9/_?=&;.-]*)\)/g, '<a href="$2">$1</a>');
}

export function renderCopilotMarkdown(source: string): string {
  const lines = escapeHtml(source ?? '').split(/\r?\n/);
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let code: string[] | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const line of lines) {
    if (code) {
      if (line.trim().startsWith('```')) {
        out.push(`<pre><code>${code.join('\n')}</code></pre>`);
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (line.trim().startsWith('```')) {
      flushParagraph();
      closeList();
      code = [];
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      out.push(`<h4>${inline(heading[2])}</h4>`);
    } else if (bullet || numbered) {
      flushParagraph();
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
    } else if (!line.trim()) {
      flushParagraph();
      closeList();
    } else {
      closeList();
      paragraph.push(line.trim());
    }
  }
  if (code) out.push(`<pre><code>${(code as string[]).join('\n')}</code></pre>`);
  flushParagraph();
  closeList();
  return out.join('');
}

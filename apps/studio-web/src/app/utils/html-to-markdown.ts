/** Article HTML → Markdown for «Export Markdown» (browser only: uses DOMParser). Unknown tags keep their text. */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const inline = (node: Node): string => Array.from(node.childNodes).map(render).join('');
  const cell = (node: Node) => inline(node).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

  function list(element: Element, ordered: boolean, depth: number): string {
    return Array.from(element.children)
      .filter((child) => child.tagName === 'LI')
      .map((li, i) => {
        const nested = Array.from(li.children).filter((child) => child.tagName === 'UL' || child.tagName === 'OL');
        const own = Array.from(li.childNodes).filter((child) => !nested.includes(child as Element)).map(render).join('').trim();
        const sub = nested.map((child) => list(child, child.tagName === 'OL', depth + 1)).join('');
        return `${'  '.repeat(depth)}${ordered ? `${i + 1}.` : '-'} ${own}\n${sub}`;
      })
      .join('');
  }

  function render(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    switch (el.tagName) {
      case 'H2': return `\n## ${inline(el).trim()}\n\n`;
      case 'H3': return `\n### ${inline(el).trim()}\n\n`;
      case 'H4': return `\n#### ${inline(el).trim()}\n\n`;
      case 'P': return `${inline(el).trim()}\n\n`;
      case 'STRONG': case 'B': return `**${inline(el)}**`;
      case 'EM': case 'I': return `*${inline(el)}*`;
      case 'S': return `~~${inline(el)}~~`;
      case 'BR': return '  \n';
      case 'HR': return '\n---\n\n';
      case 'A': return `[${inline(el)}](${el.getAttribute('href') ?? ''})`;
      case 'IMG': return `![${el.getAttribute('alt') ?? ''}](${el.getAttribute('src') ?? ''})`;
      case 'UL': return `${list(el, false, 0)}\n`;
      case 'OL': return `${list(el, true, 0)}\n`;
      case 'BLOCKQUOTE': return `${inline(el).trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
      case 'FIGCAPTION': return `\n*${inline(el).trim()}*\n\n`;
      case 'TABLE': {
        const rows = Array.from(el.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map(cell));
        if (!rows.length) return '';
        const width = Math.max(...rows.map((row) => row.length));
        const line = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`;
        return `${line(rows[0])}\n| ${Array.from({ length: width }, () => '---').join(' | ')} |\n${rows.slice(1).map(line).join('\n')}\n\n`;
      }
      default: return inline(el);
    }
  }

  return inline(doc.body).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

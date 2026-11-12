import { detectConnectTarget } from './connect-target';

describe('detectConnectTarget', () => {
  it('treats a bare domain as a website and adds https', () => {
    expect(detectConnectTarget('guiaprogramacion.tv')).toEqual({ kind: 'website', url: 'https://guiaprogramacion.tv', label: 'guiaprogramacion.tv' });
  });

  it('keeps the path of a website URL and drops www from the label', () => {
    expect(detectConnectTarget('https://www.example.com/blog')).toEqual({ kind: 'website', url: 'https://www.example.com/blog', label: 'example.com' });
  });

  it('recognises Instagram and X profile links with their handle', () => {
    expect(detectConnectTarget('https://www.instagram.com/tecnoria/')).toEqual({ kind: 'instagram', handle: 'tecnoria', label: 'Instagram · @tecnoria' });
    expect(detectConnectTarget('twitter.com/auctorio')).toEqual({ kind: 'x', handle: 'auctorio', label: 'X · @auctorio' });
  });

  it('does not take a post path for a handle', () => {
    expect(detectConnectTarget('instagram.com/p/Cx12')).toEqual({ kind: 'instagram', handle: null, label: 'Instagram' });
  });

  it('asks which network a bare @handle belongs to', () => {
    expect(detectConnectTarget('@tecnoria')).toEqual({ kind: 'handle', handle: 'tecnoria', label: '@tecnoria' });
  });

  it('rejects text that is not a destination', () => {
    expect(detectConnectTarget('')).toBeNull();
    expect(detectConnectTarget('my website')).toBeNull();
    expect(detectConnectTarget('localhost')).toBeNull();
    expect(detectConnectTarget('ftp://example.com')).toBeNull();
    expect(detectConnectTarget('javascript:alert(1)')).toBeNull();
  });
});

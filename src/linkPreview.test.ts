// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';

const page = new DOMParser().parseFromString(indexHtml, 'text/html');
const publicFiles = Object.keys(import.meta.glob('/public/**/*'));

function attribute(selector: string, name: 'content' | 'href'): string {
  const value = page.querySelector(selector)?.getAttribute(name);
  if (!value) throw new Error(`${selector} has no ${name} in index.html`);
  return value;
}

describe('the link preview of the page', () => {
  // Crawlers do not run scripts and only follow absolute URLs, so `new URL` also proves that these are absolute.
  const canonical = new URL(attribute('link[rel="canonical"]', 'href'));
  const pageUrl = new URL(attribute('meta[property="og:url"]', 'content'));
  const image = new URL(attribute('meta[property="og:image"]', 'content'));

  it('gives the same address to the canonical link and og:url, and the same site to og:image', () => {
    expect(pageUrl.href).toBe(canonical.href);
    expect(image.origin).toBe(canonical.origin);
  });

  it('advertises an image that the site serves', () => {
    expect(publicFiles).toContain(`/public${image.pathname}`);
  });

  it.each(['link[rel="icon"]', 'link[rel="apple-touch-icon"]'])('points %s at a file that the site serves', (selector) => {
    expect(publicFiles).toContain(`/public${attribute(selector, 'href')}`);
  });
});

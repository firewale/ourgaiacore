import { describe, it, expect } from 'vitest';
import { setVisibleArticles, getVisibleArticles } from '../mapContext.js';
import type { WikiArticle } from '../wikipedia.js';

describe('mapContext', () => {
  it('returns an empty array before anything is set', () => {
    expect(getVisibleArticles()).toEqual([]);
  });

  it('returns the articles passed to setVisibleArticles', () => {
    const articles: WikiArticle[] = [
      { title: 'City Museum', lat: 1, long: 2, pageId: 1, category: 'museum' },
    ];
    setVisibleArticles(articles);
    expect(getVisibleArticles()).toEqual(articles);
  });

  it('overwrites the previous set of articles', () => {
    setVisibleArticles([{ title: 'A', lat: 0, long: 0, pageId: 1, category: 'default' }]);
    setVisibleArticles([{ title: 'B', lat: 0, long: 0, pageId: 2, category: 'default' }]);
    expect(getVisibleArticles()).toEqual([{ title: 'B', lat: 0, long: 0, pageId: 2, category: 'default' }]);
  });
});

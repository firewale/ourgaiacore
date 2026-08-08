import type { WikiArticle } from './wikipedia.js';

let visibleArticles: WikiArticle[] = [];

export function setVisibleArticles(articles: WikiArticle[]): void {
  visibleArticles = articles;
}

export function getVisibleArticles(): WikiArticle[] {
  return visibleArticles;
}

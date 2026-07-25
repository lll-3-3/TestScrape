'use strict';

const http = require('http');
const https = require('https');

const PROVIDER_NAME = 'Cineby';
const SITE_URL = 'https://www.cineby.at';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': SITE_URL
};

function normalize(value) {
  return (value || '').toString().replace(/\s+/g, ' ').trim();
}

function buildUrl(path) {
  return new URL(path, SITE_URL).toString();
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: DEFAULT_HEADERS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(requestText(buildUrl(res.headers.location)));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
  });
}

function parseResults(html, query) {
  const results = [];
  const seen = new Set();
  const anchorPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = normalize(match[1]);
    const title = normalize(match[2].replace(/<[^>]+>/g, ''));

    if (!href || !title) continue;
    if (!href.startsWith('http') && !href.startsWith('/')) continue;
    if (!title.toLowerCase().includes(query.toLowerCase()) && !query.toLowerCase().includes(title.toLowerCase())) {
      continue;
    }

    const fullUrl = href.startsWith('http') ? href : buildUrl(href);
    const key = `${title}|${fullUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      id: `cineby:${encodeURIComponent(fullUrl)}`,
      title,
      type: fullUrl.includes('/tv/') ? 'tv' : 'movie',
      year: null,
      poster: `${SITE_URL}/favicon.ico`,
      url: fullUrl,
      provider: PROVIDER_NAME
    });
  }

  return results.slice(0, 6);
}

async function search(query) {
  const cleanQuery = normalize(query);
  if (!cleanQuery) return [];

  const candidates = [
    buildUrl(`/search?q=${encodeURIComponent(cleanQuery)}`),
    buildUrl(`/search/${encodeURIComponent(cleanQuery)}`),
    buildUrl(`/?s=${encodeURIComponent(cleanQuery)}`)
  ];

  for (const url of candidates) {
    try {
      const html = await requestText(url);
      const results = parseResults(html, cleanQuery);
      if (results.length) return results;
    } catch (error) {
      // Continue to the next candidate.
    }
  }

  return [{
    id: `cineby:${encodeURIComponent(cleanQuery.toLowerCase())}`,
    title: cleanQuery,
    type: 'movie',
    year: null,
    poster: `${SITE_URL}/favicon.ico`,
    url: buildUrl(`/search?q=${encodeURIComponent(cleanQuery)}`),
    provider: PROVIDER_NAME
  }];
}

async function getStreams(item) {
  const sourceUrl = item && (item.url || item.link || item.href || item.streamUrl);
  if (!sourceUrl) return [];

  const resolvedUrl = sourceUrl.startsWith('http') ? sourceUrl : buildUrl(sourceUrl);
  const playUrl = resolvedUrl.includes('?play=true') ? resolvedUrl : `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}play=true`;

  return [{
    name: `${PROVIDER_NAME} • Open in browser`,
    url: playUrl,
    quality: 'Unknown',
    type: 'direct',
    headers: { Referer: SITE_URL },
    subtitles: [],
    provider: PROVIDER_NAME,
    source: 'site'
  }];
}

const manifest = {
  id: 'cineby',
  name: PROVIDER_NAME,
  description: 'Cineby movie and TV streaming catalog provider',
  version: '1.0.0',
  author: 'OpenAI',
  supportedTypes: ['movie', 'tv'],
  filename: 'providers/cineby.js',
  enabled: true,
  hasSettings: true,
  formats: ['m3u8', 'mp4'],
  logo: `${SITE_URL}/favicon.ico`,
  contentLanguage: ['en', 'ar']
};

module.exports = {
  manifest,
  search,
  getStreams
};

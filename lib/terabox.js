import axios from 'axios';
import { cache } from './cache.js';

// Default worker proxy
const PROXY_BASE_URL = 'https://tbx-proxy.shakir-ansarii075.workers.dev/';

// Common User-Agent
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Format bytes to readable string (e.g. 15.2 MB, 1.4 GB)
 */
export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Extracts surl (short URL code) from any TeraBox link
 */
export function extractSurl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();

  // Pattern 1: ?surl=XYZ or &surl=XYZ
  const surlMatch = trimmed.match(/[?&]surl=([a-zA-Z0-9_-]+)/);
  if (surlMatch && surlMatch[1]) {
    return cleanSurl(surlMatch[1]);
  }

  // Pattern 2: /s/1XYZ or /s/XYZ
  const sMatch = trimmed.match(/\/s\/([a-zA-Z0-9_-]+)/);
  if (sMatch && sMatch[1]) {
    return cleanSurl(sMatch[1]);
  }

  // Pattern 3: direct short code entered (e.g. 1abc123 or abc123)
  if (/^[a-zA-Z0-9_-]{6,32}$/.test(trimmed)) {
    return cleanSurl(trimmed);
  }

  return null;
}

function cleanSurl(surl) {
  return surl;
}

/**
 * Helper: Extract jsToken from TeraBox sharing page
 */
async function extractJsToken(surl, ndusCookie = '') {
  const short_url = surl.startsWith('1') ? surl.substring(1) : surl;
  const candidateUrls = [
    `https://dm.terabox.app/sharing/link?surl=${surl}`,
    `https://dm.terabox.app/sharing/link?surl=${short_url}`,
    `https://www.1024tera.com/sharing/link?surl=${surl}`,
    `https://www.1024tera.com/sharing/link?surl=${short_url}`,
    `https://www.terabox.app/sharing/link?surl=${surl}`
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  if (ndusCookie) {
    headers['Cookie'] = `ndus=${ndusCookie}; lang=en`;
  }

  for (const pageUrl of candidateUrls) {
    try {
      const res = await axios.get(pageUrl, { headers, timeout: 8000 });
      const html = res.data;
      if (typeof html === 'string') {
        const match = html.match(/fn%28%22(.*?)%22%29/);
        if (match && match[1]) {
          return match[1];
        }
      }
    } catch {}
  }
  return '';
}

/**
 * Strategy 1: Direct resolution via TeraBox API with ndus cookie and jsToken
 */
async function resolveViaDirectApi(surl, ndusCookie = '') {
  const short_url = surl.startsWith('1') ? surl.substring(1) : surl;
  const jsToken = await extractJsToken(surl, ndusCookie);

  const cookieString = `ndus=${ndusCookie}; lang=en`;

  const endpoints = [
    {
      url: 'https://dm.terabox.app/share/list',
      host: 'dm.terabox.app',
      referer: `https://dm.terabox.app/sharing/link?surl=${short_url}&clearCache=1`,
      origin: 'https://dm.terabox.app'
    },
    {
      url: 'https://www.1024tera.com/share/list',
      host: 'www.1024tera.com',
      referer: `https://www.1024tera.com/sharing/link?surl=${short_url}`,
      origin: 'https://www.1024tera.com'
    }
  ];

  let lastError = null;

  for (const ep of endpoints) {
    for (const testSurl of [short_url, surl]) {
      try {
        const params = {
          app_id: '250528',
          site_referer: 'https://www.terabox.app/',
          shorturl: testSurl,
          root: '1'
        };
        if (jsToken) {
          params.jsToken = jsToken;
        }

        const headers = {
          Host: ep.host,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: ep.referer,
          Origin: ep.origin,
          Cookie: cookieString
        };

        const response = await axios.get(ep.url, {
          params,
          headers,
          timeout: 10000
        });

        const data = response.data;
        if (data && data.errno === 0 && data.list && data.list.length > 0) {
          return normalizeTeraBoxApiResult(data, surl);
        }
        if (data && data.errno !== 0) {
          lastError = new Error(`TeraBox API errno: ${data.errno}`);
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw new Error(lastError ? lastError.message : 'Direct API returned no files');
}

/**
 * Strategy 2: Resolve using Cloudflare Worker Proxy (Without raw=1 to get parsed dlink)
 */
async function resolveViaProxy(surl, rawSurl, ndusCookie = '') {
  const targetSurl = surl || rawSurl;
  // Note: Request without raw=1 first to get parsed dlink from proxy
  const requestUrl = `${PROXY_BASE_URL}?mode=resolve&surl=${targetSurl}`;

  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
  };
  if (ndusCookie) {
    headers['Cookie'] = `ndus=${ndusCookie}`;
  }

  let resData;
  try {
    const response = await axios.get(requestUrl, { headers, timeout: 12000 });
    resData = response.data;
  } catch (err) {
    // If standard mode fails, retry with raw=1
    const rawUrl = `${PROXY_BASE_URL}?mode=resolve&surl=${targetSurl}&raw=1`;
    const response = await axios.get(rawUrl, { headers, timeout: 12000 });
    resData = response.data;
  }

  if (!resData) throw new Error('Empty response from proxy');

  const item = resData.data || (resData.list && resData.list[0]) || (resData.upstream && resData.upstream.list && resData.upstream.list[0]);
  if (!item && !resData.list && !(resData.upstream && resData.upstream.list)) {
    if (resData.error) throw new Error(resData.error);
    throw new Error('No files found in share');
  }

  return normalizeProxyResult(resData, targetSurl);
}

/**
 * Strategy 3: Scraping TeraBox web page for yunData
 */
async function resolveViaWebScrape(surl, ndusCookie = '') {
  const candidateUrls = [
    `https://www.1024tera.com/sharing/link?surl=${surl}`,
    `https://dm.terabox.app/sharing/link?surl=${surl}`,
    `https://www.terabox.app/sharing/link?surl=${surl}`
  ];

  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  if (ndusCookie) {
    headers['Cookie'] = `ndus=${ndusCookie}; lang=en`;
  }

  for (const url of candidateUrls) {
    try {
      const response = await axios.get(url, { headers, timeout: 10000 });
      const html = response.data;
      if (typeof html !== 'string') continue;

      const match = html.match(/yunData\.setData\(([\s\S]*?)\);/) || html.match(/window\.yunData\s*=\s*(\{[\s\S]*?\});/);
      if (match) {
        const parsed = JSON.parse(match[1]);
        if (parsed.file_list && parsed.file_list.length > 0) {
          return normalizeYunDataResult(parsed, surl);
        }
      }
    } catch {}
  }

  throw new Error('No files found in scraped web page');
}

/**
 * Normalizes results from Proxy
 */
function normalizeProxyResult(resData, surl) {
  let fileList = [];

  if (resData.data) {
    const d = resData.data;
    fileList.push({
      fs_id: d.fid || d.fs_id || '0',
      name: d.name || d.server_filename || 'video.mp4',
      size: Number(d.size) || 0,
      sizeFormatted: formatBytes(Number(d.size) || 0),
      thumb: d.thumb || (d.thumbs && (d.thumbs.url3 || d.thumbs.url2 || d.thumbs.url1)) || '',
      dlink: d.dlink || '',
      isVideo: isVideoFile(d.name || d.server_filename)
    });
  } else if (resData.list && Array.isArray(resData.list)) {
    fileList = resData.list.map(f => ({
      fs_id: f.fs_id || f.fid || '0',
      name: f.server_filename || f.name || 'file',
      size: Number(f.size) || 0,
      sizeFormatted: formatBytes(Number(f.size) || 0),
      thumb: (f.thumbs && (f.thumbs.url3 || f.thumbs.url2 || f.thumbs.url1)) || f.thumb || '',
      dlink: f.dlink || '',
      isVideo: isVideoFile(f.server_filename || f.name)
    }));
  } else if (resData.upstream && resData.upstream.list) {
    fileList = resData.upstream.list.map(f => ({
      fs_id: f.fs_id || f.fid || '0',
      name: f.server_filename || f.name || 'file',
      size: Number(f.size) || 0,
      sizeFormatted: formatBytes(Number(f.size) || 0),
      thumb: (f.thumbs && (f.thumbs.url3 || f.thumbs.url2 || f.thumbs.url1)) || f.thumb || '',
      dlink: f.dlink || '',
      isVideo: isVideoFile(f.server_filename || f.name)
    }));
  }

  const primary = fileList.find(f => f.isVideo) || fileList[0];

  return {
    surl,
    title: primary ? primary.name : 'TeraBox File',
    size: primary ? primary.size : 0,
    sizeFormatted: primary ? primary.sizeFormatted : '0 B',
    thumb: primary ? primary.thumb : '',
    dlink: primary ? primary.dlink : '',
    isVideo: primary ? primary.isVideo : true,
    m3u8Url: `/api/m3u8?surl=${surl}`,
    files: fileList,
    source: 'proxy'
  };
}

/**
 * Normalizes results from direct API
 */
function normalizeTeraBoxApiResult(data, surl) {
  const fileList = data.list.map(f => ({
    fs_id: f.fs_id,
    name: f.server_filename,
    size: Number(f.size),
    sizeFormatted: formatBytes(Number(f.size)),
    thumb: (f.thumbs && (f.thumbs.url3 || f.thumbs.url2 || f.thumbs.url1)) || '',
    dlink: f.dlink || '',
    isVideo: isVideoFile(f.server_filename)
  }));

  const primary = fileList.find(f => f.isVideo) || fileList[0];

  return {
    surl,
    title: primary ? primary.name : 'TeraBox File',
    size: primary ? primary.size : 0,
    sizeFormatted: primary ? primary.sizeFormatted : '0 B',
    thumb: primary ? primary.thumb : '',
    dlink: primary ? primary.dlink : '',
    isVideo: primary ? primary.isVideo : true,
    m3u8Url: `/api/m3u8?surl=${surl}`,
    files: fileList,
    source: 'direct_api'
  };
}

/**
 * Normalizes results from yunData
 */
function normalizeYunDataResult(parsed, surl) {
  const list = parsed.file_list || [];
  const fileList = list.map(f => ({
    fs_id: f.fs_id,
    name: f.server_filename,
    size: Number(f.size),
    sizeFormatted: formatBytes(Number(f.size)),
    thumb: (f.thumbs && (f.thumbs.url3 || f.thumbs.url2 || f.thumbs.url1)) || '',
    dlink: f.dlink || '',
    isVideo: isVideoFile(f.server_filename)
  }));

  const primary = fileList.find(f => f.isVideo) || fileList[0];

  return {
    surl,
    title: primary ? primary.name : (parsed.share_title || 'TeraBox File'),
    size: primary ? primary.size : 0,
    sizeFormatted: primary ? primary.sizeFormatted : '0 B',
    thumb: primary ? primary.thumb : '',
    dlink: primary ? primary.dlink : '',
    isVideo: primary ? primary.isVideo : true,
    m3u8Url: `/api/m3u8?surl=${surl}`,
    files: fileList,
    source: 'web_scrape'
  };
}

function isVideoFile(filename = '') {
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.webm', '.m4v', '.3gp', '.ts'];
  const lower = filename.toLowerCase();
  return videoExts.some(ext => lower.endsWith(ext));
}

/**
 * Master Resolver Function: Coordinates multi-strategy fetching
 */
export async function resolveTeraBoxLink(rawUrl, customNdus = '') {
  const surl = extractSurl(rawUrl);
  if (!surl) {
    throw new Error('Invalid TeraBox link. Please provide a valid TeraBox share URL.');
  }

  // Check cache first (only return if it has a valid dlink)
  const cacheKey = `resolve:${surl}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.dlink) {
    return { ...cached, fromCache: true };
  }

  const ndusCookie = customNdus || process.env.TERABOX_NDUS || process.env.COOKIE_JSON || '';
  const errors = [];

  // When ndusCookie is provided by user, prioritize Direct API strategy
  if (ndusCookie) {
    try {
      const result = await resolveViaDirectApi(surl, ndusCookie);
      cache.set(cacheKey, result, 1000 * 60 * 20);
      return result;
    } catch (e) {
      errors.push(`Direct API Strategy: ${e.message}`);
    }
  }

  // Strategy 2: Cloudflare Worker Proxy
  try {
    const result = await resolveViaProxy(surl, rawUrl, ndusCookie);
    cache.set(cacheKey, result, 1000 * 60 * 20);
    return result;
  } catch (e) {
    errors.push(`Proxy Strategy: ${e.message}`);
  }

  // Strategy 3: Web Scraping
  try {
    const result = await resolveViaWebScrape(surl, ndusCookie);
    cache.set(cacheKey, result, 1000 * 60 * 20);
    return result;
  } catch (e) {
    errors.push(`Web Scrape Strategy: ${e.message}`);
  }

  throw new Error(`Unable to resolve TeraBox link. Details: ${errors.join(' | ')}`);
}

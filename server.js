import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import axios from 'axios';

import { resolveTeraBoxLink, extractSurl } from './lib/terabox.js';
import { streamVideo, proxyM3u8 } from './lib/streamer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasNdusCookie: Boolean(process.env.TERABOX_NDUS || process.env.COOKIE_JSON)
  });
});

// Link resolution endpoint
app.post('/api/resolve', async (req, res) => {
  try {
    const { url, ndus } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'Please enter a TeraBox link.' });
    }

    const resolved = await resolveTeraBoxLink(url, ndus);

    // Decorate files with proxy stream & download URLs
    if (resolved.files && resolved.files.length > 0) {
      resolved.files = resolved.files.map(file => ({
        ...file,
        streamProxyUrl: file.dlink ? `/api/stream?url=${encodeURIComponent(file.dlink)}` : '',
        downloadProxyUrl: file.dlink ? `/api/download?url=${encodeURIComponent(file.dlink)}&filename=${encodeURIComponent(file.name)}` : ''
      }));
    }

    // Decorate primary file
    if (resolved.dlink) {
      resolved.streamProxyUrl = `/api/stream?url=${encodeURIComponent(resolved.dlink)}`;
      resolved.downloadProxyUrl = `/api/download?url=${encodeURIComponent(resolved.dlink)}&filename=${encodeURIComponent(resolved.title)}`;
    }

    res.json({
      success: true,
      data: resolved
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process link'
    });
  }
});

// Video Streaming Proxy (Range request support)
app.get('/api/stream', (req, res) => {
  const targetUrl = req.query.url;
  const customNdus = req.query.ndus;
  streamVideo(req, res, targetUrl, customNdus);
});

// HLS M3U8 Proxy
app.get('/api/m3u8', (req, res) => {
  const surl = req.query.surl;
  proxyM3u8(req, res, surl);
});

// Force Download Proxy
app.get('/api/download', async (req, res) => {
  const targetUrl = req.query.url;
  const filename = req.query.filename || 'TeraPlayer_Download.mp4';
  const ndusCookie = req.query.ndus || process.env.TERABOX_NDUS || process.env.COOKIE_JSON || '';

  if (!targetUrl) {
    return res.status(400).send('Missing target URL');
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36',
      'Referer': 'https://dm.terabox.app/'
    };
    if (ndusCookie) {
      headers['Cookie'] = `ndus=${ndusCookie}; lang=en`;
    }

    const upstreamRes = await axios({
      method: 'get',
      url: targetUrl,
      headers,
      responseType: 'stream',
      timeout: 0,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const safeFilename = encodeURIComponent(filename).replace(/['()]/g, escape);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
    if (upstreamRes.headers['content-type']) {
      res.setHeader('Content-Type', upstreamRes.headers['content-type']);
    }
    if (upstreamRes.headers['content-length']) {
      res.setHeader('Content-Length', upstreamRes.headers['content-length']);
    }

    upstreamRes.data.pipe(res);
  } catch (err) {
    res.status(502).send('Download proxy error: ' + err.message);
  }
});

// Get Configuration
app.get('/api/config', (req, res) => {
  res.json({
    hasNdus: Boolean(process.env.TERABOX_NDUS || process.env.COOKIE_JSON),
    port: PORT
  });
});

// Save / Update NDUS Cookie — উন্নতি: ওয়েবসাইট হিসেবে চালালে
// Settings থেকে ndus আর সার্ভারের .env ফাইলে লেখা হবে না।
// কারণ পাবলিক ওয়েবসাইটে যে কেউ এই API-তে পোস্ট করে অন্যের
// কুকি বদলে দিতে পারত। এখন শুধু এই প্রসেসের মেমোরিতে থাকে,
// সার্ভার রিস্টার্ট হলে মুছে যায়। স্থায়ী ndus দিতে হলে
// হোস্টিং-এর Environment Variable-এ দিতে হবে, কখনো .env
// ফাইল Git-এ পুশ করা যাবে না।
app.post('/api/config', (req, res) => {
  try {
    const { ndus } = req.body;
    if (typeof ndus === 'string') {
      const cleanValue = ndus.trim();
      process.env.TERABOX_NDUS = cleanValue;
      return res.json({ success: true, message: 'NDUS cookie saved for this session only (not written to .env)!' });
    }
    res.status(400).json({ success: false, error: 'Invalid ndus value' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n===========================================`);
  console.log(`🚀 TeraPlayer is running!`);
  console.log(`🌐 Local:   http://localhost:${PORT}`);
  console.log(`📡 Network: http://0.0.0.0:${PORT}`);
  console.log(`===========================================\n`);
});

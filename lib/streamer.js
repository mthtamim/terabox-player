import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Streams video chunk with HTTP Range (206 Partial Content) support
 */
export async function streamVideo(req, res, targetUrl, customNdus = '') {
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing target stream URL' });
  }

  const range = req.headers.range;
  const ndusCookie = customNdus || process.env.TERABOX_NDUS || process.env.COOKIE_JSON || '';

  const upstreamHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Connection': 'keep-alive',
    'Referer': 'https://dm.terabox.app/'
  };

  if (range) {
    upstreamHeaders['Range'] = range;
  }
  if (ndusCookie) {
    upstreamHeaders['Cookie'] = `ndus=${ndusCookie}; lang=en`;
  }

  const abortController = new AbortController();

  req.on('close', () => {
    abortController.abort();
  });

  try {
    const upstreamRes = await axios({
      method: 'get',
      url: targetUrl,
      headers: upstreamHeaders,
      responseType: 'stream',
      signal: abortController.signal,
      // উন্নতি: বড় ফাইলের স্ট্রিম ৩০ সেকেন্ডে কাটা যাবে না।
      // ০ মানে কোনো টোটাল টাইমআউট নয়, শুধু কানেকশন টাইমআউট
      // আলাদা করে ধরা হয় না — স্ট্রিম চলতে থাকলে চলবে।
      timeout: 0,
      maxRedirects: 5,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const status = upstreamRes.status;
    const contentType = upstreamRes.headers['content-type'] || 'video/mp4';
    const contentLength = upstreamRes.headers['content-length'];
    const contentRange = upstreamRes.headers['content-range'];
    const acceptRanges = upstreamRes.headers['accept-ranges'] || 'bytes';

    const clientHeaders = {
      'Content-Type': contentType,
      'Accept-Ranges': acceptRanges,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range, Accept, Origin, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
    };

    if (contentLength) clientHeaders['Content-Length'] = contentLength;
    if (contentRange) clientHeaders['Content-Range'] = contentRange;

    res.writeHead(status, clientHeaders);
    upstreamRes.data.pipe(res);

    upstreamRes.data.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Stream error from upstream: ' + err.message });
      } else {
        res.end();
      }
    });

  } catch (error) {
    if (abortController.signal.aborted) {
      return; // Client cancelled request
    }
    const statusCode = error.response ? error.response.status : 500;
    if (!res.headersSent) {
      res.status(statusCode).json({
        error: 'Failed to proxy video stream',
        details: error.message
      });
    } else {
      res.end();
    }
  }
}

/**
 * Proxies M3U8 playlist with rewritten segment URLs
 */
export async function proxyM3u8(req, res, surl) {
  if (!surl) {
    return res.status(400).send('#EXTM3U\n#ERROR: Missing surl');
  }

  const workerUrl = `https://tbx-proxy.shakir-ansarii075.workers.dev/?mode=stream&surl=${surl}`;

  try {
    const response = await axios.get(workerUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': '*/*'
      },
      timeout: 15000
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (error) {
    res.status(502).send(`#EXTM3U\n#ERROR: Failed to fetch M3U8 stream: ${error.message}`);
  }
}

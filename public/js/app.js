// TeraPlayer Client Application Logic

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlForm = document.getElementById('urlForm');
  const urlInput = document.getElementById('urlInput');
  const clearBtn = document.getElementById('clearBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const btnIcon = document.getElementById('btnIcon');
  const btnLoader = document.getElementById('btnLoader');
  const demoLinkBtn = document.getElementById('demoLinkBtn');

  // Error Alert
  const errorAlert = document.getElementById('errorAlert');
  const errorTitle = document.getElementById('errorTitle');
  const errorDesc = document.getElementById('errorDesc');

  // Media Section Elements
  const mediaSection = document.getElementById('mediaSection');
  const videoTitle = document.getElementById('videoTitle');
  const videoSize = document.getElementById('videoSize');
  const streamTypeBadge = document.getElementById('streamTypeBadge');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const modeHlsBtn = document.getElementById('modeHlsBtn');
  const modeDirectBtn = document.getElementById('modeDirectBtn');

  // Multi-files Elements
  const multiFilesContainer = document.getElementById('multiFilesContainer');
  const fileCount = document.getElementById('fileCount');
  const fileList = document.getElementById('fileList');

  // History Elements
  const historyList = document.getElementById('historyList');
  const emptyHistory = document.getElementById('emptyHistory');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // Settings Modal Elements
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const ndusInput = document.getElementById('ndusInput');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');

  // Toast
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const toastIcon = document.getElementById('toastIcon');

  // Application State
  let playerInstance = null;
  let hlsInstance = null;
  let currentResolvedData = null;
  // উন্নতি: বড় ফাইলের জন্য ডিফল্ট এখন HLS (সেগমেন্টে ভাগ হয়ে আসে,
  // পুরো MP4 একবারে বাফার করতে হয় না, সিক করলেও দ্রুত লোড হয়)।
  // HLS ফেল করলে আগের মতো Direct Proxy-তে ফিরে যাবে।
  let currentStreamMode = 'hls';
  let currentPlayingFile = null;

  // Initialize Plyr
  const videoElement = document.getElementById('player');
  playerInstance = new Plyr(videoElement, {
    controls: [
      'play-large', 'play', 'progress', 'current-time', 'duration',
      'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
    ],
    settings: ['quality', 'speed'],
    speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
    keyboard: { focused: true, global: true },
    tooltips: { controls: true, seek: true }
  });

  // Check initial system config & history
  fetchSystemConfig();
  renderHistory();

  // --- Input Event Handlers ---
  urlInput.addEventListener('input', () => {
    if (urlInput.value.trim().length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.classList.add('hidden');
    urlInput.focus();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        clearBtn.classList.remove('hidden');
        showToast('Link pasted from clipboard', 'info');
      }
    } catch (err) {
      showToast('Could not read clipboard. Please paste manually.', 'error');
    }
  });

  demoLinkBtn.addEventListener('click', () => {
    urlInput.value = 'https://1024tera.com/sharing/link?surl=1HSEb8PZRUE7Z1Tvd3ZtT0g';
    clearBtn.classList.remove('hidden');
    urlInput.focus();
    showToast('Verified sample TeraBox link loaded!', 'info');
  });

  // --- Form Submission / Link Resolution ---
  urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const link = urlInput.value.trim();
    if (!link) return;

    hideError();
    setLoadingState(true);

    try {
      const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to process TeraBox link.');
      }

      currentResolvedData = data.data;
      displayResolvedMedia(currentResolvedData);
      saveToHistory(currentResolvedData);

      showToast('Video ready to stream!', 'success');

      // Scroll to player smoothly
      mediaSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      showError('Failed to load video', err.message || 'Please check your link and try again.');
    } finally {
      setLoadingState(false);
    }
  });

  // --- Media Display Logic ---
  function displayResolvedMedia(data) {
    if (!data) return;

    hideError();
    mediaSection.classList.remove('hidden');

    const primaryFile = (data.files && data.files.find(f => f.isVideo)) || (data.files && data.files[0]) || {
      name: data.title,
      sizeFormatted: data.sizeFormatted,
      dlink: data.dlink,
      streamProxyUrl: data.streamProxyUrl,
      downloadProxyUrl: data.downloadProxyUrl
    };

    currentPlayingFile = primaryFile;

    videoTitle.textContent = primaryFile.name || data.title || 'TeraBox Video';
    videoSize.innerHTML = `<i class="fa-solid fa-hard-drive mr-1"></i>${primaryFile.sizeFormatted || data.sizeFormatted || 'Unknown size'}`;

    // Configure Download Button
    const downloadUrl = primaryFile.downloadProxyUrl || (primaryFile.dlink ? `/api/download?url=${encodeURIComponent(primaryFile.dlink)}&filename=${encodeURIComponent(primaryFile.name)}` : '#');
    downloadBtn.href = downloadUrl;
    downloadBtn.setAttribute('download', primaryFile.name || 'video.mp4');

    // Sync button highlight
    if (currentStreamMode === 'direct') {
      modeDirectBtn.className = 'px-3 py-1.5 rounded-lg bg-accent-500 text-white font-medium transition';
      modeHlsBtn.className = 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
    } else {
      modeHlsBtn.className = 'px-3 py-1.5 rounded-lg bg-brand-600 text-white font-medium transition';
      modeDirectBtn.className = 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
    }
    // HLS ডিফল্ট হলে ডিফল্ট বোতামও সেই অনুযায়ী দেখানো হয়
    if (currentStreamMode === 'hls' && !data.m3u8Url) {
      // m3u8 না থাকলে Direct-এ ফিরে যাওয়া loadVideoSource-এই হবে
    }

    // Load Stream
    loadVideoSource(data, primaryFile, currentStreamMode);

    // Multi-files folder list
    if (data.files && data.files.length > 1) {
      multiFilesContainer.classList.remove('hidden');
      fileCount.textContent = data.files.length;
      renderFileList(data.files);
    } else {
      multiFilesContainer.classList.add('hidden');
    }
  }

  // --- Video Source Switcher (HLS vs Direct Stream Proxy) ---
  function loadVideoSource(data, file, mode) {
    // Destroy previous HLS instance if any
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    if (mode === 'direct') {
      // Direct Stream Proxy (Range request support)
      streamTypeBadge.textContent = 'Direct Proxy';
      streamTypeBadge.className = 'px-2 py-0.5 rounded bg-accent-500/20 text-accent-300 font-medium';

      const streamUrl = (file && file.streamProxyUrl) ||
        (file && file.dlink ? `/api/stream?url=${encodeURIComponent(file.dlink)}` : '') ||
        data.streamProxyUrl ||
        (data.dlink ? `/api/stream?url=${encodeURIComponent(data.dlink)}` : '');

      if (streamUrl) {
        hideError();
        // Set Plyr source cleanly
        playerInstance.source = {
          type: 'video',
          title: (file && file.name) || data.title || 'TeraBox Video',
          sources: [
            {
              src: streamUrl,
              type: 'video/mp4'
            }
          ]
        };
        playerInstance.play().catch(e => console.log('Autoplay status:', e.message));
      } else {
        showError('No stream available', 'The file does not have a valid streaming URL.');
      }
    } else if (mode === 'hls' && data.m3u8Url) {
      streamTypeBadge.textContent = 'HLS Stream';
      streamTypeBadge.className = 'px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 font-medium';

      if (Hls.isSupported()) {
        hlsInstance = new Hls({
          // উন্নতি: বড় ফাইলে বাফারিং কমাতে বাফার বড় করা হয়েছে,
          // সেগমেন্ট আগে থেকে লোড হবে, প্লেব্যাক আটকাবে কম।
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          maxBufferSize: 120 * 1000 * 1000,
          maxBufferHole: 0.5,
          startLevel: -1,
          enableWorker: true
        });

        hlsInstance.loadSource(data.m3u8Url);
        hlsInstance.attachMedia(videoElement);

        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          playerInstance.play().catch(() => {});
        });

        hlsInstance.on(Hls.Events.ERROR, (event, errorData) => {
          if (errorData.fatal) {
            console.warn('HLS fatal error, switching to direct proxy stream...', errorData);
            switchStreamMode('direct');
          }
        });
      } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS for Safari/iOS
        videoElement.src = data.m3u8Url;
        playerInstance.play().catch(() => {});
      } else {
        switchStreamMode('direct');
      }
    } else {
      switchStreamMode('direct');
    }
  }

  function switchStreamMode(newMode) {
    if (!currentResolvedData) return;
    currentStreamMode = newMode;

    if (newMode === 'hls') {
      modeHlsBtn.className = 'px-3 py-1.5 rounded-lg bg-brand-600 text-white font-medium transition';
      modeDirectBtn.className = 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
    } else {
      modeDirectBtn.className = 'px-3 py-1.5 rounded-lg bg-accent-500 text-white font-medium transition';
      modeHlsBtn.className = 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
    }

    loadVideoSource(currentResolvedData, currentPlayingFile, newMode);
  }

  modeHlsBtn.addEventListener('click', () => switchStreamMode('hls'));
  modeDirectBtn.addEventListener('click', () => switchStreamMode('direct'));

  // --- Real-player style controls: double-tap seek + big buttons ---
  const playerWrap = document.getElementById('playerWrap');
  const dtLeft = document.getElementById('dtLeft');
  const dtRight = document.getElementById('dtRight');
  const dtCenter = document.getElementById('dtCenter');
  const dtCenterText = document.getElementById('dtCenterText');
  const seekBackBtn = document.getElementById('seekBackBtn');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playPauseIcon = document.getElementById('playPauseIcon');
  const seekFwdBtn = document.getElementById('seekFwdBtn');
  const speedBtn = document.getElementById('speedBtn');
  const speedLabel = document.getElementById('speedLabel');
  const SPEEDS = [1, 1.25, 1.5, 2, 0.5, 0.75];
  let speedIndex = 0;
  let dtTimer = null;

  function showDt(el) {
    if (!el) return;
    el.classList.add('show');
    clearTimeout(dtTimer);
    dtTimer = setTimeout(() => {
      dtLeft.classList.remove('show');
      dtRight.classList.remove('show');
      dtCenter.classList.remove('show');
    }, 650);
  }

  function seekBy(seconds) {
    if (!videoElement || !isFinite(videoElement.duration)) return;
    const next = Math.min(Math.max(videoElement.currentTime + seconds, 0), videoElement.duration);
    videoElement.currentTime = next;
    showDt(seconds < 0 ? dtLeft : dtRight);
  }

  function syncPlayPause() {
    const playing = !videoElement.paused;
    playPauseIcon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    playPauseBtn.querySelector('span').textContent = playing ? 'Pause' : 'Play';
  }
  videoElement.addEventListener('play', syncPlayPause);
  videoElement.addEventListener('pause', syncPlayPause);

  if (seekBackBtn) seekBackBtn.addEventListener('click', () => seekBy(-10));
  if (seekFwdBtn) seekFwdBtn.addEventListener('click', () => seekBy(10));
  if (playPauseBtn) playPauseBtn.addEventListener('click', () => {
    if (videoElement.paused) { videoElement.play().catch(() => {}); } else { videoElement.pause(); }
  });
  if (speedBtn) speedBtn.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    const s = SPEEDS[speedIndex];
    try { playerInstance.speed = s; } catch {}
    videoElement.playbackRate = s;
    speedLabel.textContent = s + 'x';
    showToast('Speed: ' + s + 'x', 'info');
  });

  // Double-tap: বাম তৃতীয়াংশে ২ বার ট্যাপ = -10s, ডান তৃতীয়াংশে = +10s,
  // মাঝখানে ২ বার ট্যাপ = Play/Pause। Plyr-এর কন্ট্রোল বারে ট্যাপ হলে
  // এটা চলবে না, যাতে সিক বার / বোতাম ঠিকমতো কাজ করে।
  let lastTapTime = 0;
  let lastTapSide = '';
  if (playerWrap) {
    playerWrap.addEventListener('click', (e) => {
      if (e.target.closest('.plyr__controls')) return;
      const rect = playerWrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const side = x < rect.width / 3 ? 'left' : (x > rect.width * 2 / 3 ? 'right' : 'center');
      const now = Date.now();
      if (now - lastTapTime < 350 && side === lastTapSide) {
        lastTapTime = 0;
        if (side === 'left') seekBy(-10);
        else if (side === 'right') seekBy(10);
        else {
          if (videoElement.paused) { videoElement.play().catch(() => {}); dtCenterText.textContent = 'Play'; } else { videoElement.pause(); dtCenterText.textContent = 'Pause'; }
          const icon = dtCenter.querySelector('i');
          if (icon) icon.className = videoElement.paused ? 'fa-solid fa-pause' : 'fa-solid fa-play';
          showDt(dtCenter);
        }
      } else {
        lastTapTime = now;
        lastTapSide = side;
      }
    });
    // Keyboard: ArrowLeft/Right = ±10s (ডেস্কটপে)
    document.addEventListener('keydown', (e) => {
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      if (mediaSection.classList.contains('hidden')) return;
      if (e.key === 'ArrowLeft') seekBy(-10);
      if (e.key === 'ArrowRight') seekBy(10);
    });
  }

  // Fullscreen trigger
  fullscreenBtn.addEventListener('click', () => {
    playerInstance.fullscreen.toggle();
  });

  // Copy Link trigger
  copyLinkBtn.addEventListener('click', () => {
    if (!currentPlayingFile) return;
    const downloadUrl = window.location.origin + (currentPlayingFile.downloadProxyUrl || `/api/download?url=${encodeURIComponent(currentPlayingFile.dlink)}`);
    navigator.clipboard.writeText(downloadUrl).then(() => {
      showToast('Download link copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Could not copy link.', 'error');
    });
  });

  // --- Render Multi-Files List ---
  function renderFileList(files) {
    fileList.innerHTML = '';
    files.forEach((file, index) => {
      const isCurrent = currentPlayingFile && currentPlayingFile.fs_id === file.fs_id;
      const item = document.createElement('div');
      item.className = `p-3 rounded-xl border flex items-center justify-between gap-3 transition cursor-pointer ${
        isCurrent ? 'bg-brand-500/10 border-brand-500/40 text-brand-300' : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/60 text-slate-200'
      }`;

      item.innerHTML = `
        <div class="flex items-center gap-3 overflow-hidden">
          <div class="w-8 h-8 rounded-lg ${file.isVideo ? 'bg-brand-500/20 text-brand-400' : 'bg-slate-800 text-slate-400'} flex items-center justify-center shrink-0 text-xs">
            <i class="fa-solid ${file.isVideo ? 'fa-play' : 'fa-file'}"></i>
          </div>
          <div class="overflow-hidden">
            <div class="font-medium text-xs sm:text-sm truncate">${escapeHtml(file.name)}</div>
            <div class="text-[11px] text-slate-400">${file.sizeFormatted || '0 B'}</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a
            href="${file.downloadProxyUrl || '#'}"
            download="${escapeHtml(file.name)}"
            class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition"
            title="Download"
            onclick="event.stopPropagation();"
          >
            <i class="fa-solid fa-cloud-arrow-down"></i>
          </a>
        </div>
      `;

      item.addEventListener('click', () => {
        currentPlayingFile = file;
        videoTitle.textContent = file.name;
        videoSize.innerHTML = `<i class="fa-solid fa-hard-drive mr-1"></i>${file.sizeFormatted || 'Unknown size'}`;
        const downUrl = file.downloadProxyUrl || (file.dlink ? `/api/download?url=${encodeURIComponent(file.dlink)}&filename=${encodeURIComponent(file.name)}` : '#');
        downloadBtn.href = downUrl;
        downloadBtn.setAttribute('download', file.name || 'video.mp4');

        loadVideoSource(currentResolvedData, file, currentStreamMode);
        renderFileList(files);
      });

      fileList.appendChild(item);
    });
  }

  // --- Local History Management ---
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem('teraplayer_history') || '[]');
    } catch {
      return [];
    }
  }

  function saveToHistory(item) {
    if (!item) return;
    let list = getHistory();
    // Prevent duplicate entries
    list = list.filter(h => h.surl !== item.surl);
    list.unshift({
      surl: item.surl,
      title: item.title,
      sizeFormatted: item.sizeFormatted,
      thumb: item.thumb,
      date: new Date().toLocaleDateString()
    });
    // Keep max 10
    if (list.length > 10) list = list.slice(0, 10);
    localStorage.setItem('teraplayer_history', JSON.stringify(list));
    renderHistory();
  }

  function renderHistory() {
    const list = getHistory();
    historyList.innerHTML = '';

    if (list.length === 0) {
      emptyHistory.classList.remove('hidden');
      clearHistoryBtn.classList.add('hidden');
      return;
    }

    emptyHistory.classList.add('hidden');
    clearHistoryBtn.classList.remove('hidden');

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'p-3 bg-slate-900/60 border border-slate-800 rounded-xl hover:border-slate-700 transition flex items-center justify-between gap-3 group';
      card.innerHTML = `
        <div class="flex items-center gap-3 overflow-hidden cursor-pointer flex-1">
          <div class="w-12 h-10 rounded-lg bg-slate-950 flex items-center justify-center shrink-0 border border-slate-800/80 overflow-hidden relative">
            ${item.thumb ? `<img src="${item.thumb}" alt="thumb" class="w-full h-full object-cover" onerror="this.remove()">` : ''}
            <i class="fa-solid fa-play text-brand-400 text-xs ${item.thumb ? 'absolute' : ''}"></i>
          </div>
          <div class="overflow-hidden">
            <h4 class="text-xs sm:text-sm font-medium text-slate-200 group-hover:text-brand-300 transition truncate">${escapeHtml(item.title)}</h4>
            <div class="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
              <span>${item.sizeFormatted || ''}</span>
              <span>&bull;</span>
              <span>${item.date}</span>
            </div>
          </div>
        </div>
        <button class="p-2 text-slate-500 hover:text-rose-400 text-xs transition" title="Remove">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;

      // Click to re-play
      card.querySelector('.cursor-pointer').addEventListener('click', () => {
        urlInput.value = `https://1024tera.com/sharing/link?surl=${item.surl}`;
        clearBtn.classList.remove('hidden');
        urlForm.dispatchEvent(new Event('submit'));
      });

      // Remove single history
      card.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        const updated = getHistory().filter(h => h.surl !== item.surl);
        localStorage.setItem('teraplayer_history', JSON.stringify(updated));
        renderHistory();
      });

      historyList.appendChild(card);
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Clear all recent watch history?')) {
      localStorage.removeItem('teraplayer_history');
      renderHistory();
    }
  });

  // --- Settings Modal Logic ---
  openSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  cancelSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  saveSettingsBtn.addEventListener('click', async () => {
    const val = ndusInput.value.trim();
    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = 'Saving...';

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ndus: val })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Settings saved successfully!', 'success');
        settingsModal.classList.add('hidden');
        fetchSystemConfig();
      } else {
        showToast(data.error || 'Failed to save settings', 'error');
      }
    } catch (err) {
      showToast('Network error while saving settings', 'error');
    } finally {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = 'Save Settings';
    }
  });

  // Fetch server config & update badge
  async function fetchSystemConfig() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data.hasNdusCookie) {
        statusText.textContent = 'Pro Mode (Cookie Active)';
        statusBadge.className = 'hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400';
      } else {
        statusText.textContent = 'Standard Gateway';
        statusBadge.className = 'hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-400';
      }
    } catch {
      statusText.textContent = 'Offline';
    }
  }

  // --- Utility Functions ---
  function setLoadingState(loading) {
    if (loading) {
      submitBtn.disabled = true;
      btnText.textContent = 'Fetching Video...';
      btnIcon.classList.add('hidden');
      btnLoader.classList.remove('hidden');
    } else {
      submitBtn.disabled = false;
      btnText.textContent = 'Play Video';
      btnIcon.classList.remove('hidden');
      btnLoader.classList.add('hidden');
    }
  }

  // উন্নতি: সাধারণ ইংরেজি এররগুলোর বাংলা অনুবাদ দেখানো হয়,
  // যাতে ফোনে বাংলা ব্যবহারকারী বুঝতে পারেন কী ভুল হয়েছে।
  // আসল ইংরেজি মেসেজটি বন্ধনীতে রাখা হয়, ডিবাগের জন্য।
  function bnError(title, desc) {
    const map = {
      'Failed to load video': 'ভিডিও লোড হয়নি',
      'No stream available': 'স্ট্রিম পাওয়া যায়নি',
      'Failed to process TeraBox link.': 'TeraBox লিংকটি প্রসেস করা যায়নি',
      'Failed to process link': 'লিংকটি প্রসেস করা যায়নি',
      'Please enter a TeraBox link.': 'একটি TeraBox লিংক দিন',
      'No files found in share': 'এই শেয়ারে কোনো ফাইল পাওয়া যায়নি',
      'Invalid TeraBox link. Please provide a valid TeraBox share URL.': 'সঠিক TeraBox শেয়ার লিংক দিন'
    };
    const bnTitle = map[title] || title;
    const bnDesc = map[desc] || desc;
    return { bnTitle, bnDesc };
  }

  function showError(title, desc) {
    const { bnTitle, bnDesc } = bnError(title, desc);
    errorTitle.textContent = bnTitle;
    errorDesc.textContent = (bnDesc !== desc) ? `${bnDesc} (${desc})` : desc;
    errorAlert.classList.remove('hidden');
  }

  function hideError() {
    errorAlert.classList.add('hidden');
  }

  function showToast(message, type = 'success') {
    toastMsg.textContent = message;
    if (type === 'success') {
      toastIcon.className = 'fa-solid fa-circle-check text-emerald-400 text-base';
    } else if (type === 'error') {
      toastIcon.className = 'fa-solid fa-triangle-exclamation text-rose-400 text-base';
    } else {
      toastIcon.className = 'fa-solid fa-circle-info text-brand-400 text-base';
    }

    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
      toast.classList.add('translate-y-20', 'opacity-0');
    }, 3200);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
});

(function () {
  'use strict';

  /* ========================================================================
     1. DOM References & Constants
     ======================================================================== */
  const els = {
    brandResetLink: document.getElementById('brandResetLink'),
    challengeBanner: document.getElementById('challengeBanner'),
    tabReflex: document.getElementById('tabReflex'),
    tabCps: document.getElementById('tabCps'),
    arenaPad: document.getElementById('arenaPad'),
    rippleLayer: document.getElementById('rippleLayer'),
    padLiveView: document.getElementById('padLiveView'),
    padModePill: document.getElementById('padModePill'),
    padPbPill: document.getElementById('padPbPill'),
    cpsLiveCounter: document.getElementById('cpsLiveCounter'),
    padTitle: document.getElementById('padTitle'),
    padSubtitle: document.getElementById('padSubtitle'),
    padHint: document.getElementById('padHint'),
    padResultView: document.getElementById('padResultView'),
    rankBadge: document.getElementById('rankBadge'),
    scoreDisplay: document.getElementById('scoreDisplay'),
    scoreComparisonText: document.getElementById('scoreComparisonText'),
    retryPrompt: document.getElementById('retryPrompt'),
    playerNameInput: document.getElementById('playerNameInput'),
    whatsappDuelBtn: document.getElementById('whatsappDuelBtn'),
    copyDuelLinkBtn: document.getElementById('copyDuelLinkBtn'),
    downloadCardBtn: document.getElementById('downloadCardBtn'),
    shareFeedback: document.getElementById('shareFeedback'),
    confettiCanvas: document.getElementById('confettiCanvas'),
    legalModal: document.getElementById('legalModal'),
    legalModalClose: document.getElementById('legalModalClose'),
    legalModalBody: document.getElementById('legalModalBody'),
    legalTabBtns: document.querySelectorAll('[data-legal-tab]'),
    footerLegalBtns: document.querySelectorAll('[data-legal-open]')
  };

  const STORAGE_KEY = 'reflexduel_prod_v2';
  const CPS_DURATION_MS = 5000;
  const CPS_FINISH_LOCK_MS = 550;
  const AVERAGE_HUMAN_MS = 215;

  const state = {
    mode: 'reflex', // 'reflex' | 'cps'
    phase: 'idle',  // 'idle' | 'waiting' | 'go' | 'early' | 'cps' | 'result'
    waitTimerId: null,
    paintRafId: null,
    goTimestamp: 0,
    cpsStartTimestamp: 0,
    cpsRafId: null,
    cpsBackupTimerId: null,
    cpsTaps: 0,
    cpsCooldownUntil: 0,
    latestScore: { reflex: null, cps: null },
    bestScore: { reflex: null, cps: null },
    incomingDuel: null,
    duelOutcome: null, // null | 'won' | 'lost' | 'tied'
    duelDiffText: '',
    lastFocusedElement: null
  };

  /* ========================================================================
     2. GA4 / GTM DataLayer Helper
     ======================================================================== */
  function trackEvent(eventName, params) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
    } catch (_) {
      // Ignore analytics errors
    }
  }

  /* ========================================================================
     3. Persistence, Haptics & Tier Engine
     ======================================================================== */
  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      if (typeof data.name === 'string' && data.name.trim()) {
        els.playerNameInput.value = data.name.trim().slice(0, 20);
      }
      if (typeof data.bestReflex === 'number' && data.bestReflex > 0) {
        state.bestScore.reflex = data.bestReflex;
      }
      if (typeof data.bestCps === 'number' && data.bestCps > 0) {
        state.bestScore.cps = data.bestCps;
      }
    } catch (_) {
      // Ignore storage errors
    }
  }

  function persistState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          name: els.playerNameInput.value.trim().slice(0, 20),
          bestReflex: state.bestScore.reflex,
          bestCps: state.bestScore.cps
        })
      );
    } catch (_) {
      // Ignore storage errors
    }
  }

  function vibratePattern(pattern) {
    try {
      if (navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch (_) {
      // Ignore unsupported devices
    }
  }

  function getGlobalTier(mode, score) {
    if (mode === 'reflex') {
      if (score < 165) return { pct: 1, label: '⚡ TOP 1% • RADIANT CYBORG' };
      if (score <= 190) return { pct: 5, label: '🏆 TOP 5% • PRO ESPORTS TIER' };
      if (score <= 225) return { pct: 22, label: '🔥 TOP 22% • SHARP REFLEX' };
      if (score <= 270) return { pct: 50, label: '⚡ AVERAGE HUMAN' };
      return { pct: 80, label: '🐢 SLEEPY MODE' };
    }

    if (score >= 12.0) return { pct: 1, label: '⚡ TOP 1% • AUTO-CLICKER HANDS' };
    if (score >= 9.0) return { pct: 8, label: '🏆 TOP 8% • SWEATY PVPER' };
    if (score >= 6.5) return { pct: 28, label: '🔥 FAST FINGERS' };
    return { pct: 65, label: '⚡ WARMING UP' };
  }

  function formatScore(mode, score) {
    return mode === 'reflex' ? `${Math.round(score)} ms` : `${Number(score).toFixed(1)} CPS`;
  }

  function getModeDisplayName(mode) {
    return mode === 'reflex' ? 'Reaction Time' : '5-Second CPS Burst';
  }

  function updatePbBadge() {
    const pb = state.bestScore[state.mode];
    if (pb !== null) {
      els.padPbPill.textContent = `PB: ${formatScore(state.mode, pb)}`;
      els.padPbPill.classList.remove('hidden');
    } else {
      els.padPbPill.classList.add('hidden');
    }
  }

  /* ========================================================================
     4. Zero-Server URL Duel Token (?duel=...)
     ======================================================================== */
  function encodeDuelToken(payload) {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeDuelToken(token) {
    if (!token || typeof token !== 'string' || token.length > 320) return null;
    try {
      let b64 = token.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const raw = JSON.parse(new TextDecoder().decode(bytes));
      if (!raw || typeof raw !== 'object') return null;

      const rawMode = raw.m || raw.mode;
      const mode = rawMode === 'cps' ? 'cps' : (rawMode === 'reflex' || rawMode === 'reaction') ? 'reflex' : null;
      const rawScore = Number(raw.s !== undefined ? raw.s : raw.score);
      const cleanName = String(raw.n || raw.name || 'Challenger').trim().slice(0, 20) || 'Challenger';

      if (!mode || !Number.isFinite(rawScore) || rawScore <= 0) return null;
      const score = mode === 'reflex' ? Math.round(rawScore) : Number(rawScore.toFixed(1));
      return { n: cleanName, m: mode, s: score };
    } catch (_) {
      return null;
    }
  }

  function buildShareableDuelUrl(mode, score) {
    const playerName = els.playerNameInput.value.trim().slice(0, 20) || 'Challenger';
    const normalizedScore = mode === 'reflex' ? Math.round(score) : Number(score.toFixed(1));
    const token = encodeDuelToken({ n: playerName, m: mode, s: normalizedScore });
    const base = window.location.href.split('?')[0].split('#')[0];
    return `${base}?duel=${token}`;
  }

  function renderChallengeBanner(status, diffText) {
    const duel = state.incomingDuel;
    if (!duel) {
      els.challengeBanner.classList.add('hidden');
      return;
    }

    els.challengeBanner.classList.remove('hidden', 'is-victory', 'is-behind');
    const targetText = formatScore(duel.m, duel.s);
    const modeName = getModeDisplayName(duel.m);

    if (status === 'won') {
      els.challengeBanner.classList.add('is-victory');
      els.challengeBanner.textContent = `👑 VICTORY! You beat ${duel.n} by ${diffText}! Send your winning link back!`;
    } else if (status === 'lost') {
      els.challengeBanner.classList.add('is-behind');
      els.challengeBanner.textContent = `😤 So close! ${duel.n} is still ahead by ${diffText}. Tap to try again!`;
    } else if (status === 'tied') {
      els.challengeBanner.textContent = `⚔️ Tied with ${duel.n} at ${targetText}! One more try to take the crown!`;
    } else {
      els.challengeBanner.textContent = `⚔️ CHALLENGE ACTIVE: Beat ${duel.n}'s ${targetText} in ${modeName}!`;
    }
  }

  function initDuelFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('duel');
    if (!token) return;

    const decoded = decodeDuelToken(token);
    if (!decoded) return;

    state.incomingDuel = decoded;
    state.duelOutcome = null;
    state.duelDiffText = '';
    renderChallengeBanner('pending');

    if (decoded.m !== state.mode) {
      switchMode(decoded.m);
    }
  }

  /* ========================================================================
     5. Arena Pad State Transitions
     ======================================================================== */
  function clearActiveTimers() {
    if (state.waitTimerId !== null) {
      clearTimeout(state.waitTimerId);
      state.waitTimerId = null;
    }
    if (state.paintRafId !== null) {
      cancelAnimationFrame(state.paintRafId);
      state.paintRafId = null;
    }
    if (state.cpsRafId !== null) {
      cancelAnimationFrame(state.cpsRafId);
      state.cpsRafId = null;
    }
    if (state.cpsBackupTimerId !== null) {
      clearTimeout(state.cpsBackupTimerId);
      state.cpsBackupTimerId = null;
    }
  }

  function applyPadStateClass(cls) {
    els.arenaPad.classList.remove(
      'state-idle',
      'state-waiting',
      'state-go',
      'state-early',
      'state-cps',
      'state-result'
    );
    els.arenaPad.classList.add(cls);
  }

  function showLiveView() {
    els.padResultView.classList.add('hidden');
    els.padLiveView.classList.remove('hidden');
  }

  function resetPadToIdle() {
    clearActiveTimers();
    state.phase = 'idle';
    applyPadStateClass('state-idle');
    showLiveView();
    els.cpsLiveCounter.classList.add('hidden');
    els.padTitle.classList.remove('hidden');

    if (state.mode === 'reflex') {
      els.padModePill.textContent = 'REACTION TIME';
      els.padTitle.textContent = '⚡ Tap Anywhere to Start';
      els.padSubtitle.textContent = 'Tap as soon as the red pad flashes bright emerald green.';
      els.padHint.textContent = 'Zero-lag tap or press Spacebar';
    } else {
      els.padModePill.textContent = '5-SEC CPS BURST';
      els.padTitle.textContent = '⚡ Tap Anywhere to Start';
      els.padSubtitle.textContent = 'First tap starts a 5.0-second sprint. Tap as fast as possible!';
      els.padHint.textContent = 'Tap rapidly with 1 or 2 fingers';
    }
    updatePbBadge();
  }

  /* ========================================================================
     6. Mode 1: Reaction Time Engine
     ======================================================================== */
  function startReflexWaiting() {
    clearActiveTimers();
    state.phase = 'waiting';
    applyPadStateClass('state-waiting');
    showLiveView();
    els.cpsLiveCounter.classList.add('hidden');
    els.padTitle.classList.remove('hidden');

    els.padModePill.textContent = 'WAIT • ARMED';
    els.padTitle.textContent = 'Wait for Green...';
    els.padSubtitle.textContent = 'Hold steady — tapping before green triggers a fault.';
    els.padHint.textContent = 'Focus on the center';

    trackEvent('test_started', { mode: 'reflex' });

    const delayMs = 1500 + Math.random() * 2700;
    state.waitTimerId = setTimeout(() => {
      if (state.mode !== 'reflex' || state.phase !== 'waiting') return;
      state.phase = 'go';
      applyPadStateClass('state-go');
      els.padModePill.textContent = 'GO!';
      els.padTitle.textContent = 'TAP NOW!';
      els.padSubtitle.textContent = 'Strike as fast as you can!';
      els.padHint.textContent = 'Timing active...';
      state.goTimestamp = performance.now();

      state.paintRafId = requestAnimationFrame(() => {
        if (state.phase === 'go') {
          state.goTimestamp = performance.now();
        }
        state.paintRafId = null;
      });
    }, delayMs);
  }

  function triggerReflexEarlyFault() {
    clearActiveTimers();
    state.phase = 'early';
    applyPadStateClass('state-early');
    showLiveView();
    els.padModePill.textContent = 'FALSE START';
    els.padTitle.textContent = '⚠️ Too Early! Tap to try again';
    els.padSubtitle.textContent = 'Wait for the pad to flash emerald green before tapping.';
    els.padHint.textContent = 'Tap anywhere to retry';
  }

  function finishReflexRound(tapTimestamp) {
    clearActiveTimers();
    const deltaMs = Math.max(1, Math.round(tapTimestamp - state.goTimestamp));
    completeScoreRound('reflex', deltaMs);
  }

  /* ========================================================================
     7. Mode 2: 5-Second CPS Burst Engine
     ======================================================================== */
  function spawnTapRipple(clientX, clientY) {
    if (els.rippleLayer.childElementCount > 24) {
      els.rippleLayer.removeChild(els.rippleLayer.firstElementChild);
    }
    const rect = els.arenaPad.getBoundingClientRect();
    const x = typeof clientX === 'number' ? clientX - rect.left : rect.width / 2;
    const y = typeof clientY === 'number' ? clientY - rect.top : rect.height / 2;

    const ripple = document.createElement('span');
    ripple.className = 'tap-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    els.rippleLayer.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  }

  function startCpsBurst(clientX, clientY) {
    clearActiveTimers();
    state.phase = 'cps';
    state.cpsTaps = 1;
    state.cpsStartTimestamp = performance.now();

    applyPadStateClass('state-cps');
    showLiveView();
    els.padTitle.classList.add('hidden');
    els.cpsLiveCounter.classList.remove('hidden');
    els.cpsLiveCounter.textContent = '1';

    els.padModePill.textContent = '5.0s LEFT';
    els.padSubtitle.textContent = 'Keep tapping! Burst ends at 0.0s';
    els.padHint.textContent = 'Go! Go! Go!';

    spawnTapRipple(clientX, clientY);
    trackEvent('test_started', { mode: 'cps' });

    const loop = () => {
      if (state.mode !== 'cps' || state.phase !== 'cps') return;
      const elapsed = performance.now() - state.cpsStartTimestamp;
      const leftSec = Math.max(0, (CPS_DURATION_MS - elapsed) / 1000);
      els.padModePill.textContent = `${leftSec.toFixed(1)}s LEFT`;

      if (elapsed >= CPS_DURATION_MS) {
        finishCpsBurst();
        return;
      }
      state.cpsRafId = requestAnimationFrame(loop);
    };

    state.cpsRafId = requestAnimationFrame(loop);
    state.cpsBackupTimerId = setTimeout(() => {
      if (state.mode === 'cps' && state.phase === 'cps') {
        finishCpsBurst();
      }
    }, CPS_DURATION_MS + 40);
  }

  function incrementCpsTap(clientX, clientY) {
    state.cpsTaps += 1;
    els.cpsLiveCounter.textContent = String(state.cpsTaps);
    spawnTapRipple(clientX, clientY);
  }

  function finishCpsBurst() {
    clearActiveTimers();
    state.cpsCooldownUntil = performance.now() + CPS_FINISH_LOCK_MS;
    const cpsScore = Number((state.cpsTaps / 5).toFixed(1));
    completeScoreRound('cps', cpsScore);
  }

  /* ========================================================================
     8. Unified Score Completion, Duel Evaluation & Result Display
     ======================================================================== */
  function completeScoreRound(mode, score) {
    state.phase = 'result';
    state.latestScore[mode] = score;

    const prevBest = state.bestScore[mode];
    const isNewBest =
      prevBest === null || (mode === 'reflex' ? score < prevBest : score > prevBest);

    if (isNewBest) {
      state.bestScore[mode] = score;
      persistState();
    }

    const tier = getGlobalTier(mode, score);
    let comparisonText = '';
    let duelStatus = 'none';

    const duel = state.incomingDuel;
    if (duel && duel.m === mode) {
      if (mode === 'reflex') {
        if (score < duel.s) {
          const diff = `${Math.round(duel.s - score)} ms`;
          duelStatus = 'won';
          state.duelOutcome = 'won';
          state.duelDiffText = diff;
          comparisonText = `👑 VICTORY! You beat ${duel.n} by ${diff}!`;
          renderChallengeBanner('won', diff);
          launchConfetti();
        } else if (score > duel.s) {
          const diff = `${Math.round(score - duel.s)} ms`;
          duelStatus = 'lost';
          state.duelOutcome = 'lost';
          state.duelDiffText = diff;
          comparisonText = `😤 So close! ${duel.n} is still ahead by ${diff}. Tap to try again!`;
          renderChallengeBanner('lost', diff);
        } else {
          duelStatus = 'tied';
          state.duelOutcome = 'tied';
          comparisonText = `⚔️ Exact tie with ${duel.n}! Tap again to break the tie!`;
          renderChallengeBanner('tied');
        }
      } else {
        if (score > duel.s) {
          const diff = `${(score - duel.s).toFixed(1)} CPS`;
          duelStatus = 'won';
          state.duelOutcome = 'won';
          state.duelDiffText = diff;
          comparisonText = `👑 VICTORY! You beat ${duel.n} by ${diff}!`;
          renderChallengeBanner('won', diff);
          launchConfetti();
        } else if (score < duel.s) {
          const diff = `${(duel.s - score).toFixed(1)} CPS`;
          duelStatus = 'lost';
          state.duelOutcome = 'lost';
          state.duelDiffText = diff;
          comparisonText = `😤 So close! ${duel.n} is still ahead by ${diff}. Tap to try again!`;
          renderChallengeBanner('lost', diff);
        } else {
          duelStatus = 'tied';
          state.duelOutcome = 'tied';
          comparisonText = `⚔️ Exact tie with ${duel.n}! Tap again to take the lead!`;
          renderChallengeBanner('tied');
        }
      }
    } else if (mode === 'reflex') {
      const deltaVsAvg = Math.round(AVERAGE_HUMAN_MS - score);
      if (deltaVsAvg > 0) {
        comparisonText = `${deltaVsAvg} ms faster than the average human!`;
      } else if (deltaVsAvg === 0) {
        comparisonText = 'Right on the average human benchmark (215 ms)!';
      } else {
        comparisonText = `${Math.abs(deltaVsAvg)} ms slower than the 215 ms benchmark — go again!`;
      }
    } else {
      comparisonText = `${state.cpsTaps} total taps in 5.0 seconds (${tier.pct <= 10 ? 'elite speed' : 'keep pushing!'})`;
    }

    if (isNewBest || duelStatus === 'won') {
      vibratePattern([70, 40, 110]);
    }

    applyPadStateClass('state-result');
    els.padLiveView.classList.add('hidden');
    els.padResultView.classList.remove('hidden');

    els.rankBadge.textContent = tier.label;
    els.scoreDisplay.textContent = formatScore(mode, score);
    els.scoreComparisonText.textContent = comparisonText;
    els.retryPrompt.textContent = '↻ Tap here to try again';
    updatePbBadge();

    trackEvent('score_recorded', {
      mode,
      score,
      tier: tier.label,
      is_personal_best: isNewBest,
      duel_outcome: duelStatus
    });
  }

  /* ========================================================================
     9. Input Listeners (Zero-Lag PointerDown + Keyboard Space)
     ======================================================================== */
  function handleArenaPress(clientX, clientY) {
    const now = performance.now();
    vibratePattern(10);

    if (state.mode === 'reflex') {
      if (state.phase === 'idle' || state.phase === 'early' || state.phase === 'result') {
        startReflexWaiting();
      } else if (state.phase === 'waiting') {
        triggerReflexEarlyFault();
      } else if (state.phase === 'go') {
        finishReflexRound(now);
      }
      return;
    }

    if (state.phase === 'result' && now < state.cpsCooldownUntil) {
      return;
    }

    if (state.phase === 'idle' || state.phase === 'result') {
      startCpsBurst(clientX, clientY);
    } else if (state.phase === 'cps') {
      incrementCpsTap(clientX, clientY);
    }
  }

  els.arenaPad.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    handleArenaPress(e.clientX, e.clientY);
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (!els.legalModal.classList.contains('hidden')) {
      if (e.key === 'Escape') closeLegalModal();
      return;
    }

    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

    if (e.code === 'Space') {
      if (activeTag === 'BUTTON' || activeTag === 'SUMMARY') return;
      e.preventDefault();
      handleArenaPress();
    } else if (e.code === 'Enter' && document.activeElement === els.arenaPad) {
      e.preventDefault();
      handleArenaPress();
    }
  });

  function switchMode(nextMode) {
    if (state.mode === nextMode) return;
    state.mode = nextMode;

    const isReflex = nextMode === 'reflex';
    els.tabReflex.classList.toggle('is-active', isReflex);
    els.tabReflex.setAttribute('aria-selected', String(isReflex));
    els.tabCps.classList.toggle('is-active', !isReflex);
    els.tabCps.setAttribute('aria-selected', String(!isReflex));

    resetPadToIdle();
  }

  els.tabReflex.addEventListener('click', () => switchMode('reflex'));
  els.tabCps.addEventListener('click', () => switchMode('cps'));
  els.playerNameInput.addEventListener('input', persistState);

  els.brandResetLink.addEventListener('click', (e) => {
    e.preventDefault();
    state.incomingDuel = null;
    state.duelOutcome = null;
    state.duelDiffText = '';
    renderChallengeBanner('clear');
    try {
      if (window.location.search) {
        const cleanUrl = window.location.href.split('?')[0].split('#')[0];
        window.history.replaceState({}, '', cleanUrl);
      }
    } catch (_) {
      // Ignore file:// history limits
    }
    resetPadToIdle();
  });

  /* ========================================================================
     10. Viral Sharing & 1080x1920 9:16 Story PNG Card Export
     ======================================================================== */
  let feedbackTimeoutId = null;
  function showShareFeedback(msg, isWarn) {
    els.shareFeedback.textContent = msg;
    els.shareFeedback.classList.remove('hidden', 'is-warn');
    if (isWarn) els.shareFeedback.classList.add('is-warn');

    clearTimeout(feedbackTimeoutId);
    feedbackTimeoutId = setTimeout(() => {
      els.shareFeedback.classList.add('hidden');
    }, 2800);
  }

  function getShareableScore() {
    const mode = state.mode;
    const score = state.latestScore[mode] !== null ? state.latestScore[mode] : state.bestScore[mode];
    if (score === null) {
      showShareFeedback('Complete 1 round first to lock in your score!', true);
      els.arenaPad.focus({ preventScroll: true });
      return null;
    }
    return { mode, score };
  }

  els.whatsappDuelBtn.addEventListener('click', () => {
    const data = getShareableScore();
    if (!data) return;

    const { mode, score } = data;
    const tier = getGlobalTier(mode, score);
    const duelUrl = buildShareableDuelUrl(mode, score);
    const formattedScore = formatScore(mode, score);

    const msg =
      mode === 'reflex'
        ? `⚡ I just hit ${formattedScore} on ReflexDuel (${tier.label})! Think you're faster? Beat my score here: ${duelUrl}`
        : `⚡ I just smashed ${formattedScore} on ReflexDuel (${tier.label})! Think you can tap faster? Beat my score here: ${duelUrl}`;

    const waLink = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(waLink, '_blank', 'noopener,noreferrer');

    trackEvent('duel_link_shared', { method: 'whatsapp', mode, score });
    showShareFeedback('Opening WhatsApp duel invite...');
  });

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  els.copyDuelLinkBtn.addEventListener('click', async () => {
    const data = getShareableScore();
    if (!data) return;

    const duelUrl = buildShareableDuelUrl(data.mode, data.score);
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(duelUrl);
        copied = true;
      }
    } catch (_) {
      copied = false;
    }

    if (!copied) copied = fallbackCopy(duelUrl);

    if (copied) {
      const prevText = els.copyDuelLinkBtn.textContent;
      els.copyDuelLinkBtn.textContent = '✅ Duel Link Copied!';
      trackEvent('duel_link_shared', { method: 'copy', mode: data.mode, score: data.score });
      showShareFeedback('Duel link copied — paste in Discord, iMessage, IG or Telegram!');
      setTimeout(() => {
        els.copyDuelLinkBtn.textContent = prevText;
      }, 2200);
    } else {
      showShareFeedback('Clipboard unavailable on this browser.', true);
    }
  });

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function renderAndDownloadStoryPng(mode, score) {
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {
        // Proceed with fallback fonts
      }
    }

    const W = 1080;
    const H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Carbon Canvas
    ctx.fillStyle = '#0B0D10';
    ctx.fillRect(0, 0, W, H);

    // Emerald & Amber Ambient Glows
    const gTop = ctx.createRadialGradient(W / 2, 340, 40, W / 2, 340, 620);
    gTop.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
    gTop.addColorStop(1, 'rgba(11, 13, 16, 0)');
    ctx.fillStyle = gTop;
    ctx.fillRect(0, 0, W, 1100);

    const gBot = ctx.createRadialGradient(W / 2, 1620, 40, W / 2, 1620, 560);
    gBot.addColorStop(0, 'rgba(245, 158, 11, 0.16)');
    gBot.addColorStop(1, 'rgba(11, 13, 16, 0)');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, 900, W, 1020);

    // Precision Dot Matrix
    ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
    for (let x = 60; x < W; x += 48) {
      for (let y = 60; y < H; y += 48) {
        ctx.fillRect(x, y, 3, 3);
      }
    }

    // Header Branding
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 64px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('ReflexDuel ⚡', W / 2, 190);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.fillText('GLOBAL MILLISECOND & CPS ARENA', W / 2, 244);

    // Main Elevated Slate Card
    const cardX = 80;
    const cardY = 320;
    const cardW = W - 160;
    const cardH = 1170;

    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 52);
    ctx.fillStyle = '#14181F';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
    ctx.stroke();

    // Mode Badge
    const modeTitle = mode === 'reflex' ? 'REACTION TIME TEST (MS)' : '5-SECOND CPS BURST';
    drawRoundedRect(ctx, W / 2 - 260, cardY + 78, 520, 62, 31);
    ctx.fillStyle = '#1B212B';
    ctx.fill();
    ctx.strokeStyle = '#2E3748';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#34D399';
    ctx.font = '600 23px "JetBrains Mono", monospace';
    ctx.fillText(modeTitle, W / 2, cardY + 118);

    // Player Name
    const playerName = (els.playerNameInput.value.trim().slice(0, 20) || 'CHALLENGER').toUpperCase();
    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 30px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`PLAYER: ${playerName}`, W / 2, cardY + 220);

    // Giant Monospace Score
    const scoreText = mode === 'reflex' ? `${Math.round(score)} ms` : `${Number(score).toFixed(1)} CPS`;
    ctx.save();
    ctx.shadowColor = 'rgba(16, 185, 129, 0.45)';
    ctx.shadowBlur = 45;
    ctx.fillStyle = '#34D399';
    ctx.font = '700 154px "JetBrains Mono", monospace';
    ctx.fillText(scoreText, W / 2, cardY + 465);
    ctx.restore();

    // Global Rank Badge
    const tier = getGlobalTier(mode, score);
    drawRoundedRect(ctx, cardX + 70, cardY + 565, cardW - 140, 88, 44);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#FBBF24';
    ctx.font = '700 30px "JetBrains Mono", monospace';
    ctx.fillText(tier.label, W / 2, cardY + 620);

    // Challenger vs Winner Banner (if active duel)
    const boxY = cardY + 725;
    if (state.incomingDuel && state.incomingDuel.m === mode) {
      const won = state.duelOutcome === 'won';
      drawRoundedRect(ctx, cardX + 70, boxY, cardW - 140, 175, 28);
      ctx.fillStyle = won ? 'rgba(16, 185, 129, 0.14)' : '#0E1116';
      ctx.fill();
      ctx.strokeStyle = won ? '#10B981' : '#222936';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = won ? '#34D399' : '#F59E0B';
      ctx.font = '700 28px "JetBrains Mono", monospace';
      const duelHeading = won ? '👑 1V1 DUEL VICTORY' : '⚔️ 1V1 CHALLENGER TARGET';
      ctx.fillText(duelHeading, W / 2, boxY + 62);

      ctx.fillStyle = '#F8FAFC';
      ctx.font = '600 32px "Space Grotesk", system-ui, sans-serif';
      const duelLine = won
        ? `${playerName} BEAT ${state.incomingDuel.n.toUpperCase()} BY ${state.duelDiffText}`
        : `TARGET: ${formatScore(mode, state.incomingDuel.s)} (${state.incomingDuel.n.toUpperCase()})`;
      ctx.fillText(duelLine, W / 2, boxY + 124);
    } else {
      const pb = state.bestScore[mode] !== null ? state.bestScore[mode] : score;
      const boxW = (cardW - 140 - 28) / 2;

      drawRoundedRect(ctx, cardX + 70, boxY, boxW, 175, 28);
      ctx.fillStyle = '#0E1116';
      ctx.fill();
      ctx.strokeStyle = '#222936';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.font = '600 22px "JetBrains Mono", monospace';
      ctx.fillText('PERSONAL BEST', cardX + 70 + boxW / 2, boxY + 62);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '700 44px "JetBrains Mono", monospace';
      ctx.fillText(formatScore(mode, pb), cardX + 70 + boxW / 2, boxY + 125);

      const rightX = cardX + 70 + boxW + 28;
      drawRoundedRect(ctx, rightX, boxY, boxW, 175, 28);
      ctx.fillStyle = '#0E1116';
      ctx.fill();
      ctx.strokeStyle = '#222936';
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.font = '600 22px "JetBrains Mono", monospace';
      ctx.fillText('GLOBAL TIER', rightX + boxW / 2, boxY + 62);
      ctx.fillStyle = '#34D399';
      ctx.font = '700 44px "JetBrains Mono", monospace';
      ctx.fillText(`TOP ${tier.pct}%`, rightX + boxW / 2, boxY + 125);
    }

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 34px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('CAN YOU BEAT THIS SCORE?', W / 2, cardY + 1045);

    // Required Footer Callout
    ctx.fillStyle = '#10B981';
    ctx.font = '700 34px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('Test your reflex at reflex-duel.vercel.app', W / 2, 1650);

    ctx.fillStyle = '#64748B';
    ctx.font = '500 24px "JetBrains Mono", monospace';
    ctx.fillText('ZERO-LAG REACTION & 5S CPS ARENA', W / 2, 1705);

    const slug = mode === 'reflex' ? `${Math.round(score)}ms` : `${Number(score).toFixed(1)}cps`;
    const fileName = `reflexduel-${mode}-${slug}.png`;

    await new Promise((resolve) => {
      const triggerDownload = (href, revokeAfter) => {
        const a = document.createElement('a');
        a.href = href;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (revokeAfter) setTimeout(() => URL.revokeObjectURL(href), 1000);
        resolve();
      };

      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => {
          if (blob) triggerDownload(URL.createObjectURL(blob), true);
          else triggerDownload(canvas.toDataURL('image/png'), false);
        }, 'image/png');
      } else {
        triggerDownload(canvas.toDataURL('image/png'), false);
      }
    });
  }

  els.downloadCardBtn.addEventListener('click', async () => {
    const data = getShareableScore();
    if (!data) return;

    const origLabel = els.downloadCardBtn.textContent;
    els.downloadCardBtn.textContent = '⏳ Rendering 9:16...';
    els.downloadCardBtn.disabled = true;

    try {
      await renderAndDownloadStoryPng(data.mode, data.score);
      trackEvent('story_png_downloaded', { mode: data.mode, score: data.score });
      showShareFeedback('1080×1920 Story PNG saved!');
    } catch (_) {
      showShareFeedback('Could not generate Story PNG on this browser.', true);
    } finally {
      els.downloadCardBtn.textContent = origLabel;
      els.downloadCardBtn.disabled = false;
    }
  });

  /* ========================================================================
     11. Confetti Celebration Canvas
     ======================================================================== */
  let confettiRafId = null;
  function launchConfetti() {
    const canvas = els.confettiCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (confettiRafId) cancelAnimationFrame(confettiRafId);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;

    const colors = ['#10B981', '#34D399', '#F59E0B', '#FBBF24', '#F8FAFC', '#F43F5E'];
    const particles = [];
    for (let i = 0; i < 90; i += 1) {
      const angle = Math.random() * Math.PI + Math.PI;
      const speed = 6 + Math.random() * 11;
      particles.push({
        x: window.innerWidth * (0.25 + Math.random() * 0.5),
        y: window.innerHeight * 0.42,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 6,
        vy: Math.sin(angle) * speed - 4,
        size: 6 + Math.random() * 6,
        rot: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 14,
        color: colors[i % colors.length],
        alpha: 1
      });
    }

    const step = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      let alive = 0;
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.vy += 0.34;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vRot;
        if (p.y > window.innerHeight * 0.8) p.alpha -= 0.035;
        if (p.alpha <= 0 || p.y > window.innerHeight + 30) continue;

        alive += 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size * 0.55);
        ctx.restore();
      }

      if (alive > 0) {
        confettiRafId = requestAnimationFrame(step);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        confettiRafId = null;
      }
    };

    confettiRafId = requestAnimationFrame(step);
  }

  /* ========================================================================
     12. Legal & Compliance Modal (Privacy + Google DART Cookie + Mailto Form)
     ======================================================================== */
  const LEGAL_SECTIONS = {
    privacy: `
      <h3>Privacy Policy &amp; Google DART Cookie Disclosure</h3>
      <p><strong>Zero-Backend Client Processing:</strong> ReflexDuel runs entirely inside your web browser. We do not collect, transmit, or store your gamer tag, reaction time scores, or CPS metrics on any backend database. Your optional display name and personal best records remain strictly inside your device's <code>localStorage</code>.</p>
      <p><strong>URL Challenge Tokens:</strong> When you generate a <code>?duel=</code> link, your entered nickname, game mode, and score are Base64-encoded directly into the shareable query string.</p>
      <p><strong>Google AdSense, Third-Party Cookies &amp; Google DART Cookie:</strong></p>
      <ul>
        <li>Third-party vendors, including Google, use cookies to serve advertisements based on a user's prior visits to ReflexDuel or other websites across the Internet.</li>
        <li>Google's use of advertising cookies, including the <strong>Google DART cookie</strong>, enables Google and its partners to serve relevant ads based on your visit to this site and/or other sites on the Internet.</li>
        <li>Users may opt out of personalized advertising by visiting <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" style="color:#34D399;">adssettings.google.com</a>, or opt out of third-party vendor cookies for personalized ads at <a href="https://www.aboutads.info" target="_blank" rel="noopener noreferrer" style="color:#34D399;">aboutads.info</a>.</li>
      </ul>
      <p><strong>Google Analytics 4 (GA4) &amp; GTM:</strong> ReflexDuel sends anonymized interaction events (such as <code>test_started</code>, <code>score_recorded</code>, <code>duel_link_shared</code>, and <code>story_png_downloaded</code>) via Google Tag Manager to understand feature usage without collecting personally identifiable information.</p>
    `,
    terms: `
      <h3>Terms of Use</h3>
      <p>By accessing ReflexDuel (<code>reflex-duel.vercel.app</code>), you agree to use this web application solely for personal reflex training, lawful entertainment, and friendly challenges.</p>
      <ul>
        <li><strong>Fair Play:</strong> Duel links are client-side challenge tokens intended for honest competition. Using auto-clickers, macros, or automated scripts undermines fair play.</li>
        <li><strong>As-Is Provision:</strong> ReflexDuel is provided on an "as-is" and "as-available" basis without guarantees of uninterrupted uptime or hardware-level calibration.</li>
        <li><strong>Intellectual Property:</strong> Source code, interface design, and editorial benchmarks belong to ReflexDuel and may not be republished verbatim without permission.</li>
      </ul>
    `,
    disclaimer: `
      <h3>Hardware Latency &amp; Health Disclaimer</h3>
      <p><strong>Measurement Variance:</strong> ReflexDuel measures timing with <code>requestAnimationFrame</code> and <code>performance.now()</code>, yet total scores reflect combined biological reflex plus display refresh intervals (60Hz–240Hz+), GPU compositing, and touchscreen/mouse polling latency.</p>
      <p><strong>Ergonomic Safety:</strong> High-frequency clicking styles such as jitter clicking and butterfly clicking exert repetitive strain on fingers and tendons. Pace your sessions, stretch regularly, and stop immediately if you notice discomfort.</p>
    `,
    contact: `
      <h3>Contact &amp; Report Abuse</h3>
      <p>Need to report a misleading duel link, browser timing issue, or privacy/AdSense concern? Send a message directly using the form below or email <code>support@reflex-duel.vercel.app</code>.</p>
      <form class="report-form" id="reportAbuseForm">
        <input type="text" class="report-input" id="reportSubject" maxlength="80" required placeholder="Subject (e.g. Bug Report / Abuse / Ad Feedback)" />
        <textarea class="report-textarea" id="reportDetails" maxlength="600" required placeholder="Describe the issue, device/browser, or duel URL..."></textarea>
        <button type="submit" class="report-submit">✉️ Send Report via Email Client</button>
      </form>
    `
  };

  function bindReportForm() {
    const form = document.getElementById('reportAbuseForm');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const subject = document.getElementById('reportSubject').value.trim() || 'ReflexDuel Inquiry';
      const body = document.getElementById('reportDetails').value.trim();
      const mailto = `mailto:support@reflex-duel.vercel.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
    });
  }

  function selectLegalTab(tabKey) {
    const key = LEGAL_SECTIONS[tabKey] ? tabKey : 'privacy';
    els.legalTabBtns.forEach((btn) => {
      const active = btn.getAttribute('data-legal-tab') === key;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    els.legalModalBody.innerHTML = LEGAL_SECTIONS[key];
    if (key === 'contact') bindReportForm();
  }

  function openLegalModal(tabKey) {
    state.lastFocusedElement = document.activeElement;
    selectLegalTab(tabKey);
    els.legalModal.classList.remove('hidden');
    els.legalModalClose.focus();
  }

  function closeLegalModal() {
    els.legalModal.classList.add('hidden');
    if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === 'function') {
      state.lastFocusedElement.focus();
    }
  }

  els.footerLegalBtns.forEach((btn) => {
    btn.addEventListener('click', () => openLegalModal(btn.getAttribute('data-legal-open')));
  });

  els.legalTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => selectLegalTab(btn.getAttribute('data-legal-tab')));
  });

  els.legalModalClose.addEventListener('click', closeLegalModal);
  els.legalModal.addEventListener('click', (e) => {
    if (e.target === els.legalModal) closeLegalModal();
  });

  /* ========================================================================
     13. Service Worker Registration (Network-First) & Boot
     ======================================================================== */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.protocol === 'http:')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }

  loadSavedState();
  resetPadToIdle();
  initDuelFromUrl();
  registerServiceWorker();
})();

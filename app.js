(function () {
  'use strict';

  /* ========================================================================
     1. DOM References & Constants
     ======================================================================== */
  const els = {
    body: document.body,
    brandResetLink: document.getElementById('brandResetLink'),
    streakBadgeText: document.getElementById('streakBadgeText'),
    challengeBanner: document.getElementById('challengeBanner'),
    modeTabs: Array.from(document.querySelectorAll('.mode-tab[data-mode]')),
    tabReflex: document.getElementById('tabReflex'),
    tabCps: document.getElementById('tabCps'),
    tabSound: document.getElementById('tabSound'),
    variantPills: document.getElementById('variantPills'),
    historyStrip: document.getElementById('historyStrip'),
    sfxToggleBtn: document.getElementById('sfxToggleBtn'),
    arenaPad: document.getElementById('arenaPad'),
    rippleLayer: document.getElementById('rippleLayer'),
    padLiveView: document.getElementById('padLiveView'),
    padModePill: document.getElementById('padModePill'),
    padPbPill: document.getElementById('padPbPill'),
    bestOfDots: document.getElementById('bestOfDots'),
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
    nativeShareBtn: document.getElementById('nativeShareBtn'),
    shareFeedback: document.getElementById('shareFeedback'),
    confettiCanvas: document.getElementById('confettiCanvas'),
    legalModal: document.getElementById('legalModal'),
    legalModalClose: document.getElementById('legalModalClose'),
    legalModalBody: document.getElementById('legalModalBody'),
    legalTabBtns: document.querySelectorAll('[data-legal-tab]'),
    footerLegalBtns: document.querySelectorAll('[data-legal-open]'),
    consentBanner: document.getElementById('consentBanner'),
    consentAcceptBtn: document.getElementById('consentAcceptBtn'),
    consentRejectBtn: document.getElementById('consentRejectBtn')
  };

  const STORAGE_KEY = 'reflexduel_prod_v2';
  const CANONICAL_ORIGIN = 'https://reflexduel.vercel.app/';
  const CONTACT_EMAIL = 'reflexduel.official@gmail.com';
  const CPS_FINISH_LOCK_MS = 550;
  const AVERAGE_HUMAN_MS = 215;
  const AIM_TOTAL_TARGETS = 10;

  const VALID_CANONICAL_MODES = new Set([
    'reflex',
    'reflex5',
    'cps',
    'cps1',
    'cps10',
    'sound',
    'sound5',
    'spacebar',
    'spacebar10',
    'aim'
  ]);

  const initialDefaultMode =
    els.body && els.body.dataset && els.body.dataset.defaultMode
      ? els.body.dataset.defaultMode
      : 'reflex';

  const state = {
    mode: ['reflex', 'cps', 'sound', 'spacebar', 'aim'].includes(initialDefaultMode)
      ? initialDefaultMode
      : 'reflex',
    reflexVariant: 1, // 1 = 1-Tap, 5 = Best of 5
    cpsDuration: 5, // 1 | 5 | 10 seconds
    spacebarDuration: 5, // 5 | 10 seconds
    sfxEnabled: true,
    phase: 'idle', // 'idle' | 'waiting' | 'go' | 'early' | 'bo5-between' | 'cps' | 'aim' | 'result'
    waitTimerId: null,
    paintRafId: null,
    goTimestamp: 0,
    bo5Splits: [],
    cpsStartTimestamp: 0,
    cpsRafId: null,
    cpsBackupTimerId: null,
    cpsTaps: 0,
    cpsCooldownUntil: 0,
    aimHits: 0,
    aimMisses: 0,
    aimTargetAt: 0,
    aimDeltas: [],
    aimPrevPos: null,
    aimTargetEl: null,
    latestScore: {},
    bestScore: {},
    recentHistory: [],
    streak: {
      count: 0,
      lastDate: '',
      todayRuns: 0,
      todayDate: ''
    },
    consentChoice: null, // null | 'granted' | 'denied'
    incomingDuel: null,
    duelOutcome: null,
    duelDiffText: '',
    lastFocusedElement: null
  };

  /* ========================================================================
     2. GA4 / GTM DataLayer & Google Consent Mode v2
     ======================================================================== */
  function trackEvent(eventName, params) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
    } catch (_) {
      // Ignore analytics errors
    }
  }

  function applyGoogleConsent(granted) {
    try {
      const val = granted ? 'granted' : 'denied';
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          ad_storage: val,
          ad_user_data: val,
          ad_personalization: val,
          analytics_storage: val
        });
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'consent_updated',
        consent_state: val
      });
    } catch (_) {
      // Ignore consent update errors
    }
  }

  function initConsentBanner() {
    if (!els.consentBanner) return;
    if (state.consentChoice === 'granted') {
      applyGoogleConsent(true);
      els.consentBanner.classList.add('hidden');
      return;
    }
    if (state.consentChoice === 'denied') {
      applyGoogleConsent(false);
      els.consentBanner.classList.add('hidden');
      return;
    }

    els.consentBanner.classList.remove('hidden');

    if (els.consentAcceptBtn) {
      els.consentAcceptBtn.addEventListener('click', () => {
        state.consentChoice = 'granted';
        applyGoogleConsent(true);
        persistState();
        els.consentBanner.classList.add('hidden');
      });
    }

    if (els.consentRejectBtn) {
      els.consentRejectBtn.addEventListener('click', () => {
        state.consentChoice = 'denied';
        applyGoogleConsent(false);
        persistState();
        els.consentBanner.classList.add('hidden');
      });
    }
  }

  /* ========================================================================
     3. Zero-Asset Web Audio API Synthesizer (AudioContext)
     ======================================================================== */
  let audioCtx = null;

  function ensureAudioContext() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { });
      }
      return audioCtx;
    } catch (_) {
      return null;
    }
  }

  function playTone(kind, forceAudio) {
    if (!state.sfxEnabled && !forceAudio) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const playNote = (freq, startOffset, duration, type, peakGain, endFreq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, now + startOffset);
        if (endFreq) {
          osc.frequency.exponentialRampToValueAtTime(endFreq, now + startOffset + duration);
        }
        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.linearRampToValueAtTime(peakGain, now + startOffset + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + duration + 0.02);
      };

      if (kind === 'arm') {
        playNote(320, 0, 0.045, 'sine', 0.045, 280);
      } else if (kind === 'go') {
        playNote(880, 0, 0.16, 'triangle', 0.14, 1320);
      } else if (kind === 'fault') {
        playNote(155, 0, 0.14, 'sawtooth', 0.08, 110);
      } else if (kind === 'hit') {
        playNote(680, 0, 0.055, 'sine', 0.09, 920);
      } else if (kind === 'win') {
        playNote(523.25, 0, 0.12, 'triangle', 0.1);
        playNote(659.25, 0.09, 0.12, 'triangle', 0.1);
        playNote(783.99, 0.18, 0.22, 'triangle', 0.12);
      }
    } catch (_) {
      // Ignore Web Audio hardware errors
    }
  }

  function updateSfxButtonUi() {
    if (!els.sfxToggleBtn) return;
    els.sfxToggleBtn.classList.toggle('is-on', state.sfxEnabled);
    els.sfxToggleBtn.setAttribute('aria-pressed', String(state.sfxEnabled));
    els.sfxToggleBtn.innerHTML = state.sfxEnabled
      ? '<span aria-hidden="true">🔊</span><span>SFX On</span>'
      : '<span aria-hidden="true">🔇</span><span>SFX Off</span>';
  }

  /* ========================================================================
     4. Canonical Mode Helpers, Persistence, Streaks & Tiers
     ======================================================================== */
  function isSpeedBurstMode(modeKey) {
    return (
      modeKey === 'cps' ||
      modeKey === 'cps1' ||
      modeKey === 'cps10' ||
      modeKey === 'spacebar' ||
      modeKey === 'spacebar10'
    );
  }

  function isMillisecondMode(modeKey) {
    return !isSpeedBurstMode(modeKey);
  }

  function getCanonicalMode() {
    if (state.mode === 'reflex') return state.reflexVariant === 5 ? 'reflex5' : 'reflex';
    if (state.mode === 'sound') return state.reflexVariant === 5 ? 'sound5' : 'sound';
    if (state.mode === 'cps') {
      if (state.cpsDuration === 1) return 'cps1';
      if (state.cpsDuration === 10) return 'cps10';
      return 'cps';
    }
    if (state.mode === 'spacebar') {
      return state.spacebarDuration === 10 ? 'spacebar10' : 'spacebar';
    }
    return 'aim';
  }

  function getBurstDurationSec(modeKey) {
    if (modeKey === 'cps1') return 1;
    if (modeKey === 'cps10' || modeKey === 'spacebar10') return 10;
    return 5;
  }

  function formatScore(modeKey, score) {
    if (isSpeedBurstMode(modeKey)) {
      return `${Number(score).toFixed(1)} CPS`;
    }
    return `${Math.round(score)} ms`;
  }

  function getModeDisplayName(modeKey) {
    switch (modeKey) {
      case 'reflex5':
        return 'Best-of-5 Reaction';
      case 'cps1':
        return '1-Second CPS Burst';
      case 'cps':
        return '5-Second CPS Burst';
      case 'cps10':
        return '10-Second CPS Endurance';
      case 'sound':
        return 'Audio Sound Reflex';
      case 'sound5':
        return 'Best-of-5 Sound Reflex';
      case 'spacebar':
        return '5-Second Spacebar Speed';
      case 'spacebar10':
        return '10-Second Spacebar Speed';
      case 'aim':
        return '10-Target Aim Reflex';
      default:
        return 'Reaction Time';
    }
  }

  function getGlobalTier(modeKey, score) {
    if (modeKey === 'aim') {
      if (score < 275) return { pct: 1, label: '⚡ TOP 1% • RADIANT FLICK AIM' };
      if (score <= 340) return { pct: 5, label: '🏆 TOP 5% • IMMORTAL AIM TIER' };
      if (score <= 430) return { pct: 22, label: '🔥 TOP 22% • SHARP TRACKING' };
      if (score <= 550) return { pct: 50, label: '⚡ SOLID MOUSE CONTROL' };
      return { pct: 80, label: '🐢 WARMING UP AIM' };
    }

    if (isMillisecondMode(modeKey)) {
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

  function getLocalDateStr(dateObj) {
    const d = dateObj || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getYesterdayDateStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateStr(d);
  }

  function renderStreakBadge() {
    if (!els.streakBadgeText) return;
    const today = getLocalDateStr();
    const yesterday = getYesterdayDateStr();
    const activeStreak =
      state.streak.lastDate === today || state.streak.lastDate === yesterday ? state.streak.count : 0;
    const todayRuns = state.streak.todayDate === today ? state.streak.todayRuns : 0;
    els.streakBadgeText.textContent = `🔥 ${activeStreak}d Streak • ${todayRuns} Today`;
  }

  function renderHistoryStrip() {
    if (!els.historyStrip) return;
    els.historyStrip.innerHTML = '';
    const recent = state.recentHistory.slice(-4);
    for (let i = 0; i < recent.length; i += 1) {
      const chip = document.createElement('span');
      chip.className = 'history-chip';
      chip.textContent = recent[i];
      els.historyStrip.appendChild(chip);
    }
  }

  function recordStreakAndHistory(formattedValue) {
    const today = getLocalDateStr();
    const yesterday = getYesterdayDateStr();

    if (state.streak.lastDate === today) {
      state.streak.count = Math.max(1, state.streak.count);
    } else if (state.streak.lastDate === yesterday) {
      state.streak.count = (state.streak.count || 0) + 1;
    } else {
      state.streak.count = 1;
    }
    state.streak.lastDate = today;

    if (state.streak.todayDate === today) {
      state.streak.todayRuns = (state.streak.todayRuns || 0) + 1;
    } else {
      state.streak.todayDate = today;
      state.streak.todayRuns = 1;
    }

    state.recentHistory.push(formattedValue);
    if (state.recentHistory.length > 6) {
      state.recentHistory = state.recentHistory.slice(-6);
    }

    renderStreakBadge();
    renderHistoryStrip();
    persistState();
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;

      if (typeof data.name === 'string' && data.name.trim() && els.playerNameInput) {
        els.playerNameInput.value = data.name.trim().slice(0, 20);
      }
      if (typeof data.sfx === 'boolean') {
        state.sfxEnabled = data.sfx;
      }
      if (data.consent === 'granted' || data.consent === 'denied') {
        state.consentChoice = data.consent;
      }
      if (typeof data.bestReflex === 'number' && data.bestReflex > 0) {
        state.bestScore.reflex = data.bestReflex;
      }
      if (typeof data.bestCps === 'number' && data.bestCps > 0) {
        state.bestScore.cps = data.bestCps;
      }
      if (data.bestScores && typeof data.bestScores === 'object') {
        Object.keys(data.bestScores).forEach((k) => {
          const v = Number(data.bestScores[k]);
          if (VALID_CANONICAL_MODES.has(k) && Number.isFinite(v) && v > 0) {
            state.bestScore[k] = v;
          }
        });
      }
      if (Array.isArray(data.recentHistory)) {
        state.recentHistory = data.recentHistory
          .filter((x) => typeof x === 'string')
          .slice(-6);
      }
      if (data.streak && typeof data.streak === 'object') {
        state.streak = {
          count: Number(data.streak.count) || 0,
          lastDate: String(data.streak.lastDate || ''),
          todayRuns: Number(data.streak.todayRuns) || 0,
          todayDate: String(data.streak.todayDate || '')
        };
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
          name: els.playerNameInput ? els.playerNameInput.value.trim().slice(0, 20) : '',
          sfx: state.sfxEnabled,
          consent: state.consentChoice,
          bestReflex: state.bestScore.reflex || null,
          bestCps: state.bestScore.cps || null,
          bestScores: state.bestScore,
          recentHistory: state.recentHistory.slice(-6),
          streak: state.streak
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

  function updatePbBadge() {
    if (!els.padPbPill) return;
    const key = getCanonicalMode();
    const pb = state.bestScore[key];
    if (pb !== undefined && pb !== null) {
      els.padPbPill.textContent = `PB: ${formatScore(key, pb)}`;
      els.padPbPill.classList.remove('hidden');
    } else {
      els.padPbPill.classList.add('hidden');
    }
  }

  /* ========================================================================
     5. Zero-Server URL Duel Token (?duel=...)
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

      let rawMode = raw.m || raw.mode;
      if (rawMode === 'reaction') rawMode = 'reflex';
      const mode = VALID_CANONICAL_MODES.has(rawMode) ? rawMode : null;

      const rawScore = Number(raw.s !== undefined ? raw.s : raw.score);
      const cleanName = String(raw.n || raw.name || 'Challenger').trim().slice(0, 20) || 'Challenger';

      if (!mode || !Number.isFinite(rawScore) || rawScore <= 0) return null;
      const score = isSpeedBurstMode(mode) ? Number(rawScore.toFixed(1)) : Math.round(rawScore);
      return { n: cleanName, m: mode, s: score };
    } catch (_) {
      return null;
    }
  }

  function getShareBaseUrl() {
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      return window.location.href.split('?')[0].split('#')[0];
    }
    return CANONICAL_ORIGIN;
  }

  function buildShareableDuelUrl(modeKey, score) {
    const playerName = els.playerNameInput
      ? els.playerNameInput.value.trim().slice(0, 20) || 'Challenger'
      : 'Challenger';
    const normalizedScore = isSpeedBurstMode(modeKey)
      ? Number(score.toFixed(1))
      : Math.round(score);
    const token = encodeDuelToken({ n: playerName, m: modeKey, s: normalizedScore });
    return `${getShareBaseUrl()}?duel=${token}`;
  }

  function buildCanonicalQrDuelUrl(modeKey, score) {
    const rawName = els.playerNameInput
      ? els.playerNameInput.value.trim().slice(0, 20) || 'Challenger'
      : 'Challenger';
    const normalizedScore = isSpeedBurstMode(modeKey)
      ? Number(score.toFixed(1))
      : Math.round(score);
    const route =
      modeKey === 'cps' || modeKey === 'cps1' || modeKey === 'cps10'
        ? 'cps-test'
        : modeKey === 'spacebar' || modeKey === 'spacebar10'
          ? 'spacebar-test'
          : modeKey === 'aim'
            ? 'aim-reflex'
            : '';

    const tryNames = [rawName, rawName.slice(0, 8) || 'Player', 'Player'];
    for (let i = 0; i < tryNames.length; i += 1) {
      const candidate = `${CANONICAL_ORIGIN}${route}?duel=${encodeDuelToken({
        n: tryNames[i],
        m: modeKey,
        s: normalizedScore
      })}`;
      if (new TextEncoder().encode(candidate).length <= 134) {
        return candidate;
      }
    }
    return `${CANONICAL_ORIGIN}?duel=${encodeDuelToken({ n: 'Player', m: modeKey, s: normalizedScore })}`;
  }

  function renderChallengeBanner(status, diffText) {
    const duel = state.incomingDuel;
    if (!els.challengeBanner) return;
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

  function applyCanonicalModeSelection(modeKey) {
    if (modeKey === 'reflex' || modeKey === 'reflex5') {
      state.reflexVariant = modeKey === 'reflex5' ? 5 : 1;
      switchMode('reflex', true);
    } else if (modeKey === 'sound' || modeKey === 'sound5') {
      state.reflexVariant = modeKey === 'sound5' ? 5 : 1;
      switchMode('sound', true);
    } else if (modeKey === 'cps' || modeKey === 'cps1' || modeKey === 'cps10') {
      state.cpsDuration = modeKey === 'cps1' ? 1 : modeKey === 'cps10' ? 10 : 5;
      switchMode('cps', true);
    } else if (modeKey === 'spacebar' || modeKey === 'spacebar10') {
      state.spacebarDuration = modeKey === 'spacebar10' ? 10 : 5;
      switchMode('spacebar', true);
    } else if (modeKey === 'aim') {
      switchMode('aim', true);
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
    applyCanonicalModeSelection(decoded.m);
  }

  /* ========================================================================
     6. Sub-Bar Variant Controls, Best-of-5 Dots & Pad Transitions
     ======================================================================== */
  function renderVariantPills() {
    if (!els.variantPills) return;
    let options = [];
    let current = '';

    if (state.mode === 'reflex' || state.mode === 'sound') {
      options = [
        { val: '1', label: '1-Tap' },
        { val: '5', label: 'Best of 5' }
      ];
      current = String(state.reflexVariant);
    } else if (state.mode === 'cps') {
      options = [
        { val: '1', label: '1s' },
        { val: '5', label: '5s' },
        { val: '10', label: '10s' }
      ];
      current = String(state.cpsDuration);
    } else if (state.mode === 'spacebar') {
      options = [
        { val: '5', label: '5s' },
        { val: '10', label: '10s' }
      ];
      current = String(state.spacebarDuration);
    } else {
      options = [{ val: '10', label: '10 Targets' }];
      current = '10';
    }

    els.variantPills.innerHTML = '';
    for (let i = 0; i < options.length; i += 1) {
      const opt = options[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `variant-pill${opt.val === current ? ' is-active' : ''}`;
      btn.dataset.variant = opt.val;
      btn.textContent = opt.label;
      btn.addEventListener('click', () => handleVariantSelect(opt.val));
      els.variantPills.appendChild(btn);
    }
  }

  function handleVariantSelect(val) {
    const num = Number(val);
    if (state.mode === 'reflex' || state.mode === 'sound') {
      state.reflexVariant = num === 5 ? 5 : 1;
    } else if (state.mode === 'cps') {
      state.cpsDuration = num === 1 || num === 10 ? num : 5;
    } else if (state.mode === 'spacebar') {
      state.spacebarDuration = num === 10 ? 10 : 5;
    }
    state.bo5Splits = [];
    renderVariantPills();
    resetPadToIdle();
  }

  function renderBestOfDots(currentIdx) {
    if (!els.bestOfDots) return;
    const isBo5 =
      (state.mode === 'reflex' || state.mode === 'sound') && state.reflexVariant === 5;
    if (!isBo5) {
      els.bestOfDots.classList.add('hidden');
      return;
    }

    els.bestOfDots.classList.remove('hidden');
    const dots = els.bestOfDots.querySelectorAll('.bo5-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('is-done', idx < state.bo5Splits.length);
      dot.classList.toggle(
        'is-current',
        typeof currentIdx === 'number' && idx === currentIdx && idx >= state.bo5Splits.length
      );
    });
  }

  function removeAimTarget() {
    if (state.aimTargetEl && state.aimTargetEl.parentNode) {
      state.aimTargetEl.parentNode.removeChild(state.aimTargetEl);
    }
    state.aimTargetEl = null;
  }

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
    removeAimTarget();
    state.phase = 'idle';
    state.bo5Splits = [];
    applyPadStateClass('state-idle');
    showLiveView();
    els.cpsLiveCounter.classList.add('hidden');
    els.padTitle.classList.remove('hidden');
    renderBestOfDots(0);

    const key = getCanonicalMode();
    if (state.mode === 'reflex') {
      els.padModePill.textContent = state.reflexVariant === 5 ? 'BEST OF 5 • MS' : 'REACTION TIME';
      els.padTitle.textContent = '⚡ Tap Anywhere to Start';
      els.padSubtitle.textContent =
        state.reflexVariant === 5
          ? 'Complete 5 emerald-green reflex rounds to lock your true average.'
          : 'Tap as soon as the red pad flashes bright emerald green.';
      els.padHint.textContent = 'Zero-lag tap or press Spacebar';
    } else if (state.mode === 'sound') {
      els.padModePill.textContent =
        state.reflexVariant === 5 ? 'SOUND BEST OF 5' : 'SOUND REFLEX';
      els.padTitle.textContent = '🔊 Tap to Arm Audio Cue';
      els.padSubtitle.textContent =
        'Focus with ears only — tap the instant you hear the sharp 880Hz chime.';
      els.padHint.textContent = 'Ensure device volume or headphones are active';
    } else if (state.mode === 'cps') {
      els.padModePill.textContent = `${state.cpsDuration}-SEC CPS BURST`;
      els.padTitle.textContent = '⚡ Tap Anywhere to Start';
      els.padSubtitle.textContent = `First tap starts a ${state.cpsDuration.toFixed(1)}-second sprint. Tap as fast as possible!`;
      els.padHint.textContent = 'Tap rapidly with 1 or 2 fingers';
    } else if (state.mode === 'spacebar') {
      els.padModePill.textContent = `${state.spacebarDuration}-SEC SPACEBAR`;
      els.padTitle.textContent = '⌨️ Press Spacebar to Start';
      els.padSubtitle.textContent = `Hit Spacebar (or tap on mobile) for ${state.spacebarDuration.toFixed(1)} seconds as fast as possible!`;
      els.padHint.textContent = 'First Spacebar press starts the timer';
    } else if (state.mode === 'aim') {
      els.padModePill.textContent = 'AIM REFLEX • 10 HITS';
      els.padTitle.textContent = '🎯 Tap Anywhere to Start';
      els.padSubtitle.textContent = `Strike ${AIM_TOTAL_TARGETS} glowing emerald targets in sequence to score average ms/hit.`;
      els.padHint.textContent = 'Mouse or direct touchscreen taps only';
    }

    updatePbBadge();
    renderVariantPills();
    renderStreakBadge();
    renderHistoryStrip();
    updateSfxButtonUi();
    // Avoid unused helper lint warning on `key`
    void key;
  }

  /* ========================================================================
     7. Reaction Time & Sound Reflex Engine (1-Tap + Best of 5)
     ======================================================================== */
  function startReflexOrSoundWaiting() {
    clearActiveTimers();
    removeAimTarget();
    state.phase = 'waiting';
    applyPadStateClass('state-waiting');
    showLiveView();
    els.cpsLiveCounter.classList.add('hidden');
    els.padTitle.classList.remove('hidden');

    const roundIdx = state.bo5Splits.length;
    const isBo5 = state.reflexVariant === 5;
    const isSound = state.mode === 'sound';
    renderBestOfDots(roundIdx);

    if (isSound) {
      ensureAudioContext();
      els.padModePill.textContent = isBo5 ? `SOUND ${roundIdx + 1}/5` : 'LISTEN • ARMED';
      els.padTitle.textContent = 'Listen for Chime...';
      els.padSubtitle.textContent = 'Wait for the audio beep — do not tap early.';
      els.padHint.textContent = 'Audio-only stimulus active';
    } else {
      playTone('arm');
      els.padModePill.textContent = isBo5 ? `ROUND ${roundIdx + 1}/5` : 'WAIT • ARMED';
      els.padTitle.textContent = 'Wait for Green...';
      els.padSubtitle.textContent = 'Hold steady — tapping before green triggers a fault.';
      els.padHint.textContent = 'Focus on the center';
    }

    const activeCanonical = getCanonicalMode();
    if (roundIdx === 0) {
      trackEvent('test_started', { mode: activeCanonical });
    }

    const delayMs = 1500 + Math.random() * 2700;
    state.waitTimerId = setTimeout(() => {
      if ((state.mode !== 'reflex' && state.mode !== 'sound') || state.phase !== 'waiting') {
        return;
      }
      state.phase = 'go';
      applyPadStateClass('state-go');
      els.padModePill.textContent = 'GO!';
      els.padTitle.textContent = isSound ? 'BEEP! TAP NOW!' : 'TAP NOW!';
      els.padSubtitle.textContent = 'Strike as fast as you can!';
      els.padHint.textContent = 'Timing active...';

      if (isSound) {
        playTone('go', true);
      }

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
    playTone('fault');
    state.phase = 'early';
    applyPadStateClass('state-early');
    showLiveView();
    const isBo5 = state.reflexVariant === 5;
    els.padModePill.textContent = isBo5
      ? `ROUND ${state.bo5Splits.length + 1}/5 FAULT`
      : 'FALSE START';
    els.padTitle.textContent = '⚠️ Too Early! Tap to try again';
    els.padSubtitle.textContent =
      state.mode === 'sound'
        ? 'Wait for the 880Hz chime before tapping.'
        : 'Wait for the pad to flash emerald green before tapping.';
    els.padHint.textContent = 'Tap anywhere to retry';
  }

  function finishReflexRound(tapTimestamp) {
    clearActiveTimers();
    const deltaMs = Math.max(1, Math.round(tapTimestamp - state.goTimestamp));
    const canonical = getCanonicalMode();

    if (state.reflexVariant === 5) {
      state.bo5Splits.push(deltaMs);
      renderBestOfDots(state.bo5Splits.length);

      if (state.bo5Splits.length < 5) {
        state.phase = 'bo5-between';
        applyPadStateClass('state-idle');
        showLiveView();
        els.cpsLiveCounter.classList.add('hidden');
        els.padTitle.classList.remove('hidden');
        els.padModePill.textContent = `SPLIT ${state.bo5Splits.length}/5`;
        els.padTitle.textContent = `${deltaMs} ms`;
        els.padSubtitle.textContent = `Splits: ${state.bo5Splits.join(' • ')} ms`;
        els.padHint.textContent = `Tap anywhere for Round ${state.bo5Splits.length + 1} of 5`;
        return;
      }

      const sum = state.bo5Splits.reduce((acc, v) => acc + v, 0);
      const avgMs = Math.max(1, Math.round(sum / 5));
      const bestSplit = Math.min(...state.bo5Splits);
      const customNote = `5-Round Avg (${state.bo5Splits.join(', ')} ms) • Best split: ${bestSplit} ms`;
      state.bo5Splits = [];
      completeScoreRound(canonical, avgMs, customNote);
      return;
    }

    completeScoreRound(canonical, deltaMs);
  }

  /* ========================================================================
     8. Mode 2 & Spacebar Burst Engine (1s / 5s / 10s CPS)
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

  function startBurstSprint(clientX, clientY) {
    clearActiveTimers();
    const canonical = getCanonicalMode();
    const durationSec = getBurstDurationSec(canonical);
    const durationMs = durationSec * 1000;

    state.phase = 'cps';
    state.cpsTaps = 1;
    state.cpsStartTimestamp = performance.now();

    applyPadStateClass('state-cps');
    showLiveView();
    els.padTitle.classList.add('hidden');
    els.cpsLiveCounter.classList.remove('hidden');
    els.cpsLiveCounter.textContent = '1';

    els.padModePill.textContent = `${durationSec.toFixed(1)}s LEFT`;
    els.padSubtitle.textContent =
      state.mode === 'spacebar'
        ? 'Smash Spacebar! Sprint ends at 0.0s'
        : 'Keep tapping! Burst ends at 0.0s';
    els.padHint.textContent = 'Go! Go! Go!';

    spawnTapRipple(clientX, clientY);
    trackEvent('test_started', { mode: canonical });

    const loop = () => {
      if ((state.mode !== 'cps' && state.mode !== 'spacebar') || state.phase !== 'cps') return;
      const elapsed = performance.now() - state.cpsStartTimestamp;
      const leftSec = Math.max(0, (durationMs - elapsed) / 1000);
      els.padModePill.textContent = `${leftSec.toFixed(1)}s LEFT`;

      if (elapsed >= durationMs) {
        finishBurstSprint();
        return;
      }
      state.cpsRafId = requestAnimationFrame(loop);
    };

    state.cpsRafId = requestAnimationFrame(loop);
    state.cpsBackupTimerId = setTimeout(() => {
      if ((state.mode === 'cps' || state.mode === 'spacebar') && state.phase === 'cps') {
        finishBurstSprint();
      }
    }, durationMs + 40);
  }

  function incrementBurstTap(clientX, clientY) {
    state.cpsTaps += 1;
    els.cpsLiveCounter.textContent = String(state.cpsTaps);
    spawnTapRipple(clientX, clientY);
  }

  function finishBurstSprint() {
    clearActiveTimers();
    const canonical = getCanonicalMode();
    const durationSec = getBurstDurationSec(canonical);
    state.cpsCooldownUntil = performance.now() + CPS_FINISH_LOCK_MS;
    const cpsScore = Number((state.cpsTaps / durationSec).toFixed(1));
    completeScoreRound(
      canonical,
      cpsScore,
      `${state.cpsTaps} total hits in ${durationSec.toFixed(1)} seconds!`
    );
  }

  /* ========================================================================
     9. Mode 4: Aim Reflex 10-Target Trainer
     ======================================================================== */
  function spawnNextAimTarget() {
    removeAimTarget();
    const padW = els.arenaPad.clientWidth || 320;
    const padH = els.arenaPad.clientHeight || 240;

    let pctX = 50;
    let pctY = 50;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidateX = 16 + Math.random() * 68;
      const candidateY = 26 + Math.random() * 52;
      if (!state.aimPrevPos) {
        pctX = candidateX;
        pctY = candidateY;
        break;
      }
      const dx = ((candidateX - state.aimPrevPos.x) * padW) / 100;
      const dy = ((candidateY - state.aimPrevPos.y) * padH) / 100;
      if (Math.hypot(dx, dy) >= 64) {
        pctX = candidateX;
        pctY = candidateY;
        break;
      }
      pctX = candidateX;
      pctY = candidateY;
    }

    state.aimPrevPos = { x: pctX, y: pctY };

    const orb = document.createElement('button');
    orb.type = 'button';
    orb.className = 'aim-target';
    orb.id = 'aimTargetOrb';
    orb.setAttribute('aria-label', `Aim Target ${state.aimHits + 1} of ${AIM_TOTAL_TARGETS}`);
    orb.style.left = `${pctX}%`;
    orb.style.top = `${pctY}%`;

    orb.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (state.mode !== 'aim' || state.phase !== 'aim') return;

      const hitTime = performance.now();
      const delta = Math.max(1, Math.round(hitTime - state.aimTargetAt));
      state.aimDeltas.push(delta);
      state.aimHits += 1;

      vibratePattern(10);
      playTone('hit');
      spawnTapRipple(e.clientX, e.clientY);

      if (state.aimHits >= AIM_TOTAL_TARGETS) {
        removeAimTarget();
        const total = state.aimDeltas.reduce((acc, v) => acc + v, 0);
        const avgMs = Math.max(1, Math.round(total / AIM_TOTAL_TARGETS));
        const note = `10 targets cleared (${state.aimMisses} misses) • Avg ${avgMs} ms/hit`;
        completeScoreRound('aim', avgMs, note);
        return;
      }

      els.padModePill.textContent = `TARGET ${state.aimHits}/${AIM_TOTAL_TARGETS}`;
      els.padSubtitle.textContent = `Last hit: ${delta} ms • Keep striking emerald targets!`;
      spawnNextAimTarget();
    });

    els.arenaPad.appendChild(orb);
    state.aimTargetEl = orb;
    requestAnimationFrame(() => {
      state.aimTargetAt = performance.now();
    });
    state.aimTargetAt = performance.now();
  }

  function startAimTrainer() {
    clearActiveTimers();
    removeAimTarget();
    state.phase = 'aim';
    state.aimHits = 0;
    state.aimMisses = 0;
    state.aimDeltas = [];
    state.aimPrevPos = null;

    applyPadStateClass('state-cps');
    showLiveView();
    els.cpsLiveCounter.classList.add('hidden');
    els.padTitle.classList.add('hidden');
    els.padModePill.textContent = `TARGET 0/${AIM_TOTAL_TARGETS}`;
    els.padSubtitle.textContent = 'Strike the emerald orb as fast as it appears!';
    els.padHint.textContent = 'Avoid misclicks for a clean run';

    trackEvent('test_started', { mode: 'aim' });
    spawnNextAimTarget();
  }

  /* ========================================================================
     10. Unified Score Completion, Duel Evaluation & Result Display
     ======================================================================== */
  function completeScoreRound(modeKey, score, customSubtitle) {
    state.phase = 'result';
    state.latestScore[modeKey] = score;

    const prevBest = state.bestScore[modeKey];
    const isHigherBetter = isSpeedBurstMode(modeKey);
    const isNewBest =
      prevBest === undefined ||
      prevBest === null ||
      (isHigherBetter ? score > prevBest : score < prevBest);

    if (isNewBest) {
      state.bestScore[modeKey] = score;
    }

    const formatted = formatScore(modeKey, score);
    recordStreakAndHistory(formatted);

    const tier = getGlobalTier(modeKey, score);
    let comparisonText = customSubtitle || '';
    let duelStatus = 'none';

    const duel = state.incomingDuel;
    if (duel && duel.m === modeKey) {
      const won = isHigherBetter ? score > duel.s : score < duel.s;
      const lost = isHigherBetter ? score < duel.s : score > duel.s;
      const diffVal = isHigherBetter
        ? `${Math.abs(score - duel.s).toFixed(1)} CPS`
        : `${Math.abs(Math.round(duel.s - score))} ms`;

      if (won) {
        duelStatus = 'won';
        state.duelOutcome = 'won';
        state.duelDiffText = diffVal;
        comparisonText = `👑 VICTORY! You beat ${duel.n} by ${diffVal}!`;
        renderChallengeBanner('won', diffVal);
        launchConfetti();
      } else if (lost) {
        duelStatus = 'lost';
        state.duelOutcome = 'lost';
        state.duelDiffText = diffVal;
        comparisonText = `😤 So close! ${duel.n} is still ahead by ${diffVal}. Tap to try again!`;
        renderChallengeBanner('lost', diffVal);
      } else {
        duelStatus = 'tied';
        state.duelOutcome = 'tied';
        comparisonText = `⚔️ Exact tie with ${duel.n}! Tap again to break the tie!`;
        renderChallengeBanner('tied');
      }
    } else if (!comparisonText) {
      if (isHigherBetter) {
        comparisonText = `${tier.pct <= 10 ? 'Elite burst pace' : 'Keep pushing your finger speed!'}`;
      } else {
        const deltaVsAvg = Math.round(AVERAGE_HUMAN_MS - score);
        if (deltaVsAvg > 0) {
          comparisonText = `${deltaVsAvg} ms faster than the average human!`;
        } else if (deltaVsAvg === 0) {
          comparisonText = 'Right on the average human benchmark (215 ms)!';
        } else {
          comparisonText = `${Math.abs(deltaVsAvg)} ms slower than the 215 ms benchmark — go again!`;
        }
      }
    }

    if (isNewBest || duelStatus === 'won') {
      vibratePattern([70, 40, 110]);
      playTone('win');
    }

    applyPadStateClass('state-result');
    els.padLiveView.classList.add('hidden');
    els.padResultView.classList.remove('hidden');

    els.rankBadge.textContent = tier.label;
    els.scoreDisplay.textContent = formatted;
    els.scoreComparisonText.textContent = comparisonText;
    els.retryPrompt.textContent =
      state.mode === 'spacebar' ? '↻ Press Spacebar or tap to retry' : '↻ Tap here to try again';
    updatePbBadge();

    trackEvent('score_recorded', {
      mode: modeKey,
      score,
      tier: tier.label,
      is_personal_best: isNewBest,
      duel_outcome: duelStatus
    });
  }

  /* ========================================================================
     11. Input Listeners (Zero-Lag PointerDown + Keyboard Space)
     ======================================================================== */
  function handleArenaPress(clientX, clientY) {
    const now = performance.now();
    vibratePattern(10);

    if (state.mode === 'reflex' || state.mode === 'sound') {
      if (
        state.phase === 'idle' ||
        state.phase === 'early' ||
        state.phase === 'result' ||
        state.phase === 'bo5-between'
      ) {
        startReflexOrSoundWaiting();
      } else if (state.phase === 'waiting') {
        triggerReflexEarlyFault();
      } else if (state.phase === 'go') {
        finishReflexRound(now);
      }
      return;
    }

    if (state.mode === 'aim') {
      if (state.phase === 'idle' || state.phase === 'result') {
        startAimTrainer();
      } else if (state.phase === 'aim') {
        state.aimMisses += 1;
        playTone('fault');
      }
      return;
    }

    if (state.phase === 'result' && now < state.cpsCooldownUntil) {
      return;
    }

    if (state.phase === 'idle' || state.phase === 'result') {
      startBurstSprint(clientX, clientY);
    } else if (state.phase === 'cps') {
      incrementBurstTap(clientX, clientY);
    }
  }

  els.arenaPad.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target && e.target.id === 'aimTargetOrb') return;
    e.preventDefault();
    handleArenaPress(e.clientX, e.clientY);
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (els.legalModal && !els.legalModal.classList.contains('hidden')) {
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

  function switchMode(nextMode, forceRefresh) {
    if (state.mode === nextMode && !forceRefresh) return;
    state.mode = nextMode;

    els.modeTabs.forEach((tab) => {
      const isMatch = tab.getAttribute('data-mode') === nextMode;
      tab.classList.toggle('is-active', isMatch);
      tab.setAttribute('aria-selected', String(isMatch));
    });

    resetPadToIdle();
  }

  els.modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetMode = tab.getAttribute('data-mode');
      if (targetMode) switchMode(targetMode);
    });
  });

  if (els.sfxToggleBtn) {
    els.sfxToggleBtn.addEventListener('click', () => {
      state.sfxEnabled = !state.sfxEnabled;
      if (state.sfxEnabled) playTone('arm', true);
      updateSfxButtonUi();
      persistState();
    });
  }

  if (els.playerNameInput) {
    els.playerNameInput.addEventListener('input', persistState);
  }

  if (els.brandResetLink) {
    els.brandResetLink.addEventListener('click', (e) => {
      if (initialDefaultMode === 'reflex') {
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
      }
    });
  }

  /* ========================================================================
     12. Pure-JS ISO/IEC 18004 QR Code Matrix Encoder (Level L, V1..V6)
     ======================================================================== */
  const QR_VERSIONS = [
    null,
    { ver: 1, size: 21, data: 19, ec: 7, blocks: 1, align: [] },
    { ver: 2, size: 25, data: 34, ec: 10, blocks: 1, align: [6, 18] },
    { ver: 3, size: 29, data: 55, ec: 15, blocks: 1, align: [6, 22] },
    { ver: 4, size: 33, data: 80, ec: 20, blocks: 1, align: [6, 26] },
    { ver: 5, size: 37, data: 108, ec: 26, blocks: 1, align: [6, 30] },
    { ver: 6, size: 41, data: 136, ec: 18, blocks: 2, align: [6, 34] }
  ];

  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGaloisField() {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i += 1) {
      GF_EXP[i] = GF_EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function buildRsGenerator(ecLen) {
    let poly = [1];
    for (let i = 0; i < ecLen; i += 1) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = GF_EXP[i];
      for (let j = 0; j < poly.length; j += 1) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function computeRsRemainder(dataBlock, ecLen) {
    const gen = buildRsGenerator(ecLen);
    const work = new Uint8Array(dataBlock.length + ecLen);
    work.set(dataBlock);
    for (let i = 0; i < dataBlock.length; i += 1) {
      const lead = work[i];
      if (lead !== 0) {
        for (let j = 0; j < gen.length; j += 1) {
          work[i + j] ^= gfMul(gen[j], lead);
        }
      }
    }
    return work.slice(dataBlock.length);
  }

  function computeFormatBitsL(maskId) {
    const raw = (1 << 3) | (maskId & 7); // EC L = 01
    let bits = raw << 10;
    for (let i = 14; i >= 10; i -= 1) {
      if ((bits >> i) & 1) {
        bits ^= 0x537 << (i - 10);
      }
    }
    return ((raw << 10) | bits) ^ 0x5412;
  }

  function evalMaskFunction(maskId, r, c) {
    switch (maskId) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  }

  function scoreQrMatrix(mat) {
    const n = mat.length;
    let penalty = 0;
    let darkCount = 0;

    for (let r = 0; r < n; r += 1) {
      let runRow = 1;
      let runCol = 1;
      for (let c = 0; c < n; c += 1) {
        if (mat[r][c]) darkCount += 1;
        if (c > 0) {
          if (mat[r][c] === mat[r][c - 1]) runRow += 1;
          else {
            if (runRow >= 5) penalty += 3 + (runRow - 5);
            runRow = 1;
          }
          if (mat[c][r] === mat[c - 1][r]) runCol += 1;
          else {
            if (runCol >= 5) penalty += 3 + (runCol - 5);
            runCol = 1;
          }
        }
        if (r < n - 1 && c < n - 1) {
          const sum = mat[r][c] + mat[r][c + 1] + mat[r + 1][c] + mat[r + 1][c + 1];
          if (sum === 0 || sum === 4) penalty += 3;
        }
      }
      if (runRow >= 5) penalty += 3 + (runRow - 5);
      if (runCol >= 5) penalty += 3 + (runCol - 5);
    }

    const pctDiff = Math.abs((darkCount * 100) / (n * n) - 50);
    penalty += Math.floor(pctDiff / 5) * 10;
    return penalty;
  }

  function encodeQrMatrix(text) {
    const rawBytes = Array.from(new TextEncoder().encode(text));
    let spec = null;
    for (let v = 1; v < QR_VERSIONS.length; v += 1) {
      if (rawBytes.length <= QR_VERSIONS[v].data - 2) {
        spec = QR_VERSIONS[v];
        break;
      }
    }
    if (!spec) {
      spec = QR_VERSIONS[QR_VERSIONS.length - 1];
    }

    const payload = rawBytes.slice(0, spec.data - 2);
    const bitBuf = [];
    const pushBits = (val, count) => {
      for (let i = count - 1; i >= 0; i -= 1) {
        bitBuf.push((val >> i) & 1);
      }
    };

    pushBits(4, 4); // Byte mode 0100
    pushBits(payload.length, 8);
    for (let i = 0; i < payload.length; i += 1) pushBits(payload[i], 8);

    const maxDataBits = spec.data * 8;
    const termBits = Math.min(4, maxDataBits - bitBuf.length);
    pushBits(0, termBits);
    while (bitBuf.length % 8 !== 0) bitBuf.push(0);

    const dataCodewords = new Uint8Array(spec.data);
    let byteIdx = 0;
    for (let i = 0; i < bitBuf.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j += 1) b = (b << 1) | bitBuf[i + j];
      dataCodewords[byteIdx] = b;
      byteIdx += 1;
    }
    const padBytes = [0xec, 0x11];
    for (let p = 0; byteIdx < spec.data; p += 1) {
      dataCodewords[byteIdx] = padBytes[p % 2];
      byteIdx += 1;
    }

    const blockDataLen = Math.floor(spec.data / spec.blocks);
    const dataBlocks = [];
    const ecBlocks = [];
    for (let b = 0; b < spec.blocks; b += 1) {
      const slice = dataCodewords.slice(b * blockDataLen, (b + 1) * blockDataLen);
      dataBlocks.push(slice);
      ecBlocks.push(computeRsRemainder(slice, spec.ec));
    }

    const streamBits = [];
    for (let i = 0; i < blockDataLen; i += 1) {
      for (let b = 0; b < spec.blocks; b += 1) {
        const val = dataBlocks[b][i];
        for (let k = 7; k >= 0; k -= 1) streamBits.push((val >> k) & 1);
      }
    }
    for (let i = 0; i < spec.ec; i += 1) {
      for (let b = 0; b < spec.blocks; b += 1) {
        const val = ecBlocks[b][i];
        for (let k = 7; k >= 0; k -= 1) streamBits.push((val >> k) & 1);
      }
    }

    const n = spec.size;
    const base = Array.from({ length: n }, () => new Int8Array(n));
    const isFn = Array.from({ length: n }, () => new Uint8Array(n));

    const setFn = (r, c, val) => {
      if (r >= 0 && r < n && c >= 0 && c < n) {
        base[r][c] = val ? 1 : 0;
        isFn[r][c] = 1;
      }
    };

    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr += 1) {
        for (let dc = -1; dc <= 7; dc += 1) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r < 0 || r >= n || c < 0 || c >= n) continue;
          const on =
            dr >= 0 &&
            dr <= 6 &&
            dc >= 0 &&
            dc <= 6 &&
            (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setFn(r, c, on ? 1 : 0);
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, n - 7);
    drawFinder(n - 7, 0);

    for (let i = 8; i < n - 8; i += 1) {
      setFn(6, i, i % 2 === 0 ? 1 : 0);
      setFn(i, 6, i % 2 === 0 ? 1 : 0);
    }

    if (spec.align.length >= 2) {
      const rCenter = spec.align[1];
      const cCenter = spec.align[1];
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const on = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setFn(rCenter + dr, cCenter + dc, on ? 1 : 0);
        }
      }
    }

    setFn(n - 8, 8, 1); // Dark module

    for (let i = 0; i <= 8; i += 1) {
      if (i !== 6) {
        isFn[8][i] = 1;
        isFn[i][8] = 1;
      }
      if (i < 8) isFn[8][n - 1 - i] = 1;
      if (i < 7) isFn[n - 1 - i][8] = 1;
    }

    let bitIdx = 0;
    let upward = true;
    for (let colRight = n - 1; colRight >= 1; colRight -= 2) {
      if (colRight === 6) colRight = 5;
      for (let step = 0; step < n; step += 1) {
        const r = upward ? n - 1 - step : step;
        for (let offset = 0; offset < 2; offset += 1) {
          const c = colRight - offset;
          if (!isFn[r][c]) {
            base[r][c] = bitIdx < streamBits.length ? streamBits[bitIdx] : 0;
            bitIdx += 1;
          }
        }
      }
      upward = !upward;
    }

    let bestMask = 0;
    let bestScore = Infinity;
    let bestMat = null;

    for (let mask = 0; mask < 8; mask += 1) {
      const cand = base.map((row) => new Int8Array(row));
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
          if (!isFn[r][c] && evalMaskFunction(mask, r, c)) {
            cand[r][c] ^= 1;
          }
        }
      }

      const fmt = computeFormatBitsL(mask);
      for (let i = 0; i < 15; i += 1) {
        const bit = (fmt >> (14 - i)) & 1;
        // Row 8 left + col 8 top (bits 14..0)
        if (i < 6) cand[8][i] = bit;
        else if (i === 6) cand[8][7] = bit;
        else if (i === 7) cand[8][8] = bit;
        else if (i === 8) cand[7][8] = bit;
        else cand[14 - i][8] = bit;

        // Second copy: bottom-left col 8 (bits 14..8) + top-right row 8 (bits 7..0)
        if (i < 7) cand[n - 1 - i][8] = bit;
        else cand[8][n - 8 + (i - 7)] = bit;
      }

      const sc = scoreQrMatrix(cand);
      if (sc < bestScore) {
        bestScore = sc;
        bestMask = mask;
        bestMat = cand;
      }
    }

    void bestMask;
    return bestMat;
  }

  /* ========================================================================
     13. Viral Sharing, Native Mobile Share & 1080x1920 Story PNG + QR Code
     ======================================================================== */
  let feedbackTimeoutId = null;
  function showShareFeedback(msg, isWarn) {
    if (!els.shareFeedback) return;
    els.shareFeedback.textContent = msg;
    els.shareFeedback.classList.remove('hidden', 'is-warn');
    if (isWarn) els.shareFeedback.classList.add('is-warn');

    clearTimeout(feedbackTimeoutId);
    feedbackTimeoutId = setTimeout(() => {
      els.shareFeedback.classList.add('hidden');
    }, 2800);
  }

  function getShareableScore() {
    const modeKey = getCanonicalMode();
    const score =
      state.latestScore[modeKey] !== undefined && state.latestScore[modeKey] !== null
        ? state.latestScore[modeKey]
        : state.bestScore[modeKey];
    if (score === undefined || score === null) {
      showShareFeedback('Complete 1 round first to lock in your score!', true);
      els.arenaPad.focus({ preventScroll: true });
      return null;
    }
    return { mode: modeKey, score };
  }

  if (els.whatsappDuelBtn) {
    els.whatsappDuelBtn.addEventListener('click', () => {
      const data = getShareableScore();
      if (!data) return;

      const { mode, score } = data;
      const tier = getGlobalTier(mode, score);
      const duelUrl = buildShareableDuelUrl(mode, score);
      const formattedScore = formatScore(mode, score);
      const label = getModeDisplayName(mode);

      const msg = isSpeedBurstMode(mode)
        ? `⚡ I just smashed ${formattedScore} in ${label} on ReflexDuel (${tier.label})! Think you can tap faster? Beat me here: ${duelUrl}`
        : `⚡ I just hit ${formattedScore} in ${label} on ReflexDuel (${tier.label})! Think you're faster? Beat my score here: ${duelUrl}`;

      const waLink = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
      window.open(waLink, '_blank', 'noopener,noreferrer');

      trackEvent('duel_link_shared', { method: 'whatsapp', mode, score });
      showShareFeedback('Opening WhatsApp duel invite...');
    });
  }

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

  async function copyTextSafe(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      // Fallback below
    }
    return fallbackCopy(text);
  }

  if (els.copyDuelLinkBtn) {
    els.copyDuelLinkBtn.addEventListener('click', async () => {
      const data = getShareableScore();
      if (!data) return;

      const duelUrl = buildShareableDuelUrl(data.mode, data.score);
      const copied = await copyTextSafe(duelUrl);

      if (copied) {
        const prevHtml = els.copyDuelLinkBtn.innerHTML;
        els.copyDuelLinkBtn.textContent = '✅ Link Copied!';
        trackEvent('duel_link_shared', { method: 'copy', mode: data.mode, score: data.score });
        showShareFeedback('Duel link copied — paste in Discord, iMessage, IG or Telegram!');
        setTimeout(() => {
          els.copyDuelLinkBtn.innerHTML = prevHtml;
        }, 2200);
      } else {
        showShareFeedback('Clipboard unavailable on this browser.', true);
      }
    });
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawQrCodeOnCanvas(ctx, urlString, boxX, boxY, boxSize) {
    const matrix = encodeQrMatrix(urlString);
    if (!matrix) return;

    drawRoundedRect(ctx, boxX, boxY, boxSize, boxSize, 22);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();

    const quiet = 16;
    const modCount = matrix.length;
    const cellSize = (boxSize - quiet * 2) / modCount;

    ctx.fillStyle = '#0B0D10';
    for (let r = 0; r < modCount; r += 1) {
      for (let c = 0; c < modCount; c += 1) {
        if (matrix[r][c] === 1) {
          ctx.fillRect(
            Math.round(boxX + quiet + c * cellSize),
            Math.round(boxY + quiet + r * cellSize),
            Math.ceil(cellSize),
            Math.ceil(cellSize)
          );
        }
      }
    }
  }

  async function renderStoryCardBlob(modeKey, score) {
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {
        // Proceed cleanly
      }
    }

    const W = 1080;
    const H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0B0D10';
    ctx.fillRect(0, 0, W, H);

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

    ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
    for (let x = 60; x < W; x += 48) {
      for (let y = 60; y < H; y += 48) {
        ctx.fillRect(x, y, 3, 3);
      }
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 64px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('ReflexDuel ⚡', W / 2, 175);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 23px "JetBrains Mono", monospace';
    ctx.fillText('GLOBAL MILLISECOND & CPS ARENA', W / 2, 226);

    const cardX = 80;
    const cardY = 285;
    const cardW = W - 160;
    const cardH = 1140;

    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 52);
    ctx.fillStyle = '#14181F';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
    ctx.stroke();

    const modeTitle = getModeDisplayName(modeKey).toUpperCase();
    drawRoundedRect(ctx, W / 2 - 270, cardY + 70, 540, 62, 31);
    ctx.fillStyle = '#1B212B';
    ctx.fill();
    ctx.strokeStyle = '#2E3748';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#34D399';
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillText(modeTitle, W / 2, cardY + 110, 500);

    const playerName = (
      (els.playerNameInput ? els.playerNameInput.value.trim().slice(0, 20) : '') || 'CHALLENGER'
    ).toUpperCase();
    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 30px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`PLAYER: ${playerName}`, W / 2, cardY + 210, cardW - 140);

    const scoreText = formatScore(modeKey, score);
    ctx.save();
    ctx.shadowColor = 'rgba(16, 185, 129, 0.45)';
    ctx.shadowBlur = 45;
    ctx.fillStyle = '#34D399';
    ctx.font = '700 148px "JetBrains Mono", monospace';
    ctx.fillText(scoreText, W / 2, cardY + 455, cardW - 120);
    ctx.restore();

    const tier = getGlobalTier(modeKey, score);
    drawRoundedRect(ctx, cardX + 64, cardY + 545, cardW - 128, 86, 43);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#FBBF24';
    ctx.font = '700 28px "JetBrains Mono", monospace';
    ctx.fillText(tier.label, W / 2, cardY + 598, cardW - 170);

    const boxY = cardY + 700;
    if (state.incomingDuel && state.incomingDuel.m === modeKey) {
      const won = state.duelOutcome === 'won';
      drawRoundedRect(ctx, cardX + 64, boxY, cardW - 128, 175, 28);
      ctx.fillStyle = won ? 'rgba(16, 185, 129, 0.14)' : '#0E1116';
      ctx.fill();
      ctx.strokeStyle = won ? '#10B981' : '#222936';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = won ? '#34D399' : '#F59E0B';
      ctx.font = '700 28px "JetBrains Mono", monospace';
      const duelHeading = won ? '👑 1V1 DUEL VICTORY' : '⚔️ 1V1 CHALLENGER TARGET';
      ctx.fillText(duelHeading, W / 2, boxY + 62, cardW - 170);

      ctx.fillStyle = '#F8FAFC';
      ctx.font = '600 30px "Space Grotesk", system-ui, sans-serif';
      const duelLine = won
        ? `${playerName} BEAT ${state.incomingDuel.n.toUpperCase()} BY ${state.duelDiffText}`
        : `TARGET: ${formatScore(modeKey, state.incomingDuel.s)} (${state.incomingDuel.n.toUpperCase()})`;
      ctx.fillText(duelLine, W / 2, boxY + 124, cardW - 170);
    } else {
      const pb = state.bestScore[modeKey] !== undefined && state.bestScore[modeKey] !== null ? state.bestScore[modeKey] : score;
      const boxW = (cardW - 128 - 28) / 2;

      drawRoundedRect(ctx, cardX + 64, boxY, boxW, 175, 28);
      ctx.fillStyle = '#0E1116';
      ctx.fill();
      ctx.strokeStyle = '#222936';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.font = '600 22px "JetBrains Mono", monospace';
      ctx.fillText('PERSONAL BEST', cardX + 64 + boxW / 2, boxY + 62);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '700 42px "JetBrains Mono", monospace';
      ctx.fillText(formatScore(modeKey, pb), cardX + 64 + boxW / 2, boxY + 125, boxW - 36);

      const rightX = cardX + 64 + boxW + 28;
      drawRoundedRect(ctx, rightX, boxY, boxW, 175, 28);
      ctx.fillStyle = '#0E1116';
      ctx.fill();
      ctx.strokeStyle = '#222936';
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.font = '600 22px "JetBrains Mono", monospace';
      ctx.fillText('GLOBAL TIER', rightX + boxW / 2, boxY + 62);
      ctx.fillStyle = '#34D399';
      ctx.font = '700 42px "JetBrains Mono", monospace';
      ctx.fillText(`TOP ${tier.pct}%`, rightX + boxW / 2, boxY + 125, boxW - 36);
    }

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 32px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('CAN YOU BEAT THIS SCORE?', W / 2, cardY + 1015, cardW - 120);

    // Bottom Scannable QR Duel Code + Canonical Domain Footer
    const qrDuelUrl = buildCanonicalQrDuelUrl(modeKey, score);
    const qrBoxSize = 230;
    const qrBoxX = W - 80 - qrBoxSize;
    const qrBoxY = 1495;
    drawQrCodeOnCanvas(ctx, qrDuelUrl, qrBoxX, qrBoxY, qrBoxSize);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 30px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('SCAN QR TO ACCEPT DUEL', 90, 1555, qrBoxX - 115);

    ctx.fillStyle = '#10B981';
    ctx.font = '700 34px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText('reflexduel.vercel.app', 90, 1615, qrBoxX - 115);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText('ZERO-LAG MILLISECOND & CPS ARENA', 90, 1670, qrBoxX - 115);

    const slug = isSpeedBurstMode(modeKey)
      ? `${Number(score).toFixed(1)}cps`
      : `${Math.round(score)}ms`;
    const fileName = `reflexduel-${modeKey}-${slug}.png`;

    const blob = await new Promise((resolve) => {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((b) => resolve(b), 'image/png');
      } else {
        resolve(null);
      }
    });

    return { canvas, blob, fileName, duelUrl: qrDuelUrl };
  }

  function triggerBlobOrDataUrlDownload(canvas, blob, fileName) {
    const a = document.createElement('a');
    let objectUrl = null;
    if (blob) {
      objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
    } else {
      a.href = canvas.toDataURL('image/png');
    }
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (objectUrl) {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }

  if (els.downloadCardBtn) {
    els.downloadCardBtn.addEventListener('click', async () => {
      const data = getShareableScore();
      if (!data) return;

      const origHtml = els.downloadCardBtn.innerHTML;
      els.downloadCardBtn.textContent = '⏳ Rendering...';
      els.downloadCardBtn.disabled = true;

      try {
        const res = await renderStoryCardBlob(data.mode, data.score);
        triggerBlobOrDataUrlDownload(res.canvas, res.blob, res.fileName);
        trackEvent('story_png_downloaded', { mode: data.mode, score: data.score });
        showShareFeedback('1080×1920 Story PNG + QR saved!');
      } catch (_) {
        showShareFeedback('Could not generate Story PNG on this browser.', true);
      } finally {
        els.downloadCardBtn.innerHTML = origHtml;
        els.downloadCardBtn.disabled = false;
      }
    });
  }

  if (els.nativeShareBtn) {
    els.nativeShareBtn.addEventListener('click', async () => {
      const data = getShareableScore();
      if (!data) return;

      const origHtml = els.nativeShareBtn.innerHTML;
      els.nativeShareBtn.textContent = '⏳ Preparing...';
      els.nativeShareBtn.disabled = true;

      try {
        const formatted = formatScore(data.mode, data.score);
        const modeLabel = getModeDisplayName(data.mode);
        const duelUrl = buildShareableDuelUrl(data.mode, data.score);
        const res = await renderStoryCardBlob(data.mode, data.score);
        const shareText = `⚡ I just scored ${formatted} in ${modeLabel} on ReflexDuel! Beat my score: ${duelUrl}`;

        let sharedViaNative = false;
        if (navigator && typeof navigator.share === 'function') {
          const sharePayload = {
            title: `ReflexDuel Challenge: ${formatted}`,
            text: shareText,
            url: duelUrl
          };
          if (res.blob && typeof File === 'function') {
            const pngFile = new File([res.blob], res.fileName, { type: 'image/png' });
            if (!navigator.canShare || navigator.canShare({ files: [pngFile] })) {
              sharePayload.files = [pngFile];
            }
          }
          await navigator.share(sharePayload);
          sharedViaNative = true;
        }

        if (sharedViaNative) {
          trackEvent('duel_link_shared', { method: 'native_share', mode: data.mode, score: data.score });
          showShareFeedback('Shared score card + duel link!');
        } else {
          await copyTextSafe(duelUrl);
          triggerBlobOrDataUrlDownload(res.canvas, res.blob, res.fileName);
          trackEvent('duel_link_shared', { method: 'native_fallback', mode: data.mode, score: data.score });
          showShareFeedback('Link copied & 9:16 PNG saved!');
        }
      } catch (err) {
        if (err && err.name !== 'AbortError') {
          showShareFeedback('Share cancelled or unavailable — use Copy Link or PNG.', true);
        }
      } finally {
        els.nativeShareBtn.innerHTML = origHtml;
        els.nativeShareBtn.disabled = false;
      }
    });
  }

  /* ========================================================================
     14. Confetti Celebration Canvas
     ======================================================================== */
  let confettiRafId = null;
  function launchConfetti() {
    const canvas = els.confettiCanvas;
    if (!canvas) return;
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
     15. Legal & Compliance Modal (Privacy + Google DART Cookie + Mailto Form)
     ======================================================================== */
  const LEGAL_SECTIONS = {
    privacy: `
      <h3>Privacy Policy &amp; Google DART Cookie Disclosure</h3>
      <p><strong>Zero-Backend Client Processing:</strong> ReflexDuel runs entirely inside your web browser. We do not collect, transmit, or store your gamer tag, reaction time scores, or CPS metrics on any backend database. Your optional display name, streak stats, and personal best records remain strictly inside your device's <code>localStorage</code>.</p>
      <p><strong>URL Challenge Tokens:</strong> When you generate a <code>?duel=</code> link, your entered nickname, game mode, and score are Base64-encoded directly into the shareable query string.</p>
      <p><strong>Google AdSense, Third-Party Cookies &amp; Google DART Cookie:</strong></p>
      <ul>
        <li>Third-party vendors, including Google, use cookies to serve advertisements based on a user's prior visits to ReflexDuel or other websites across the Internet.</li>
        <li>Google's use of advertising cookies, including the <strong>Google DART cookie</strong>, enables Google and its partners to serve relevant ads based on your visit to this site and/or other sites on the Internet.</li>
        <li>Users may opt out of personalized advertising by visiting <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" style="color:#34D399;">adssettings.google.com</a>, or opt out of third-party vendor cookies for personalized ads at <a href="https://www.aboutads.info" target="_blank" rel="noopener noreferrer" style="color:#34D399;">aboutads.info</a>.</li>
      </ul>
      <p><strong>Google Analytics 4 (GA4), GTM &amp; Consent Mode v2:</strong> ReflexDuel respects your cookie banner choice via Google Consent Mode v2 and sends anonymized feature telemetry only as permitted by your browser consent settings.</p>
    `,
    terms: `
      <h3>Terms of Use</h3>
      <p>By accessing ReflexDuel (<code>reflexduel.vercel.app</code>), you agree to use this web application solely for personal reflex training, lawful entertainment, and friendly challenges.</p>
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
      <p>Need to report a misleading duel link, browser timing issue, or privacy/AdSense concern? Send a message directly using the form below or email <a href="mailto:${CONTACT_EMAIL}" style="color:#34D399;">${CONTACT_EMAIL}</a>.</p>
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
      const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
    if (!els.legalModal) return;
    state.lastFocusedElement = document.activeElement;
    selectLegalTab(tabKey);
    els.legalModal.classList.remove('hidden');
    if (els.legalModalClose) els.legalModalClose.focus();
  }

  function closeLegalModal() {
    if (!els.legalModal) return;
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

  if (els.legalModalClose) {
    els.legalModalClose.addEventListener('click', closeLegalModal);
  }
  if (els.legalModal) {
    els.legalModal.addEventListener('click', (e) => {
      if (e.target === els.legalModal) closeLegalModal();
    });
  }

  /* ========================================================================
     16. Service Worker Registration (Network-First) & Boot
     ======================================================================== */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.protocol === 'http:')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => { });
      });
    }
  }

  loadSavedState();
  initConsentBanner();
  switchMode(state.mode, true);
  initDuelFromUrl();
  registerServiceWorker();
})();

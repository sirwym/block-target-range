import { SOUND_PATHS, WEAPON_CONFIG } from "./config.js";

let audioContext;
const audioBuffers = new Map();
const loadingBuffers = new Map();
const failedBuffers = new Set();
const lastFireTime = {};
const activeSources = new Set();
const MAX_ACTIVE_SOURCES = 8;
let preloaded = false;

export function extractWeaponId(type) {
  const match = type.match(/^([a-z0-9]+)(Fire|Reload|Draw)$/);
  return match ? match[1] : null;
}

export function shouldThrottle(type, now, lastFire = 0, activeCount = 0) {
  if (!type.endsWith("Fire")) return false;
  const weaponId = extractWeaponId(type);
  const fireInterval = WEAPON_CONFIG[weaponId]?.fireInterval ?? 0.1;
  const minInterval = fireInterval * 0.8;
  if (now - (lastFire ?? 0) < minInterval && activeCount >= 3) return true;
  if (activeCount >= MAX_ACTIVE_SOURCES) return true;
  return false;
}

export function getActiveSourceCount() {
  return activeSources.size;
}

export function ensureAudio() {
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtor();
  }
  if (audioContext.state === "suspended") audioContext.resume();
  if (!preloaded) {
    preloaded = true;
    preloadAudioClips();
  }
}

export function preloadAudioClips() {
  Object.keys(SOUND_PATHS).forEach((type) => loadAudioClip(type));
}

export function playSound(type) {
  if (!audioContext) return;
  if (SOUND_PATHS[type]) {
    playAudioClip(type);
    return;
  }
  const now = audioContext.currentTime;
  if (type === "blockHit") {
    playBlockHitSound(now);
    return;
  }

  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(type === "damage" ? 0.08 : 0.055, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
  gain.connect(audioContext.destination);

  const osc = audioContext.createOscillator();
  osc.type = type === "burst" || type === "damage" ? "sawtooth" : type === "hit" || type === "critical" ? "triangle" : "square";
  const [start, end, duration] = getSoundShape(type);
  osc.frequency.setValueAtTime(start, now);
  osc.frequency.exponentialRampToValueAtTime(end, now + duration);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playBlockHitSound(now) {
  const noiseBuffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 0.08), audioContext.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const noise = audioContext.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseGain = audioContext.createGain();
  noiseGain.gain.setValueAtTime(0.05, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  noise.connect(noiseGain);
  noiseGain.connect(audioContext.destination);
  noise.start(now);

  const thunk = audioContext.createOscillator();
  const thunkGain = audioContext.createGain();
  thunk.type = "square";
  thunk.frequency.setValueAtTime(155, now);
  thunk.frequency.exponentialRampToValueAtTime(92, now + 0.09);
  thunkGain.gain.setValueAtTime(0.045, now);
  thunkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  thunk.connect(thunkGain);
  thunkGain.connect(audioContext.destination);
  thunk.start(now);
  thunk.stop(now + 0.12);
}

function getSoundShape(type) {
  const shapes = {
    start: [380, 720, 0.18],
    shoot: [560, 220, 0.11],
    hit: [760, 520, 0.1],
    critical: [980, 1380, 0.16],
    defeat: [420, 900, 0.18],
    burst: [180, 70, 0.22],
    combo: [660, 1040, 0.2],
    damage: [150, 68, 0.28],
    win: [520, 880, 0.32],
    lose: [180, 95, 0.34],
  };
  return shapes[type] ?? [440, 220, 0.15];
}

function playAudioClip(type) {
  const now = audioContext.currentTime;
  if (shouldThrottle(type, now, lastFireTime[type] ?? 0, activeSources.size)) return;
  lastFireTime[type] = now;
  const buffer = audioBuffers.get(type);
  if (!buffer) {
    loadAudioClip(type);
    playFallbackGunSound(type);
    return;
  }
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(type.includes("Fire") ? 0.46 : 0.32, now);
  source.connect(gain);
  gain.connect(audioContext.destination);
  activeSources.add(source);
  source.onended = () => activeSources.delete(source);
  source.start(now);
}

export function loadAudioClip(type) {
  if (audioBuffers.has(type)) return Promise.resolve(audioBuffers.get(type));
  if (failedBuffers.has(type) || loadingBuffers.has(type)) return loadingBuffers.get(type) ?? Promise.resolve(null);
  const loading = fetch(SOUND_PATHS[type])
    .then((response) => {
      if (!response.ok) throw new Error(`Audio load failed: ${type}`);
      return response.arrayBuffer();
    })
    .then((data) => audioContext.decodeAudioData(data))
    .then((buffer) => {
      audioBuffers.set(type, buffer);
      loadingBuffers.delete(type);
      return buffer;
    })
    .catch(() => {
      loadingBuffers.delete(type);
      failedBuffers.add(type);
      return null;
    });
  loadingBuffers.set(type, loading);
  return loading;
}

function playFallbackGunSound(type) {
  const now = audioContext.currentTime;
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(type.includes("Reload") ? 0.05 : 0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  gain.connect(audioContext.destination);

  const osc = audioContext.createOscillator();
  osc.type = type.includes("Reload") ? "triangle" : "sawtooth";
  osc.frequency.setValueAtTime(type.includes("Reload") ? 260 : 130, now);
  osc.frequency.exponentialRampToValueAtTime(type.includes("Reload") ? 170 : 56, now + 0.1);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.15);
}

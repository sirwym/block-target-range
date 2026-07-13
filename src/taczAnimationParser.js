const TACS_ANIMATION_ROOT = "assets/tacz/animations";
const TACS_PLAYER_ANIMATOR_ROOT = "assets/tacz/player_animator";

const DEG_TO_RAD = Math.PI / 180;
const VECTOR3_ZERO = [0, 0, 0];
const VECTOR3_ONE = [1, 1, 1];

const animationCache = new Map();
const playerAnimationCache = new Map();
const loadErrors = new Map();

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function isNumberArray(value) {
  return Array.isArray(value) && value.every((item) => Number.isFinite(Number(item)));
}

function sanitizeVec3(value, fallback = VECTOR3_ZERO) {
  if (!isNumberArray(value)) return [...fallback];
  return [
    Number(value[0] ?? fallback[0] ?? 0),
    Number(value[1] ?? fallback[1] ?? 0),
    Number(value[2] ?? fallback[2] ?? 0),
  ];
}

function normalizeFrameValue(rawFrame, fallbackMode = "linear") {
  if (isNumberArray(rawFrame)) {
    const value = sanitizeVec3(rawFrame);
    return { pre: value, post: value, mode: fallbackMode };
  }
  if (rawFrame && typeof rawFrame === "object") {
    const post = sanitizeVec3(rawFrame.post ?? rawFrame.pre ?? rawFrame.value ?? VECTOR3_ZERO);
    const pre = sanitizeVec3(rawFrame.pre ?? rawFrame.post ?? rawFrame.value ?? post);
    return { pre, post, mode: rawFrame.lerp_mode ?? fallbackMode };
  }
  return { pre: [...VECTOR3_ZERO], post: [...VECTOR3_ZERO], mode: fallbackMode };
}

function parseTrack(rawTrack, kind) {
  if (rawTrack == null) return null;
  if (isNumberArray(rawTrack)) {
    const value = convertTrackValue(sanitizeVec3(rawTrack, kind === "scale" ? VECTOR3_ONE : VECTOR3_ZERO), kind);
    return {
      kind,
      static: true,
      frames: [{ time: 0, pre: value, post: value, mode: "linear" }],
      duration: 0,
    };
  }
  if (typeof rawTrack !== "object") return null;

  const frames = Object.entries(rawTrack)
    .map(([timeKey, rawFrame]) => {
      const time = Number(timeKey);
      if (!Number.isFinite(time)) return null;
      const normalized = normalizeFrameValue(rawFrame);
      return {
        time,
        pre: convertTrackValue(normalized.pre, kind),
        post: convertTrackValue(normalized.post, kind),
        mode: normalized.mode ?? "linear",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  if (frames.length === 0) return null;
  return {
    kind,
    static: frames.length === 1,
    frames,
    duration: frames[frames.length - 1].time,
  };
}

function convertTrackValue(value, kind) {
  const vec = sanitizeVec3(value, kind === "scale" ? VECTOR3_ONE : VECTOR3_ZERO);
  if (kind !== "rotation") return vec;
  return vec.map((component) => component * DEG_TO_RAD);
}

function parseBone(rawBone = {}) {
  return {
    position: parseTrack(rawBone.position, "position"),
    rotation: parseTrack(rawBone.rotation, "rotation"),
    scale: parseTrack(rawBone.scale, "scale"),
  };
}

function collectAnimationDuration(rawAnimation, bones) {
  const declared = Number(rawAnimation.animation_length);
  if (Number.isFinite(declared) && declared > 0) return declared;
  let duration = 0;
  for (const bone of Object.values(bones)) {
    for (const track of Object.values(bone)) {
      duration = Math.max(duration, track?.duration ?? 0);
    }
  }
  return duration || 0.0667;
}

function parseTimedEffects(raw = {}) {
  return Object.entries(raw)
    .map(([timeKey, event]) => {
      const time = Number(timeKey);
      if (!Number.isFinite(time)) return null;
      const effect = typeof event === "string" ? event : event?.effect ?? event?.sound ?? event?.name ?? "";
      return { time, effect, raw: event };
    })
    .filter((event) => event && event.effect)
    .sort((a, b) => a.time - b.time);
}

export function parseTaczAnimationJson(json, sourcePath = "") {
  const animations = {};
  for (const [name, rawAnimation] of Object.entries(json.animations ?? {})) {
    const bones = {};
    for (const [boneName, rawBone] of Object.entries(rawAnimation.bones ?? {})) {
      bones[boneName] = parseBone(rawBone);
    }
    animations[name] = {
      name,
      sourcePath,
      formatVersion: json.format_version,
      loop: rawAnimation.loop ?? false,
      length: collectAnimationDuration(rawAnimation, bones),
      bones,
      soundEffects: parseTimedEffects(rawAnimation.sound_effects),
      effects: parseTimedEffects(rawAnimation.effects),
    };
  }
  return {
    sourcePath,
    formatVersion: json.format_version,
    animations,
    animationNames: Object.keys(animations),
  };
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

export async function loadTaczAnimation(path) {
  if (!path) throw new Error("Missing TaCZ animation path");
  if (animationCache.has(path)) return animationCache.get(path);
  const json = await fetchJson(path);
  const parsed = parseTaczAnimationJson(json, path);
  animationCache.set(path, parsed);
  return parsed;
}

export async function loadPlayerAnimation(path) {
  if (!path) return null;
  if (playerAnimationCache.has(path)) return playerAnimationCache.get(path);
  const json = await fetchJson(path);
  playerAnimationCache.set(path, json);
  return json;
}

export async function preloadTaczAnimations(configs, weaponIds) {
  const results = {};
  for (const weaponId of weaponIds) {
    const profile = configs[weaponId]?.v2AnimationProfile;
    if (!profile?.animationPath) {
      const error = new Error(`${weaponId} missing v2AnimationProfile.animationPath`);
      loadErrors.set(weaponId, error);
      results[weaponId] = { animation: null, playerAnimation: null, error };
      continue;
    }
    try {
      const [animation, playerAnimation] = await Promise.all([
        loadTaczAnimation(profile.animationPath),
        loadPlayerAnimation(profile.playerAnimationPath),
      ]);
      results[weaponId] = { animation, playerAnimation, error: null };
      loadErrors.delete(weaponId);
    } catch (error) {
      loadErrors.set(weaponId, error);
      results[weaponId] = { animation: null, playerAnimation: null, error };
    }
  }
  return results;
}

export function getTaczAnimation(pathOrProfile) {
  const path = typeof pathOrProfile === "string" ? pathOrProfile : pathOrProfile?.animationPath;
  return path ? animationCache.get(path) ?? null : null;
}

export function getTaczLoadError(weaponId) {
  return loadErrors.get(weaponId) ?? null;
}

function linear(a, b, t) {
  return a + (b - a) * t;
}

function lerpVec3(a, b, t) {
  return [
    linear(a[0] ?? 0, b[0] ?? 0, t),
    linear(a[1] ?? 0, b[1] ?? 0, t),
    linear(a[2] ?? 0, b[2] ?? 0, t),
  ];
}

function catmullRom(a, b, c, d, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * b)
    + (-a + c) * t
    + (2 * a - 5 * b + 4 * c - d) * t2
    + (-a + 3 * b - 3 * c + d) * t3
  );
}

function catmullRomVec3(p0, p1, p2, p3, t) {
  return [
    catmullRom(p0[0] ?? 0, p1[0] ?? 0, p2[0] ?? 0, p3[0] ?? 0, t),
    catmullRom(p0[1] ?? 0, p1[1] ?? 0, p2[1] ?? 0, p3[1] ?? 0, t),
    catmullRom(p0[2] ?? 0, p1[2] ?? 0, p2[2] ?? 0, p3[2] ?? 0, t),
  ];
}

export function sampleTrack(track, time, fallback = VECTOR3_ZERO) {
  if (!track?.frames?.length) return [...fallback];
  const frames = track.frames;
  if (time <= frames[0].time) return [...frames[0].post];
  const last = frames[frames.length - 1];
  if (time >= last.time) return [...last.post];

  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (frames[mid].time <= time) lo = mid;
    else hi = mid;
  }

  const left = frames[lo];
  const right = frames[hi];
  const span = Math.max(0.00001, right.time - left.time);
  const t = clamp01((time - left.time) / span);
  const mode = right.mode ?? left.mode ?? "linear";
  if (mode === "catmullrom") {
    const p0 = frames[Math.max(0, lo - 1)].post;
    const p1 = left.post;
    const p2 = right.pre;
    const p3 = frames[Math.min(frames.length - 1, hi + 1)].pre;
    return catmullRomVec3(p0, p1, p2, p3, t);
  }
  return lerpVec3(left.post, right.pre, t);
}

export function sampleBone(animation, boneName, time) {
  const bone = animation?.bones?.[boneName];
  if (!bone) return null;
  return {
    position: sampleTrack(bone.position, time, VECTOR3_ZERO),
    rotation: sampleTrack(bone.rotation, time, VECTOR3_ZERO),
    scale: sampleTrack(bone.scale, time, VECTOR3_ONE),
  };
}

export function sampleAnimation(animationData, animationName, timeOrProgress, { normalized = false } = {}) {
  const animation = animationData?.animations?.[animationName];
  if (!animation) return null;
  const time = normalized ? clamp01(timeOrProgress) * animation.length : Math.max(0, timeOrProgress);
  const clampedTime = animation.loop === true ? (time % animation.length) : Math.min(time, animation.length);
  const bones = {};
  for (const boneName of Object.keys(animation.bones)) {
    bones[boneName] = sampleBone(animation, boneName, clampedTime);
  }
  return {
    name: animation.name,
    time: clampedTime,
    length: animation.length,
    loop: animation.loop,
    bones,
    soundEffects: animation.soundEffects,
    effects: animation.effects,
  };
}

export function resolveTaczAnimationPath(fileName) {
  return `${TACS_ANIMATION_ROOT}/${fileName}`;
}

export function resolveTaczPlayerAnimationPath(fileName) {
  return `${TACS_PLAYER_ANIMATOR_ROOT}/${fileName}`;
}

export const _TEST_ONLY = {
  parseTrack,
  parseTimedEffects,
  parseTaczAnimationJson,
  sampleTrack,
  sampleBone,
  sampleAnimation,
  clearCaches: () => {
    animationCache.clear();
    playerAnimationCache.clear();
    loadErrors.clear();
  },
  setAnimationCache: (path, data) => animationCache.set(path, data),
};

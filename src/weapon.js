export function getBowFrame(animationTimer, animationDuration) {
  if (animationTimer <= 0 || animationDuration <= 0) return "bow";
  const progress = 1 - animationTimer / animationDuration;
  if (progress < 0.34) return "bowPulling0";
  if (progress < 0.68) return "bowPulling1";
  return "bowPulling2";
}

export function createWeaponState(order, configs) {
  return {
    currentWeaponId: order[0],
    ammo: Object.fromEntries(order.map((id) => [id, configs[id].magazineSize])),
    fireTimer: 0,
    reloading: false,
    reloadTimer: 0,
    reloadDuration: 0,
    triggerHeld: false,
    semiAutoLocked: false,
  };
}

export function getCurrentWeapon(state, configs) {
  return configs[state.currentWeaponId];
}

export function selectWeapon(state, weaponId, configs) {
  if (!configs[weaponId] || weaponId === state.currentWeaponId) return state;
  return {
    ...state,
    currentWeaponId: weaponId,
    reloading: false,
    reloadTimer: 0,
    reloadDuration: 0,
    fireTimer: 0,
    semiAutoLocked: false,
  };
}

export function setTriggerHeld(state, held) {
  return {
    ...state,
    triggerHeld: held,
    semiAutoLocked: held ? state.semiAutoLocked : false,
  };
}

export function canFireWeapon(state, weapon) {
  return Boolean(weapon)
    && !state.reloading
    && state.fireTimer <= 0
    && (state.ammo[weapon.id] ?? 0) > 0
    && (weapon.automatic || !state.semiAutoLocked);
}

export function fireWeapon(state, weapon) {
  if (!canFireWeapon(state, weapon)) return { state, fired: false };
  const nextAmmo = Math.max(0, (state.ammo[weapon.id] ?? 0) - 1);
  return {
    fired: true,
    state: {
      ...state,
      ammo: {
        ...state.ammo,
        [weapon.id]: nextAmmo,
      },
      fireTimer: weapon.fireInterval,
      semiAutoLocked: !weapon.automatic,
    },
  };
}

export function startReload(state, weapon) {
  if (!weapon || state.reloading) return { state, started: false };
  if ((state.ammo[weapon.id] ?? 0) >= weapon.magazineSize) return { state, started: false };

  // 区分空仓换弹（弹匣打空）和战术换弹（弹匣有余弹）。
  // 两者的时长和声音不同：空仓用 reloadEmpty，战术用 reloadTactical。
  // 时长来自 V2 data.json 的 cooldown.empty / cooldown.tactical。
  const isEmpty = (state.ammo[weapon.id] ?? 0) === 0;
  const reloadConfig = isEmpty ? weapon.reloadEmpty : weapon.reloadTactical;
  const reloadDuration = reloadConfig?.duration ?? weapon.reloadDuration;

  return {
    started: true,
    isEmpty,
    reloadDuration,
    state: {
      ...state,
      reloading: true,
      reloadTimer: reloadDuration,
      reloadDuration,
      semiAutoLocked: false,
    },
  };
}

export function updateWeaponState(state, delta, configs) {
  const fireTimer = Math.max(0, state.fireTimer - delta);
  if (!state.reloading) return { ...state, fireTimer };

  const reloadTimer = Math.max(0, state.reloadTimer - delta);
  if (reloadTimer > 0) return { ...state, fireTimer, reloadTimer };

  const weapon = getCurrentWeapon(state, configs);
  return {
    ...state,
    ammo: {
      ...state.ammo,
      [weapon.id]: weapon.magazineSize,
    },
    fireTimer,
    reloading: false,
    reloadTimer: 0,
    reloadDuration: 0,
  };
}

export function getReloadProgress(state) {
  if (!state.reloading || state.reloadDuration <= 0) return 0;
  return 1 - state.reloadTimer / state.reloadDuration;
}

export function consumeJumpRequest(player, config) {
  if (!player.jumpRequested) return pickJumpState(player);
  if (!player.grounded) return { ...pickJumpState(player), jumpRequested: false };
  return {
    playerY: config.playerGroundY,
    verticalVelocity: config.playerJumpVelocity,
    grounded: false,
    jumpRequested: false,
  };
}

export function updateJumpState(player, delta, config) {
  if (player.grounded) {
    return {
      ...pickJumpState(player),
      playerY: config.playerGroundY,
      verticalVelocity: 0,
    };
  }
  const verticalVelocity = player.verticalVelocity - config.playerGravity * delta;
  const playerY = player.playerY + verticalVelocity * delta;
  if (playerY <= config.playerGroundY) {
    return {
      playerY: config.playerGroundY,
      verticalVelocity: 0,
      grounded: true,
      jumpRequested: false,
    };
  }
  return {
    playerY,
    verticalVelocity,
    grounded: false,
    jumpRequested: false,
  };
}

function pickJumpState(player) {
  return {
    playerY: player.playerY,
    verticalVelocity: player.verticalVelocity,
    grounded: player.grounded,
    jumpRequested: player.jumpRequested,
  };
}

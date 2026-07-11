export function makeAabb(minX, minY, minZ, maxX, maxY, maxZ) {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export function aabbIntersects(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX
    && a.minY <= b.maxY && a.maxY >= b.minY
    && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

export function makeEnemyAabb(position, radius = 0.72, height = 2.8) {
  return makeAabb(
    position.x - radius,
    position.y,
    position.z - radius,
    position.x + radius,
    position.y + height,
    position.z + radius
  );
}

export function wouldEnemyCollide(nextPosition, colliders, radius = 0.72, height = 2.8) {
  const enemyBox = makeEnemyAabb(nextPosition, radius, height);
  return colliders.some((entry) => aabbIntersects(enemyBox, entry.box ?? entry));
}

export function resolveCircleCollision(position, colliders, radius, bounds) {
  const resolved = { x: position.x, y: position.y, z: position.z };
  colliders.forEach((entry) => {
    const box = entry.box ?? entry;
    if (resolved.y < box.minY - 0.2 || resolved.y > box.maxY + 2.2) return;
    const closestX = clamp(resolved.x, box.minX, box.maxX);
    const closestZ = clamp(resolved.z, box.minZ, box.maxZ);
    let dx = resolved.x - closestX;
    let dz = resolved.z - closestZ;
    let distanceSq = dx * dx + dz * dz;

    if (distanceSq < 0.0001 && resolved.x >= box.minX && resolved.x <= box.maxX && resolved.z >= box.minZ && resolved.z <= box.maxZ) {
      const distances = [
        { axis: "x", value: box.minX - radius, distance: Math.abs(resolved.x - box.minX) },
        { axis: "x", value: box.maxX + radius, distance: Math.abs(box.maxX - resolved.x) },
        { axis: "z", value: box.minZ - radius, distance: Math.abs(resolved.z - box.minZ) },
        { axis: "z", value: box.maxZ + radius, distance: Math.abs(box.maxZ - resolved.z) },
      ].sort((a, b) => a.distance - b.distance);
      if (distances[0].axis === "x") resolved.x = distances[0].value;
      else resolved.z = distances[0].value;
      return;
    }

    if (distanceSq >= radius * radius) return;

    if (distanceSq < 0.0001) {
      const centerX = (box.minX + box.maxX) / 2;
      const centerZ = (box.minZ + box.maxZ) / 2;
      const toX = resolved.x - centerX;
      const toZ = resolved.z - centerZ;
      if (Math.abs(toX) > Math.abs(toZ)) {
        dx = Math.sign(toX || 1);
        dz = 0;
      } else {
        dx = 0;
        dz = Math.sign(toZ || 1);
      }
      distanceSq = 1;
    }

    const distance = Math.sqrt(distanceSq);
    const push = radius - distance;
    resolved.x += (dx / distance) * push;
    resolved.z += (dz / distance) * push;
  });

  resolved.x = clamp(resolved.x, -bounds.x, bounds.x);
  resolved.z = clamp(resolved.z, bounds.zMin, bounds.zMax);
  return resolved;
}

export function nearestHit(hitGroups) {
  return hitGroups.flat().sort((a, b) => a.distance - b.distance)[0] ?? null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Soft shading for flat-shaded ("Polyart") models: every vertex takes the average normal of the
// vertices at the same position whose faces bend less than maxAngle from its own, so rounded shapes
// read round while real edges (a blade, a shield rim) stay sharp. Works on one primitive's arrays.
export function smoothNormals(positions, normals, maxAngleDeg = 60) {
  const count = positions.length / 3;
  const cos = Math.cos((maxAngleDeg * Math.PI) / 180);
  const key = (i) => `${positions[i * 3].toFixed(5)},${positions[i * 3 + 1].toFixed(5)},${positions[i * 3 + 2].toFixed(5)}`;
  const groups = new Map();
  for (let i = 0; i < count; i++) {
    const k = key(i);
    const list = groups.get(k);
    if (list) list.push(i);
    else groups.set(k, [i]);
  }
  const out = new Float32Array(normals.length);
  for (const list of groups.values()) {
    for (const i of list) {
      let x = 0, y = 0, z = 0;
      const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
      for (const j of list) {
        const mx = normals[j * 3], my = normals[j * 3 + 1], mz = normals[j * 3 + 2];
        if (nx * mx + ny * my + nz * mz < cos) continue;
        x += mx; y += my; z += mz;
      }
      const len = Math.hypot(x, y, z) || 1;
      out[i * 3] = x / len; out[i * 3 + 1] = y / len; out[i * 3 + 2] = z / len;
    }
  }
  return out;
}

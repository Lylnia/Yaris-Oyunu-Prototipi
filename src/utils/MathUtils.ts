/** Clamp value between min and max */
export function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * clamp(t, 0, 1);
}

/** Normalize angle to [-PI, PI] */
export function normalizeAngle(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

/** Lerp between two angles (shortest path) */
export function lerpAngle(a: number, b: number, t: number): number {
    let diff = normalizeAngle(b - a);
    return a + diff * clamp(t, 0, 1);
}

/** Degrees to radians */
export function deg2rad(d: number): number { return d * Math.PI / 180; }

/** Radians to degrees */
export function rad2deg(r: number): number { return r * 180 / Math.PI; }

/** m/s to km/h */
export function msToKmh(ms: number): number { return ms * 3.6; }

/** km/h to m/s */
export function kmhToMs(kmh: number): number { return kmh / 3.6; }

/** Smooth step */
export function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

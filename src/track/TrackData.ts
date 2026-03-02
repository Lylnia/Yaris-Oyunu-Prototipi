import * as THREE from 'three';

/**
 * NASCAR-style oval track data.
 * Counterclockwise, left turns only.
 * ~1500m circumference, ~50-60s laps.
 */
export const TRACK_WIDTH = 18; // metres — wide NASCAR-style

export const TRACK_CONTROL_POINTS: THREE.Vector3[] = [
    // ── Right straight (heading +Z, northbound) ──
    new THREE.Vector3(150, 0, -200),
    new THREE.Vector3(150, 0, -100),
    new THREE.Vector3(150, 0, 0),
    new THREE.Vector3(150, 0, 100),
    new THREE.Vector3(150, 0, 200),

    // ── Turn 1: top left curve (banked) ──
    new THREE.Vector3(130, 2, 270),
    new THREE.Vector3(75, 3, 310),
    new THREE.Vector3(0, 3, 320),
    new THREE.Vector3(-75, 3, 310),
    new THREE.Vector3(-130, 2, 270),

    // ── Left straight (heading -Z, southbound) ──
    new THREE.Vector3(-150, 0, 200),
    new THREE.Vector3(-150, 0, 100),
    new THREE.Vector3(-150, 0, 0),
    new THREE.Vector3(-150, 0, -100),
    new THREE.Vector3(-150, 0, -200),

    // ── Turn 2: bottom right curve (banked) ──
    new THREE.Vector3(-130, 2, -270),
    new THREE.Vector3(-75, 3, -310),
    new THREE.Vector3(0, 3, -320),
    new THREE.Vector3(75, 3, -310),
    new THREE.Vector3(130, 2, -270),
];

/** Number of sample points when discretising the spline */
export const TRACK_SEGMENTS = 600;

/** Checkpoint t-values for lap validation */
export const CHECKPOINT_T_VALUES = [0.08, 0.25, 0.5, 0.75];

/** Start grid positions — offset from t=0 backwards */
export const GRID_OFFSETS = [
    { lane: 0, back: 0 },
    { lane: 1, back: 10 },
    { lane: -1, back: 20 },
    { lane: 1, back: 30 },
];

/** No tunnel in oval track */
export const TUNNEL_T_RANGE: [number, number] = [0, 0];

/** Sector boundaries for timing */
export const SECTOR_BOUNDARIES = [0.0, 0.33, 0.66];

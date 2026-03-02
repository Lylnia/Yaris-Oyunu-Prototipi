import * as THREE from 'three';

/**
 * Track control points and metadata.
 * Closed loop ~4 km, designed for ~2.5 min laps
 *
 * Layout (top-down):
 *   Start/Finish (south) → main straight north →
 *   right turn → east straight → S-curve →
 *   uphill into tunnel → tunnel gentle left →
 *   tunnel exit downhill → wide fast left →
 *   hairpin U-turn → technical section →
 *   final straight south → back to start
 */
export const TRACK_WIDTH = 14; // metres (3+ car widths)

export const TRACK_CONTROL_POINTS: THREE.Vector3[] = [
    // ── Start / Finish ──
    new THREE.Vector3(0, 0, 0),

    // ── Main Straight (north, ~350m) ──
    new THREE.Vector3(0, 0, 120),
    new THREE.Vector3(0, 0, 250),
    new THREE.Vector3(0, 0, 350),

    // ── Turn 1: right 90° ──
    new THREE.Vector3(40, 0, 410),
    new THREE.Vector3(110, 0, 440),

    // ── East Straight (~180m) + slight uphill ──
    new THREE.Vector3(210, 1, 440),
    new THREE.Vector3(290, 3, 430),

    // ── S-Curve ──
    new THREE.Vector3(350, 5, 385),
    new THREE.Vector3(310, 7, 325),
    new THREE.Vector3(360, 9, 265),

    // ── Uphill + Tunnel Entrance ──
    new THREE.Vector3(370, 14, 185),
    new THREE.Vector3(345, 17, 115),

    // ── Tunnel (gentle left) ──
    new THREE.Vector3(295, 17, 65),
    new THREE.Vector3(230, 17, 35),

    // ── Tunnel Exit + Downhill ──
    new THREE.Vector3(165, 12, 15),
    new THREE.Vector3(110, 5, -10),

    // ── Wide Fast Left ──
    new THREE.Vector3(55, 1, -50),
    new THREE.Vector3(5, 0, -85),

    // ── Hairpin (U-turn, tight right) ──
    new THREE.Vector3(-40, 0, -65),
    new THREE.Vector3(-55, 0, -25),
    new THREE.Vector3(-35, 0, 15),

    // ── Technical: two tight turns ──
    new THREE.Vector3(5, 0, 40),
    new THREE.Vector3(-25, 0, 70),
    new THREE.Vector3(-5, 0, 95),

    // ── Final approach back to start ──
    new THREE.Vector3(-15, 0, -30),
    new THREE.Vector3(-5, 0, -15),
];

/** Number of sample points when discretising the spline */
export const TRACK_SEGMENTS = 800;

/** Checkpoint t-values (fraction around track) used for lap validation */
export const CHECKPOINT_T_VALUES = [0.0, 0.25, 0.5, 0.75];

/** Start grid positions — offset from t=0 backwards */
export const GRID_OFFSETS = [
    { lane: 0, back: 0 },    // P1  (player)
    { lane: 1, back: 12 },   // P2
    { lane: -1, back: 24 },  // P3
    { lane: 1, back: 36 },   // P4
];

/** Tunnel section (t-range) for visual/audio effects */
export const TUNNEL_T_RANGE: [number, number] = [0.42, 0.56];

/** Segment labels for sector timing */
export const SECTOR_BOUNDARIES = [0.0, 0.33, 0.66]; // 3 sectors

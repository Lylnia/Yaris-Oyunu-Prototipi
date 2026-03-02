import * as THREE from 'three';
import { InputManager } from './InputManager';
import { Car } from './entities/Car';
import { Track } from './track/Track';
import { CameraController } from './camera/CameraController';
import { RaceManager } from './race/RaceManager';
import { HUD } from './ui/HUD';
import { Minimap } from './ui/Minimap';
import { AudioManager } from './audio/AudioManager';
import { GRID_OFFSETS } from './track/TrackData';

/**
 * Main game class — owns the render loop, scene, and all subsystems.
 */
export class Game {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private clock = new THREE.Clock();

    private input: InputManager;
    private track!: Track;
    private cameraCtrl!: CameraController;
    private race!: RaceManager;
    private hud!: HUD;
    private minimap!: Minimap;
    private audio: AudioManager;
    private audioStarted = false;

    private player!: Car;
    private aiCars: Car[] = [];

    constructor(canvas: HTMLCanvasElement) {
        // ── Renderer ──
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.8;

        // ── Scene ──
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050510);
        this.scene.fog = new THREE.FogExp2(0x050510, 0.003);

        // ── Camera ──
        this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1500);

        // ── Input ──
        this.input = new InputManager();

        // ── Audio ──
        this.audio = new AudioManager();

        // ── Lighting ──
        this.setupLights();

        // ── Build world ──
        this.track = new Track(this.scene);
        this.setupCars();
        this.setupRace();

        // ── Camera controller ──
        this.cameraCtrl = new CameraController(this.camera);

        // ── UI ──
        this.hud = new HUD();
        const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
        this.minimap = new Minimap(minimapCanvas, this.track);

        // ── Resize ──
        window.addEventListener('resize', () => this.onResize());

        // ── Start audio on first click/key ──
        const startAudio = () => {
            if (!this.audioStarted) {
                this.audio.init();
                this.audioStarted = true;
            }
        };
        window.addEventListener('keydown', startAudio, { once: true });
        window.addEventListener('click', startAudio, { once: true });
    }

    private setupLights() {
        // Moonlight
        const dir = new THREE.DirectionalLight(0x334466, 0.3);
        dir.position.set(-100, 200, 100);
        dir.castShadow = true;
        dir.shadow.mapSize.set(2048, 2048);
        dir.shadow.camera.near = 10;
        dir.shadow.camera.far = 500;
        dir.shadow.camera.left = -200;
        dir.shadow.camera.right = 200;
        dir.shadow.camera.top = 200;
        dir.shadow.camera.bottom = -200;
        this.scene.add(dir);

        // Hemisphere (sky / ground)
        const hemi = new THREE.HemisphereLight(0x111133, 0x0a0a15, 0.5);
        this.scene.add(hemi);
    }

    private setupCars() {
        // Get start positions from grid
        const startData = this.track.getPointAt(0);
        const startDir = Math.atan2(startData.tangent.x, startData.tangent.z);
        const perpX = startData.tangent.z;
        const perpZ = -startData.tangent.x;

        const colors = [0x00ffff, 0xff3344, 0xffaa00, 0xaa44ff];

        GRID_OFFSETS.forEach((offset, i) => {
            const px = startData.pos.x + perpX * offset.lane * 3 - startData.tangent.x * offset.back;
            const pz = startData.pos.z + perpZ * offset.lane * 3 - startData.tangent.z * offset.back;

            const car = new Car(i, colors[i], px, pz, startDir, i === 0);
            this.scene.add(car.mesh);

            if (i === 0) {
                this.player = car;
            } else {
                this.aiCars.push(car);
            }
        });
    }

    private setupRace() {
        this.race = new RaceManager(this.player, this.aiCars, this.track);
    }

    start() {
        this.clock.start();
        this.loop();
    }

    private loop = () => {
        requestAnimationFrame(this.loop);

        const dt = Math.min(this.clock.getDelta(), 0.05); // cap for tab-away
        const input = this.input.update(dt);

        // Only pass input during racing
        const raceInput = this.race.state === 'racing'
            ? input
            : { throttle: 0, brake: 0, steer: 0 };

        this.race.update(dt, this.track, raceInput);

        // Camera
        this.cameraCtrl.update(this.player.mesh, this.player.state.speed, dt);

        // Audio
        if (this.audioStarted) {
            this.audio.update(
                this.player.state.rpm,
                this.player.state.isDrifting,
                this.player.state.driftAngle,
                input.brake,
            );
        }

        // UI
        this.hud.update(this.race);
        this.minimap.update(this.race.allCars);

        // Render
        this.renderer.render(this.scene, this.camera);
    };

    private onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

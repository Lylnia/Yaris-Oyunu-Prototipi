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
import { DriftParticles } from './entities/DriftParticles';

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
    private driftParticles!: DriftParticles;

    private player!: Car;
    private aiCars: Car[] = [];
    private raceFinishHandled = false;
    private musicStarted = false;

    constructor(canvas: HTMLCanvasElement) {
        // ── Renderer (optimised for Intel HD 5000) ──
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: false,              // HD 5000 can't afford MSAA
            powerPreference: 'high-performance',
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(1.0);  // force 1:1 pixels, no retina
        this.renderer.shadowMap.enabled = false;  // shadows OFF for integrated GPU
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.6;

        // ── Scene ──
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.001); // Daylight fog

        // ── Camera ──
        this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 1, 800);

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

        // ── Drift particles ──
        this.driftParticles = new DriftParticles(this.scene);

        // ── UI ──
        this.hud = new HUD();
        const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
        this.minimap = new Minimap(minimapCanvas, this.track);

        // ── Audio → UI callbacks ──
        this.audio.onTrackChange = (title: string, artist: string) => {
            this.hud.showMusicToast(title, artist);
        };
        this.cameraCtrl.onModeChange = (mode) => {
            this.hud.showCameraToast(mode);
        };

        // ── Resize ──
        window.addEventListener('resize', () => this.onResize());
    }

    private setupLights() {
        const dir = new THREE.DirectionalLight(0xffffee, 2.5);
        dir.position.set(-100, 300, 150);
        this.scene.add(dir);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x445544, 1.2);
        this.scene.add(hemi);

        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
    }

    private setupCars() {
        // Get start positions from grid
        const startData = this.track.getPointAt(0);
        const startDir = Math.atan2(startData.tangent.x, startData.tangent.z);
        const perpX = startData.tangent.z;
        const perpZ = -startData.tangent.x;

        const colors = [0x00ffff, 0xff3344, 0xffaa00, 0xaa44ff, 0x00ff00, 0xffff00, 0xff00ff, 0xffffff];

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

    private paused = false;
    private started = false;
    private pauseMenu = document.getElementById('pause-menu')!;
    private startMenu = document.getElementById('start-menu')!;
    private finishOverlay = document.getElementById('finish-overlay')!;

    private softReset(goToMenu: boolean) {
        // Reset race
        this.race.reset();
        this.raceFinishHandled = false;
        this.musicStarted = false;

        // Reset camera
        this.cameraCtrl.reset();

        // Reset HUD
        this.hud.reset();

        // Hide overlays
        this.pauseMenu.style.display = 'none';
        this.finishOverlay.style.display = 'none';
        this.paused = false;

        if (goToMenu) {
            // Going to menu: stop all audio
            this.audio.fadeOut();
            this.audioStarted = false;
            this.started = false;
            this.startMenu.style.display = 'flex';
        } else {
            // Restarting race: reset and restart audio
            this.audio.reset();
            this.audioStarted = true;
            this.started = true;
        }

        // Reset clock
        this.clock.getDelta();
    }

    start() {
        this.clock.start();

        // Start button
        document.getElementById('btn-start')?.addEventListener('click', () => {
            this.startMenu.style.display = 'none';
            this.started = true;

            // Check sound toggle
            const soundCheck = document.getElementById('chk-sound') as HTMLInputElement;
            if (soundCheck && !soundCheck.checked) {
                this.audio.muted = true;
            }

            this.audio.init();
            this.audioStarted = true;
        });

        // Pause toggle
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && this.started) {
                this.paused = !this.paused;
                this.pauseMenu.style.display = this.paused ? 'flex' : 'none';
                if (!this.paused) this.clock.getDelta(); // reset dt after unpause
            }
        });

        // Resume button
        document.getElementById('btn-resume')?.addEventListener('click', () => {
            this.paused = false;
            this.pauseMenu.style.display = 'none';
            this.clock.getDelta();
        });

        // Restart button (soft reset)
        document.getElementById('btn-restart')?.addEventListener('click', () => {
            this.softReset(false);
        });

        // Main menu button (pause → soft reset to menu)
        document.getElementById('btn-main-menu')?.addEventListener('click', () => {
            this.softReset(true);
        });

        // Play again button (finish → soft reset)
        document.getElementById('btn-play-again')?.addEventListener('click', () => {
            this.softReset(false);
        });

        // Main menu button (finish → soft reset to menu)
        document.getElementById('btn-finish-menu')?.addEventListener('click', () => {
            this.softReset(true);
        });

        this.loop();
    }

    private loop = () => {
        requestAnimationFrame(this.loop);

        if (!this.started || this.paused) {
            this.clock.getDelta(); // drain clock so dt doesn't spike on resume
            this.renderer.render(this.scene, this.camera);
            return;
        }

        const dt = Math.min(this.clock.getDelta(), 0.05);
        const input = this.input.update(dt);

        const raceInput = this.race.state === 'racing'
            ? input
            : { throttle: 0, brake: 0, steer: 0, handbrake: false };

        this.race.update(dt, this.track, raceInput);

        // Start music exactly on GO!
        if (this.race.state === 'racing' && !this.musicStarted) {
            this.musicStarted = true;
            if (this.audioStarted) {
                this.audio.playNextTrack();
            }
        }

        // Camera
        this.cameraCtrl.update(this.player.mesh, this.player.state.speed, dt);

        // Drift particles (player only)
        this.driftParticles.update(
            dt,
            this.player.state.isDrifting,
            this.player.state.px,
            this.player.state.py,
            this.player.state.pz,
            this.player.state.heading,
            this.player.state.speed,
        );

        // Audio
        if (this.audioStarted) {
            this.audio.update(
                this.player.state.rpm,
                this.player.state.isDrifting,
                this.player.state.driftAngle,
                input.brake,
                this.player.state.speed,
            );
        }

        // Race finish → fade out audio
        if (this.race.state === 'finished' && !this.raceFinishHandled) {
            this.raceFinishHandled = true;
            this.audio.fadeOut();
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

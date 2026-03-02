import * as THREE from 'three';
import { InputManager } from './InputManager';
import { Car } from './entities/Car';
import { Track } from './track/Track';
import { CameraController } from './camera/CameraController';
import { RaceManager } from './race/RaceManager';
import { HUD } from './ui/HUD';
import { Minimap } from './ui/Minimap';
import { AudioManager } from './audio/AudioManager';
import { MusicManager } from './audio/MusicManager';
import { TrafficSystem } from './entities/TrafficSystem';
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
    private music: MusicManager;
    private traffic!: TrafficSystem;
    private audioStarted = false;
    private audioFadedOut = false;

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
        this.renderer.toneMappingExposure = 1.6;

        // ── Scene ──
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050510);
        this.scene.fog = new THREE.FogExp2(0x080818, 0.0012);

        // ── Camera ──
        this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1500);

        // ── Input ──
        this.input = new InputManager();

        // ── Audio ──
        this.audio = new AudioManager();
        this.music = new MusicManager();

        // ── Lighting ──
        this.setupLights();

        // ── Build world ──
        this.track = new Track(this.scene);
        this.setupCars();

        // ── Traffic ──
        this.traffic = new TrafficSystem(this.track, this.scene);

        // ── Race ──
        this.setupRace();

        // ── Camera controller ──
        this.cameraCtrl = new CameraController(this.camera);

        // ── UI ──
        this.hud = new HUD();
        const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
        this.minimap = new Minimap(minimapCanvas, this.track);

        // ── Resize ──
        window.addEventListener('resize', () => this.onResize());
    }

    private setupLights() {
        const dir = new THREE.DirectionalLight(0x6688bb, 1.0);
        dir.position.set(-100, 300, 150);
        dir.castShadow = true;
        dir.shadow.mapSize.set(2048, 2048);
        dir.shadow.camera.near = 10;
        dir.shadow.camera.far = 600;
        dir.shadow.camera.left = -300;
        dir.shadow.camera.right = 300;
        dir.shadow.camera.top = 300;
        dir.shadow.camera.bottom = -300;
        this.scene.add(dir);

        const hemi = new THREE.HemisphereLight(0x334466, 0x151525, 1.2);
        this.scene.add(hemi);

        const ambient = new THREE.AmbientLight(0x222244, 0.8);
        this.scene.add(ambient);
    }

    private setupCars() {
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
        this.race.traffic = this.traffic;
    }

    private paused = false;
    private started = false;
    private pauseMenu = document.getElementById('pause-menu')!;
    private startMenu = document.getElementById('start-menu')!;

    // ── Gamepad menu navigation ──
    private menuButtons: HTMLButtonElement[] = [];
    private activeMenuIndex = 0;

    private getPauseMenuButtons(): HTMLButtonElement[] {
        return Array.from(this.pauseMenu.querySelectorAll('.menu-btn'));
    }

    private getFinishMenuButtons(): HTMLButtonElement[] {
        const finishEl = document.getElementById('finish-overlay')!;
        return Array.from(finishEl.querySelectorAll('.menu-btn'));
    }

    private updateActiveButton(buttons: HTMLButtonElement[], index: number) {
        buttons.forEach((btn, i) => {
            if (i === index) {
                btn.classList.add('active-btn');
            } else {
                btn.classList.remove('active-btn');
            }
        });
    }

    start() {
        this.clock.start();

        // Start button (keyboard or click)
        document.getElementById('btn-start')?.addEventListener('click', () => {
            this.beginGame();
        });

        // Pause toggle (keyboard)
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && this.started) {
                this.togglePause();
            }
            // Music controls
            if (e.code === 'KeyN') this.music.next();
            if (e.code === 'KeyP') this.music.prev();
            if (e.code === 'KeyM') this.music.toggle();
        });

        // Menu button clicks
        document.getElementById('btn-resume')?.addEventListener('click', () => {
            this.paused = false;
            this.pauseMenu.style.display = 'none';
            this.clock.getDelta();
        });

        document.getElementById('btn-restart')?.addEventListener('click', () => {
            window.location.reload();
        });

        document.getElementById('btn-main-menu')?.addEventListener('click', () => {
            window.location.reload();
        });

        document.getElementById('btn-play-again')?.addEventListener('click', () => {
            window.location.reload();
        });

        document.getElementById('btn-finish-menu')?.addEventListener('click', () => {
            window.location.reload();
        });

        // Music HUD buttons
        document.getElementById('btn-music-prev')?.addEventListener('click', () => this.music.prev());
        document.getElementById('btn-music-toggle')?.addEventListener('click', () => this.music.toggle());
        document.getElementById('btn-music-next')?.addEventListener('click', () => this.music.next());

        this.loop();
    }

    private beginGame() {
        this.startMenu.style.display = 'none';
        this.started = true;

        // Check sound toggle
        const soundCheck = document.getElementById('chk-sound') as HTMLInputElement;
        if (soundCheck && !soundCheck.checked) {
            this.audio.muted = true;
        }

        this.audio.init();
        this.audioStarted = true;

        // Start music
        this.music.play();
    }

    private togglePause() {
        this.paused = !this.paused;
        this.pauseMenu.style.display = this.paused ? 'flex' : 'none';
        if (this.paused) {
            this.menuButtons = this.getPauseMenuButtons();
            this.activeMenuIndex = 0;
            this.updateActiveButton(this.menuButtons, 0);
        } else {
            this.clock.getDelta();
        }
    }

    private handleGamepadMenu() {
        // Start/Options button (9) — toggle pause
        if (this.input.isButtonJustPressed(9) && this.started) {
            // Only in pause or racing state
            if (this.race.state !== 'finished') {
                this.togglePause();
            }
        }

        // A button (0) — start game from menu, or click active button
        if (this.input.isButtonJustPressed(0)) {
            if (this.startMenu.style.display !== 'none') {
                this.beginGame();
                return;
            }
            if (this.menuButtons.length > 0) {
                this.menuButtons[this.activeMenuIndex]?.click();
            }
        }

        // D-pad up (12) / down (13) — navigate menu
        if (this.menuButtons.length > 0) {
            if (this.input.isButtonJustPressed(12)) {
                this.activeMenuIndex = (this.activeMenuIndex - 1 + this.menuButtons.length) % this.menuButtons.length;
                this.updateActiveButton(this.menuButtons, this.activeMenuIndex);
            }
            if (this.input.isButtonJustPressed(13)) {
                this.activeMenuIndex = (this.activeMenuIndex + 1) % this.menuButtons.length;
                this.updateActiveButton(this.menuButtons, this.activeMenuIndex);
            }
        }
    }

    private loop = () => {
        requestAnimationFrame(this.loop);

        // Gamepad menu handling (even when paused)
        this.handleGamepadMenu();
        this.input.updatePrevButtons();

        if (!this.started || this.paused) {
            this.clock.getDelta();
            this.renderer.render(this.scene, this.camera);
            return;
        }

        const dt = Math.min(this.clock.getDelta(), 0.05);
        const input = this.input.update(dt);

        const raceInput = this.race.state === 'racing'
            ? input
            : { throttle: 0, brake: 0, steer: 0 };

        this.race.update(dt, this.track, raceInput);

        // Camera
        this.cameraCtrl.update(this.player.mesh, this.player.state.speed, dt);

        // Audio
        if (this.audioStarted && !this.audioFadedOut) {
            if (this.race.state === 'finished') {
                // Fade out engine sound when race ends
                this.audio.fadeOut();
                this.music.fadeOut();
                this.audioFadedOut = true;

                // Setup finish menu buttons for gamepad
                setTimeout(() => {
                    this.menuButtons = this.getFinishMenuButtons();
                    this.activeMenuIndex = 0;
                    this.updateActiveButton(this.menuButtons, 0);
                }, 100);
            } else {
                this.audio.update(
                    this.player.state.rpm,
                    this.player.state.isDrifting,
                    this.player.state.driftAngle,
                    input.brake,
                    this.player.state.speed,
                );
            }
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

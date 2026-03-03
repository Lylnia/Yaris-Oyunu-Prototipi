import { Track } from '../track/Track';
import { Car } from '../entities/Car';
import { TRACK_SEGMENTS } from '../track/TrackData';

/**
 * Draws a simple 2D minimap on a canvas overlay.
 */
export class Minimap {
    private ctx: CanvasRenderingContext2D;
    private trackPath: { x: number; z: number }[] = [];
    private scale = 1;
    private offsetX = 0;
    private offsetZ = 0;

    constructor(private canvas: HTMLCanvasElement, track: Track) {
        this.ctx = canvas.getContext('2d')!;
        this.buildPath(track);
    }

    private buildPath(track: Track) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i <= TRACK_SEGMENTS; i += 4) {
            const t = i / TRACK_SEGMENTS;
            const p = track.getPointAt(t).pos;
            this.trackPath.push({ x: p.x, z: p.z });
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        }

        const padding = 15;
        const rangeX = maxX - minX;
        const rangeZ = maxZ - minZ;
        this.scale = (this.canvas.width - padding * 2) / Math.max(rangeX, rangeZ);
        this.offsetX = -minX * this.scale + padding + (this.canvas.width - padding * 2 - rangeX * this.scale) / 2;
        this.offsetZ = -minZ * this.scale + padding + (this.canvas.height - padding * 2 - rangeZ * this.scale) / 2;
    }

    update(cars: Car[]) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Draw track line
        ctx.beginPath();
        ctx.strokeStyle = '#0ff'; // Neon glow
        ctx.lineWidth = 4;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#0ff';
        this.trackPath.forEach((p, i) => {
            const sx = p.x * this.scale + this.offsetX;
            const sz = p.z * this.scale + this.offsetZ;
            if (i === 0) ctx.moveTo(sx, h - sz);
            else ctx.lineTo(sx, h - sz);
        });
        ctx.closePath();
        ctx.stroke();

        // Reset shadow for cars
        ctx.shadowBlur = 0;

        // Draw cars
        const colors = ['#00ffff', '#ff4444', '#ffaa00', '#aa44ff'];
        cars.forEach((car, i) => {
            const sx = car.state.px * this.scale + this.offsetX;
            const sz = car.state.pz * this.scale + this.offsetZ;
            ctx.beginPath();
            ctx.fillStyle = colors[i] || '#ffffff';
            ctx.arc(sx, h - sz, car.isPlayer ? 5 : 3.5, 0, Math.PI * 2);
            ctx.fill();
            if (car.isPlayer) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        });
    }
}

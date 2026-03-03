import { defineConfig, Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Vite plugin that auto-generates /music/tracks.json from public/music/ */
function musicManifestPlugin(): Plugin {
    const musicDir = path.resolve(__dirname, 'public/music');
    const manifestPath = path.resolve(musicDir, 'tracks.json');
    const audioExtensions = ['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac', '.webm'];

    function generateManifest() {
        if (!fs.existsSync(musicDir)) {
            fs.mkdirSync(musicDir, { recursive: true });
        }

        const files = fs.readdirSync(musicDir)
            .filter(f => audioExtensions.includes(path.extname(f).toLowerCase()))
            .sort();

        fs.writeFileSync(manifestPath, JSON.stringify(files, null, 2));
        console.log(`[music-manifest] Found ${files.length} track(s):`, files);
    }

    return {
        name: 'music-manifest',
        buildStart() {
            generateManifest();
        },
        configureServer(server) {
            // Regenerate when files change in public/music/
            generateManifest();
            server.watcher.add(musicDir);
            server.watcher.on('all', (_event: string, filePath: string) => {
                if (filePath.startsWith(musicDir) && !filePath.endsWith('tracks.json')) {
                    generateManifest();
                }
            });
        },
    };
}

export default defineConfig({
    root: '.',
    publicDir: 'public',
    server: { port: 3000 },
    build: { outDir: 'dist' },
    plugins: [musicManifestPlugin()],
});

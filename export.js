const EXPORT_FPS = 30;
// Raw frames are fastest, but keeping one huge typed array on the UI thread
// causes a severe memory-pressure cliff. Frames below this limit are streamed
// in small chunks into a preallocated file owned by the encoder worker.
const MAX_RAW_FRAME_BYTES = 256 * 1024 * 1024;
const RAW_CHUNK_TARGET_BYTES = 8 * 1024 * 1024;
const CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
const MIME_TYPES = { gif: 'image/gif', mp4: 'video/mp4', webp: 'image/webp' };

let encoderPromise;
let exportInProgress = false;

// A self-contained classic worker also works when the app is opened via file://.
const ENCODER_WORKER_SOURCE = `
let ffmpegCore;
self.onmessage = async function (event) {
    const message = event.data;
    try {
        let result;
        if (message.type === 'load') {
            (0, eval)(message.data.coreSource);
            const wasmURL = URL.createObjectURL(new Blob(
                [message.data.wasmBytes], { type: 'application/wasm' }
            ));
            ffmpegCore = await self.createFFmpegCore({
                mainScriptUrlOrBlob: 'ffmpeg-core.js#' + btoa(JSON.stringify({
                    wasmURL: wasmURL, workerURL: wasmURL,
                })),
            });
            result = true;
        } else if (message.type === 'writeFile') {
            ffmpegCore.FS.writeFile(message.data.path, message.data.bytes);
            result = true;
        } else if (message.type === 'prepareFile') {
            const stream = ffmpegCore.FS.open(message.data.path, 'w+');
            if (message.data.size > 0) {
                ffmpegCore.FS.llseek(stream, message.data.size - 1, 0);
                ffmpegCore.FS.write(stream, new Uint8Array(1), 0, 1);
            }
            ffmpegCore.FS.close(stream);
            result = true;
        } else if (message.type === 'writeFileChunk') {
            const stream = ffmpegCore.FS.open(message.data.path, 'r+');
            ffmpegCore.FS.write(
                stream,
                message.data.bytes,
                0,
                message.data.bytes.byteLength,
                message.data.offset,
            );
            ffmpegCore.FS.close(stream);
            result = true;
        } else if (message.type === 'exec') {
            ffmpegCore.setTimeout(-1);
            ffmpegCore.exec('-nostdin', '-y', ...message.data.args);
            result = ffmpegCore.ret;
            ffmpegCore.reset();
        } else if (message.type === 'readFile') {
            result = ffmpegCore.FS.readFile(message.data.path);
        } else if (message.type === 'deleteFile') {
            ffmpegCore.FS.unlink(message.data.path);
            result = true;
        } else throw new Error('Unknown encoder operation: ' + message.type);
        const transfer = result instanceof Uint8Array ? [result.buffer] : [];
        self.postMessage({ id: message.id, result: result }, transfer);
    } catch (error) {
        self.postMessage({ id: message.id, error: error?.message || String(error) });
    }
};`;

class BrowserFFmpeg {
    constructor() {
        this.nextRequestId = 1;
        this.pendingRequests = new Map();
        this.workerURL = URL.createObjectURL(new Blob(
            [ENCODER_WORKER_SOURCE], { type: 'text/javascript' },
        ));
        this.worker = new Worker(this.workerURL);
        this.worker.addEventListener('message', (event) => {
            const pending = this.pendingRequests.get(event.data.id);
            if (!pending) return;
            this.pendingRequests.delete(event.data.id);
            if (event.data.error) pending.reject(new Error(event.data.error));
            else pending.resolve(event.data.result);
        });
        this.worker.addEventListener('error', (event) => {
            const error = new Error(event.message || 'The export encoder worker crashed.');
            this.pendingRequests.forEach(({ reject }) => reject(error));
            this.pendingRequests.clear();
        });
    }

    request(type, data, transfer = []) {
        return new Promise((resolve, reject) => {
            const id = this.nextRequestId++;
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ id, type, data }, transfer);
        });
    }

    load(options) { return this.request('load', options, [options.wasmBytes.buffer]); }
    writeFile(path, bytes) { return this.request('writeFile', { path, bytes }, [bytes.buffer]); }
    prepareFile(path, size) { return this.request('prepareFile', { path, size }); }
    writeFileChunk(path, bytes, offset) {
        return this.request('writeFileChunk', { path, bytes, offset }, [bytes.buffer]);
    }
    exec(args) { return this.request('exec', { args }); }
    readFile(path) { return this.request('readFile', { path }); }
    deleteFile(path) { return this.request('deleteFile', { path }); }
}

async function fetchAsText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not download the export encoder (${response.status}).`);
    return response.text();
}

async function fetchAsBytes(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not download the export encoder (${response.status}).`);
    return new Uint8Array(await response.arrayBuffer());
}

function setExportStatus(message, progress) {
    const status = document.getElementById('exportStatus');
    const progressElement = document.getElementById('exportProgress');
    status.textContent = message;
    if (progress === undefined) {
        progressElement.hidden = true;
        return;
    }
    progressElement.hidden = false;
    progressElement.value = clamp(progress, 0, 1);
}

function setExportButtonsDisabled(disabled) {
    document.querySelectorAll('[data-export-format]').forEach((button) => {
        button.disabled = disabled;
    });
}

async function getEncoder(showStatus = true) {
    if (!encoderPromise) {
        encoderPromise = (async () => {
            if (showStatus) setExportStatus('Loading the export encoder (about 31 MB)…', .02);
            const ffmpeg = new BrowserFFmpeg();
            const [coreSource, wasmBytes] = await Promise.all([
                fetchAsText(`${CORE_BASE_URL}/ffmpeg-core.js`),
                fetchAsBytes(`${CORE_BASE_URL}/ffmpeg-core.wasm`),
            ]);
            await ffmpeg.load({ coreSource, wasmBytes });
            return ffmpeg;
        })().catch((error) => {
            encoderPromise = undefined;
            throw error;
        });
    }
    return encoderPromise;
}

function getOutputSize(crop, requestedWidth) {
    const width = Math.max(2, Math.round(requestedWidth / 2) * 2);
    const height = Math.max(2, Math.round((width * crop.height / crop.width) / 2) * 2);
    return { width, height };
}

function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The browser could not render an export frame.'));
    }, 'image/png'));
}

async function captureFrames(encoderTask, format, duration, requestedWidth) {
    const scene = window.shinigamiRenderer;
    const exportSession = scene.createExportSession();
    const timelineStartedAt = exportSession.startTime;
    const crop = exportSession.crop;
    const outputSize = getOutputSize(crop, requestedWidth);
    const frameCount = Math.max(1, Math.round(duration * EXPORT_FPS));
    const frameInterval = 1000 / EXPORT_FPS;
    const rawByteLength = outputSize.width * outputSize.height * 4 * frameCount;
    const useRawFrames = rawByteLength <= MAX_RAW_FRAME_BYTES;
    const bytesPerFrame = outputSize.width * outputSize.height * 4;
    const framesPerChunk = Math.max(1, Math.floor(RAW_CHUNK_TARGET_BYTES / bytesPerFrame));
    let rawChunk = useRawFrames
        ? new Uint8Array(bytesPerFrame * Math.min(framesPerChunk, frameCount))
        : null;
    let rawChunkOffset = 0;
    let rawFileOffset = 0;
    const background = format === 'gif' ? '#000000'
        : format === 'mp4' ? (getComputedStyle(document.body).backgroundColor || '#000')
        : 'transparent';
    const frameNames = [];
    const canvas = document.createElement('canvas');
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    scene.renderingExport = true;

    const rawFrameName = 'shinigami-frames.rgba';
    let rawEncoder;
    const flushRawChunk = async () => {
        if (!rawChunkOffset) return;
        const bytes = rawChunkOffset === rawChunk.byteLength
            ? rawChunk
            : rawChunk.slice(0, rawChunkOffset);
        await rawEncoder.writeFileChunk(rawFrameName, bytes, rawFileOffset);
        rawFileOffset += rawChunkOffset;
        rawChunkOffset = 0;
        const remaining = rawByteLength - rawFileOffset;
        if (remaining > 0) {
            rawChunk = new Uint8Array(Math.min(
                bytesPerFrame * framesPerChunk,
                remaining,
            ));
        }
    };

    try {
        if (useRawFrames) {
            setExportStatus('Preparing the frame buffer…', .06);
            rawEncoder = await encoderTask;
            await rawEncoder.prepareFile(rawFrameName, rawByteLength);
            frameNames.push(rawFrameName);
        }

        for (let index = 0; index < frameCount; index++) {
            scene.renderExportFrame(
                canvas,
                timelineStartedAt + index * frameInterval,
                background,
                crop,
                exportSession.lines,
            );
            setExportStatus(`Capturing frame ${index + 1} of ${frameCount}…`,
                .08 + (index + 1) / frameCount * .64);
            if (rawChunk) {
                const pixels = canvas.getContext('2d').getImageData(
                    0, 0, outputSize.width, outputSize.height,
                ).data;
                rawChunk.set(pixels, rawChunkOffset);
                rawChunkOffset += bytesPerFrame;
                if (rawChunkOffset === rawChunk.byteLength) await flushRawChunk();
            } else {
                const name = `shinigami-frame-${String(index).padStart(3, '0')}.png`;
                const bytes = new Uint8Array(await (await canvasToPngBlob(canvas)).arrayBuffer());
                const ffmpeg = await encoderTask;
                await ffmpeg.writeFile(name, bytes);
                frameNames.push(name);
            }
            // Keep the UI responsive during large exports.
            if (index % 3 === 2) await new Promise(requestAnimationFrame);
        }

        if (rawChunk) await flushRawChunk();
    } catch (error) {
        const ffmpeg = await encoderTask.catch(() => undefined);
        if (ffmpeg) await removeEncoderFiles(ffmpeg, frameNames);
        throw error;
    } finally {
        scene.renderingExport = false;
        scene.invalidate();
    }
    return { frameNames, frameCount, outputSize, useRawFrames };
}

function getEncoderArguments(format, outputName, outputSize, useRawFrames) {
    const input = useRawFrames ? [
        '-f', 'rawvideo', '-pixel_format', 'rgba',
        '-video_size', `${outputSize.width}x${outputSize.height}`,
        '-framerate', String(EXPORT_FPS), '-i', 'shinigami-frames.rgba',
    ] : ['-framerate', String(EXPORT_FPS), '-i', 'shinigami-frame-%03d.png'];

    if (format === 'gif') return [
        ...input, '-filter_complex',
        'split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a',
        '-gifflags', '-transdiff', '-loop', '0', outputName,
    ];
    if (format === 'webp') return [
        ...input, '-c:v', 'libwebp_anim', '-lossless', '1',
        '-compression_level', '0', '-pix_fmt', 'rgba', '-loop', '0', outputName,
    ];
    return [...input, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputName];
}

function downloadExport(data, format) {
    const blob = new Blob([data.buffer], { type: MIME_TYPES[format] });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `shinigami-eyes.${format}`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function removeEncoderFiles(ffmpeg, names) {
    await Promise.all(names.map((name) => ffmpeg.deleteFile(name).catch(() => undefined)));
}

async function exportAnimation(format) {
    if (exportInProgress) return;
    exportInProgress = true;
    setExportButtonsDisabled(true);
    const files = [];
    try {
        const duration = Number(document.getElementById('exportDuration').value);
        const requestedWidth = Number(document.getElementById('exportResolution').value);
        const encoderTask = getEncoder();
        const captured = await captureFrames(encoderTask, format, duration, requestedWidth);
        const ffmpeg = await encoderTask;
        files.push(...captured.frameNames);
        const outputName = `shinigami-output.${format}`;
        files.push(outputName);
        setExportStatus(`Encoding ${format.toUpperCase()}…`, .76);
        const exitCode = await ffmpeg.exec(getEncoderArguments(
            format, outputName, captured.outputSize, captured.useRawFrames,
        ));
        if (exitCode !== 0) throw new Error(`Encoder exited with code ${exitCode}.`);
        downloadExport(await ffmpeg.readFile(outputName), format);
        setExportStatus(`Downloaded ${captured.outputSize.width}×${captured.outputSize.height} ${format.toUpperCase()} (${captured.frameCount} frames).`, 1);
    } catch (error) {
        console.error(error);
        setExportStatus(`Export failed: ${error.message || error}`, undefined);
    } finally {
        if (encoderPromise) {
            const ffmpeg = await encoderPromise.catch(() => undefined);
            if (ffmpeg) await removeEncoderFiles(ffmpeg, files);
        }
        setExportButtonsDisabled(false);
        exportInProgress = false;
    }
}

document.querySelectorAll('[data-export-format]').forEach((button) => {
    button.addEventListener('click', () => exportAnimation(button.dataset.exportFormat));
});

const prewarmEncoder = () => getEncoder(false).catch(() => undefined);
if ('requestIdleCallback' in window) requestIdleCallback(prewarmEncoder, { timeout: 5000 });
else setTimeout(prewarmEncoder, 2500);

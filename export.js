const EXPORT_FPS = 30;
const CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
const MIME_TYPES = {
    gif: 'image/gif',
    mp4: 'video/mp4',
    webp: 'image/webp',
};

let encoderPromise;
let fontEmbedCSSPromise;
let exportInProgress = false;

// Keeping the worker source in memory avoids Firefox's prohibition on loading
// local ES modules and worker files from a file:// page.
const ENCODER_WORKER_SOURCE = `
let ffmpegCore;

self.onmessage = async function (event) {
    const message = event.data;

    try {
        let result;

        if (message.type === 'load') {
            // A blob worker created by a file:// page has an opaque origin and
            // cannot import a second blob URL. Evaluate the already-downloaded
            // FFmpeg bootstrap in this worker instead.
            (0, eval)(message.data.coreSource);
            const wasmURL = URL.createObjectURL(new Blob(
                [message.data.wasmBytes],
                { type: 'application/wasm' },
            ));
            ffmpegCore = await self.createFFmpegCore({
                mainScriptUrlOrBlob: 'ffmpeg-core.js#' + btoa(JSON.stringify({
                    wasmURL: wasmURL,
                    workerURL: wasmURL,
                })),
            });
            result = true;
        } else if (message.type === 'writeFile') {
            ffmpegCore.FS.writeFile(message.data.path, message.data.bytes);
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
        } else {
            throw new Error('Unknown encoder operation: ' + message.type);
        }

        const transfer = result instanceof Uint8Array ? [result.buffer] : [];
        self.postMessage({ id: message.id, result: result }, transfer);
    } catch (error) {
        self.postMessage({
            id: message.id,
            error: error && error.message ? error.message : String(error),
        });
    }
};
`;

class BrowserFFmpeg {
    constructor() {
        this.nextRequestId = 1;
        this.pendingRequests = new Map();
        this.workerURL = URL.createObjectURL(new Blob(
            [ENCODER_WORKER_SOURCE],
            { type: 'text/javascript' },
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

    load(options) {
        return this.request('load', options, [options.wasmBytes.buffer]);
    }

    writeFile(path, bytes) {
        return this.request('writeFile', { path, bytes }, [bytes.buffer]);
    }

    exec(args) {
        return this.request('exec', { args });
    }

    readFile(path) {
        return this.request('readFile', { path });
    }

    deleteFile(path) {
        return this.request('deleteFile', { path });
    }
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

async function blobToBytes(blob) {
    return new Uint8Array(await blob.arrayBuffer());
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
    progressElement.value = Math.max(0, Math.min(progress, 1));
}

function setExportButtonsDisabled(disabled) {
    document.querySelectorAll('[data-export-format]').forEach((button) => {
        button.disabled = disabled;
    });
}

function getExportCrop() {
    const stage = document.getElementById('animationStage');
    const digits = Array.from(stage.querySelectorAll('.shinigamiEyes__Line__Digit'));
    if (digits.length === 0) throw new Error('Add at least one line before exporting.');

    const stageRect = stage.getBoundingClientRect();
    const bounds = digits.map((digit) => digit.getBoundingClientRect());
    const glyphLeft = Math.min(...bounds.map((rect) => rect.left));
    const glyphRight = Math.max(...bounds.map((rect) => rect.right));
    const glyphTop = Math.min(...bounds.map((rect) => rect.top));
    const glyphBottom = Math.max(...bounds.map((rect) => rect.bottom));
    const attractorY = glyphBottom + 140;
    const left = Math.max(0, Math.floor(glyphLeft - stageRect.left - 48));
    const top = Math.max(0, Math.floor(glyphTop - stageRect.top - 48));
    const right = Math.min(stageRect.width, Math.ceil(glyphRight - stageRect.left + 48));
    const bottom = Math.ceil(attractorY - stageRect.top + 112);

    return {
        left,
        top,
        width: Math.max(2, right - left),
        height: Math.max(2, bottom - top),
        stageWidth: Math.ceil(stageRect.width),
        stageHeight: Math.max(Math.ceil(stageRect.height), bottom),
    };
}

function getOutputSize(crop, requestedWidth) {
    const width = Math.max(2, Math.round(requestedWidth / 2) * 2);
    const proportionalHeight = width * crop.height / crop.width;
    const height = Math.max(2, Math.round(proportionalHeight / 2) * 2);
    return { width, height };
}

function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('The browser could not render an export frame.'));
        }, 'image/png');
    });
}

async function getFontEmbedCSS(stage) {
    // Firefox will not let html-to-image fetch a local font from a file:// page.
    // The font is already loaded by the document, so skip the redundant fetch.
    if (location.protocol === 'file:') return null;

    if (!fontEmbedCSSPromise) {
        fontEmbedCSSPromise = window.htmlToImage
            .getFontEmbedCSS(stage, { preferredFontFormat: 'truetype' })
            .catch((error) => {
                console.warn('The export font could not be embedded.', error);
                return null;
            });
    }
    return fontEmbedCSSPromise;
}

async function getEncoder() {
    if (!encoderPromise) {
        encoderPromise = (async () => {
            setExportStatus('Loading the export encoder (about 31 MB)…', 0.02);
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

async function captureFrames(ffmpeg, format, duration, requestedWidth) {
    if (!window.htmlToImage) throw new Error('The capture library did not load.');

    const stage = document.getElementById('animationStage');
    const crop = getExportCrop();
    const outputSize = getOutputSize(crop, requestedWidth);
    const frameCount = Math.max(1, Math.round(duration * EXPORT_FPS));
    const frameInterval = 1000 / EXPORT_FPS;
    const fontEmbedCSS = await getFontEmbedCSS(stage);
    const backgroundColor = format === 'gif'
        ? '#000000'
        : format === 'mp4'
        ? (getComputedStyle(document.body).backgroundColor || '#000')
        : 'transparent';
    const frameNames = [];
    const animationClock = window.shinigamiAnimationClock;
    const timelineStartedAt = animationClock ? animationClock.begin() : performance.now();
    const cssAnimations = typeof stage.getAnimations === 'function'
        ? stage.getAnimations({ subtree: true }).map((animation) => ({
            animation,
            currentTime: animation.currentTime,
            playState: animation.playState,
            playbackRate: animation.playbackRate,
        }))
        : [];

    cssAnimations.forEach(({ animation }) => animation.pause());

    try {
        for (let index = 0; index < frameCount; index++) {
            const elapsed = index * frameInterval;
            if (animationClock) animationClock.seek(timelineStartedAt + elapsed);
            cssAnimations.forEach(({ animation, currentTime, playbackRate }) => {
                if (currentTime !== null) animation.currentTime = currentTime + elapsed * playbackRate;
            });
            setExportStatus(
                `Capturing frame ${index + 1} of ${frameCount}…`,
                0.08 + (index + 1) / frameCount * 0.64,
            );

            const canvas = await window.htmlToImage.toCanvas(stage, {
                width: crop.width,
                height: crop.height,
                canvasWidth: outputSize.width,
                canvasHeight: outputSize.height,
                pixelRatio: 1,
                backgroundColor,
                fontEmbedCSS,
                skipFonts: fontEmbedCSS === null,
                preferredFontFormat: 'truetype',
                style: {
                    width: `${crop.stageWidth}px`,
                    height: `${crop.stageHeight}px`,
                    transform: `translate(${-crop.left}px, ${-crop.top}px)`,
                    transformOrigin: 'top left',
                    overflow: 'visible',
                },
            });

            const frameName = `shinigami-frame-${String(index).padStart(3, '0')}.png`;
            const blob = await canvasToPngBlob(canvas);
            await ffmpeg.writeFile(frameName, await blobToBytes(blob));
            frameNames.push(frameName);
        }
    } finally {
        if (animationClock) animationClock.end();
        cssAnimations.forEach(({ animation, playState }) => {
            if (playState === 'running') animation.play();
        });
    }

    return { frameNames, frameCount, outputSize };
}

function getEncoderArguments(format, outputName) {
    const input = [
        '-framerate', String(EXPORT_FPS),
        '-i', 'shinigami-frame-%03d.png',
    ];

    if (format === 'gif') {
        return [
            ...input,
            '-filter_complex',
            'split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a',
            '-gifflags', '-transdiff',
            '-loop', '0',
            outputName,
        ];
    }

    if (format === 'webp') {
        return [
            ...input,
            '-c:v', 'libwebp_anim',
            '-lossless', '1',
            '-compression_level', '4',
            '-pix_fmt', 'rgba',
            '-loop', '0',
            outputName,
        ];
    }

    return [
        ...input,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputName,
    ];
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
    const encoderFiles = [];

    try {
        const duration = Number(document.getElementById('exportDuration').value);
        const requestedWidth = Number(document.getElementById('exportResolution').value);
        const ffmpeg = await getEncoder();
        const { frameNames, frameCount, outputSize } = await captureFrames(
            ffmpeg,
            format,
            duration,
            requestedWidth,
        );
        encoderFiles.push(...frameNames);

        const outputName = `shinigami-output.${format}`;
        encoderFiles.push(outputName);
        setExportStatus(`Encoding ${format.toUpperCase()}…`, 0.76);
        const exitCode = await ffmpeg.exec(getEncoderArguments(format, outputName));
        if (exitCode !== 0) throw new Error(`The ${format.toUpperCase()} encoder exited with code ${exitCode}.`);

        const output = await ffmpeg.readFile(outputName);
        downloadExport(output, format);
        setExportStatus(
            `Downloaded ${outputSize.width}×${outputSize.height} ${format.toUpperCase()} (${frameCount} frames).`,
            1,
        );
    } catch (error) {
        console.error(error);
        setExportStatus(`Export failed: ${error.message || error}`, undefined);
    } finally {
        if (encoderPromise) {
            const ffmpeg = await encoderPromise.catch(() => undefined);
            if (ffmpeg) await removeEncoderFiles(ffmpeg, encoderFiles);
        }
        setExportButtonsDisabled(false);
        exportInProgress = false;
    }
}

document.querySelectorAll('[data-export-format]').forEach((button) => {
    button.addEventListener('click', () => exportAnimation(button.dataset.exportFormat));
});

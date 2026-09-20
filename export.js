const EXPORT_FPS = 30;
const MAX_RAW_FRAME_BYTES = 512 * 1024 * 1024;
const CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
const MIME_TYPES = {
    gif: 'image/gif',
    mp4: 'video/mp4',
    webp: 'image/webp',
};

let encoderPromise;
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

async function getEncoder(showStatus = true) {
    if (!encoderPromise) {
        encoderPromise = (async () => {
            if (showStatus) setExportStatus('Loading the export encoder (about 31 MB)…', 0.02);
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

function getTransformMatrix(element) {
    const transform = getComputedStyle(element).transform;
    return transform && transform !== 'none'
        ? new DOMMatrixReadOnly(transform)
        : new DOMMatrixReadOnly();
}

function getScaleFromTransform(element) {
    const matrix = getTransformMatrix(element);
    return {
        x: Math.hypot(matrix.a, matrix.b) || 1,
        y: Math.hypot(matrix.c, matrix.d) || 1,
    };
}

function getDigitRenderState(digit) {
    const line = digit.closest('.shinigamiEyes__Line');
    const inner = digit.closest('.shinigamiEyes__Line__InnerContainer');
    const container = digit.closest('.shinigamiEyes__Line__Container');
    const lineScale = getScaleFromTransform(line);
    const containerScale = getScaleFromTransform(container);
    const ancestorScale = {
        x: lineScale.x * containerScale.x,
        y: lineScale.y * containerScale.y,
    };
    const opacity = [container, inner, line, digit].reduce(
        (value, element) => value * Number(getComputedStyle(element).opacity || 1),
        1,
    );
    const filters = [container, inner, line, digit]
        .map((element) => getComputedStyle(element).filter)
        .filter((filter) => filter && filter !== 'none');
    const computed = getComputedStyle(digit);

    return {
        ancestorScale,
        char: digit.dataset.char,
        digit,
        digitMatrix: getTransformMatrix(digit),
        filters,
        fontFamily: computed.fontFamily,
        fontSize: Number.parseFloat(computed.fontSize),
        fontStyle: computed.fontStyle,
        fontWeight: computed.fontWeight,
        noGlow: digit.classList.contains('shinigamiEyes__Line__Digit--noGlow'),
        opacity,
        renderBlur: filters.reduce((largest, filter) => {
            const matches = Array.from(filter.matchAll(/blur\(([\d.]+)px\)/g));
            return Math.max(largest, ...matches.map((match) => Number(match[1])), 0);
        }, 0),
        colorFilter: filters
            .map((filter) => filter.replace(/blur\([^)]+\)/g, '').trim())
            .filter((filter) => filter && filter !== 'none'
                && filter !== 'hue-rotate(0deg)'
                && filter !== 'brightness(1)'
                && filter !== 'saturate(1)')
            .join(' ') || 'none',
    };
}

function combineLinearTransform(state, child) {
    const matrix = child
        ? state.digitMatrix.multiply(getTransformMatrix(child))
        : state.digitMatrix;
    return {
        a: matrix.a * state.ancestorScale.x,
        b: matrix.b * state.ancestorScale.y,
        c: matrix.c * state.ancestorScale.x,
        d: matrix.d * state.ancestorScale.y,
    };
}

function getLayerCenter(element, stageRect) {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2 - stageRect.left,
        y: rect.top + rect.height / 2 - stageRect.top,
    };
}

const GLYPH_TEXTURE_SIZE = 320;
const GLYPH_TEXTURE_FONT_SIZE = 100;
const glyphTextureCache = new Map();

function createGlyphTexture(state, kind) {
    const baseBlur = { core: 0, echo: 3, trail: 5, slice: 3.8 }[kind] || 0;
    const blur = Math.round((baseBlur + state.renderBlur) * 2) / 2;
    const key = [
        state.char, state.fontFamily, state.fontStyle, state.fontWeight,
        kind, state.noGlow, blur,
    ].join('|');
    const cached = glyphTextureCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = GLYPH_TEXTURE_SIZE;
    canvas.height = GLYPH_TEXTURE_SIZE;
    const ctx = canvas.getContext('2d');
    const scale = GLYPH_TEXTURE_FONT_SIZE / state.fontSize;
    const bakedBlur = blur * scale;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.font = `${state.fontStyle} ${state.fontWeight} ${GLYPH_TEXTURE_FONT_SIZE}px ${state.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const metrics = ctx.measureText(state.char);
    const baseline = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;

    if (bakedBlur > 0) ctx.filter = `blur(${bakedBlur}px)`;

    if (kind === 'core') {
        if (!state.noGlow) {
            ctx.fillStyle = 'rgba(255, 92, 108, 0.72)';
            ctx.shadowColor = '#ff4e5e';
            ctx.shadowBlur = 22;
            ctx.fillText(state.char, 0, baseline);
            ctx.fillStyle = 'rgba(255, 208, 214, 0.88)';
            ctx.shadowColor = '#ff7180';
            ctx.shadowBlur = 10;
            ctx.fillText(state.char, 0, baseline);
        }
        ctx.fillStyle = '#ffe1e1';
        ctx.shadowColor = state.noGlow ? 'transparent' : '#ffffff';
        ctx.shadowBlur = state.noGlow ? 0 : 3;
        ctx.fillText(state.char, 0, baseline);
    } else if (kind === 'echo') {
        ctx.fillStyle = '#ffc7cd';
        ctx.shadowColor = state.noGlow ? 'transparent' : '#ff6978';
        ctx.shadowBlur = state.noGlow ? 0 : 12;
        ctx.fillText(state.char, 0, baseline);
    } else if (kind === 'trail') {
        const gradient = ctx.createLinearGradient(0, -45, 0, 72);
        gradient.addColorStop(0, '#ffb4bd');
        gradient.addColorStop(0.48, '#ff8998');
        gradient.addColorStop(1, 'rgba(255, 80, 98, 0)');
        ctx.fillStyle = gradient;
        ctx.shadowColor = state.noGlow ? 'transparent' : '#ff485a';
        ctx.shadowBlur = state.noGlow ? 0 : 12;
        ctx.fillText(state.char, 0, baseline);
    } else {
        ctx.fillStyle = '#ffc0c5';
        ctx.shadowColor = state.noGlow ? 'transparent' : '#ff5868';
        ctx.shadowBlur = state.noGlow ? 0 : 10;
        ctx.fillText(state.char, 0, baseline);
    }

    glyphTextureCache.set(key, canvas);
    return canvas;
}

function drawGlyph(ctx, state, options) {
    const {
        center,
        matrix,
        opacity,
        textureKind = 'slice',
        blur = 0,
        clip,
    } = options;

    if (opacity <= 0.001) return;
    const texture = createGlyphTexture(state, textureKind);
    const textureExtent = GLYPH_TEXTURE_SIZE * state.fontSize / GLYPH_TEXTURE_FONT_SIZE;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
    ctx.filter = state.colorFilter;
    ctx.translate(center.x, center.y);
    ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, 0, 0);

    if (clip) {
        const glyphHeight = state.fontSize;
        ctx.beginPath();
        ctx.rect(
            -state.fontSize,
            -glyphHeight / 2 + glyphHeight * clip.top,
            state.fontSize * 2,
            glyphHeight * (clip.bottom - clip.top),
        );
        ctx.clip();
    }

    ctx.drawImage(
        texture,
        -textureExtent / 2,
        -textureExtent / 2,
        textureExtent,
        textureExtent,
    );
    ctx.restore();
}

function drawHaze(ctx, state, center, attractor) {
    const deltaX = attractor.x - center.x;
    const deltaY = attractor.y - center.y;
    const distance = Math.hypot(deltaX, deltaY) || 1;
    const length = Math.min(distance * 0.68, 170);
    const gradient = ctx.createLinearGradient(0, 0, 0, length);
    gradient.addColorStop(0, 'rgba(255, 122, 136, 0.24)');
    gradient.addColorStop(0.42, 'rgba(255, 78, 96, 0.13)');
    gradient.addColorStop(1, 'rgba(255, 45, 70, 0)');

    ctx.save();
    ctx.globalAlpha = state.opacity;
    ctx.filter = state.colorFilter;
    ctx.translate(center.x, center.y + state.fontSize * 0.12);
    ctx.rotate(Math.atan2(deltaY, deltaX) - Math.PI / 2);
    ctx.fillStyle = gradient;
    ctx.fillRect(-state.fontSize * 0.13, 0, state.fontSize * 0.26, length);
    ctx.restore();
}

function drawCore(ctx, state, core, stageRect) {
    const center = getLayerCenter(core, stageRect);
    const matrix = combineLinearTransform(state);
    const coreOpacity = state.opacity * Number(getComputedStyle(core).opacity || 1);

    drawGlyph(ctx, state, {
        center, matrix, opacity: coreOpacity, textureKind: 'core',
    });
}

function drawEchoes(ctx, state, stageRect, attractor) {
    state.digit.querySelectorAll('.shinigamiEyes__GlyphEcho').forEach((echo) => {
        const center = getLayerCenter(echo, stageRect);
        const matrix = combineLinearTransform(state, echo);
        const depth = echo.vanishingDepth || 0.5;
        const opacity = state.opacity * Number(getComputedStyle(echo).opacity || 0);
        const deltaX = attractor.x - center.x;
        const deltaY = attractor.y - center.y;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const smearLength = Math.min(distance * (0.1 + depth * 0.06), 55);
        const blur = Number.parseFloat(echo.style.getPropertyValue('--echo-blur')) || 2;

        for (let sample = 2; sample >= 1; sample--) {
            const progress = sample / 2;
            drawGlyph(ctx, state, {
                center: {
                    x: center.x + deltaX / distance * smearLength * progress,
                    y: center.y + deltaY / distance * smearLength * progress,
                },
                matrix,
                opacity: opacity * 0.3 * (1 - progress * 0.65),
                textureKind: 'echo',
                blur: blur + progress * 4,
            });
        }

        drawGlyph(ctx, state, {
            center, matrix, opacity, textureKind: 'echo', blur,
        });
    });
}

function drawTrails(ctx, state, stageRect, attractor) {
    state.digit.querySelectorAll('.shinigamiEyes__GlyphTrail').forEach((trail, index) => {
        const center = getLayerCenter(trail, stageRect);
        const matrix = combineLinearTransform(state, trail);
        const opacity = state.opacity * Number(getComputedStyle(trail).opacity || 0);
        const deltaX = attractor.x - center.x;
        const deltaY = attractor.y - center.y;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const smearLength = Math.min(distance * (0.28 + index * 0.08), 150);
        const blur = index === 0 ? 5 : 7;

        for (let sample = 3; sample >= 1; sample--) {
            const progress = sample / 3;
            drawGlyph(ctx, state, {
                center: {
                    x: center.x + deltaX / distance * smearLength * progress,
                    y: center.y + deltaY / distance * smearLength * progress,
                },
                matrix,
                opacity: opacity * 0.42 * (1 - progress * 0.7),
                textureKind: 'trail',
                blur: blur + progress * 6,
            });
        }

        drawGlyph(ctx, state, {
            center, matrix, opacity, textureKind: 'trail', blur,
        });
    });
}

function getSliceClip(slice) {
    const clipPath = slice.firstElementChild?.style.clipPath || '';
    const match = clipPath.match(/inset\(([\d.]+)%[^)]*?([\d.]+)%/);
    if (!match) return undefined;
    return {
        top: Number(match[1]) / 100,
        bottom: 1 - Number(match[2]) / 100,
    };
}

function drawSlices(ctx, state, stageRect, attractor) {
    state.digit.querySelectorAll('.shinigamiEyes__GlyphSlice').forEach((slice) => {
        const center = getLayerCenter(slice, stageRect);
        const matrix = combineLinearTransform(state, slice);
        const opacity = state.opacity * Number(getComputedStyle(slice).opacity || 0);
        const deltaX = attractor.x - center.x;
        const deltaY = attractor.y - center.y;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const smearLength = Math.min(distance * 0.18, 88);
        const clip = getSliceClip(slice);

        for (let sample = 1; sample >= 1; sample--) {
            const progress = sample;
            drawGlyph(ctx, state, {
                center: {
                    x: center.x + deltaX / distance * smearLength * progress,
                    y: center.y + deltaY / distance * smearLength * progress,
                },
                matrix,
                opacity: opacity * 0.25 * (1 - progress * 0.65),
                textureKind: 'slice',
                blur: 4 + progress * 5,
                clip,
            });
        }

        drawGlyph(ctx, state, {
            center, matrix, opacity, textureKind: 'slice', blur: 3.8, clip,
        });
    });
}

function renderExportCanvas(stage, crop, outputSize, backgroundColor, canvas) {
    const ctx = canvas.getContext('2d', { alpha: backgroundColor === 'transparent' });
    if (!ctx) throw new Error('The browser could not create the export canvas.');

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    if (backgroundColor !== 'transparent') {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const stageRect = stage.getBoundingClientRect();
    ctx.setTransform(
        outputSize.width / crop.width,
        0,
        0,
        outputSize.height / crop.height,
        -crop.left * outputSize.width / crop.width,
        -crop.top * outputSize.height / crop.height,
    );

    const states = Array.from(stage.querySelectorAll('.shinigamiEyes__Line__Digit'))
        .map(getDigitRenderState);
    const bounds = states.map(({ digit }) => digit.getBoundingClientRect());
    const attractor = {
        x: (Math.min(...bounds.map((rect) => rect.left))
            + Math.max(...bounds.map((rect) => rect.right))) / 2 - stageRect.left,
        y: Math.max(...bounds.map((rect) => rect.bottom)) + 140 - stageRect.top,
    };

    states.forEach((state) => {
        const core = state.digit.querySelector('.shinigamiEyes__GlyphCore');
        const center = getLayerCenter(core, stageRect);
        drawHaze(ctx, state, center, attractor);
    });
    states.forEach((state) => drawTrails(ctx, state, stageRect, attractor));
    states.forEach((state) => drawSlices(ctx, state, stageRect, attractor));
    states.forEach((state) => drawEchoes(ctx, state, stageRect, attractor));
    states.forEach((state) => {
        const core = state.digit.querySelector('.shinigamiEyes__GlyphCore');
        drawCore(ctx, state, core, stageRect);
    });

    return canvas;
}

async function captureFrames(encoderTask, format, duration, requestedWidth) {
    const stage = document.getElementById('animationStage');
    const crop = getExportCrop();
    const outputSize = getOutputSize(crop, requestedWidth);
    const frameCount = Math.max(1, Math.round(duration * EXPORT_FPS));
    const frameInterval = 1000 / EXPORT_FPS;
    const rawByteLength = outputSize.width * outputSize.height * 4 * frameCount;
    const useRawFrames = rawByteLength <= MAX_RAW_FRAME_BYTES;
    const rawFrames = useRawFrames ? new Uint8Array(rawByteLength) : null;
    await document.fonts.ready;
    const backgroundColor = format === 'gif'
        ? '#000000'
        : format === 'mp4'
        ? (getComputedStyle(document.body).backgroundColor || '#000')
        : 'transparent';
    const frameNames = [];
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = outputSize.width;
    renderCanvas.height = outputSize.height;
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

            const canvas = renderExportCanvas(
                stage,
                crop,
                outputSize,
                backgroundColor,
                renderCanvas,
            );
            if (rawFrames) {
                const pixels = canvas.getContext('2d').getImageData(
                    0,
                    0,
                    outputSize.width,
                    outputSize.height,
                ).data;
                rawFrames.set(pixels, index * outputSize.width * outputSize.height * 4);
            } else {
                const frameName = `shinigami-frame-${String(index).padStart(3, '0')}.png`;
                const blob = await canvasToPngBlob(canvas);
                const ffmpeg = await encoderTask;
                await ffmpeg.writeFile(frameName, await blobToBytes(blob));
                frameNames.push(frameName);
            }
        }

        if (rawFrames) {
            const frameName = 'shinigami-frames.rgba';
            setExportStatus('Preparing frames for the encoder…', 0.72);
            const ffmpeg = await encoderTask;
            await ffmpeg.writeFile(frameName, rawFrames);
            frameNames.push(frameName);
        }
    } finally {
        if (animationClock) animationClock.end();
        cssAnimations.forEach(({ animation, playState }) => {
            if (playState === 'running') animation.play();
        });
    }

    return { frameNames, frameCount, outputSize, useRawFrames };
}

function getEncoderArguments(format, outputName, outputSize, useRawFrames) {
    const input = useRawFrames
        ? [
            '-f', 'rawvideo',
            '-pixel_format', 'rgba',
            '-video_size', `${outputSize.width}x${outputSize.height}`,
            '-framerate', String(EXPORT_FPS),
            '-i', 'shinigami-frames.rgba',
        ]
        : [
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
            '-compression_level', '0',
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
        const encoderTask = getEncoder();
        const { frameNames, frameCount, outputSize, useRawFrames } = await captureFrames(
            encoderTask,
            format,
            duration,
            requestedWidth,
        );
        const ffmpeg = await encoderTask;
        encoderFiles.push(...frameNames);

        const outputName = `shinigami-output.${format}`;
        encoderFiles.push(outputName);
        setExportStatus(`Encoding ${format.toUpperCase()}…`, 0.76);
        const exitCode = await ffmpeg.exec(getEncoderArguments(
            format,
            outputName,
            outputSize,
            useRawFrames,
        ));
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

// Download and compile the encoder in its worker while the user configures the
// effect, so this startup cost is usually already gone by the time Export is
// pressed. A failed prewarm is harmless; an explicit export retries it.
const prewarmEncoder = () => getEncoder(false).catch(() => undefined);
if ('requestIdleCallback' in window) {
    window.requestIdleCallback(prewarmEncoder, { timeout: 5000 });
} else {
    setTimeout(prewarmEncoder, 2500);
}

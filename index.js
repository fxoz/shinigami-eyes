const SETTINGS = {
    ANIMATE: true,
    MIN_PADDING: 10,
    MIN_OPACITY: 0.3,
    TRANSITION_DURATION_MS: 1800,
    DURATION_VARIATION: 0.3,
    MOTION_SPEED: 1.5,
    MOTION_INTENSITY: 1.4,
    CLONES: {
        AMOUNT: 1,
        OPACITY_MULTIPLIER: 0.7,
        SCALE_MULTIPLIER: 0.9,
        TOP_OFFSET: 100,
    },
};

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (start, end, amount) => start + (end - start) * amount;

function randomStyle() {
    return {
        paddingLeft: Math.random() * 6 + SETTINGS.MIN_PADDING / 2,
        paddingRight: Math.random() * 6 + SETTINGS.MIN_PADDING / 2,
        rotation: Math.random() * 40 - 20,
        translateY: Math.random() * 16 - 8,
        scaleX: Math.random() * 0.96 + 0.52,
        fontSize: Math.random() * 54 + 48,
        opacity: SETTINGS.MIN_OPACITY + Math.random() * (1 - SETTINGS.MIN_OPACITY),
    };
}

function randomDuration() {
    const variation = 1 - SETTINGS.DURATION_VARIATION
        + Math.random() * SETTINGS.DURATION_VARIATION * 2;
    return Math.max(Number(SETTINGS.TRANSITION_DURATION_MS), 1) * variation;
}

function interpolateStyle(start, end, amount) {
    return {
        paddingLeft: mix(start.paddingLeft, end.paddingLeft, amount),
        paddingRight: mix(start.paddingRight, end.paddingRight, amount),
        rotation: mix(start.rotation, end.rotation, amount),
        translateY: mix(start.translateY, end.translateY, amount),
        scaleX: mix(start.scaleX, end.scaleX, amount),
        fontSize: mix(start.fontSize, end.fontSize, amount),
        opacity: mix(start.opacity, end.opacity, amount),
    };
}

function applyMotionIntensity(style, intensity) {
    const paddingBaseline = SETTINGS.MIN_PADDING / 2 + 3;
    return {
        ...style,
        paddingLeft: paddingBaseline + (style.paddingLeft - paddingBaseline) * intensity,
        paddingRight: paddingBaseline + (style.paddingRight - paddingBaseline) * intensity,
        rotation: style.rotation * intensity,
        translateY: style.translateY * intensity,
        scaleX: Math.max(0.08, 1 + (style.scaleX - 1) * intensity),
        fontSize: Math.max(12, 75 + (style.fontSize - 75) * intensity),
        opacity: clamp(1 + (style.opacity - 1) * intensity, 0, 1),
    };
}

class ShinigamiCanvasRenderer {
    constructor(stage) {
        this.stage = stage;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'shinigamiEyes__Canvas';
        this.canvas.setAttribute('aria-hidden', 'true');
        this.stage.appendChild(this.canvas);
        this.context = this.canvas.getContext('2d', { alpha: true, desynchronized: true });
        this.lines = [];
        this.textureCache = new Map();
        this.widthCache = new Map();
        this.containerHeight = 100;
        this.size = 1;
        this.hue = 0;
        this.saturation = 100;
        this.brightness = 100;
        this.opacity = 1;
        this.intensity = SETTINGS.MOTION_INTENSITY;
        this.glow = true;
        this.digitBlur = true;
        this.outline = false;
        this.frameRequest = 0;
        this.renderingExport = false;
        this.pauseTime = 0;
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(stage);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.invalidate();
        });
        this.resize();
    }

    createGlyph(char) {
        return {
            char,
            start: randomStyle(),
            end: randomStyle(),
            segmentStart: performance.now(),
            duration: randomDuration(),
            phase: Math.random() * TAU,
            slicePhases: Array.from({ length: 4 }, () => Math.random() * TAU),
            trailPhases: Array.from({ length: 2 }, () => Math.random() * TAU),
        };
    }

    addLine(text) {
        const chars = text.replaceAll(' ', '⠀').split('');
        this.lines.push({ text, glyphs: chars.map((char) => this.createGlyph(char)) });
        this.updateHeight();
        this.invalidate();
    }

    clear() {
        this.lines.length = 0;
        this.updateHeight();
        this.invalidate();
    }

    reapply() {
        const texts = this.getLines();
        this.lines.length = 0;
        texts.forEach((text) => this.addLine(text));
        this.updateHeight();
    }

    getLines() {
        return this.lines.map(({ text }) => text);
    }

    setAnimation(enabled) {
        if (SETTINGS.ANIMATE === enabled) return;
        if (!enabled) this.pauseTime = performance.now();
        else {
            const shift = performance.now() - this.pauseTime;
            this.lines.forEach(({ glyphs }) => glyphs.forEach((glyph) => {
                glyph.segmentStart += shift;
            }));
        }
        SETTINGS.ANIMATE = enabled;
        this.invalidate();
    }

    setOption(name, value) {
        this[name] = value;
        if (name === 'containerHeight' || name === 'size') this.updateHeight();
        if (name === 'glow' || name === 'digitBlur') this.textureCache.clear();
        this.invalidate();
    }

    updateHeight() {
        const cloneReach = Math.max(0, Number(SETTINGS.CLONES.AMOUNT) - 1)
            * SETTINGS.CLONES.TOP_OFFSET;
        const contentHeight = this.lines.length * this.containerHeight + cloneReach
            + 300 * Math.max(1, this.size);
        this.stage.style.height = `${Math.max(1, contentHeight)}px`;
        this.resize();
    }

    resize() {
        const width = Math.max(1, this.stage.clientWidth);
        const height = Math.max(1, this.stage.clientHeight);
        const requestedDpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const pixelBudgetDpr = Math.sqrt(3000000 / (width * height));
        const dpr = Math.max(1, Math.min(requestedDpr, pixelBudgetDpr));
        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);
        if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
            this.canvas.width = pixelWidth;
            this.canvas.height = pixelHeight;
            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;
        }
        this.dpr = dpr;
        this.invalidate();
    }

    invalidate() {
        if (this.frameRequest || document.hidden) return;
        this.frameRequest = requestAnimationFrame((timestamp) => this.frame(timestamp));
    }

    frame(timestamp) {
        this.frameRequest = 0;
        const time = SETTINGS.ANIMATE ? timestamp : this.pauseTime;
        this.render(this.context, this.canvas.width, this.canvas.height, time, {
            dpr: this.dpr,
            background: 'transparent',
            applyColorFilter: false,
        });
        this.canvas.style.filter = `hue-rotate(${this.hue}deg) saturate(${this.saturation}%) brightness(${this.brightness}%)`;
        this.canvas.style.opacity = this.opacity;
        if (SETTINGS.ANIMATE && !this.renderingExport && this.lines.length) this.invalidate();
    }

    currentStyle(glyph, time, mutate = true) {
        let elapsed = time - glyph.segmentStart;
        if (elapsed >= glyph.duration && mutate) {
            const cycles = Math.floor(elapsed / glyph.duration);
            glyph.segmentStart += cycles * glyph.duration;
            glyph.start = glyph.end;
            glyph.end = randomStyle();
            glyph.duration = randomDuration();
            elapsed = time - glyph.segmentStart;
        }
        const amount = clamp(elapsed / glyph.duration, 0, 1);
        return applyMotionIntensity(
            interpolateStyle(glyph.start, glyph.end, amount),
            this.intensity,
        );
    }

    glyphWidth(char) {
        if (this.widthCache.has(char)) return this.widthCache.get(char);
        const ctx = this.context;
        ctx.save();
        ctx.font = '300 100px "Noto Serif JP", serif';
        const width = ctx.measureText(char).width / 100;
        ctx.restore();
        this.widthCache.set(char, width);
        return width;
    }

    texture(char, kind) {
        const blur = this.digitBlur ? 1 : 0;
        const key = `${char}|${kind}|${this.glow}|${blur}`;
        if (this.textureCache.has(key)) return this.textureCache.get(key);

        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.translate(size / 2, size / 2);
        ctx.font = '300 100px "Noto Serif JP", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (kind === 'smear') ctx.filter = `blur(${7 + blur}px)`;
        else if (blur) ctx.filter = `blur(${blur}px)`;

        const paint = (color, shadowColor = 'transparent', shadowBlur = 0) => {
            ctx.fillStyle = color;
            ctx.shadowColor = this.glow ? shadowColor : 'transparent';
            ctx.shadowBlur = this.glow ? shadowBlur : 0;
            ctx.fillText(char, 0, 0);
        };

        if (kind === 'core') {
            if (this.glow) {
                paint('rgba(255,78,94,.7)', '#ff4e5e', 22);
                paint('rgba(255,208,214,.88)', '#ff7180', 10);
            }
            paint('#ffe1e1', '#fff', 3);
        } else if (kind === 'echo') {
            paint('#ffc7cd', '#ff6978', 12);
        } else if (kind === 'smear') {
            paint('rgba(255,74,94,.48)', '#ff3854', 30);
            paint('rgba(255,118,132,.24)', '#ff596e', 18);
        } else if (kind === 'trail') {
            const gradient = ctx.createLinearGradient(0, -48, 0, 70);
            gradient.addColorStop(0, '#ffb4bd');
            gradient.addColorStop(.5, '#ff8998');
            gradient.addColorStop(1, 'rgba(255,80,98,0)');
            ctx.fillStyle = gradient;
            ctx.shadowColor = this.glow ? '#ff485a' : 'transparent';
            ctx.shadowBlur = this.glow ? 12 : 0;
            ctx.fillText(char, 0, 0);
        } else {
            paint('#ffc0c5', '#ff5868', 10);
        }
        this.textureCache.set(key, canvas);
        return canvas;
    }

    drawTexture(ctx, glyph, kind, x, y, style, opacity, transform = {}) {
        if (opacity < .002) return;
        const extent = style.fontSize * 2.56;
        ctx.save();
        ctx.globalAlpha *= clamp(opacity, 0, 1);
        ctx.translate(x + (transform.x || 0), y + (transform.y || 0));
        ctx.rotate((style.rotation + (transform.rotation || 0)) * Math.PI / 180);
        ctx.transform(style.scaleX * (transform.scaleX || 1), 0, 0,
            transform.scaleY || 1, 0, 0);
        if (transform.clip) {
            const { top, bottom } = transform.clip;
            ctx.beginPath();
            ctx.rect(-style.fontSize, -style.fontSize * .5 + style.fontSize * top,
                style.fontSize * 2, style.fontSize * (bottom - top));
            ctx.clip();
        }
        ctx.drawImage(this.texture(glyph.char, kind), -extent / 2, -extent / 2, extent, extent);
        if (this.outline && kind === 'core') {
            ctx.strokeStyle = 'rgba(255,255,255,.85)';
            ctx.lineWidth = 1 / Math.max(style.scaleX, .1);
            ctx.strokeRect(-style.fontSize * .42, -style.fontSize * .52,
                style.fontSize * .84, style.fontSize * 1.04);
        }
        ctx.restore();
    }

    drawGlyph(ctx, glyph, style, x, y, attractor, time, cloneOpacity) {
        const centerY = y + style.translateY;
        const dx = attractor.x - x;
        const dy = attractor.y - centerY;
        const distance = Math.hypot(dx, dy) || 1;
        const directionX = dx / distance;
        const directionY = dy / distance;
        const baseOpacity = style.opacity * cloneOpacity;
        const effectTime = time * SETTINGS.MOTION_SPEED;
        const intensity = this.intensity;
        const slow = effectTime / 4200 + glyph.phase;

        // A soft stack of offset, pre-blurred glyphs recreates the long red
        // directional shadow without invoking an expensive canvas blur every frame.
        if (this.glow && intensity > .01) {
            const smearLength = Math.min(distance * .52, 190) * Math.min(intensity, 2);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let sample = 7; sample >= 1; sample--) {
                const progress = sample / 7;
                const fade = 1 - progress * .72;
                this.drawTexture(ctx, glyph, 'smear', x, centerY, style,
                    baseOpacity * .17 * fade, {
                        x: directionX * smearLength * progress,
                        y: directionY * smearLength * progress,
                        scaleX: 1 + progress * .05 * intensity,
                        scaleY: 1 + progress * .2 * intensity,
                    });
            }
            ctx.restore();
        }

        const hazeLength = Math.min(distance * .68, 170);
        const gradient = ctx.createLinearGradient(0, 0, 0, hazeLength);
        gradient.addColorStop(0, 'rgba(255,122,136,.24)');
        gradient.addColorStop(.42, 'rgba(255,78,96,.13)');
        gradient.addColorStop(1, 'rgba(255,45,70,0)');
        ctx.save();
        ctx.globalAlpha *= baseOpacity * (.25 + .12 * Math.sin(slow));
        ctx.translate(x, centerY + style.fontSize * .12);
        ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
        ctx.fillStyle = gradient;
        ctx.fillRect(-style.fontSize * .13, 0, style.fontSize * .26, hazeLength);
        ctx.restore();

        for (let index = 2; index >= 0; index--) {
            const depth = (index + 1) / 3;
            const pulse = .9 + .1 * Math.sin(slow + depth);
            const travel = (.04 + depth * .42) * intensity;
            const echoScale = Math.max(.08, 1 + ((1 - depth * .7) - 1) * intensity);
            this.drawTexture(ctx, glyph, 'echo', x, centerY, style,
                baseOpacity * (.22 - depth * .15) * pulse, {
                    x: dx * travel,
                    y: dy * travel,
                    scaleX: echoScale,
                    scaleY: echoScale,
                });
        }

        for (let index = 1; index >= 0; index--) {
            const phase = effectTime / (index ? 5100 : 4400) + glyph.trailPhases[index];
            const wave = (Math.sin(phase) + 1) / 2;
            const length = (10 + index * 9 + wave * 12) * intensity;
            const opacity = baseOpacity * (index ? .1 : .17);
            for (let sample = 2; sample >= 0; sample--) {
                const progress = sample / 2;
                this.drawTexture(ctx, glyph, 'trail', x, centerY, style,
                    opacity * (1 - progress * .55), {
                        x: directionX * length * progress,
                        y: directionY * length * progress + wave * 4 * intensity,
                        rotation: (Math.atan2(dy, dx) * 180 / Math.PI - 90) * wave * intensity,
                        scaleX: 1 - wave * .1 * intensity,
                        scaleY: 1 + wave * (.08 + index * .04) * intensity,
                    });
            }
        }

        for (let index = 0; index < 4; index++) {
            const depth = (index + 1) / 4;
            const phase = effectTime / (3200 + index * 420) + glyph.slicePhases[index];
            const wave = (Math.sin(phase) + 1) / 2;
            const flow = (4 + depth * 8) * intensity;
            this.drawTexture(ctx, glyph, 'slice', x, centerY, style,
                baseOpacity * (.18 + depth * .12), {
                    x: directionX * flow * wave,
                    y: directionY * flow * wave,
                    rotation: (Math.atan2(dy, dx) * 180 / Math.PI - 90) * .55 * wave * intensity,
                    scaleX: 1 - wave * .04 * intensity,
                    scaleY: 1 + wave * (.08 + depth * .12) * intensity,
                    clip: { top: .1 + index * .22, bottom: Math.min(.28 + index * .22, 1) },
                });
        }

        this.drawTexture(ctx, glyph, 'core', x, centerY, style,
            baseOpacity * (.94 + .06 * Math.sin(slow * 1.15)));
    }

    sceneLayout(time, mutate = true, lines = this.lines) {
        const layouts = [];
        let bottom = 0;
        lines.forEach((line, lineIndex) => {
            const styles = line.glyphs.map((glyph) => this.currentStyle(glyph, time, mutate));
            const widths = styles.map((style, index) =>
                this.glyphWidth(line.glyphs[index].char) * style.fontSize
                + style.paddingLeft + style.paddingRight);
            const totalWidth = widths.reduce((sum, width) => sum + width, 0);
            for (let clone = 0; clone < Number(SETTINGS.CLONES.AMOUNT); clone++) {
                const cloneScale = Math.pow(SETTINGS.CLONES.SCALE_MULTIPLIER, clone) * this.size;
                const cloneOpacity = clone === 0
                    ? 1
                    : .2 * Math.pow(SETTINGS.CLONES.OPACITY_MULTIPLIER, clone - 1);
                let cursor = -totalWidth / 2;
                const y = lineIndex * this.containerHeight + SETTINGS.CLONES.TOP_OFFSET
                    + clone * SETTINGS.CLONES.TOP_OFFSET;
                const glyphs = line.glyphs.map((glyph, index) => {
                    const x = (cursor + widths[index] / 2) * cloneScale;
                    cursor += widths[index];
                    return { glyph, style: styles[index], x, y, cloneScale, cloneOpacity };
                });
                layouts.push({ glyphs, y, totalWidth: totalWidth * cloneScale });
                bottom = Math.max(bottom, y + 120 * cloneScale);
            }
        });
        return { layouts, bottom };
    }

    cloneLinesForExport() {
        return this.lines.map((line) => ({
            text: line.text,
            glyphs: line.glyphs.map((glyph) => ({
                ...glyph,
                start: { ...glyph.start },
                end: { ...glyph.end },
                slicePhases: [...glyph.slicePhases],
                trailPhases: [...glyph.trailPhases],
            })),
        }));
    }

    getExportCrop(time = performance.now(), lines = this.lines) {
        if (!lines.length) throw new Error('Add at least one line before exporting.');
        const { layouts, bottom } = this.sceneLayout(time, false, lines);
        const widest = Math.max(...layouts.map(({ totalWidth }) => totalWidth), 2);
        const top = 30;
        return {
            left: -widest / 2 - 190,
            top,
            width: widest + 380,
            height: Math.max(2, bottom + 135 - top),
        };
    }

    createExportSession(time = performance.now()) {
        const lines = this.cloneLinesForExport();
        return {
            lines,
            startTime: time,
            crop: this.getExportCrop(time, lines),
        };
    }

    render(ctx, pixelWidth, pixelHeight, time, options = {}) {
        const dpr = options.dpr || 1;
        const background = options.background || 'transparent';
        const crop = options.crop;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.filter = 'none';
        ctx.clearRect(0, 0, pixelWidth, pixelHeight);
        if (background !== 'transparent') {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, pixelWidth, pixelHeight);
        }
        if (options.applyColorFilter) {
            ctx.filter = `hue-rotate(${this.hue}deg) saturate(${this.saturation}%) brightness(${this.brightness}%)`;
            ctx.globalAlpha = this.opacity;
        }

        const scale = crop ? pixelWidth / crop.width : dpr;
        const originX = crop ? -crop.left * scale : pixelWidth / 2;
        const originY = crop ? -crop.top * scale : 0;
        ctx.translate(originX, originY);
        ctx.scale(scale, scale);

        const lines = options.lines || this.lines;
        const mutateTimeline = options.mutateTimeline ?? !options.exporting;
        const { layouts, bottom } = this.sceneLayout(time, mutateTimeline, lines);
        if (!crop && layouts.length) {
            const widest = Math.max(...layouts.map(({ totalWidth }) => totalWidth), 1);
            const fit = Math.min(1, (pixelWidth / dpr - 16) / widest);
            ctx.scale(fit, fit);
        }
        const attractor = { x: 0, y: bottom + 140 };
        layouts.forEach(({ glyphs }) => glyphs.forEach((item) => {
            ctx.save();
            ctx.translate(item.x, item.y);
            ctx.scale(item.cloneScale, item.cloneScale);
            this.drawGlyph(ctx, item.glyph, item.style, 0, 0, {
                x: attractor.x / item.cloneScale - item.x / item.cloneScale,
                y: (attractor.y - item.y) / item.cloneScale,
            }, time, item.cloneOpacity);
            ctx.restore();
        }));
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
    }

    renderExportFrame(canvas, time, background, crop, lines) {
        const ctx = canvas.getContext('2d', {
            alpha: background === 'transparent',
            willReadFrequently: true,
        });
        this.render(ctx, canvas.width, canvas.height, time, {
            dpr: canvas.width / crop.width,
            background,
            crop,
            applyColorFilter: true,
            exporting: true,
            lines,
            mutateTimeline: Boolean(lines),
        });
        return canvas;
    }
}

window.shinigamiRenderer = new ShinigamiCanvasRenderer(document.getElementById('animationStage'));

function setAnimation(status) {
    window.shinigamiRenderer.setAnimation(status);
}

function enableGlow() {
    window.shinigamiRenderer.setOption('glow', true);
}

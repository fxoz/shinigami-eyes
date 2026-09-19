const SETTINGS = {
    ANIMATE: true,
    MIN_PADDING: 10,
    MIN_OPACITY: 0.3,
    TRANSITION_DURATION_MS: 3000,
    DURATION_VARIATION: 0.3,
    MOLTEN_SLICES: 4,
    MOLTEN_TRAILS: 2,
    PERSPECTIVE_ECHOES: 3,
    CLONES: {
        AMOUNT: 1,
        OPACITY_MULTIPLIER: 0.7,
        SCALE_MULTIPLIER: 0.9,
        TOP_OFFSET: 100,
    },
};

function setAnimation(status) {
    SETTINGS.ANIMATE = status;
    for (const digit of document.querySelectorAll('.shinigamiEyes__Line__Digit')) {
        digit.classList.toggle('shinigamiEyes__Line__Digit--paused', !status);
    }
}

function enableGlow() {
    for (const digit of document.querySelectorAll('.shinigamiEyes__Line__Digit')) {
        digit.classList.remove('shinigamiEyes__Line__Digit--noGlow');
    }
}

function generateDigitStyles() {
    return {
        paddingLeft: `${Math.random() * 6 + SETTINGS.MIN_PADDING / 2}px`,
        paddingRight: `${Math.random() * 6 + SETTINGS.MIN_PADDING / 2}px`,
        rotation: Math.random() * 24 - 12,
        translateY: Math.random() * 10 - 5,
        scaleX: Math.random() * 0.6 + 0.7,
        fontSize: `${Math.random() * 35 + 55}px`,
        opacity: SETTINGS.MIN_OPACITY + Math.random() * (1 - SETTINGS.MIN_OPACITY),
    };
}

function generateAnimationDuration() {
    const baseDuration = Math.max(Number(SETTINGS.TRANSITION_DURATION_MS), 1);
    const variation = 1 - SETTINGS.DURATION_VARIATION + Math.random() * SETTINGS.DURATION_VARIATION * 2;
    return baseDuration * variation;
}

function applyStyles(el, styles) {
    Object.assign(el.style, {
        paddingLeft: styles.paddingLeft,
        paddingRight: styles.paddingRight,
        fontSize: styles.fontSize,
        opacity: styles.opacity,
        transform: `rotate(${styles.rotation}deg) translateY(${styles.translateY}px) scaleX(${styles.scaleX})`,
    });
}

function createMoltenSlice(char, index) {
    const slice = document.createElement('span');
    const ink = document.createElement('span');
    const depth = (index + 1) / SETTINGS.MOLTEN_SLICES;
    const top = 10 + index * 22;
    const bottom = Math.min(top + 18, 100);
    const duration = 2800 + Math.random() * 2600;
    const meltX = (Math.random() * 2 - 1) * 3;
    const meltY = 1 + depth * (3 + Math.random() * 4);
    const meltStretch = 1.01 + depth * (0.08 + Math.random() * 0.12);
    const meltSkew = (Math.random() * 2 - 1) * (1 + depth * 2);
    const sliceOpacity = 0.18 + depth * 0.12;

    slice.className = 'shinigamiEyes__GlyphSlice';
    slice.setAttribute('aria-hidden', 'true');
    ink.className = 'shinigamiEyes__GlyphSliceInk';
    ink.textContent = char;
    ink.style.clipPath = `inset(${top}% -20% ${100 - bottom}% -20%)`;
    slice.appendChild(ink);
    slice.style.animationDuration = `${duration}ms`;
    slice.style.animationDelay = `${-Math.random() * duration}ms`;
    slice.style.setProperty('--melt-x-start', `${meltX * -0.45}px`);
    slice.style.setProperty('--melt-x-mid', `${meltX * 0.65}px`);
    slice.style.setProperty('--melt-x-end', `${meltX}px`);
    slice.style.setProperty('--melt-x-relax', `${meltX * -0.2}px`);
    slice.style.setProperty('--melt-y-mid', `${meltY * 0.3}px`);
    slice.style.setProperty('--melt-y-end', `${meltY}px`);
    slice.style.setProperty('--melt-y-relax', `${meltY * 0.18}px`);
    slice.style.setProperty('--melt-stretch-mid', 1 + (meltStretch - 1) * 0.35);
    slice.style.setProperty('--melt-stretch-end', meltStretch);
    slice.style.setProperty('--melt-skew-start', `${meltSkew * -0.35}deg`);
    slice.style.setProperty('--melt-skew-mid', `${meltSkew * 0.45}deg`);
    slice.style.setProperty('--melt-skew-end', `${meltSkew}deg`);
    slice.style.setProperty('--melt-skew-relax', `${meltSkew * -0.2}deg`);
    slice.style.setProperty('--slice-opacity-low', sliceOpacity * 0.82);
    slice.style.setProperty('--slice-opacity-soft', sliceOpacity * 0.9);
    slice.style.setProperty('--slice-opacity-high', sliceOpacity);
    slice.style.setProperty('--slice-opacity-relaxed', sliceOpacity * 0.96);
    slice.moltenMotion = { depth, meltX, meltY };
    return slice;
}

function createMoltenTrail(char, index) {
    const trail = document.createElement('span');
    const duration = 3600 + Math.random() * 2800;
    const trailX = (Math.random() * 2 - 1) * 2;
    const trailY = 3 + Math.random() * 4;
    const trailStretch = 1.04 + Math.random() * 0.08 + index * 0.04;
    const trailSkew = (Math.random() * 2 - 1) * 2;

    trail.className = `shinigamiEyes__GlyphTrail shinigamiEyes__GlyphTrail--${index + 1}`;
    trail.textContent = char;
    trail.setAttribute('aria-hidden', 'true');
    trail.style.animationDuration = `${duration}ms`;
    trail.style.animationDelay = `${-Math.random() * duration}ms`;
    trail.style.setProperty('--trail-x-start', `${trailX * -0.4}px`);
    trail.style.setProperty('--trail-x-mid', `${trailX * 0.35}px`);
    trail.style.setProperty('--trail-x-end', `${trailX}px`);
    trail.style.setProperty('--trail-y-mid', `${trailY * 0.45}px`);
    trail.style.setProperty('--trail-y-end', `${trailY}px`);
    trail.style.setProperty('--trail-stretch-mid', trailStretch * 0.72);
    trail.style.setProperty('--trail-stretch-end', trailStretch);
    trail.style.setProperty('--trail-skew-start', `${trailSkew * -0.3}deg`);
    trail.style.setProperty('--trail-skew-mid', `${trailSkew * 0.5}deg`);
    trail.style.setProperty('--trail-skew-end', `${trailSkew}deg`);
    trail.style.setProperty('--trail-opacity-start', index === 0 ? 0.1 : 0.055);
    trail.style.setProperty('--trail-opacity-mid', index === 0 ? 0.24 : 0.15);
    trail.style.setProperty('--trail-opacity-end', index === 0 ? 0.15 : 0.085);
    trail.moltenMotion = { depth: 0.7 + index * 0.3, trailX, trailY };
    return trail;
}

function createPerspectiveEcho(char, index) {
    const echo = document.createElement('span');
    const depth = (index + 1) / SETTINGS.PERSPECTIVE_ECHOES;
    const scale = 1 - depth * 0.7;
    const opacity = 0.22 - depth * 0.15;

    echo.className = 'shinigamiEyes__GlyphEcho';
    echo.textContent = char;
    echo.setAttribute('aria-hidden', 'true');
    echo.style.zIndex = SETTINGS.PERSPECTIVE_ECHOES + 2 - index;
    echo.style.setProperty('--echo-scale', scale);
    echo.style.setProperty('--echo-opacity-low', opacity * 0.82);
    echo.style.setProperty('--echo-opacity-high', opacity);
    echo.style.setProperty('--echo-opacity-relaxed', opacity * 0.92);
    echo.style.setProperty('--echo-blur', `${1.5 + depth * 2}px`);
    echo.vanishingDepth = depth;
    return echo;
}

function createDirectionalShadow(directionX, directionY, length, opacity) {
    const samples = 9;
    const shadows = [];

    for (let index = 1; index <= samples; index++) {
        const progress = index / samples;
        const offsetX = directionX * length * progress;
        const offsetY = directionY * length * progress;
        const blur = 2 + progress * 12;
        const sampleOpacity = opacity * (1 - progress * 0.62);
        shadows.push(`${offsetX}px ${offsetY}px ${blur}px rgba(255, 92, 108, ${sampleOpacity})`);
    }

    return shadows.join(', ');
}

function createDirectionalFilter(directionX, directionY, length, opacity) {
    const samples = 4;
    const filters = [];

    for (let index = 1; index <= samples; index++) {
        const progress = index / samples;
        const offsetX = directionX * length * progress;
        const offsetY = directionY * length * progress;
        const blur = 3 + progress * 10;
        const sampleOpacity = opacity * (1 - progress * 0.58);
        filters.push(`drop-shadow(${offsetX}px ${offsetY}px ${blur}px rgba(255, 86, 104, ${sampleOpacity}))`);
    }

    return filters.join(' ');
}

function createEchoSmear(directionX, directionY, length) {
    const samples = 5;
    const shadows = [];

    for (let index = 1; index <= samples; index++) {
        const progress = index / samples;
        const offsetX = directionX * length * progress;
        const offsetY = directionY * length * progress;
        const blur = 1.5 + progress * 5;
        const opacity = 0.42 * (1 - progress * 0.7);
        shadows.push(`${offsetX}px ${offsetY}px ${blur}px rgba(255, 112, 126, ${opacity})`);
    }

    return shadows.join(', ');
}

function updateAttractorDirections() {
    const digits = Array.from(document.querySelectorAll('.shinigamiEyes__Line__Digit'));
    if (digits.length === 0) return;

    const bounds = digits.map((digit) => digit.getBoundingClientRect());
    const left = Math.min(...bounds.map((rect) => rect.left));
    const right = Math.max(...bounds.map((rect) => rect.right));
    const bottom = Math.max(...bounds.map((rect) => rect.bottom));
    const attractorX = (left + right) / 2;
    const attractorY = bottom + 140;

    digits.forEach((digit, digitIndex) => {
        const rect = bounds[digitIndex];
        const deltaX = attractorX - (rect.left + rect.width / 2);
        const deltaY = attractorY - (rect.top + rect.height / 2);
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const directionX = deltaX / distance;
        const directionY = deltaY / distance;
        const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI - 90;

        digit.style.setProperty('--haze-x-end', `${directionX * 18}px`);
        digit.style.setProperty('--haze-y-end', `${directionY * 18}px`);
        digit.style.setProperty('--haze-angle-mid', `${angle * 0.45}deg`);
        digit.style.setProperty('--haze-angle-end', `${angle}deg`);

        digit.querySelectorAll('.shinigamiEyes__GlyphEcho').forEach((echo) => {
            const travel = 0.04 + echo.vanishingDepth * 0.42;
            echo.style.setProperty('--echo-x', `${deltaX * travel}px`);
            echo.style.setProperty('--echo-y', `${deltaY * travel}px`);
            echo.style.setProperty(
                '--echo-smear',
                createEchoSmear(
                    directionX,
                    directionY,
                    Math.min(distance * (0.1 + echo.vanishingDepth * 0.06), 55),
                ),
            );
        });

        digit.querySelectorAll('.shinigamiEyes__GlyphSlice').forEach((slice) => {
            const { depth, meltX, meltY } = slice.moltenMotion;
            const flowDistance = 4 + depth * 8;
            const flowX = directionX * flowDistance;
            const flowY = directionY * flowDistance;
            slice.style.setProperty('--melt-x-mid', `${meltX * 0.4 + flowX * 0.4}px`);
            slice.style.setProperty('--melt-x-end', `${meltX + flowX}px`);
            slice.style.setProperty('--melt-y-mid', `${meltY * 0.4 + flowY * 0.4}px`);
            slice.style.setProperty('--melt-y-end', `${meltY + flowY}px`);
            slice.style.setProperty('--flow-angle-mid', `${angle * 0.25}deg`);
            slice.style.setProperty('--flow-angle-end', `${angle * 0.55}deg`);
            slice.style.setProperty(
                '--motion-filter',
                createDirectionalFilter(
                    directionX,
                    directionY,
                    Math.min(distance * (0.32 + depth * 0.12), 130),
                    0.48,
                ),
            );
        });

        digit.querySelectorAll('.shinigamiEyes__GlyphTrail').forEach((trail) => {
            const { depth, trailX, trailY } = trail.moltenMotion;
            const flowDistance = 10 + depth * 9;
            const flowX = directionX * flowDistance;
            const flowY = directionY * flowDistance;
            trail.style.setProperty('--trail-x-mid', `${trailX * 0.3 + flowX * 0.45}px`);
            trail.style.setProperty('--trail-x-end', `${trailX + flowX}px`);
            trail.style.setProperty('--trail-y-mid', `${trailY * 0.3 + flowY * 0.45}px`);
            trail.style.setProperty('--trail-y-end', `${trailY + flowY}px`);
            trail.style.setProperty('--trail-angle-mid', `${angle * 0.55}deg`);
            trail.style.setProperty('--trail-angle-end', `${angle}deg`);
            trail.style.setProperty(
                '--motion-shadow',
                createDirectionalShadow(
                    directionX,
                    directionY,
                    Math.min(distance * (0.48 + depth * 0.12), 180),
                    0.58,
                ),
            );
        });
    });
}

function createDigit(char, styles) {
    const el = document.createElement('span');
    el.className = 'shinigamiEyes__Line__Digit';
    el.setAttribute('aria-label', char);
    el.dataset.char = char;

    const measure = document.createElement('span');
    measure.className = 'shinigamiEyes__GlyphMeasure';
    measure.textContent = char;
    measure.setAttribute('aria-hidden', 'true');
    el.appendChild(measure);

    const core = document.createElement('span');
    core.className = 'shinigamiEyes__GlyphCore';
    core.textContent = char;
    core.setAttribute('aria-hidden', 'true');
    el.appendChild(core);

    for (let index = 0; index < SETTINGS.PERSPECTIVE_ECHOES; index++) {
        el.appendChild(createPerspectiveEcho(char, index));
    }

    for (let index = 0; index < SETTINGS.MOLTEN_TRAILS; index++) {
        el.appendChild(createMoltenTrail(char, index));
    }

    for (let index = 0; index < SETTINGS.MOLTEN_SLICES; index++) {
        el.appendChild(createMoltenSlice(char, index));
    }

    if (!SETTINGS.ANIMATE) el.classList.add('shinigamiEyes__Line__Digit--paused');
    const glowCheckbox = document.getElementById('glowCheckbox');
    if (glowCheckbox && !glowCheckbox.checked) {
        el.classList.add('shinigamiEyes__Line__Digit--noGlow');
    }
    applyStyles(el, styles);
    el.initialStyles = styles;
    return el;
}

function createContainer(chars, scale, topOffset, opacity, reuseStyles, storedStyles) {
    const container = document.createElement('div');
    container.className = 'shinigamiEyes__Line';
    if (reuseStyles) container.classList.add('shinigamiEyes__Line--reused');
    Object.assign(container.style, {
        transform: `scale(${scale})`,
        top: `${topOffset}px`,
        opacity,
    });

    chars.forEach((char, i) => {
        const styles = reuseStyles ? storedStyles[i] : generateDigitStyles();
        if (!reuseStyles) storedStyles.push(styles);
        container.appendChild(createDigit(char, styles));
    });

    return container;
}

function initRender(text) {
    const outerContainer = document.createElement('div');
    outerContainer.className = 'shinigamiEyes__Line__Container';
    document.body.appendChild(outerContainer);

    const innerContainer = document.createElement('div');
    innerContainer.className = 'shinigamiEyes__Line__InnerContainer';
    document.body.appendChild(innerContainer);

    const chars = text.replace(" ", "⠀").split('');
    const storedStyles = [];
    const { AMOUNT, SCALE_MULTIPLIER, OPACITY_MULTIPLIER, TOP_OFFSET } = SETTINGS.CLONES;
    let scale = 1;
    let topOffset = TOP_OFFSET;
    let opacity = 1;

    const allDigits = [];

    for (let i = 0; i < AMOUNT; i++) {
        const container = createContainer(chars, scale, topOffset, opacity, i > 0, storedStyles);
        innerContainer.appendChild(container);
        outerContainer.appendChild(innerContainer);
        const digits = container.querySelectorAll('.shinigamiEyes__Line__Digit');
        digits.forEach((digit) => {
            allDigits.push(digit);
        });

        scale *= SCALE_MULTIPLIER;
        topOffset += TOP_OFFSET;
        opacity *= OPACITY_MULTIPLIER;
        if (i === 0) opacity = 0.2;
    }

    setTimeout(() => {
        updateAttractorDirections();
        animateDigits(allDigits);
    }, 20);
}

function interpolateStyles(startStyles, endStyles, progress) {
    const interpolate = (start, end) => start + (end - start) * progress;

    return {
        paddingLeft: `${interpolate(Number.parseFloat(startStyles.paddingLeft), Number.parseFloat(endStyles.paddingLeft))}px`,
        paddingRight: `${interpolate(Number.parseFloat(startStyles.paddingRight), Number.parseFloat(endStyles.paddingRight))}px`,
        fontSize: `${interpolate(Number.parseFloat(startStyles.fontSize), Number.parseFloat(endStyles.fontSize))}px`,
        opacity: interpolate(startStyles.opacity, endStyles.opacity),
        rotation: interpolate(startStyles.rotation, endStyles.rotation),
        translateY: interpolate(startStyles.translateY, endStyles.translateY),
        scaleX: interpolate(startStyles.scaleX, endStyles.scaleX),
    };
}

function animateDigits(digits) {
    const animationStates = digits.map((digit) => ({
        digit,
        startStyles: digit.initialStyles,
        endStyles: generateDigitStyles(),
        duration: generateAnimationDuration(),
        segmentStart: undefined,
    }));
    let previousTimestamp;

    function animateFrame(timestamp) {
        const activeStates = animationStates.filter(({ digit }) => digit.isConnected);
        if (activeStates.length === 0) return;

        if (!SETTINGS.ANIMATE) {
            const pausedDuration = timestamp - (previousTimestamp ?? timestamp);
            activeStates.forEach((state) => {
                if (state.segmentStart !== undefined) state.segmentStart += pausedDuration;
            });
            previousTimestamp = timestamp;
            requestAnimationFrame(animateFrame);
            return;
        }

        previousTimestamp = timestamp;
        if (timestamp - lastAttractorUpdate >= 500) {
            updateAttractorDirections();
            lastAttractorUpdate = timestamp;
        }
        activeStates.forEach((state) => {
            if (state.segmentStart === undefined) state.segmentStart = timestamp;

            const elapsed = timestamp - state.segmentStart;
            if (elapsed >= state.duration) {
                const overflow = elapsed % state.duration;
                state.segmentStart = timestamp - overflow;
                state.startStyles = state.endStyles;
                state.endStyles = generateDigitStyles();
                state.duration = generateAnimationDuration();
            }

            const progress = Math.min((timestamp - state.segmentStart) / state.duration, 1);
            applyStyles(state.digit, interpolateStyles(state.startStyles, state.endStyles, progress));
        });

        requestAnimationFrame(animateFrame);
    }

    requestAnimationFrame(animateFrame);
}

let lastAttractorUpdate = 0;

if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => requestAnimationFrame(updateAttractorDirections));
}

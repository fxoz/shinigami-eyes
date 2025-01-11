const SETTINGS = {
    ANIMATE: true,
    MIN_PADDING: 10,
    MIN_SCALE_X: 0.2,
    MIN_OPACITY: 0.3,
    TRANSITION_DURATION_MS: 1000,
    REANIMATION_DELAY_MS: 1000,
    CLONES: {
        AMOUNT: 1,
        OPACITY_MULTIPLIER: 0.7,
        SCALE_MULTIPLIER: 0.9,
        TOP_OFFSET: 100,
    },
};

function setAnimation(status) {
    SETTINGS.ANIMATE = status;
}

function enableGlow() {
    for (digit of document.querySelectorAll('.shinigamiEyes__Line__Digit')) {
        digit.style.textShadow = '0 0 100px #ff000022, 0 0 60px #ff0000, 0 0 30px #ff0000bb, 0 0 5px #ff000066, 0 0 60px white, 0px 15px 5px #ffffff3e, 0 0 100px #ffffff55';
    };
}

function generateDigitStyles() {
    return {
        paddingLeft: `${Math.random() * 10 + SETTINGS.MIN_PADDING / 2}px`,
        paddingRight: `${Math.random() * 10 + SETTINGS.MIN_PADDING / 2}px`,
        rotation: Math.random() * 60 - 30,
        translateY: Math.random() * 20 - 10,
        scaleX: Math.random() * 1.5 + SETTINGS.MIN_SCALE_X,
        fontSize: `${Math.random() * 70 + 35}px`,
        opacity: Math.random() * 0.8 + SETTINGS.MIN_OPACITY,
    };
}

function applyStyles(el, styles) {
    Object.assign(el.style, {
        paddingLeft: styles.paddingLeft,
        paddingRight: styles.paddingRight,
        fontSize: styles.fontSize,
        opacity: styles.opacity,
        transform: `rotate(${styles.rotation}deg) translateY(${styles.translateY}px) scaleX(${styles.scaleX})`,
        transition: `all linear ${SETTINGS.TRANSITION_DURATION_MS}ms`,
    });
}

function createDigit(char, styles) {
    const el = document.createElement('span');
    el.textContent = char;
    el.className = 'shinigamiEyes__Line__Digit';
    applyStyles(el, styles);
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
        digits.forEach((digit, index) => {
            digit.initialStyles = generateDigitStyles();
            allDigits.push(digit);
        });

        scale *= SCALE_MULTIPLIER;
        topOffset += TOP_OFFSET;
        opacity *= OPACITY_MULTIPLIER;
        if (i === 0) opacity = 0.2;
    }

    setTimeout(() => {
        animateDigits(allDigits);
    }, 20);
}

function animateDigits(digits, duration = 2000) {
    digits.forEach((digit, index) => {
        const startStyles = digit.initialStyles;
        const endStyles = generateDigitStyles();

        const stepCount = 100;
        let step = 0;

        function animateStep() {
            step++;
            const progress = step / stepCount;

            const currentStyles = {
                paddingLeft: `${Number.parseFloat(startStyles.paddingLeft) + (Number.parseFloat(endStyles.paddingLeft) - Number.parseFloat(startStyles.paddingLeft)) * progress}px`,
                paddingRight: `${Number.parseFloat(startStyles.paddingRight) + (Number.parseFloat(endStyles.paddingRight) - Number.parseFloat(startStyles.paddingRight)) * progress}px`,
                fontSize: `${Number.parseFloat(startStyles.fontSize) + (Number.parseFloat(endStyles.fontSize) - Number.parseFloat(startStyles.fontSize)) * progress}px`,
                opacity: startStyles.opacity + (endStyles.opacity - startStyles.opacity) * progress,
                rotation: startStyles.rotation + (endStyles.rotation - startStyles.rotation) * progress,
                translateY: startStyles.translateY + (endStyles.translateY - startStyles.translateY) * progress,
                scaleX: startStyles.scaleX + (endStyles.scaleX - startStyles.scaleX) * progress,
            };

            applyStyles(digit, currentStyles);

            if (step < stepCount) {
                requestAnimationFrame(animateStep);
            } else {
                digit.initialStyles = endStyles;

                setTimeout(() => {
                    animateDigits([digit], duration);
                }, SETTINGS.REANIMATION_DELAY_MS);
            }
        }

        animateStep();
    });
}

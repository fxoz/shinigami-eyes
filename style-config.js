
document.getElementById('digitBlurCheckbox').addEventListener('change', () => {
    for (const container of document.querySelectorAll('.shinigamiEyes__Line__Digit')) {
        container.style.filter = document.getElementById('digitBlurCheckbox').checked ? 'blur(1px)' : 'none';
    }
});

document.getElementById('animationDelaySlider').addEventListener('input', (e) => {
    SETTINGS.REANIMATION_DELAY_MS = e.target.value;
});

document.getElementById('outlineLettersCheckbox').addEventListener('change', () => {
    for (const container of document.querySelectorAll('.shinigamiEyes__Line__Digit')) {
        container.style.outline = document.getElementById('outlineLettersCheckbox').checked ? '1px solid white' : 'none';
    }
});

document.getElementById('containerHeightSlider').addEventListener('input', (e) => {
    for (const container of document.querySelectorAll('.shinigamiEyes__Line__Container')) {
        container.style.height = `${e.target.value}px`;
    }
});

document.getElementById('spacingSlider').addEventListener('input', (e) => {
    SETTINGS.MIN_PADDING = e.target.value;
});

document.getElementById('opacityMinSlider').addEventListener('input', (e) => {
    SETTINGS.MIN_OPACITY = e.target.value / 100;
});

document.getElementById('sizeSlider').addEventListener('input', (e) => {
    for (const container of document.querySelectorAll('.shinigamiEyes__Line__Container')) {
        container.style.transform = `scale(${e.target.value / 100})`;
    }
});

document.getElementById('hueSlider').addEventListener('input', (e) => {
    for (const container of document.querySelectorAll('.shinigamiEyes__Line__Digit')) {
        container.style.filter = `hue-rotate(${e.target.value}deg)`;
    }
});

document.getElementById('brightnessSlider').addEventListener('input', (e) => {
    for (const container of document.querySelectorAll('.shinigamiEyes__Line__InnerContainer')) {
        container.style.filter = `brightness(${e.target.value}%)`;
    }
});

document.getElementById('opacitySlider').addEventListener('input', (e) => {
    for (const container of document.querySelectorAll('.shinigamiEyes__Line__InnerContainer')) {
        container.style.opacity = e.target.value / 100;
    }
});

document.getElementById('glowCheckbox').addEventListener('change', (e) => {
    if (e.target.checked) {
        enableGlow();
        return;
    }

    for (const container of document.querySelectorAll('.shinigamiEyes__Line__Digit')) {
        container.style.textShadow = e.target.checked ? '0 0 10px white' : 'none';
    }
});

document.getElementById('saturationSlider').addEventListener('input', (e) => {
    for (const container of document.querySelectorAll('.shinigamiEyes__Line__Container')) {
        container.style.filter = `saturate(${e.target.value}%)`;
    }
});

document.getElementById('transitionDurationSlider').addEventListener('input', (e) => {
    SETTINGS.TRANSITION_DURATION_MS = e.target.value;
});


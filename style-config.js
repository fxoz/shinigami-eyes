
document.getElementById('digitBlurCheckbox').addEventListener('change', () => {
    for (const digit of document.querySelectorAll('.shinigamiEyes__Line__Digit')) {
        digit.style.setProperty(
            '--digit-blur',
            document.getElementById('digitBlurCheckbox').checked ? '1px' : '0px',
        );
    }
});

document.getElementById('animateCheckbox').addEventListener('change', (e) => {
    setAnimation(e.target.checked);
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
    for (const digit of document.querySelectorAll('.shinigamiEyes__Line__Digit')) {
        digit.style.setProperty('--digit-hue', `${e.target.value}deg`);
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

    for (const digit of document.querySelectorAll('.shinigamiEyes__Line__Digit')) {
        digit.classList.add('shinigamiEyes__Line__Digit--noGlow');
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


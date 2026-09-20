const renderer = window.shinigamiRenderer;

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.navigator.userAgent.includes('Chrome')) {
        document.getElementById('chromeWarning').style.display = 'none';
    }
    await document.fonts.ready;
    renderer.widthCache.clear();
    renderer.textureCache.clear();
    renderer.addLine('夜神月');
    renderer.addLine('93312639');
    updateTextPreview();
});

function initRender(text) {
    renderer.addLine(text);
}

function addLine(text) {
    renderer.addLine(text);
    updateTextPreview();
}

function addLineTriggered() {
    const input = document.getElementById('lineInput');
    if (!input.value) return;
    addLine(input.value);
}

function getLinesText() {
    return renderer.getLines();
}

function updateTextPreview() {
    document.getElementById('textPreview').innerText = getLinesText().join(' / ');
}

function reapply() {
    renderer.reapply();
    updateTextPreview();
    document.getElementById('reapplyRecommended').style.display = 'none';
}

document.getElementById('instancesSlider').addEventListener('input', (event) => {
    SETTINGS.CLONES.AMOUNT = Number(event.target.value);
    document.getElementById('reapplyRecommended').style.display = 'block';
});

function toggleGui() {
    const button = document.getElementById('toggleGuiButton');
    button.innerText = button.innerText === 'Hide Settings' ? 'Show Settings' : 'Hide Settings';
    const gui = document.querySelector('aside');
    gui.style.display = gui.style.display === 'none' ? 'block' : 'none';
}

function makeTransparent() {
    document.body.style.backgroundColor = 'transparent';
    renderer.invalidate();
}

function clearAll() {
    renderer.clear();
    updateTextPreview();
}

document.getElementById('toggleGuiButton').addEventListener('click', toggleGui);

document.getElementById('digitBlurCheckbox').addEventListener('change', (event) => {
    renderer.setOption('digitBlur', event.target.checked);
});

document.getElementById('animateCheckbox').addEventListener('change', (event) => {
    setAnimation(event.target.checked);
});

document.getElementById('outlineLettersCheckbox').addEventListener('change', (event) => {
    renderer.setOption('outline', event.target.checked);
});

document.getElementById('containerHeightSlider').addEventListener('input', (event) => {
    renderer.setOption('containerHeight', Number(event.target.value));
});

document.getElementById('spacingSlider').addEventListener('input', (event) => {
    SETTINGS.MIN_PADDING = Number(event.target.value);
});

document.getElementById('opacityMinSlider').addEventListener('input', (event) => {
    SETTINGS.MIN_OPACITY = Number(event.target.value) / 100;
});

document.getElementById('sizeSlider').addEventListener('input', (event) => {
    renderer.setOption('size', Number(event.target.value) / 100);
});

document.getElementById('hueSlider').addEventListener('input', (event) => {
    renderer.setOption('hue', Number(event.target.value));
});

document.getElementById('brightnessSlider').addEventListener('input', (event) => {
    renderer.setOption('brightness', Number(event.target.value));
});

document.getElementById('opacitySlider').addEventListener('input', (event) => {
    renderer.setOption('opacity', Number(event.target.value) / 100);
});

document.getElementById('glowCheckbox').addEventListener('change', (event) => {
    renderer.setOption('glow', event.target.checked);
});

document.getElementById('saturationSlider').addEventListener('input', (event) => {
    renderer.setOption('saturation', Number(event.target.value));
});

document.getElementById('transitionDurationSlider').addEventListener('input', (event) => {
    const slider = event.target;
    SETTINGS.TRANSITION_DURATION_MS = Number(slider.max) + Number(slider.min)
        - Number(slider.value);
});

document.getElementById('intensitySlider').addEventListener('input', (event) => {
    renderer.setOption('intensity', Number(event.target.value) / 100);
});

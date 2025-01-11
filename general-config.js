document.addEventListener('DOMContentLoaded', () => {
    if (!window.navigator.userAgent.includes('Chrome')) {
        document.getElementById('chromeWarning').style.display = 'none'
    }

    initRender('夜神月');
    initRender('93312639');
    enableGlow();
    updateTextPreview();
});


function addLine(text) {
    initRender(text);
    if (document.getElementById('glowCheckbox').checked) {
        enableGlow();
    }
    updateTextPreview();
}

function addLineTriggered() {
    if (!document.getElementById('lineInput').value) {
        return;
    }
    addLine(document.getElementById('lineInput').value);
}

function getLinesText() {
    const linesText = [];
    for (lineElement of document.querySelectorAll('.shinigamiEyes__Line')) {
        if (!lineElement.classList.contains('shinigamiEyes__Line--reused')) {
            linesText.push(lineElement.innerText);
        }
    };

    return linesText;
}

function updateTextPreview() {
    document.getElementById('textPreview').innerText = getLinesText().join(' / ');
}

function reapply() {
    const savedLines = getLinesText();
    clearAll();
    for (line of savedLines) {
        addLine(line);
    };
    reapplyRecommended.style.display = 'none';
}

document.getElementById('instancesSlider').addEventListener('input', (e) => {
    SETTINGS.CLONES.AMOUNT = e.target.value;
    reapplyRecommended.style.display = 'block';
});

function toggleGui() {
    toggleGuiButton.innerText = toggleGuiButton.innerText === 'Hide Settings' ? 'Show Settings' : 'Hide Settings';
    const gui = document.querySelector('aside');
    gui.style.display = gui.style.display === 'none' ? 'block' : 'none';
}

function makeTransparent() {
    document.querySelector('body').style.backgroundColor = 'transparent';
}

function clearAll() {
    for (container of document.querySelectorAll('.shinigamiEyes__Line__Container'))
        container.remove();
    updateTextPreview();
};


toggleGuiButton.addEventListener('click', toggleGui);
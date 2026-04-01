const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

let questions = [];
let selectedId = null;
let listeningForKey = false;
let settings_code = 67;

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
});

async function init() {
    questions = await ipcRenderer.invoke('load-database');
    renderQuestions();
    const s = await ipcRenderer.invoke('load-settings');
    document.getElementById('inp-delay').value = s.delay;
    document.getElementById('key-display').textContent = s.keybind;
    document.getElementById('hdr-key').textContent = s.keybind;
    settings_code = s.keybindCode || 67;
}

function renderQuestions() {
    const list = document.getElementById('q-list');
    if (!questions.length) {
        list.innerHTML = '<p style="color:#444;text-align:center;padding:40px 0;">Brak pytań</p>';
        return;
    }
    list.innerHTML = questions.map((q, i) => `
        <div class="q-item ${selectedId === i ? 'selected' : ''}" data-id="${i}">
            <div class="q-content">
                <div class="q-num">${i + 1}.</div>
                <div class="q-text">${q.question}</div>
                <div class="q-answer">→ ${q.answer}</div>
            </div>
            <button class="q-del" onclick="delQ(${i});event.stopPropagation()">Usuń</button>
        </div>
    `).join('');

    document.querySelectorAll('.q-item').forEach(el => {
        el.addEventListener('click', () => {
            const id = parseInt(el.dataset.id);
            // Kliknięcie ponownie odznacza
            if (selectedId === id) {
                selectedId = null;
                ipcRenderer.invoke('select-answer', '');
                document.getElementById('selected-box').classList.remove('show');
                renderQuestions();
            } else {
                selectQ(id);
            }
        });
    });
}

function selectQ(id) {
    selectedId = id;
    const q = questions[id];
    ipcRenderer.invoke('select-answer', q.answer);
    document.getElementById('selected-val').textContent = `${q.question} → ${q.answer}`;
    document.getElementById('selected-box').classList.add('show');
    renderQuestions();
}

window.delQ = async function(id) {
    if (!confirm('Usunąć?')) return;
    questions.splice(id, 1);
    await ipcRenderer.invoke('save-database', questions);
    if (selectedId === id) {
        selectedId = null;
        document.getElementById('selected-box').classList.remove('show');
    }
    renderQuestions();
};

window.clearAll = async function() {
    if (!confirm('Usunąć WSZYSTKIE pytania?')) return;
    questions = [];
    await ipcRenderer.invoke('save-database', questions);
    selectedId = null;
    document.getElementById('selected-box').classList.remove('show');
    renderQuestions();
};

// Add
document.getElementById('btn-add').addEventListener('click', async () => {
    const q = document.getElementById('inp-q').value.trim();
    const a = document.getElementById('inp-a').value.trim();
    const status = document.getElementById('add-status');
    if (!q || !a) { showStatus(status, 'Wypełnij oba pola!', false); return; }
    questions.push({ question: q, answer: a });
    await ipcRenderer.invoke('save-database', questions);
    document.getElementById('inp-q').value = '';
    document.getElementById('inp-a').value = '';
    renderQuestions();
    showStatus(status, '✓ Dodano!', true);
});

// OCR - paste image
document.addEventListener('paste', async (e) => {
    // Only handle paste on OCR tab
    const ocrTab = document.getElementById('tab-ocr');
    if (!ocrTab.classList.contains('active')) return;

    const items = e.clipboardData.items;
    for (let item of items) {
        if (item.type.startsWith('image')) {
            e.preventDefault();
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const imgEl = document.getElementById('ocr-img');
                imgEl.src = ev.target.result;
                document.getElementById('ocr-preview').style.display = 'block';

                const statusEl = document.getElementById('ocr-status');
                statusEl.textContent = '⏳ Przetwarzanie obrazu...';
                statusEl.className = 'status ok';
                statusEl.style.display = 'block';

                // Preprocess: scale up 3x, invert dark bg, boost contrast
                const processedData = await preprocessImage(ev.target.result);

                statusEl.textContent = '⏳ Rozpoznawanie tekstu (pol+eng+deu)...';

                const result = await ipcRenderer.invoke('process-ocr', processedData);
                if (result.success) {
                    let text = result.text;
                    text = text.split('\n').filter(l => l.trim().length > 2).join('\n');
                    document.getElementById('ocr-text').value = text;
                    statusEl.style.display = 'none';
                } else {
                    showStatus(statusEl, '✗ Błąd OCR: ' + result.error, false);
                }
            };
            reader.readAsDataURL(blob);
            break;
        }
    }
});

document.getElementById('btn-ocr-save').addEventListener('click', async () => {
    const text = document.getElementById('ocr-text').value.trim();
    const lines = text.split('\n').filter(l => l.includes('>'));
    let added = 0;
    lines.forEach(line => {
        const idx = line.indexOf('>');
        const q = line.substring(0, idx).trim();
        const a = line.substring(idx + 1).trim();
        if (q && a) {
            questions.push({ question: q, answer: a });
            added++;
        }
    });
    await ipcRenderer.invoke('save-database', questions);
    renderQuestions();
    document.getElementById('ocr-text').value = '';
    document.getElementById('ocr-preview').style.display = 'none';
    showStatus(document.getElementById('ocr-status'), `✓ Dodano ${added} pytań!`, true);
});

// Keybind picker
const picker = document.getElementById('keybind-picker');
const keyDisplay = document.getElementById('key-display');
const keyHint = document.getElementById('key-hint');

picker.addEventListener('click', () => {
    listeningForKey = true;
    picker.classList.add('listening');
    keyHint.textContent = 'Naciśnij klawisz...';
    keyDisplay.textContent = '?';
});

document.addEventListener('keydown', async (e) => {
    if (!listeningForKey) return;
    e.preventDefault();
    e.stopPropagation();

    listeningForKey = false;
    picker.classList.remove('listening');

    const rawKey = e.key === ' ' ? 'Space' : e.key;
    const keyName = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
    settings_code = e.keyCode;

    keyDisplay.textContent = keyName;
    keyHint.textContent = 'Kliknij i naciśnij klawisz';
    document.getElementById('hdr-key').textContent = keyName;

    const delay = parseInt(document.getElementById('inp-delay').value) || 50;
    await ipcRenderer.invoke('save-settings', { delay, keybind: keyName, keybindCode: e.keyCode });
    showStatus(document.getElementById('settings-status'), '✓ Bind zapisany: ' + keyName, true);
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const delay = parseInt(document.getElementById('inp-delay').value) || 50;
    const keybind = keyDisplay.textContent;
    const result = await ipcRenderer.invoke('save-settings', { delay, keybind, keybindCode: settings_code });
    showStatus(document.getElementById('settings-status'), result.success ? '✓ Zapisano!' : '✗ Błąd', result.success);
});

// CFG
async function loadCfgList() {
    const { files } = await ipcRenderer.invoke('list-configs');
    const sel = document.getElementById('cfg-list');
    sel.innerHTML = '<option value="">-- wybierz plik --</option>';
    files.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        sel.appendChild(opt);
    });
}

document.getElementById('btn-load-cfg').addEventListener('click', async () => {
    const filename = document.getElementById('cfg-list').value;
    if (!filename) return;
    const result = await ipcRenderer.invoke('load-config', filename);
    if (result.success) {
        questions = result.items;
        await ipcRenderer.invoke('save-database', questions);
        renderQuestions();
        showStatus(document.getElementById('cfg-status'), `✓ Wczytano ${questions.length} pytań z ${filename}`, true);
    } else {
        showStatus(document.getElementById('cfg-status'), '✗ Błąd: ' + result.error, false);
    }
});

document.getElementById('btn-save-cfg').addEventListener('click', async () => {
    const name = document.getElementById('cfg-name').value.trim();
    if (!name) { showStatus(document.getElementById('cfg-status'), 'Podaj nazwę pliku!', false); return; }
    const result = await ipcRenderer.invoke('save-config', name, questions);
    if (result.success) {
        showStatus(document.getElementById('cfg-status'), `✓ Zapisano jako ${name}.cfg`, true);
        loadCfgList();
        document.getElementById('cfg-name').value = '';
    } else {
        showStatus(document.getElementById('cfg-status'), '✗ Błąd: ' + result.error, false);
    }
});

function showStatus(el, msg, ok) {
    el.textContent = msg;
    el.className = 'status ' + (ok ? 'ok' : 'err');
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
}

async function preprocessImage(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = 3;
            const canvas = document.createElement('canvas');
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const d = imageData.data;

            // Convert to grayscale + threshold = black text on white bg
            for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i+1], b = d[i+2];
                // Luminance
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                // If pixel is bright (text on dark bg) OR dark (text on light bg)
                // We want text to be black, background white
                // Detect if background is dark by checking if lum < 80
                const val = lum < 80 ? 255 : (lum > 180 ? 0 : 255 - lum);
                d[i] = d[i+1] = d[i+2] = val > 128 ? 255 : 0;
                d[i+3] = 255;
            }
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.src = dataUrl;
    });
}

init();
loadCfgList();

const { app, BrowserWindow, ipcMain, globalShortcut, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow;
let selectedAnswer = '';
let settings = { delay: 50, keybind: 'F9', keybindCode: 113 };
let isTyping = false;

function getDataPath(f) {
    return path.join(app.getPath('userData'), f);
}

function getCfgPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'cfg');
    }
    return path.join(__dirname, 'cfg');
}

function getTyperPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'typer', 'DefraKlawiatura31.exe');
    }
    return path.join(__dirname, 'typer', 'DefraKlawiatura31.exe');
}

function loadSettings() {
    try {
        const p = getDataPath('settings.json');
        if (fs.existsSync(p)) settings = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {}
}

function saveSettings() {
    fs.writeFileSync(getDataPath('settings.json'), JSON.stringify(settings, null, 2));
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 700, height: 800,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        autoHideMenuBar: true,
        backgroundColor: '#0a0a0a'
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    loadSettings();
    createWindow();
    registerHotkey();
});

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    app.quit();
});

function registerHotkey() {
    globalShortcut.unregisterAll();
    try {
        let key = settings.keybind;
        if (key.length === 1) key = key.toUpperCase();
        
        const success = globalShortcut.register(key, () => {
            if (selectedAnswer && !isTyping) {
                typeText(selectedAnswer);
            }
        });
        console.log('Hotkey registered:', key, success);
    } catch (e) {
        console.error('Hotkey register error:', e);
    }
}

async function typeText(text) {
    if (isTyping) return;
    isTyping = true;

    const typerPath = getTyperPath();

    if (!fs.existsSync(typerPath)) {
        console.error('DefraKlawiatura31.exe not found! Run typer/build.bat first.');
        isTyping = false;
        return;
    }

    const escaped = text.replace(/"/g, '\\"');
    exec(`"${typerPath}" "${escaped}" ${settings.delay}`, (err) => {
        if (err) console.error('Typer error:', err);
        isTyping = false;
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

ipcMain.handle('load-database', () => {
    try {
        const p = getDataPath('database.json');
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : [];
    } catch (e) { return []; }
});

ipcMain.handle('save-database', (_, items) => {
    try {
        fs.writeFileSync(getDataPath('database.json'), JSON.stringify(items, null, 2));
        return { success: true };
    } catch (e) { return { success: false }; }
});

ipcMain.handle('select-answer', (_, answer) => {
    selectedAnswer = answer;
    return { success: true };
});

ipcMain.handle('load-settings', () => settings);

ipcMain.handle('save-settings', (_, s) => {
    try {
        settings = s;
        saveSettings();
        registerHotkey();
        return { success: true };
    } catch (e) { return { success: false }; }
});

ipcMain.handle('set-keybind-code', (_, code) => {
    settings.keybindCode = code;
    saveSettings();
    return { success: true };
});

ipcMain.handle('cleanup-traineddata', () => {
    const exts = ['pol.traineddata', 'eng.traineddata', 'deu.traineddata'];
    exts.forEach(f => {
        const p = path.join(__dirname, f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    return { success: true };
});

ipcMain.handle('process-ocr', async (_, imageData) => {
    try {
        const Tesseract = require('tesseract.js');
        const { createCanvas, loadImage } = require('canvas');
        
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Preprocess image - scale up, increase contrast
        const img = await loadImage(buffer);
        const scale = 3;
        const canvas = createCanvas(img.width * scale, img.height * scale);
        const ctx = canvas.getContext('2d');
        
        // White background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Scale up
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Increase contrast
        const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageDataObj.data;
        for (let i = 0; i < data.length; i += 4) {
            // Invert if dark background
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            if (avg < 128) {
                data[i] = 255 - data[i];
                data[i+1] = 255 - data[i+1];
                data[i+2] = 255 - data[i+2];
            }
            // Increase contrast
            for (let c = 0; c < 3; c++) {
                let val = data[i+c];
                val = ((val - 128) * 2) + 128;
                data[i+c] = Math.max(0, Math.min(255, val));
            }
        }
        ctx.putImageData(imageDataObj, 0, 0);
        
        const processedBuffer = canvas.toBuffer('image/png');
        
        const { data: { text } } = await Tesseract.recognize(processedBuffer, 'pol+eng+deu', {
            tessedit_pageseg_mode: '6',
        });
        return { success: true, text: text.trim() };
    } catch (e) {
        // Fallback without preprocessing
        try {
            const Tesseract = require('tesseract.js');
            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const { data: { text } } = await Tesseract.recognize(buffer, 'pol+eng+deu');
            return { success: true, text: text.trim() };
        } catch (e2) {
            return { success: false, error: e2.message };
        }
    }
});

ipcMain.handle('list-configs', () => {
    try {
        const cfgDir = getCfgPath();
        if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });
        const files = fs.readdirSync(cfgDir).filter(f => f.endsWith('.cfg'));
        return { success: true, files };
    } catch (e) {
        return { success: false, files: [] };
    }
});

ipcMain.handle('load-config', (_, filename) => {
    try {
        const cfgPath = path.join(getCfgPath(), filename);
        const content = fs.readFileSync(cfgPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        const items = lines.map(line => {
            const idx = line.indexOf('>');
            if (idx === -1) return null;
            return {
                question: line.substring(0, idx).trim(),
                answer: line.substring(idx + 1).trim()
            };
        }).filter(Boolean);
        return { success: true, items };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('save-config', (_, filename, items) => {
    try {
        const cfgDir = getCfgPath();
        if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });
        const name = filename.endsWith('.cfg') ? filename : filename + '.cfg';
        const content = '# DefraAntyInstaling Config\n' +
            items.map(i => `${i.question} > ${i.answer}`).join('\n');
        fs.writeFileSync(path.join(cfgDir, name), content, 'utf-8');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

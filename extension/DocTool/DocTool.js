/**
 * DocTool.js
 * Manages the UI interactions for the documentation editor panel.
 */

let docState = {
    isPanelOpen: false,
    isPanelExpanded: false,
    pdfUrl: null,
    storageKey: null,
    imagesKey: null,
    images: [],
    imageFolder: 'pdf',
    pdfTitle: '',
    titleSlug: 'pdf',
};

const docDom = {};

function cacheDocDomElements() {
    docDom.docActivateBtn = document.getElementById('doc-activate-btn');
    docDom.docBorder = document.getElementById('doc-tool-border');
    docDom.docPanel = document.getElementById('doc-panel');
    docDom.docHeader = document.querySelector('.doc-header');
    docDom.docCloseBtn = document.getElementById('doc-close-btn');
    docDom.docResizeBtn = document.getElementById('doc-resize-btn');
    docDom.docPopoutBtn = document.getElementById('doc-popout-btn');
    docDom.docCaptureBtn = document.getElementById('doc-capture-btn');
    docDom.docDownloadImagesBtn = document.getElementById('doc-download-images-btn');
    docDom.docTabs = Array.from(document.querySelectorAll('#doc-tabs .doc-tab'));
    docDom.docEditor = document.getElementById('doc-editor');
    docDom.docEditorPane = document.getElementById('doc-editor-pane');
    docDom.docPreviewPane = document.getElementById('doc-preview-pane');
    docDom.docPreview = document.getElementById('doc-preview');
}

function docGetStorage(key) {
    return new Promise((resolve) => chrome.storage.local.get([key], (result) => resolve(result[key])));
}

function docSetStorage(data) {
    return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

async function docApplyTheme() {
    const data = await docGetStorage('theme');
    const theme = data || 'light';
    if (docDom.docPanel) {
        docDom.docPanel.dataset.theme = theme;
    }
}

async function docGetPdfUrlWithRetry(retries = 10, delay = 500) {
    for (let i = 0; i < retries; i++) {
        if (window.pdfUrl) {
            docState.pdfUrl = window.pdfUrl;
            return window.pdfUrl;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    return '';
}

function getDefaultTemplate(pdfUrl, pdfTitle) {
    return `---\ntitle: ${pdfTitle || ''}\ndescription: \ncategories: []\nlink: ${pdfUrl || ''}\n---\n\n`;
}

function getPdfSlug(pdfUrl) {
    if (!pdfUrl) return 'pdf';
    try {
        const url = new URL(pdfUrl);
        const base = url.pathname.split('/').pop() || 'pdf';
        const name = base.replace(/\.[^/.]+$/, '');
        return normalizeSlug(name);
    } catch (error) {
        const name = pdfUrl.split('/').pop() || 'pdf';
        return normalizeSlug(name.replace(/\.[^/.]+$/, ''));
    }
}

function normalizeSlug(value) {
    return (value || 'pdf').toString().trim().replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '') || 'pdf';
}

function stripUrlScheme(value) {
    if (!value) return '';
    return value.replace(/^https?:\/\//i, '');
}

async function getPdfTitleFromMetadata(pdfUrl) {
    if (!pdfUrl || !window.pdfjsLib) {
        return '';
    }

    try {
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
        }
    } catch (error) {
        // Ignore worker setup errors.
    }

    try {
        const loadingTask = window.pdfjsLib.getDocument({ url: pdfUrl });
        const pdf = await loadingTask.promise;
        const { info, metadata, contentDispositionFilename } = await pdf.getMetadata();
        const titleFromInfo = info && info.Title ? info.Title : '';
        const titleFromMeta = metadata && typeof metadata.get === 'function' ? metadata.get('dc:title') : '';
        const title = titleFromInfo || titleFromMeta || contentDispositionFilename || '';
        if (typeof pdf.destroy === 'function') {
            pdf.destroy();
        }
        return title || '';
    } catch (error) {
        return '';
    }
}

function buildImagePath(fileName) {
    return `assets/img/${docState.imageFolder}/${fileName}`;
}

function updateDocPreview() {
    let markdown = docDom.docEditor.value;
    markdown = markdown.replace(/\{%\s*include\s+figure\.liquid\s+path='([^']+)'\s+class="([^"]+)"\s*%\}/g, (match, path, className) => {
        const image = docState.images.find((entry) => entry.path === path);
        if (!image) return match;
        return `<img src="${image.dataUrl}" class="${className}" />`;
    });

    if (typeof marked === 'object') {
        docDom.docPreview.innerHTML = marked.parse(markdown);
    } else {
        docDom.docPreview.textContent = markdown;
    }

    if (typeof renderMathInElement === 'function') {
        renderMathInElement(docDom.docPreview, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ]
        });
    }
}

function setActiveDocTab(tabName) {
    docDom.docTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    const showPreview = tabName === 'preview';
    docDom.docEditorPane.classList.toggle('hidden', showPreview);
    docDom.docPreviewPane.classList.toggle('hidden', !showPreview);

    if (showPreview) {
        updateDocPreview();
    }
}

let saveTimer = null;
function scheduleDocSaveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        if (docState.storageKey) {
            docSetStorage({ [docState.storageKey]: docDom.docEditor.value });
        }
    }, 300);
}

function toggleDocPanel() {
    docState.isPanelOpen = !docState.isPanelOpen;
    docDom.docPanel.classList.toggle('hidden', !docState.isPanelOpen);
    if (!docState.isPanelOpen) {
        setActiveDocTab('markdown');
    }
}

function insertTextAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + text + after;
    const newPos = start + text.length;
    textarea.selectionStart = newPos;
    textarea.selectionEnd = newPos;
    textarea.focus();
}

function toggleDocSize() {
    docState.isPanelExpanded = !docState.isPanelExpanded;
    docDom.docPanel.classList.toggle('expanded', docState.isPanelExpanded);
    docDom.docResizeBtn.querySelector('.material-symbols-outlined').textContent = docState.isPanelExpanded ? 'close_fullscreen' : 'open_in_full';

    docDom.docPopoutBtn.classList.toggle('hidden', !docState.isPanelExpanded);

    docDom.docPanel.style.top = '';
    docDom.docPanel.style.left = '';
    docDom.docPanel.style.right = '';
    docDom.docPanel.style.width = '';
    docDom.docPanel.style.height = '';
    docDom.docPanel.style.transform = '';
}

function handleDocEditorInput() {
    scheduleDocSaveDraft();
    if (!docDom.docPreviewPane.classList.contains('hidden')) {
        updateDocPreview();
    }
}

function openDocPopout() {
    if (docState.storageKey) {
        docSetStorage({ [docState.storageKey]: docDom.docEditor.value });
    }

    const rect = docDom.docPanel.getBoundingClientRect();
    const url = chrome.runtime.getURL(`DocTool/popout.html?pdf=${encodeURIComponent(docState.pdfUrl || '')}`);

    chrome.runtime.sendMessage({
        action: 'createPopout',
        options: {
            url: url,
            type: 'popup',
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            left: Math.round(window.screenX + rect.left),
            top: Math.round(window.screenY + rect.top)
        }
    }, (response) => {
        if (response && response.status === 'ok') {
            toggleDocPanel();
        }
    });
}

// --- Window Functionality (Draggable, Resizable) ---
function docMakeDraggable(panel, header) {
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) {
            return;
        }

        e.preventDefault();
        isDragging = true;

        const rect = panel.getBoundingClientRect();

        if (getComputedStyle(panel).right !== 'auto' && getComputedStyle(panel).left === 'auto') {
            panel.style.left = `${rect.left}px`;
            panel.style.right = 'auto';
        }

        if (panel.classList.contains('expanded')) {
            panel.classList.remove('expanded');
            panel.style.transform = 'none';
            panel.style.left = `${rect.left}px`;
            panel.style.top = `${rect.top}px`;
            panel.style.width = `${rect.width}px`;
            panel.style.height = `${rect.height}px`;
        }

        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp, { once: true });
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        window.requestAnimationFrame(() => {
            panel.style.top = `${e.clientY - offsetY}px`;
            panel.style.left = `${e.clientX - offsetX}px`;
        });
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
    }
}

function docMakeResizable(panel) {
    const resizers = panel.querySelectorAll('.resizer');

    resizers.forEach(resizer => {
        resizer.addEventListener('mousedown', initResize);
    });

    function initResize(e) {
        e.preventDefault();

        const currentResizer = e.currentTarget;
        const rect = panel.getBoundingClientRect();
        const original_mouse_x = e.clientX;
        const original_mouse_y = e.clientY;

        if (panel.classList.contains('expanded')) {
            panel.classList.remove('expanded');
            panel.style.transform = 'none';
            panel.style.left = `${rect.left}px`;
            panel.style.top = `${rect.top}px`;
            panel.style.width = `${rect.width}px`;
            panel.style.height = `${rect.height}px`;
        }

        const resize = (e) => {
            const minWidth = parseInt(getComputedStyle(panel).minWidth);
            const minHeight = parseInt(getComputedStyle(panel).minHeight);

            if (currentResizer.classList.contains('resizer-se')) {
                const width = rect.width + (e.clientX - original_mouse_x);
                const height = rect.height + (e.clientY - original_mouse_y);
                if (width > minWidth) panel.style.width = width + 'px';
                if (height > minHeight) panel.style.height = height + 'px';
            } else if (currentResizer.classList.contains('resizer-sw')) {
                const width = rect.width - (e.clientX - original_mouse_x);
                const height = rect.height + (e.clientY - original_mouse_y);
                if (width > minWidth) {
                    panel.style.width = width + 'px';
                    panel.style.left = rect.left + (e.clientX - original_mouse_x) + 'px';
                }
                if (height > minHeight) {
                    panel.style.height = height + 'px';
                }
            } else if (currentResizer.classList.contains('resizer-ne')) {
                const width = rect.width + (e.clientX - original_mouse_x);
                const height = rect.height - (e.clientY - original_mouse_y);
                if (width > minWidth) {
                    panel.style.width = width + 'px';
                }
                if (height > minHeight) {
                    panel.style.height = height + 'px';
                    panel.style.top = rect.top + (e.clientY - original_mouse_y) + 'px';
                }
            } else if (currentResizer.classList.contains('resizer-nw')) {
                const width = rect.width - (e.clientX - original_mouse_x);
                const height = rect.height - (e.clientY - original_mouse_y);
                if (width > minWidth) {
                    panel.style.width = width + 'px';
                    panel.style.left = rect.left + (e.clientX - original_mouse_x) + 'px';
                }
                if (height > minHeight) {
                    panel.style.height = height + 'px';
                    panel.style.top = rect.top + (e.clientY - original_mouse_y) + 'px';
                }
            } else if (currentResizer.classList.contains('resizer-e')) {
                const width = rect.width + (e.clientX - original_mouse_x);
                if (width > minWidth) panel.style.width = width + 'px';
            } else if (currentResizer.classList.contains('resizer-w')) {
                const width = rect.width - (e.clientX - original_mouse_x);
                if (width > minWidth) {
                    panel.style.width = width + 'px';
                    panel.style.left = rect.left + (e.clientX - original_mouse_x) + 'px';
                }
            } else if (currentResizer.classList.contains('resizer-s')) {
                const height = rect.height + (e.clientY - original_mouse_y);
                if (height > minHeight) panel.style.height = height + 'px';
            } else if (currentResizer.classList.contains('resizer-n')) {
                const height = rect.height - (e.clientY - original_mouse_y);
                if (height > minHeight) {
                    panel.style.height = height + 'px';
                    panel.style.top = rect.top + (e.clientY - original_mouse_y) + 'px';
                }
            }
        };

        const stopResize = () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResize);
        };

        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResize, { once: true });
    }
}

function getNextImageName() {
    const index = docState.images.length + 1;
    return `image${index}.png`;
}

function addCapturedImage(dataUrl) {
    const fileName = getNextImageName();
    const path = buildImagePath(fileName);
    const entry = {
        id: `img-${Date.now()}`,
        name: fileName,
        path,
        dataUrl,
    };

    docState.images.push(entry);
    if (docState.imagesKey) {
        docSetStorage({ [docState.imagesKey]: docState.images });
    }

    const snippet = [
        '<div class="row">',
        '        <div class="col-sm mt-3 mt-md-0">',
        `            {% include figure.liquid path='${path}' class="img-fluid rounded z-depth-1" %}`,
        '        </div>',
        '    </div>',
        '',
        ''
    ].join('\n');

    insertTextAtCursor(docDom.docEditor, snippet);
    scheduleDocSaveDraft();
    updateDocPreview();
}

function dataUrlToUint8(dataUrl) {
    const base64 = dataUrl.split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function crc32(bytes) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < bytes.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

function numberToBytesLE(value, bytes) {
    const out = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) {
        out[i] = value & 0xFF;
        value = value >>> 8;
    }
    return out;
}

function createZipBlob(files) {
    const encoder = new TextEncoder();
    const parts = [];
    const centralDirectory = [];
    let offset = 0;

    files.forEach((file) => {
        const nameBytes = encoder.encode(file.name);
        const data = file.data;
        const crc = crc32(data);

        const localHeader = new Uint8Array([
            0x50, 0x4b, 0x03, 0x04,
            0x14, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            ...numberToBytesLE(crc, 4),
            ...numberToBytesLE(data.length, 4),
            ...numberToBytesLE(data.length, 4),
            ...numberToBytesLE(nameBytes.length, 2),
            0x00, 0x00
        ]);

        parts.push(localHeader, nameBytes, data);

        const centralHeader = new Uint8Array([
            0x50, 0x4b, 0x01, 0x02,
            0x14, 0x00,
            0x14, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            ...numberToBytesLE(crc, 4),
            ...numberToBytesLE(data.length, 4),
            ...numberToBytesLE(data.length, 4),
            ...numberToBytesLE(nameBytes.length, 2),
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            ...numberToBytesLE(offset, 4)
        ]);

        centralDirectory.push(centralHeader, nameBytes);

        offset += localHeader.length + nameBytes.length + data.length;
    });

    const centralSize = centralDirectory.reduce((sum, part) => sum + part.length, 0);
    const centralOffset = offset;

    parts.push(...centralDirectory);

    const endRecord = new Uint8Array([
        0x50, 0x4b, 0x05, 0x06,
        0x00, 0x00,
        0x00, 0x00,
        ...numberToBytesLE(files.length, 2),
        ...numberToBytesLE(files.length, 2),
        ...numberToBytesLE(centralSize, 4),
        ...numberToBytesLE(centralOffset, 4),
        0x00, 0x00
    ]);

    parts.push(endRecord);

    return new Blob(parts, { type: 'application/zip' });
}

function downloadImagesZip() {
    if (!docState.images.length) {
        return;
    }

    const files = docState.images.map((image) => ({
        name: image.name,
        data: dataUrlToUint8(image.dataUrl),
    }));

    const zipBlob = createZipBlob(files);
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${docState.titleSlug || docState.imageFolder}-images.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

let captureState = null;

function cleanupCapture() {
    if (captureState && captureState.overlay) {
        captureState.overlay.remove();
    }
    document.body.style.cursor = '';
    docDom.docCaptureBtn.classList.remove('active');
    captureState = null;
}

function getPageAtPoint(x, y) {
    const elements = document.elementsFromPoint(x, y);
    for (const element of elements) {
        if (element.classList && element.classList.contains('gsr-page')) {
            return element;
        }
        if (element.tagName === 'CANVAS') {
            const page = element.closest('.gsr-page');
            if (page) return page;
        }
    }
    return null;
}

function startCaptureMode() {
    if (captureState) {
        cleanupCapture();
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'doc-capture-overlay';
    const rect = document.createElement('div');
    rect.className = 'doc-capture-rect';
    overlay.appendChild(rect);
    document.body.appendChild(overlay);

    captureState = {
        overlay,
        rect,
        startX: 0,
        startY: 0,
        isDragging: false,
    };

    docDom.docCaptureBtn.classList.add('active');

    overlay.addEventListener('mousedown', (event) => {
        captureState.isDragging = true;
        captureState.startX = event.clientX;
        captureState.startY = event.clientY;
        rect.style.left = `${captureState.startX}px`;
        rect.style.top = `${captureState.startY}px`;
        rect.style.width = '0px';
        rect.style.height = '0px';
    });

    overlay.addEventListener('mousemove', (event) => {
        if (!captureState.isDragging) return;
        const x = Math.min(event.clientX, captureState.startX);
        const y = Math.min(event.clientY, captureState.startY);
        const w = Math.abs(event.clientX - captureState.startX);
        const h = Math.abs(event.clientY - captureState.startY);
        rect.style.left = `${x}px`;
        rect.style.top = `${y}px`;
        rect.style.width = `${w}px`;
        rect.style.height = `${h}px`;
    });

    overlay.addEventListener('mouseup', (event) => {
        if (!captureState.isDragging) {
            cleanupCapture();
            return;
        }

        captureState.isDragging = false;

        const endX = event.clientX;
        const endY = event.clientY;
        const startX = captureState.startX;
        const startY = captureState.startY;

        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const right = Math.max(startX, endX);
        const bottom = Math.max(startY, endY);

        if (Math.abs(right - left) < 10 || Math.abs(bottom - top) < 10) {
            cleanupCapture();
            return;
        }

        const page = getPageAtPoint(startX, startY) || getPageAtPoint(endX, endY);
        if (!page) {
            cleanupCapture();
            return;
        }

        const canvas = page.querySelector('canvas');
        if (!canvas) {
            cleanupCapture();
            return;
        }

        const canvasRect = canvas.getBoundingClientRect();
        const clipLeft = Math.max(left, canvasRect.left);
        const clipTop = Math.max(top, canvasRect.top);
        const clipRight = Math.min(right, canvasRect.right);
        const clipBottom = Math.min(bottom, canvasRect.bottom);

        if (clipRight <= clipLeft || clipBottom <= clipTop) {
            cleanupCapture();
            return;
        }

        const scaleX = canvas.width / canvasRect.width;
        const scaleY = canvas.height / canvasRect.height;
        const sx = Math.round((clipLeft - canvasRect.left) * scaleX);
        const sy = Math.round((clipTop - canvasRect.top) * scaleY);
        const sw = Math.round((clipRight - clipLeft) * scaleX);
        const sh = Math.round((clipBottom - clipTop) * scaleY);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sw;
        tempCanvas.height = sh;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

        const dataUrl = tempCanvas.toDataURL('image/png');
        addCapturedImage(dataUrl);
        cleanupCapture();
    });
}

// --- Initialization ---
async function initializeDocTool() {
    cacheDocDomElements();

    docMakeDraggable(docDom.docPanel, docDom.docHeader);
    docMakeResizable(docDom.docPanel);

    await docApplyTheme();

    docState.pdfUrl = await docGetPdfUrlWithRetry();
    docState.storageKey = `docDraft_${docState.pdfUrl || 'unknown'}`;
    docState.imagesKey = `docImages_${docState.pdfUrl || 'unknown'}`;

    const savedDraft = await docGetStorage(docState.storageKey);
    const savedImages = await docGetStorage(docState.imagesKey);
    if (Array.isArray(savedImages)) {
        docState.images = savedImages;
    }

    docState.pdfTitle = (await getPdfTitleFromMetadata(docState.pdfUrl)) || '';
    if (!docState.pdfTitle) {
        docState.pdfTitle = stripUrlScheme(docState.pdfUrl);
    }
    docState.titleSlug = normalizeSlug(docState.pdfTitle) || getPdfSlug(docState.pdfUrl);
    if (docState.pdfTitle) {
        docSetStorage({
            [`docMeta_${docState.pdfUrl || 'unknown'}`]: {
                title: docState.pdfTitle,
                slug: docState.titleSlug,
            }
        });
    }

    if (docState.images.length) {
        const firstPath = docState.images[0].path || '';
        const folderMatch = firstPath.match(/^assets\/img\/([^/]+)\//);
        docState.imageFolder = folderMatch ? folderMatch[1] : docState.titleSlug;
    } else {
        docState.imageFolder = docState.titleSlug;
    }

    if (!savedDraft) {
        docDom.docEditor.value = getDefaultTemplate(docState.pdfUrl, docState.pdfTitle);
    } else {
        docDom.docEditor.value = savedDraft;
    }

    updateDocPreview();

    docDom.docActivateBtn.classList.remove('hidden');
    docDom.docBorder.classList.remove('hidden');

    docDom.docActivateBtn.addEventListener('click', toggleDocPanel);
    docDom.docCloseBtn.addEventListener('click', toggleDocPanel);
    docDom.docResizeBtn.addEventListener('click', toggleDocSize);
    docDom.docPopoutBtn.addEventListener('click', openDocPopout);
    docDom.docCaptureBtn.addEventListener('click', startCaptureMode);
    docDom.docDownloadImagesBtn.addEventListener('click', downloadImagesZip);

    docDom.docTabs.forEach(tab => {
        tab.addEventListener('click', () => setActiveDocTab(tab.dataset.tab));
    });

    docDom.docEditor.addEventListener('input', handleDocEditorInput);
}

document.addEventListener('DOMContentLoaded', initializeDocTool);

/**
 * popout.js
 * Initializes and manages the pop-out documentation editor.
 */

const dom = {};
let storageKey = null;
let imagesKey = null;
let docImages = [];
let docMetaKey = null;
let docMeta = {};

function cacheDomElements() {
    dom.docCloseBtn = document.getElementById('doc-close-btn');
    dom.docTabs = Array.from(document.querySelectorAll('#doc-tabs .doc-tab'));
    dom.docEditor = document.getElementById('doc-editor');
    dom.docEditorPane = document.getElementById('doc-editor-pane');
    dom.docPreviewPane = document.getElementById('doc-preview-pane');
    dom.docPreview = document.getElementById('doc-preview');
    dom.docPanel = document.getElementById('doc-panel');
}

function getStorage(key) {
    return new Promise((resolve) => chrome.storage.local.get([key], (result) => resolve(result[key])));
}

function setStorage(data) {
    return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

async function applyTheme() {
    const data = await getStorage('theme');
    const theme = data || 'light';
    if (dom.docPanel) {
        dom.docPanel.dataset.theme = theme;
    }
}

function updatePreview() {
    let markdown = dom.docEditor.value;
    markdown = markdown.replace(/\{%\s*include\s+figure\.liquid\s+path='([^']+)'\s+class="([^"]+)"\s*%\}/g, (match, path, className) => {
        const image = docImages.find((entry) => entry.path === path);
        if (!image) return match;
        return `<img src="${image.dataUrl}" class="${className}" />`;
    });
    if (typeof marked === 'object') {
        dom.docPreview.innerHTML = marked.parse(markdown);
    } else {
        dom.docPreview.textContent = markdown;
    }

    if (typeof renderMathInElement === 'function') {
        renderMathInElement(dom.docPreview, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ]
        });
    }
}

function setActiveTab(tabName) {
    dom.docTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    const showPreview = tabName === 'preview';
    dom.docEditorPane.classList.toggle('hidden', showPreview);
    dom.docPreviewPane.classList.toggle('hidden', !showPreview);

    if (showPreview) {
        updatePreview();
    }
}

let saveTimer = null;
function scheduleSaveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        if (storageKey) {
            setStorage({ [storageKey]: dom.docEditor.value });
        }
    }, 300);
}

async function initializePopoutDoc() {
    cacheDomElements();
    await applyTheme();

    const urlParams = new URLSearchParams(window.location.search);
    const pdfUrl = decodeURIComponent(urlParams.get('pdf') || '');
    storageKey = `docDraft_${pdfUrl || 'unknown'}`;
    imagesKey = `docImages_${pdfUrl || 'unknown'}`;
    docMetaKey = `docMeta_${pdfUrl || 'unknown'}`;

    const savedDraft = await getStorage(storageKey);
    const savedImages = await getStorage(imagesKey);
    if (Array.isArray(savedImages)) {
        docImages = savedImages;
    }
    const savedMeta = await getStorage(docMetaKey);
    if (savedMeta && typeof savedMeta === 'object') {
        docMeta = savedMeta;
    }

    if (savedDraft) {
        dom.docEditor.value = savedDraft;
    } else {
        const title = docMeta.title || '';
        dom.docEditor.value = `---\ntitle: ${title}\ndescription: \ncategories: []\nlink: ${pdfUrl}\n---\n\n`;
    }

    updatePreview();

    dom.docTabs.forEach(tab => {
        tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    });

    dom.docEditor.addEventListener('input', () => {
        scheduleSaveDraft();
        if (!dom.docPreviewPane.classList.contains('hidden')) {
            updatePreview();
        }
    });

    dom.docCloseBtn.addEventListener('click', () => window.close());
}

document.addEventListener('DOMContentLoaded', initializePopoutDoc);

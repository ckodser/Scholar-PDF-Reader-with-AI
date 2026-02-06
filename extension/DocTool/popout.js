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
let isSaved = true;

function cacheDomElements() {
    dom.docCloseBtn = document.getElementById('doc-close-btn');
    dom.docTabs = Array.from(document.querySelectorAll('#doc-tabs .doc-tab'));
    dom.docEditor = document.getElementById('doc-editor');
    dom.docEditorPane = document.getElementById('doc-editor-pane');
    dom.docPreviewPane = document.getElementById('doc-preview-pane');
    dom.docPreview = document.getElementById('doc-preview');
    dom.docPanel = document.getElementById('doc-panel');
    dom.docSaveIndicator = document.getElementById('doc-save-indicator');
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

function setSaveState(saved) {
    isSaved = saved;
    if (!dom.docSaveIndicator) return;
    dom.docSaveIndicator.classList.toggle('is-saved', saved);
    dom.docSaveIndicator.classList.toggle('is-dirty', !saved);
    dom.docSaveIndicator.title = saved ? 'All changes saved' : 'Unsaved changes — click to save';
}

async function saveDraft() {
    if (!storageKey) return;
    await setStorage({ [storageKey]: dom.docEditor.value });
    setSaveState(true);
}

function setActiveTab(tabName) {
    dom.docTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    const showPreview = tabName === 'preview' || tabName === 'split';
    const showEditor = tabName === 'markdown' || tabName === 'split';
    dom.docPanel.classList.toggle('split-view', tabName === 'split');
    dom.docEditorPane.classList.toggle('hidden', !showEditor);
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
            setStorage({ [storageKey]: dom.docEditor.value }).then(() => {
                setSaveState(true);
            });
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
    setSaveState(!!savedDraft);

    updatePreview();

    dom.docTabs.forEach(tab => {
        tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    });

    dom.docEditor.addEventListener('input', () => {
        setSaveState(false);
        scheduleSaveDraft();
        if (!dom.docPreviewPane.classList.contains('hidden')) {
            updatePreview();
        }
    });

    if (dom.docSaveIndicator) {
        dom.docSaveIndicator.addEventListener('click', saveDraft);
    }
    dom.docCloseBtn.addEventListener('click', () => window.close());
}

document.addEventListener('DOMContentLoaded', initializePopoutDoc);

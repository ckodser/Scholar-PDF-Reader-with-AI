/**
 * DocTool.js
 * Manages the UI interactions for the documentation editor panel.
 */

let docState = {
    isPanelOpen: false,
    isPanelExpanded: false,
    pdfUrl: null,
    storageKey: null,
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

function getDefaultTemplate(pdfUrl) {
    return `---\ntitle: \ndescription: \ncategories: []\nlink: ${pdfUrl || ''}\n---\n\n`;
}

function updateDocPreview() {
    const markdown = docDom.docEditor.value;
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

// --- Initialization ---
async function initializeDocTool() {
    cacheDocDomElements();

    docMakeDraggable(docDom.docPanel, docDom.docHeader);
    docMakeResizable(docDom.docPanel);

    await docApplyTheme();

    docState.pdfUrl = await docGetPdfUrlWithRetry();
    docState.storageKey = `docDraft_${docState.pdfUrl || 'unknown'}`;
    const savedDraft = await docGetStorage(docState.storageKey);
    docDom.docEditor.value = savedDraft || getDefaultTemplate(docState.pdfUrl);

    updateDocPreview();

    docDom.docActivateBtn.classList.remove('hidden');
    docDom.docBorder.classList.remove('hidden');

    docDom.docActivateBtn.addEventListener('click', toggleDocPanel);
    docDom.docCloseBtn.addEventListener('click', toggleDocPanel);
    docDom.docResizeBtn.addEventListener('click', toggleDocSize);
    docDom.docPopoutBtn.addEventListener('click', openDocPopout);

    docDom.docTabs.forEach(tab => {
        tab.addEventListener('click', () => setActiveDocTab(tab.dataset.tab));
    });

    docDom.docEditor.addEventListener('input', handleDocEditorInput);
}

document.addEventListener('DOMContentLoaded', initializeDocTool);

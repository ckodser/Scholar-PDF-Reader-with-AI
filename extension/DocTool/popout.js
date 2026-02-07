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
let pdfUrl = '';

function cacheDomElements() {
    dom.docCloseBtn = document.getElementById('doc-close-btn');
    dom.docAutoSummaryBtn = document.getElementById('doc-auto-summary-btn');
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

function parseFrontMatter(markdown) {
    if (!markdown.startsWith('---')) {
        return { body: markdown, meta: {} };
    }

    const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!match) {
        return { body: markdown, meta: {} };
    }

    const meta = {};
    const lines = match[1].split('\n');
    lines.forEach((line) => {
        if (!line.trim()) return;
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) return;
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        if (key) {
            meta[key] = value;
        }
    });

    return {
        body: markdown.slice(match[0].length),
        meta,
    };
}

function buildFrontMatterTemplate(meta, defaults) {
    const orderedKeys = [
        'layout',
        'title',
        'description',
        'categories',
        'img',
        'importance',
        'giscus_comments',
        'link'
    ];
    const lines = [];
    const usedKeys = new Set();
    orderedKeys.forEach((key) => {
        let value = meta && meta[key] !== undefined ? meta[key] : defaults[key];
        if (key === 'description' || key === 'img') {
            value = '';
        }
        if (value === undefined || value === null) {
            value = '';
        }
        lines.push(`${key}: ${value}`);
        usedKeys.add(key);
    });

    Object.keys(meta || {}).forEach((key) => {
        if (usedKeys.has(key)) return;
        const value = meta[key];
        if (value === undefined || value === null) return;
        lines.push(`${key}: ${value}`);
    });

    return `---\n${lines.join('\n')}\n---\n`;
}

async function getDocGeminiConfig() {
    const apiKey = await getStorage('geminiApiKey');
    const savedModel = await getStorage('selectedGeminiModel');
    return {
        apiKey,
        model: savedModel || 'gemini-2.5-flash',
    };
}

async function fetchPdfAsBase64(url) {
    if (!url) {
        throw new Error('Missing PDF URL.');
    }
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
}

function getImageFolder() {
    if (docImages.length) {
        const firstPath = docImages[0].path || '';
        const folderMatch = firstPath.match(/^assets\/img\/([^/]+)\//);
        if (folderMatch) return folderMatch[1];
    }
    if (docMeta.slug) return docMeta.slug;
    return 'pdf';
}

function buildDocSummaryPrompt(frontMatter, imageFolder, title) {
    const safeTitle = (title || '').trim();
    return [
        'You are writing documentation for a research paper.',
        safeTitle ? `Paper title: ${safeTitle}` : '',
        '',
        'Return only Markdown. Use the front matter template below and fill in the description and img fields.',
        '```',
        frontMatter.trim(),
        '```',
        '',
        'Requirements:',
        '- Focus only on Method and Experiments. Omit related work entirely.',
        '- Be objective and concrete. Avoid hype, subjective adjectives/adverbs, and claims like novel, groundbreaking, or state-of-the-art.',
        '- Avoid vague, high-level phrasing and avoid jargon where possible.',
        '- Use Markdown headings: "Method" and "Experiments".',
        '- Put all math in $...$ (single dollar), even display equations.',
        '- Add placeholders for figures/tables you want included, e.g., [FIGURE: Figure 2 - short caption] and [TABLE: Table 1 - short caption].',
        `- Choose one representative figure for the title image; set img to assets/img/${imageFolder}/figure-<N>.png and include a matching [FIGURE: Figure <N> - ...] placeholder.`,
        '- Provide a short description sentence for the front matter description.',
        '',
        'Output only the filled front matter followed by the Markdown body.'
    ]
        .filter(Boolean)
        .join('\n');
}

async function callGeminiForDoc(prompt, pdfDataB64, model, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: 'application/pdf', data: pdfDataB64 } }
                ]
            }
        ]
    };
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.candidates) {
        throw new Error(data.error?.message || 'Unknown API error.');
    }
    return data;
}

function setDocAutoSummaryLoading(isLoading) {
    if (!dom.docAutoSummaryBtn) return;
    const icon = dom.docAutoSummaryBtn.querySelector('.material-symbols-outlined');
    if (isLoading) {
        dom.docAutoSummaryBtn.classList.add('is-loading');
        dom.docAutoSummaryBtn.disabled = true;
        if (icon) icon.textContent = 'hourglass_top';
    } else {
        dom.docAutoSummaryBtn.classList.remove('is-loading');
        dom.docAutoSummaryBtn.disabled = false;
        if (icon) icon.textContent = 'summarize';
    }
}

async function handleDocAutoSummary() {
    setDocAutoSummaryLoading(true);
    try {
        const { apiKey, model } = await getDocGeminiConfig();
        if (!apiKey) {
            throw new Error('Missing Gemini API key. Please add it in settings.');
        }
        const pdfDataB64 = await fetchPdfAsBase64(pdfUrl);
        const { meta } = parseFrontMatter(dom.docEditor.value);
        const frontMatter = buildFrontMatterTemplate(meta, {
            layout: 'page',
            title: meta.title || docMeta.title || '',
            description: '',
            categories: meta.categories || '[]',
            img: '',
            importance: meta.importance || '1',
            giscus_comments: meta.giscus_comments || 'true',
            link: meta.link || pdfUrl || '',
        });
        const prompt = buildDocSummaryPrompt(frontMatter, getImageFolder(), docMeta.title);
        const responseData = await callGeminiForDoc(prompt, pdfDataB64, model, apiKey);
        const responseText = responseData.candidates[0].content.parts[0].text || '';
        dom.docEditor.value = responseText.trim();
        setSaveState(false);
        scheduleSaveDraft();
        if (!dom.docPreviewPane.classList.contains('hidden')) {
            updatePreview();
        }
    } catch (error) {
        console.error('Auto-generate summary failed:', error);
        window.alert(`Auto-generate summary failed: ${error.message}`);
    } finally {
        setDocAutoSummaryLoading(false);
    }
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
    pdfUrl = decodeURIComponent(urlParams.get('pdf') || '');
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
    const docGeminiKey = await getStorage('geminiApiKey');
    if (dom.docAutoSummaryBtn) {
        dom.docAutoSummaryBtn.classList.toggle('hidden', !docGeminiKey);
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
    if (dom.docAutoSummaryBtn) {
        dom.docAutoSummaryBtn.addEventListener('click', handleDocAutoSummary);
    }
    dom.docCloseBtn.addEventListener('click', () => window.close());
}

document.addEventListener('DOMContentLoaded', initializePopoutDoc);

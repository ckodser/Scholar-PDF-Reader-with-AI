const DOC_DRAFT_PREFIX = 'docDraft_';
const DOC_META_PREFIX = 'docMeta_';
const DOC_IMAGES_PREFIX = 'docImages_';

function stripUrlScheme(value) {
    if (!value) return '';
    return value.replace(/^https?:\/\//i, '');
}

function parseFrontMatter(markdown) {
    if (!markdown || !markdown.startsWith('---')) {
        return { body: markdown || '', meta: {} };
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

function parseCategories(value) {
    if (!value) return [];
    let trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        trimmed = trimmed.slice(1, -1);
    }
    if (!trimmed) return [];
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}

function isHttpUrl(value) {
    return /^https?:\/\//i.test(value || '');
}

function resolveImageUrl(frontMatterImg, images) {
    if (isHttpUrl(frontMatterImg)) {
        return frontMatterImg;
    }

    if (frontMatterImg && Array.isArray(images)) {
        const match = images.find((entry) => entry && entry.path === frontMatterImg);
        if (match && match.dataUrl) {
            return match.dataUrl;
        }
    }

    if (Array.isArray(images) && images.length > 0) {
        return images[0].dataUrl || '';
    }

    return '';
}

function buildPreviewHtml(body, images) {
    let markdown = body.replace(
        /\{%\s*include\s+figure\.liquid\s+path='([^']+)'\s+class="([^"]+)"\s*%\}/g,
        (match, path, className) => {
            const image = Array.isArray(images) ? images.find((entry) => entry.path === path) : null;
            if (!image) return match;
            return `<img src="${image.dataUrl}" class="${className}" />`;
        }
    );

    if (typeof marked === 'object') {
        return marked.parse(markdown);
    }
    return markdown;
}

function renderMath(container) {
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(container, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ]
        });
    }
}

function renderDocument(doc) {
    const titleEl = document.getElementById('doc-title');
    const descEl = document.getElementById('doc-description');
    const hero = document.getElementById('doc-hero');
    const heroImg = document.getElementById('doc-hero-img');
    const categoriesEl = document.getElementById('doc-categories');
    const sourceEl = document.getElementById('doc-source');
    const contentEl = document.getElementById('doc-content');
    const emptyState = document.getElementById('empty-state');

    const { body, meta } = parseFrontMatter(doc.draft || '');
    const title = meta.title || (doc.meta && doc.meta.title) || 'Untitled Document';
    const description = meta.description || '';
    const link = meta.link || (doc.pdfUrl && doc.pdfUrl !== 'unknown' ? doc.pdfUrl : '');
    const imageUrl = resolveImageUrl(meta.img, doc.images);

    titleEl.textContent = title;
    descEl.textContent = description || '';

    if (imageUrl) {
        heroImg.src = imageUrl;
        heroImg.alt = title;
        hero.classList.remove('hidden');
    }

    const categories = parseCategories(meta.categories);
    if (categories.length) {
        categoriesEl.innerHTML = '';
        categories.forEach((category) => {
            const chip = document.createElement('span');
            chip.textContent = category;
            categoriesEl.appendChild(chip);
        });
    }

    if (link) {
        sourceEl.textContent = stripUrlScheme(link);
    }

    if (!body || !body.trim()) {
        contentEl.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    contentEl.classList.remove('hidden');
    emptyState.classList.add('hidden');
    contentEl.innerHTML = buildPreviewHtml(body, doc.images);
    renderMath(contentEl);
}

function loadDocument() {
    const params = new URLSearchParams(window.location.search);
    const pdfUrl = params.get('pdfUrl');
    if (!pdfUrl) {
        document.getElementById('empty-state').textContent = 'Missing document reference.';
        document.getElementById('empty-state').classList.remove('hidden');
        return;
    }

    const keys = [
        `${DOC_DRAFT_PREFIX}${pdfUrl}`,
        `${DOC_META_PREFIX}${pdfUrl}`,
        `${DOC_IMAGES_PREFIX}${pdfUrl}`,
    ];

    chrome.storage.local.get(keys, (items) => {
        const doc = {
            pdfUrl,
            draft: items[keys[0]] || '',
            meta: items[keys[1]] || null,
            images: Array.isArray(items[keys[2]]) ? items[keys[2]] : [],
        };
        renderDocument(doc);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadDocument();
});

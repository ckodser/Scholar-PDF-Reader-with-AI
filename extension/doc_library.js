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

function createDocCard(doc) {
    const { meta } = parseFrontMatter(doc.draft || '');
    const title = meta.title || (doc.meta && doc.meta.title) || 'Untitled Document';
    const description = meta.description || '';
    const link = meta.link || (doc.pdfUrl && doc.pdfUrl !== 'unknown' ? doc.pdfUrl : '');
    const imageUrl = resolveImageUrl(meta.img, doc.images);
    const sourceLabel = stripUrlScheme(link || doc.pdfUrl || '');
    const previewUrl = `doc_preview.html?pdfUrl=${encodeURIComponent(doc.pdfUrl || '')}`;

    const card = document.createElement('article');
    card.className = 'doc-card';

    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'doc-card-image';
    if (imageUrl) {
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = title;
        imageWrapper.appendChild(image);
    } else {
        imageWrapper.textContent = 'No header image available';
    }
    card.appendChild(imageWrapper);

    const body = document.createElement('div');
    body.className = 'doc-card-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'doc-card-title';
    titleEl.textContent = title;

    const descEl = document.createElement('div');
    descEl.className = 'doc-card-description';
    descEl.textContent = description || 'No description provided.';

    body.appendChild(titleEl);
    body.appendChild(descEl);

    if (sourceLabel) {
        const metaEl = document.createElement('div');
        metaEl.className = 'doc-card-meta';
        metaEl.textContent = sourceLabel;
        body.appendChild(metaEl);
    }

    const actions = document.createElement('div');
    actions.className = 'doc-card-actions';

    const previewBtn = document.createElement('button');
    previewBtn.textContent = 'Open Summary';
    previewBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL(previewUrl) });
    });
    actions.appendChild(previewBtn);

    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open PDF';
    openBtn.disabled = !link;
    openBtn.addEventListener('click', () => {
        if (link) {
            chrome.tabs.create({ url: link });
        }
    });
    actions.appendChild(openBtn);

    body.appendChild(actions);
    card.appendChild(body);

    return card;
}

function buildSearchText(doc) {
    const { meta, body } = parseFrontMatter(doc.draft || '');
    const title = meta.title || (doc.meta && doc.meta.title) || '';
    const description = meta.description || '';
    const link = meta.link || (doc.pdfUrl && doc.pdfUrl !== 'unknown' ? doc.pdfUrl : '');
    return [
        title,
        description,
        stripUrlScheme(link || doc.pdfUrl || ''),
        body || ''
    ].join(' ').toLowerCase();
}

function buildDocList(items) {
    const docsByUrl = new Map();

    Object.entries(items).forEach(([key, value]) => {
        if (key.startsWith(DOC_DRAFT_PREFIX)) {
            const pdfUrl = key.slice(DOC_DRAFT_PREFIX.length);
            const entry = docsByUrl.get(pdfUrl) || { pdfUrl, draft: '', meta: null, images: [] };
            entry.draft = typeof value === 'string' ? value : '';
            docsByUrl.set(pdfUrl, entry);
            return;
        }

        if (key.startsWith(DOC_META_PREFIX)) {
            const pdfUrl = key.slice(DOC_META_PREFIX.length);
            const entry = docsByUrl.get(pdfUrl) || { pdfUrl, draft: '', meta: null, images: [] };
            entry.meta = value || null;
            docsByUrl.set(pdfUrl, entry);
            return;
        }

        if (key.startsWith(DOC_IMAGES_PREFIX)) {
            const pdfUrl = key.slice(DOC_IMAGES_PREFIX.length);
            const entry = docsByUrl.get(pdfUrl) || { pdfUrl, draft: '', meta: null, images: [] };
            entry.images = Array.isArray(value) ? value : [];
            docsByUrl.set(pdfUrl, entry);
        }
    });

    return Array.from(docsByUrl.values()).filter((doc) => {
        if (!doc.draft) return false;
        const { body } = parseFrontMatter(doc.draft || '');
        return body && body.trim().length > 0;
    });
}

function renderDocs(docs, query) {
    const grid = document.getElementById('docs-grid');
    const emptyState = document.getElementById('empty-state');
    const status = document.getElementById('search-status');
    const normalizedQuery = (query || '').trim().toLowerCase();

    grid.innerHTML = '';
    emptyState.classList.add('hidden');

    let visibleDocs = docs;
    if (normalizedQuery) {
        visibleDocs = docs.filter((doc) => buildSearchText(doc).includes(normalizedQuery));
    }

    if (!visibleDocs.length) {
        emptyState.textContent = normalizedQuery
            ? 'No documents match your search.'
            : 'No documents saved yet. Open a PDF and use the Documentation tool to create one.';
        emptyState.classList.remove('hidden');
    }

    if (status) {
        status.textContent = normalizedQuery
            ? `${visibleDocs.length} result${visibleDocs.length === 1 ? '' : 's'}`
            : '';
    }

    visibleDocs.forEach((doc) => {
        grid.appendChild(createDocCard(doc));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear-btn');

    chrome.storage.local.get(null, (items) => {
        const docs = buildDocList(items);
        docs.sort((a, b) => {
            const aMeta = parseFrontMatter(a.draft || '').meta;
            const bMeta = parseFrontMatter(b.draft || '').meta;
            const aTitle = (aMeta.title || (a.meta && a.meta.title) || '').toLowerCase();
            const bTitle = (bMeta.title || (b.meta && b.meta.title) || '').toLowerCase();
            return aTitle.localeCompare(bTitle);
        });

        const renderWithQuery = () => renderDocs(docs, input.value);
        renderWithQuery();

        input.addEventListener('input', renderWithQuery);
        clearBtn.addEventListener('click', () => {
            input.value = '';
            renderWithQuery();
            input.focus();
        });
    });
});

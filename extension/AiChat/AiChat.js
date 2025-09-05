/**
 * AiChat.js
 * Manages the UI interactions for the in-page AI chat panel.
 */

// --- Window Functionality (Draggable, Resizable) ---
// ... (makeDraggable and makeResizable functions remain unchanged) ...
function makeDraggable(panel, header) {
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
        // Prevent starting a drag on control buttons
        if (e.target.closest('button')) {
            return;
        }

        e.preventDefault();
        isDragging = true;

        const rect = panel.getBoundingClientRect();

        // If panel is positioned with `right`, calculate `left` and switch to it.
        if (getComputedStyle(panel).right !== 'auto' && getComputedStyle(panel).left === 'auto') {
            panel.style.left = `${rect.left}px`;
            panel.style.right = 'auto';
        }

        // If panel is in 'expanded' mode (centered with transform), normalize its position.
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
        // Use requestAnimationFrame for smoother rendering, preventing layout thrashing.
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
function makeResizable(panel) {
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

        // If panel is in 'expanded' mode, normalize its styles before resizing.
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

async function toggleChatPanel() {
    aiChatState.isPanelOpen = !aiChatState.isPanelOpen;
    dom.chatPanel.classList.toggle('hidden', !aiChatState.isPanelOpen);
    if (aiChatState.isPanelOpen && aiChatState.tabs.length === 0) {
        await createNewTab();
    }
    if (!aiChatState.isPanelOpen) {
        hideDeleteConfirmation();
    }
    dom.chatDeleteBtn.classList.toggle('hidden', !aiChatState.isPanelExpanded);
}

function toggleChatSize() {
    aiChatState.isPanelExpanded = !aiChatState.isPanelExpanded;
    dom.chatPanel.classList.toggle('expanded', aiChatState.isPanelExpanded);
    dom.chatResizeBtn.querySelector('.material-symbols-outlined').textContent = aiChatState.isPanelExpanded ? 'close_fullscreen' : 'open_in_full';

    // Show popout button only when expanded
    dom.popoutBtn.classList.toggle('hidden', !aiChatState.isPanelExpanded);


    // Remove all inline positioning and sizing styles.
    dom.chatPanel.style.top = '';
    dom.chatPanel.style.left = '';
    dom.chatPanel.style.right = '';
    dom.chatPanel.style.width = '';
    dom.chatPanel.style.height = '';
    dom.chatPanel.style.transform = '';

    hideDeleteConfirmation();
    dom.chatDeleteBtn.classList.toggle('hidden', !aiChatState.isPanelExpanded);
}

// --- Initialization ---

async function initializeAiChat() {
    console.log('Initializing AI Chat...');
    cacheDomElements();

    makeDraggable(dom.chatPanel, dom.chatHeader);
    makeResizable(dom.chatPanel);

    await applyTheme();
    await loadConversations();

    aiChatState.apiKey = await getStorage('geminiApiKey');
    const savedModel = await getStorage('selectedGeminiModel');
    if (savedModel) aiChatState.model = savedModel;

    if (aiChatState.apiKey) {
        dom.chatActivateBtn.classList.remove('hidden');
        dom.aiChatBorder.classList.remove('hidden');
        if (dom.headerTitle) {
            const modelData = GEMINI_MODELS_DATA[aiChatState.model];
            dom.headerTitle.textContent = modelData ? modelData.name : aiChatState.model;
        }
    } else {
        dom.chatPanel.classList.add('hidden');
        dom.chatActivateBtn.classList.add('hidden');
        dom.aiChatBorder.classList.add('hidden');
    }

    renderTabs();
    renderActiveTabMessages();

    // --- Event Listeners ---
    dom.chatActivateBtn.addEventListener('click', toggleChatPanel);
    dom.chatCloseBtn.addEventListener('click', toggleChatPanel);
    dom.chatResizeBtn.addEventListener('click', toggleChatSize);
    dom.newTabBtn.addEventListener('click', createNewTab);
    dom.chatSendBtn.addEventListener('click', handleSendMessage);

    dom.chatDeleteBtn.addEventListener('click', showDeleteConfirmation);
    dom.confirmDeleteNoBtn.addEventListener('click', hideDeleteConfirmation);
    dom.confirmDeleteYesBtn.addEventListener('click', async () => {
        await deleteAllMessages();
        hideDeleteConfirmation();
    });

    dom.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    dom.popoutBtn.addEventListener('click', () => {
        const rect = dom.chatPanel.getBoundingClientRect();
        const url = chrome.runtime.getURL(`AiChat/popout.html?pdf=${encodeURIComponent(aiChatState.pdfId)}`);

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
                // Hide the in-page panel after the popout is created
                toggleChatPanel();
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', initializeAiChat);
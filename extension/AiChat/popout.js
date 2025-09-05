/**
 * popout.js
 * Initializes and manages the pop-out AI chat window.
 */

async function initializePopoutChat() {
    console.log('Initializing Pop-out AI Chat...');
    cacheDomElements(); // Re-cache DOM elements for the popout window

    const urlParams = new URLSearchParams(window.location.search);
    window.pdfUrl = decodeURIComponent(urlParams.get('pdf'));
    aiChatState.pdfId = window.pdfUrl;


    await applyTheme();
    await loadConversations();

    aiChatState.apiKey = await getStorage('geminiApiKey');
    const savedModel = await getStorage('selectedGeminiModel');
    if (savedModel) aiChatState.model = savedModel;

    if (aiChatState.apiKey) {
        if (dom.headerTitle) {
            const modelData = GEMINI_MODELS_DATA[aiChatState.model];
            dom.headerTitle.textContent = modelData ? modelData.name : aiChatState.model;
        }
    } else {
        // Handle case where API key is not available
        dom.chatMessages.innerHTML = '<div class="chat-message ai"><div class="message-content">Gemini API key not found. Please set it in the extension options.</div></div>';
        dom.chatInput.disabled = true;
        dom.chatSendBtn.disabled = true;
    }

    renderTabs();
    if (aiChatState.tabs.length === 0) {
        await createNewTab();
    } else {
        renderActiveTabMessages();
    }


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

    // Listen for storage changes to sync tabs between the main window and popout
    chrome.storage.onChanged.addListener((changes, namespace) => {
        const storageKey = `chatHistory_${aiChatState.pdfId}`;
        if (namespace === 'local' && changes[storageKey]) {
            console.log('Storage changed, reloading conversations...');
            loadConversations().then(() => {
                renderTabs();
                renderActiveTabMessages();
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', initializePopoutChat);
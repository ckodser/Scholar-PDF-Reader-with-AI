/**
 * popout.js
 * Initializes and manages the pop-out AI chat window.
 */

async function initializePopoutChat() {
    console.log('Initializing Pop-out AI Chat...');
    // Explicitly cache DOM elements for the pop-out.
    cacheDomElements();

    const urlParams = new URLSearchParams(window.location.search);
    window.pdfUrl = decodeURIComponent(urlParams.get('pdf'));
    aiChatState.pdfId = window.pdfUrl;
    console.log('Pop-out chat initialized for PDF:', aiChatState.pdfId);


    await applyTheme();
    await loadConversations();
    console.log('Conversations loaded for pop-out chat.');


    aiChatState.apiKey = await getStorage('geminiApiKey');
    const savedModel = await getStorage('selectedGeminiModel');
    if (savedModel) aiChatState.model = savedModel;

    if (aiChatState.apiKey) {
        if (dom.headerTitle) {
            const modelData = GEMINI_MODELS_DATA[aiChatState.model];
            dom.headerTitle.textContent = modelData ? modelData.name : aiChatState.model;
        }
        console.log('API key and model loaded for pop-out chat.');
    } else {
        // Handle case where API key is not available
        dom.chatMessages.innerHTML = '<div class="chat-message ai"><div class="message-content">Gemini API key not found. Please set it in the extension options.</div></div>';
        dom.chatInput.disabled = true;
        dom.chatSendBtn.disabled = true;
        console.error('Gemini API key not found for pop-out chat.');
    }

    renderTabs();
    if (aiChatState.tabs.length === 0) {
        await createNewTab();
    } else {
        renderActiveTabMessages();
    }


    dom.newTabBtn.addEventListener('click', createNewTab);
    dom.chatSendBtn.addEventListener('click',() => {
        console.log('Send button clicked in pop-out.');
        handleSendMessage();
    });
    dom.chatDeleteBtn.addEventListener('click', showDeleteConfirmation);
    dom.confirmDeleteNoBtn.addEventListener('click', hideDeleteConfirmation);
    dom.confirmDeleteYesBtn.addEventListener('click', async () => {
        await deleteAllMessages();
        hideDeleteConfirmation();
    });

    dom.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            console.log('Enter key pressed in pop-out input.');
            handleSendMessage();
        }
    });

    // A smarter storage listener to prevent unnecessary re-renders.
    chrome.storage.onChanged.addListener((changes, namespace) => {
        const storageKey = `chatHistory_${aiChatState.pdfId}`;
        if (namespace === 'local' && changes[storageKey]) {
            console.log('Storage changed, updating conversations in pop-out...');
            const newTabs = changes[storageKey].newValue || [];
            const activeTab = newTabs.find(tab => tab.id === aiChatState.activeTabId);

            if (activeTab) {
                // Find the last message in the current UI
                const lastMessageElement = dom.chatMessages.lastElementChild;
                const lastMessageText = lastMessageElement ? lastMessageElement.querySelector('.message-content').textContent : null;

                // Find the corresponding message in the new data
                const lastMessageIndex = activeTab.messages.findIndex(msg => msg.content === lastMessageText);

                // Append only the new messages
                for (let i = lastMessageIndex + 1; i < activeTab.messages.length; i++) {
                    const message = activeTab.messages[i];
                    const messageElement = createMessageElement(message.role, message.content);
                    dom.chatMessages.appendChild(messageElement);
                }
                scrollToBottom();
            }
        }
    });
}

// Make sure handleSendMessage is available in the popout's scope
// This wrapper is still useful for debugging.
const originalHandleSendMessage = window.handleSendMessage;
window.handleSendMessage = async function() {
    console.log('handleSendMessage called in pop-out.');
    // Show thinking indicator
    if (dom.chatProcessingOverlay) {
        console.log('Showing thinking indicator in pop-out.');
        dom.chatProcessingOverlay.classList.remove('hidden');
    }

    try {
        await originalHandleSendMessage();
        console.log('handleSendMessage completed in pop-out.');
    } catch (error) {
        console.error('Error in handleSendMessage in pop-out:', error);
    } finally {
        // Hide thinking indicator
        if (dom.chatProcessingOverlay) {
            console.log('Hiding thinking indicator in pop-out.');
            dom.chatProcessingOverlay.classList.add('hidden');
        }
    }
}


document.addEventListener('DOMContentLoaded', initializePopoutChat);
import '../background-compiled.js';

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "getPdfUrl") {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
                let url = tabs[0].url;
                let cleanUrl = url.split('#')[0]; // Remove the fragment identifier
                chrome.tabs.sendMessage(tabs[0].id, {action: "setPdfUrl", url: cleanUrl});
            }
        });
    }
});
// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle request to create a pop-out window
    if (request.action === 'createPopout' && request.options) {
        chrome.windows.create({
            url: request.options.url,
            type: 'popup',
            width: request.options.width,
            height: request.options.height,
            left: request.options.left,
            top: request.options.top
        });
        sendResponse({ status: 'ok' });
    }

    // Note: If you have other message listeners (like for TTS), they would go here.

    // Return true to indicate you wish to send a response asynchronously.
    // This is important for keeping the message channel open.
    return true;
});
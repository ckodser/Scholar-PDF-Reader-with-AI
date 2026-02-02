/**
 * gemini_settings.js
 * Handles all logic for the Gemini settings section on the settings page,
 * including API key validation, model selection with pricing, and saving settings.
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const elements = {
        apiKeyInput: document.getElementById('ai-chat-api-key-input'),
        validateKeyBtn: document.getElementById('ai-chat-validate-key-btn'),
        clearKeyBtn: document.getElementById('ai-chat-clear-key-btn'),
        modelSelectionContainer: document.getElementById('gemini-model-selection-container'),
        saveModelBtn: document.getElementById('save-gemini-model-btn'),
        status: document.getElementById('status'), // Re-using the general status element
        geminiUsageContainer: document.getElementById('total-gemini-usage-container'),
        totalUsageDisplay: document.getElementById('total-usage-gemini'),
        geminiModal: document.getElementById('gemini-api-key-modal'),
        showGeminiModalBtn: document.getElementById('show-gemini-modal-btn'),
        closeGeminiModalBtn: document.getElementById('close-gemini-modal-btn'),
    };

    // --- State ---
    const state = {
        apiKey: '',
        selectedModel: '',
        availableModels: {},
    };



    // --- Utility Functions ---

    /**
     * Saves a value to the extension's local storage.
     * @param {string} key The key to save the data under.
     * @param {any} value The value to save.
     */
    function setStorage(key, value) {
        chrome.storage.local.set({ [key]: value }, () => {
            console.log(`Gemini setting saved: ${key} =`, value);
        });
    }

    /**
     * Retrieves a setting from chrome.storage.local.
     * @param {string} key The key of the setting to retrieve.
     * @returns {Promise<any>} A promise that resolves with the stored value.
     */
    function getStorage(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key]);
            });
        });
    }

    /**
     * Shows a status message to the user.
     * @param {string} message The message to display.
     * @param {'success' | 'error'} type The type of message.
     */
    function showStatus(message, type = 'success') {
        elements.status.textContent = message;
        elements.status.className = `status ${type}`;
        elements.status.style.display = 'block';

        setTimeout(() => {
            elements.status.style.display = 'none';
        }, 5000);
    }


    // --- Core Functions ---

    /**
     * Loads and displays the total usage cost from storage.
     */
    const loadAndDisplayUsage = async () => {
        const totalCost = await getStorage('totalGeminiCost') || 0;
        elements.totalUsageDisplay.textContent = `$${parseFloat(totalCost).toFixed(3)}`;
    };

    /**
     * Loads saved settings from storage when the page loads.
     */
    const loadSettings = async () => {
        const apiKey = await getStorage('geminiApiKey');
        const model = await getStorage('selectedGeminiModel');

        if (model) {
            state.selectedModel = model;
        }

        if (apiKey) {
            elements.apiKeyInput.value = apiKey;
            state.apiKey = apiKey;
            elements.modelSelectionContainer.style.display = 'block';
            elements.geminiUsageContainer.style.display = 'block';
            await fetchAndRenderModels();
        }
        await loadAndDisplayUsage(); // Initial load
    };

    /**
     * Validates the provided Gemini API key by making a cheap, 1-token generation call.
     * @param {boolean} showAlerts - Whether to show status messages to the user.
     */
    const validateApiKey = async (showAlerts = true) => {
        const apiKey = elements.apiKeyInput.value.trim();
        if (!apiKey) {
            if (showAlerts) showStatus('Please enter a Gemini API key.', 'error');
            return;
        }

        if (showAlerts) showStatus('Validating key...', 'success');
        elements.validateKeyBtn.disabled = true;

        const validationModel = 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${validationModel}:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
                }),
            });

            const data = await response.json();

            if (response.ok && data.candidates) {
                if (showAlerts) showStatus('Gemini API Key is valid!', 'success');
                state.apiKey = apiKey;
                setStorage('geminiApiKey', apiKey);

                elements.modelSelectionContainer.style.display = 'block';
                elements.geminiUsageContainer.style.display = 'block';
                await fetchAndRenderModels();
            } else {
                const error = data.error?.message || 'Invalid API Key or insufficient permissions.';
                throw new Error(error);
            }
        } catch (error) {
            console.error('Gemini API Key validation error:', error);
            if (showAlerts) showStatus(`Validation Error: ${error.message}`, 'error');
            elements.modelSelectionContainer.style.display = 'none';
            elements.geminiUsageContainer.style.display = 'none';
        } finally {
            elements.validateKeyBtn.disabled = false;
        }
    };

    /**
     * Clears the API key from the input and storage.
     */
    const clearApiKey = () => {
        elements.apiKeyInput.value = '';
        state.apiKey = '';
        chrome.storage.local.remove('geminiApiKey');
        elements.modelSelectionContainer.style.display = 'none';
        elements.geminiUsageContainer.style.display = 'none';
        showStatus('Gemini API Key removed.', 'success');
    };

    /**
     * Renders the list of available Gemini models for selection.
     */
    const renderModelSelection = () => {
        const container = elements.modelSelectionContainer.querySelector('#gemini-model-tier-container');
        container.innerHTML = ''; // Clear previous content

        const modelKeys = Object.keys(state.availableModels);
        if (modelKeys.length === 0) {
            container.innerHTML = '<p class="tier-desc">No Gemini models available for this API key.</p>';
            return;
        }

        modelKeys.forEach(modelKey => {
            const modelInfo = state.availableModels[modelKey];
            const card = document.createElement('div');
            card.className = 'voice-tier-card';

            const pricingHtml = modelInfo.pricing
                ? `
                    <div class="tier-details">
                        <span><strong>Input:</strong> ${modelInfo.pricing.input} / 1M tokens</span>
                        <span><strong>Output:</strong> ${modelInfo.pricing.output} / 1M tokens</span>
                    </div>
                  `
                : '';

            card.innerHTML = `
                <div class="tier-header">
                    <h4>${modelInfo.name}</h4>
                </div>
                <p class="tier-desc">${modelInfo.desc || 'No description available.'}</p>
                ${pricingHtml}
                <div class="mt-3">
                    <label class="voice-option">
                        <input type="radio" name="gemini-model-selection" value="${modelKey}" ${modelKey === state.selectedModel ? 'checked' : ''}>
                        <span>Select ${modelInfo.name}</span>
                    </label>
                </div>
            `;
            container.appendChild(card);
        });
    };

    /**
     * Saves the user's chosen Gemini model to storage.
     */
    const saveModelSelection = () => {
        const selectedRadio = document.querySelector('input[name="gemini-model-selection"]:checked');
        if (selectedRadio) {
            state.selectedModel = selectedRadio.value;
            setStorage('selectedGeminiModel', state.selectedModel);
            const modelName = state.availableModels[state.selectedModel]?.name || state.selectedModel;
            showStatus(`Model set to ${modelName}.`, 'success');
        } else {
            showStatus('Please select a model first.', 'error');
        }
    };

    /**
     * Fetches available Gemini models from the API and renders them.
     */
    const fetchAndRenderModels = async () => {
        if (!state.apiKey) {
            return;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${state.apiKey}`;
        try {
            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok || !data.models) {
                const error = data.error?.message || 'Failed to fetch Gemini models.';
                throw new Error(error);
            }

            const models = {};
            data.models.forEach((model) => {
                if (!model.name) return;
                const modelId = model.name.replace('models/', '');
                if (!modelId.includes('gemini')) return;
                models[modelId] = {
                    name: model.displayName || modelId,
                    desc: model.description || '',
                    pricing: null,
                };
            });

            state.availableModels = models;
            if (!state.selectedModel || !state.availableModels[state.selectedModel]) {
                const firstModel = Object.keys(state.availableModels)[0];
                if (firstModel) {
                    state.selectedModel = firstModel;
                    setStorage('selectedGeminiModel', state.selectedModel);
                }
            }

            renderModelSelection();
        } catch (error) {
            console.error('Gemini model fetch error:', error);
            showStatus(`Model Fetch Error: ${error.message}`, 'error');
            state.availableModels = {};
            renderModelSelection();
        }
    };


    // --- Event Listeners ---
    elements.validateKeyBtn.addEventListener('click', () => validateApiKey(true));
    elements.clearKeyBtn.addEventListener('click', clearApiKey);
    elements.saveModelBtn.addEventListener('click', saveModelSelection);
    // --- Gemini API Key Modal Logic ---
    if (elements.showGeminiModalBtn) {
        elements.showGeminiModalBtn.addEventListener('click', () => {
            if (elements.geminiModal) {
                elements.geminiModal.classList.remove('hidden');
            }
        });
    }
    if (elements.closeGeminiModalBtn) {
        elements.closeGeminiModalBtn.addEventListener('click', () => {
            if (elements.geminiModal) {
                elements.geminiModal.classList.add('hidden');
            }
        });
    }
    if (elements.geminiModal) {
        elements.geminiModal.addEventListener('click', (event) => {
            // Close modal if user clicks on the background overlay
            if (event.target === elements.geminiModal) {
                elements.geminiModal.classList.add('hidden');
            }
        });
    }

    // --- Initialization ---
    loadSettings();
    // Set an interval to refresh the usage display every 10 seconds
    setInterval(loadAndDisplayUsage, 10000);
});

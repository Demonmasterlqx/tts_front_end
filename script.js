const API_BASE_URL = '/api';

let availableModels = []; // Store fetched models
let currentRequestId = null; // To keep track of the current request ID for polling
let pollingInterval = null; // To store the interval timer for polling

document.addEventListener('DOMContentLoaded', () => {
    fetchModels();

    const ttsForm = document.getElementById('tts-form');
    ttsForm.addEventListener('submit', handleSynthesize);

    const addVoiceBtn = document.getElementById('add-voice-btn');
    addVoiceBtn.addEventListener('click', addVoiceInput);

    const modelSelect = document.getElementById('model-select');
    modelSelect.addEventListener('change', updateLanguageOptions);
});

async function fetchModels() {
    const modelSelect = document.getElementById('model-select');
    try {
        const response = await fetch(`${API_BASE_URL}/tts/models`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        availableModels = await response.json(); // Store models
        modelSelect.innerHTML = ''; // Clear loading option
        availableModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = model.name;
            modelSelect.appendChild(option);
        });
        // Trigger language options update for the initially selected model
        updateLanguageOptions();
    } catch (error) {
        console.error('Error fetching models:', error);
        modelSelect.innerHTML = '<option value="">加载模型失败</option>';
        // Optionally display an error message to the user
    }
}

function updateLanguageOptions() {
    const modelSelect = document.getElementById('model-select');
    const languageSelect = document.getElementById('language-select');
    const selectedModelName = modelSelect.value;

    // Find the selected model in the availableModels array
    const selectedModel = availableModels.find(model => model.name === selectedModelName);

    languageSelect.innerHTML = ''; // Clear current options
    const autoOption = document.createElement('option');
    autoOption.value = "";
    autoOption.textContent = "自动检测或使用模型默认";
    languageSelect.appendChild(autoOption);


    if (selectedModel && selectedModel.language) {
        selectedModel.language.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang;
            option.textContent = lang;
            languageSelect.appendChild(option);
        });
    }
}


function addVoiceInput() {
    const voicesContainer = document.getElementById('voices-container');
    const voiceIndex = voicesContainer.querySelectorAll('.voice-input-group').length;

    const voiceInputGroup = document.createElement('div');
    voiceInputGroup.classList.add('voice-input-group');
    voiceInputGroup.innerHTML = `
        <h3>音色 ${voiceIndex + 1}</h3>
        <div>
            <label for="voice-name-${voiceIndex}">音色名称:</label>
            <input type="text" class="voice-name" required>
        </div>
        <div>
            <label for="voice-ref-audio-${voiceIndex}">参考音频:</label>
            <input type="file" class="voice-ref-audio" accept="audio/*" required>
        </div>
        <div>
            <label for="voice-ref-text-${voiceIndex}">参考文本 (可选):</label>
            <input type="text" class="voice-ref-text">
        </div>
        <button type="button" class="remove-voice-btn">移除音色</button>
        <hr>
    `;
    voicesContainer.appendChild(voiceInputGroup);

    // Add event listener to the remove button
    voiceInputGroup.querySelector('.remove-voice-btn').addEventListener('click', () => {
        voicesContainer.removeChild(voiceInputGroup);
    });
}


async function handleSynthesize(event) {
    event.preventDefault();

    const loadingIndicator = document.getElementById('loading-indicator');
    const audioPlayer = document.getElementById('audio-player');
    const resultDiv = document.getElementById('result'); // Get result div to display messages

    // Clear previous result and messages
    audioPlayer.src = '';
    resultDiv.innerHTML = '<h2>生成的语音:</h2><audio id="audio-player" controls></audio>'; // Reset result div content
    const updatedAudioPlayer = document.getElementById('audio-player'); // Get reference to the new audio player

    // Stop any ongoing polling
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }


    // Show loading indicator
    loadingIndicator.style.display = 'block';


    const modelName = document.getElementById('model-select').value;
    const refAudioFile = document.getElementById('ref-audio').files[0];
    const refText = document.getElementById('ref-text').value;
    const genText = document.getElementById('gen-text').value;
    const language = document.getElementById('language-select').value; // Get language from select dropdown

    if (!modelName || !refAudioFile || !genText) {
        alert('请填写所有必需字段 (模型, 参考音频, 生成文本)');
        loadingIndicator.style.display = 'none'; // Hide loading on validation error
        return;
    }

    // Convert audio file to Base64
    const refAudioBase64 = await fileToBase64(refAudioFile);

    const requestBody = {
        model_name: modelName,
        ref_audio: refAudioBase64,
        ref_text: refText,
        gen_text: genText,
    };

    if (language) {
        requestBody.language = language;
    }

    // Handle multiple voices
    const voices = {};
    const voiceInputGroups = document.querySelectorAll('.voice-input-group');
    for (const group of voiceInputGroups) {
        const voiceNameInput = group.querySelector('.voice-name');
        const voiceRefAudioInput = group.querySelector('.voice-ref-audio');
        const voiceRefTextInput = group.querySelector('.voice-ref-text');

        const voiceName = voiceNameInput.value;
        const voiceRefAudioFile = voiceRefAudioInput.files[0];
        const voiceRefText = voiceRefTextInput.value;

        if (voiceName && voiceRefAudioFile) {
            const voiceRefAudioBase64 = await fileToBase64(voiceRefAudioFile);
            voices[voiceName] = {
                ref_audio: voiceRefAudioBase64,
                ref_text: voiceRefText,
            };
        } else if (voiceName || voiceRefAudioFile) {
             alert(`请为音色 "${voiceName || voiceRefAudioFile.name}" 提供名称和参考音频.`);
             loadingIndicator.style.display = 'none'; // Hide loading on validation error
             return;
        }
    }

    if (Object.keys(voices).length > 0) {
        requestBody.voices = voices;
    }


    try {
        const response = await fetch(`${API_BASE_URL}/tts/synthesize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const responseData = await response.json();

        if (!response.ok) {
             // Handle API errors (e.g., 400, 500 from jump server or backend)
             const errorMessage = responseData.detail || JSON.stringify(responseData);
             throw new Error(`API error! status: ${response.status}, Detail: ${errorMessage}`);
        }


        currentRequestId = responseData.request_id;
        const status = responseData.status;

        if (status === "completed") {
            // Request completed immediately, fetch and play audio
            loadingIndicator.style.display = 'none'; // Hide loading
            // Fetch the audio data (the status endpoint for completed requests returns the audio)
            const audioResponse = await fetch(`${API_BASE_URL}/tts/status/${currentRequestId}`);
            if (!audioResponse.ok) {
                 throw new Error(`Failed to fetch audio data: ${audioResponse.status}`);
            }
            const audioBlob = await audioResponse.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            resultDiv.innerHTML = '<h2>生成的语音:</h2><audio id="audio-player" controls></audio>'; // Reset result div
            const updatedAudioPlayer = document.getElementById('audio-player'); // Get reference to the new audio player
            updatedAudioPlayer.src = audioUrl;
            updatedAudioPlayer.play();
            console.log(`Request ${currentRequestId} completed and audio played.`);


        } else if (status === "processing") {
            // Request is being processed immediately
            resultDiv.innerHTML = `<h2>生成的语音:</h2><p>正在处理您的请求...</p><audio id="audio-player" controls></audio>`;
            // Start polling for status
            pollingInterval = setInterval(() => checkRequestStatus(currentRequestId), 2000); // Poll every 2 seconds

        } else if (status === "queued") {
            // Request is queued
            const position = responseData.position;
            resultDiv.innerHTML = `<h2>生成的语音:</h2><p>您的请求已加入队列，当前排队位置：${position}</p><audio id="audio-player" controls></audio>`;
            // Start polling for status
            pollingInterval = setInterval(() => checkRequestStatus(currentRequestId), 2000); // Poll every 2 seconds

        } else {
            // Unexpected status
            throw new Error(`Unexpected response status: ${status}`);
        }


    } catch (error) {
        console.error('Error initiating synthesis:', error);
        // Ensure loading indicator is hidden and display error in result div
        displayError('发起语音生成请求失败: ' + error.message);
    }
}

async function checkRequestStatus(requestId) {
    const resultDiv = document.getElementById('result');
    const audioPlayer = document.getElementById('audio-player');
    const loadingIndicator = document.getElementById('loading-indicator'); // Get loading indicator reference

    try {
        const response = await fetch(`${API_BASE_URL}/tts/status/${requestId}`);

        if (response.status === 404) {
            // Request ID not found, might have been processed and result retrieved, or invalid
            console.warn(`Request ID ${requestId} not found or expired.`);
            displayError('请求状态未知或已过期。');
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.detail || JSON.stringify(errorData);
            throw new Error(`Status check error! status: ${response.status}, Detail: ${errorMessage}`);
        }

        const statusData = await response.json();
        const status = statusData.status;

        if (status === "completed") {
            // Request completed, fetch the audio data
            clearInterval(pollingInterval); // Stop polling
            pollingInterval = null;
            loadingIndicator.style.display = 'none'; // Hide loading

            // Fetch the audio data (the status endpoint for completed requests returns the audio)
            const audioResponse = await fetch(`${API_BASE_URL}/tts/status/${requestId}`);
            if (!audioResponse.ok) {
                 throw new Error(`Failed to fetch audio data: ${audioResponse.status}`);
            }
            const audioBlob = await audioResponse.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            resultDiv.innerHTML = '<h2>生成的语音:</h2><audio id="audio-player" controls></audio>'; // Reset result div
            const updatedAudioPlayer = document.getElementById('audio-player'); // Get reference to the new audio player
            updatedAudioPlayer.src = audioUrl;
            updatedAudioPlayer.play();
            console.log(`Request ${requestId} completed and audio played.`);


        } else if (status === "queued") {
            // Still in queue, update position
            const position = statusData.position;
            resultDiv.innerHTML = `<h2>生成的语音:</h2><p>您的请求已加入队列，当前排队位置：${position}</p><audio id="audio-player" controls></audio>`;
            console.log(`Request ${requestId} still queued. Position: ${position}`);

        } else if (status === "processing") {
             // Still processing
             resultDiv.innerHTML = `<h2>生成的语音:</h2><p>正在处理您的请求...</p><audio id="audio-player" controls></audio>`;
             console.log(`Request ${requestId} still processing.`);

        } else {
            // Unexpected status
            console.error(`Unexpected status received for request ${requestId}: ${status}`);
            displayError(`生成失败: 未知状态 ${status}`);
        }

    } catch (error) {
        console.error(`Error checking status for request ${requestId}:`, error);
        displayError(`生成失败: 状态检查错误 - ${error.message}`);
    }
}

function displayError(message) {
    const loadingIndicator = document.getElementById('loading-indicator');
    const resultDiv = document.getElementById('result');

    // Ensure loading indicator is hidden
    loadingIndicator.style.display = 'none';

    // Stop any ongoing polling
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }

    // Clear previous result and messages and display the error
    resultDiv.innerHTML = `<h2>生成的语音:</h2><p style="color: red;">${message}</p><audio id="audio-player" controls></audio>`;
}


function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // The result includes the data URL prefix (e.g., data:audio/wav;base64,...)
            resolve(reader.result);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

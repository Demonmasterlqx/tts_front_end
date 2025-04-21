const API_BASE_URL = '/api';

let availableModels = []; // Store fetched models
let currentRequestId = null; // To keep track of the current request ID for polling
let pollingInterval = null; // To store the interval timer for polling

// Global variables for recording
let mediaRecorder;
let audioChunks = [];
let audioBlob;
let audioBase64;
let recordingTimer;
let recordingStartTime;
const MAX_RECORDING_TIME = 60; // Maximum recording time in seconds

document.addEventListener('DOMContentLoaded', () => {
    // Check the current page and initialize accordingly
    if (document.getElementById('tts-form')) {
        // This is the single model configuration page
        initializeSingleModelConfig();
    } else if (document.getElementById('multi-model-form')) {
        // This is the multi-model configuration page
        // Initialization for multi-model is handled in multi_model_script.js
        // Ensure background is set for this page too
        setRandomBackground();
    } else if (document.getElementById('results-container')) {
        // This is the results page
        // Initialization for results is handled in multi_model_script.js
        // Ensure background is set for this page too
        setRandomBackground();
    }

    const goToMultiModelBtn = document.getElementById('go-to-multi-model-btn');
    if (goToMultiModelBtn) {
        goToMultiModelBtn.addEventListener('click', () => {
            window.location.href = 'multi_model.html';
        });
    }
});

function initializeSingleModelConfig() {
    fetchModels();
    setRandomBackground(); // Call the function to set random background

    const ttsForm = document.getElementById('tts-form');
    ttsForm.addEventListener('submit', handleSynthesize);

    const addVoiceBtn = document.getElementById('add-voice-btn');
    addVoiceBtn.addEventListener('click', addVoiceInput);

    const modelSelect = document.getElementById('model-select');
    modelSelect.addEventListener('change', updateModelAndLanguageOptions);

    // Setup file upload and recording for the main reference audio
    setupFileUploadAndRecording('ref-audio-container', 'ref-audio', 'record-ref-audio-btn', 'ref-audio-timer');

    // Setup file upload for reference text file
    setupTextFileUpload('ref-text-container', 'ref-text-file', 'ref-text');

    // Setup file upload for generated text file
    setupTextFileUpload('gen-text-container', 'gen-text-file', 'gen-text');

    // Check for microphone support and setup recording for dynamically added voice inputs
    checkMicrophoneSupportAndSetupRecording();
}


// Function to setup file upload and recording for a given container
function setupFileUploadAndRecording(containerId, fileInputId, recordButtonId, timerSpanId) {
    const container = document.getElementById(containerId);
    const fileInput = document.getElementById(fileInputId);
    const recordButton = document.getElementById(recordButtonId);
    const timerSpan = document.getElementById(timerSpanId);
    const fileUploadP = container.querySelector('p');

    if (!container || !fileInput || !recordButton || !timerSpan || !fileUploadP) {
        console.error(`Could not find all elements for setupFileUploadAndRecording with containerId: ${containerId}`);
        return;
    }

    // Add drag and drop functionality
    container.addEventListener('dragover', (event) => {
        event.preventDefault();
        container.classList.add('dragover');
    });

    container.addEventListener('dragleave', () => {
        container.classList.remove('dragover');
    });

    container.addEventListener('drop', (event) => {
        event.preventDefault();
        container.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            // Optionally display the selected file name
            const fileName = files[0].name;
            fileUploadP.textContent = `已选择文件: ${fileName}`;
        }
    });

    // Add click to select functionality
    container.addEventListener('click', (event) => {
        // Only trigger file input click if the click wasn't on the record button
        if (event.target !== recordButton) {
            fileInput.click();
        }
    });

    // Update displayed file name when file is selected via click
    fileInput.addEventListener('change', () => {
        const files = fileInput.files;
        if (files.length > 0) {
            const fileName = files[0].name;
            fileUploadP.textContent = `已选择文件: ${fileName}`;
        } else {
             fileUploadP.textContent = `拖放音频文件到此处或点击选择`;
        }
    });

    // Add event listener for the record button
    recordButton.addEventListener('click', (event) => toggleRecording(event, fileInput, timerSpan, fileUploadP));

    // Initial check for microphone support for this specific record button
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        recordButton.disabled = true;
        recordButton.textContent = '录音 (不支持)';
        recordButton.style.backgroundColor = '#ccc';
        timerSpan.textContent = '不支持录音';
        timerSpan.style.display = 'inline';
    } else {
         timerSpan.style.display = 'none'; // Hide timer initially if supported
    }
}

// Function to setup text file upload for a given container
function setupTextFileUpload(containerId, fileInputId, targetElementId) {
    const container = document.getElementById(containerId);
    const fileInput = document.getElementById(fileInputId);
    const targetElement = document.getElementById(targetElementId); // This can be input or textarea
    const pTag = container.querySelector('p');

     if (!container || !fileInput || !targetElement || !pTag) {
        console.error(`Could not find all elements for setupTextFileUpload with containerId: ${containerId}`);
        return;
    }

    container.addEventListener('dragover', (event) => {
        event.preventDefault();
        container.classList.add('dragover');
    });

    container.addEventListener('dragleave', () => {
        container.classList.remove('dragover');
    });

    container.addEventListener('drop', (event) => {
        event.preventDefault();
        container.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            handleTextFileUpload(files[0], targetElement, container);
        }
    });

    container.addEventListener('click', (event) => {
         // Only trigger file input click if the click wasn't on the target element
        if (event.target !== targetElement) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            handleTextFileUpload(files[0], targetElement, container);
        }
    });
}


// Function to check microphone support and setup recording for dynamically added voice inputs
function checkMicrophoneSupportAndSetupRecording() {
     if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const recordButtons = document.querySelectorAll('button[id^="record-"], button[class^="record-"]');
        recordButtons.forEach(button => {
            button.disabled = true;
            button.textContent = '录音 (不支持)';
            button.style.backgroundColor = '#ccc';
        });
        const timerSpans = document.querySelectorAll('span[id$="-timer"], span[class$="-timer"]');
        timerSpans.forEach(span => {
            span.textContent = '不支持录音';
            span.style.display = 'inline';
        });
        alert('您的浏览器不支持麦克风访问功能。录音按钮已禁用。');
    }
}


// Function to toggle recording
async function toggleRecording(event, fileInput, timerSpan, fileUploadP) {
    console.log('toggleRecording called');
    const button = event.target;

    if (button.textContent === '录音') {
        // Start recording
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('浏览器不支持麦克风访问功能。请尝试更新浏览器或使用支持的浏览器。');
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                audioBlob = new Blob(audioChunks, { type: 'audio/wav' }); // Use wav format
                // Create a File object from the Blob
                const recordedFile = new File([audioBlob], 'recorded_audio.wav', { type: 'audio/wav' });

                // Assign the recorded file to the corresponding file input
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(recordedFile);
                fileInput.files = dataTransfer.files;

                // Update the displayed file name
                if (fileUploadP) {
                    fileUploadP.textContent = `已录制文件: recorded_audio.wav`;
                }

                // Convert the recorded audio blob to Base64
                // Store in a global variable or pass back as needed
                window.audioBase64 = await blobToBase64(audioBlob);


                // Stop all tracks in the stream to release the microphone
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            button.textContent = '停止录音';
            button.style.backgroundColor = 'red'; // Indicate recording is active
            recordingStartTime = Date.now();
            timerSpan.style.display = 'inline'; // Show timer
            timerSpan.textContent = '00:00';
            recordingTimer = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                timerSpan.textContent = `${minutes}:${seconds}`;

                if (elapsed >= MAX_RECORDING_TIME) {
                    toggleRecording(event, fileInput, timerSpan, fileUploadP); // Stop recording automatically
                }
            }, 1000);

        } catch (err) {
            console.error('Error accessing microphone:', err);
            let errorMessage = '无法访问麦克风。请确保已授予权限。';
            if (window.location.protocol === 'http:') {
                errorMessage += '\n请注意，在非安全连接 (HTTP) 下，浏览器可能限制麦克风访问。请尝试使用安全连接 (HTTPS)。';
            }
            alert(errorMessage);
        }
    } else {
        // Stop recording
        mediaRecorder.stop();
        button.textContent = '录音';
        button.style.backgroundColor = ''; // Reset button color
        clearInterval(recordingTimer); // Stop timer
        timerSpan.style.display = 'none'; // Hide timer
    }
}

// Function to convert Blob to Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Function to handle text file upload and populate the corresponding text area
function handleTextFileUpload(file, targetElement, containerElement) {
    const reader = new FileReader();
    const pTag = containerElement.querySelector('p');

    reader.onload = (e) => {
        targetElement.value = e.target.result;
        if (pTag) {
            pTag.textContent = `已选择文件: ${file.name}`;
            pTag.style.color = ''; // Reset color
        }
    };

    reader.onerror = () => {
        console.error('Error reading file:', reader.error);
        if (pTag) {
            pTag.textContent = `读取文件失败: ${file.name}`;
            pTag.style.color = 'red'; // Indicate error
        }
        targetElement.value = ''; // Clear text area on error
    };

    // Basic file type validation (optional, as accept=".txt" is in HTML)
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        reader.readAsText(file);
    } else {
        if (pTag) {
            pTag.textContent = `无效的文件类型: ${file.name} (请选择 .txt 文件)`;
            pTag.style.color = 'red'; // Indicate error
        }
        targetElement.value = ''; // Clear text area on error
    }
}


// Function to set a random background image
async function setRandomBackground() {
    try {
        const response = await fetch(`/api/background/random`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const imageUrl = data.url;
        document.body.style.backgroundImage = `url('${imageUrl}')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundAttachment = 'fixed'; // Optional: Fix background
    } catch (error) {
        console.error('Error setting random background:', error);
        // Optionally, set a default background or display an error message
    }
}


async function fetchModels() {
    const modelSelect = document.getElementById('model-select');
    try {
        const response = await fetch(`${API_BASE_URL}/tts/models`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        availableModels = await response.json(); // Store full model data
        // Sort model groups by name
        availableModels.sort((a, b) => a.name.localeCompare(b.name));

        modelSelect.innerHTML = ''; // Clear loading option
        availableModels.forEach(modelGroup => { // Iterate through sorted model groups
            const option = document.createElement('option');
            option.value = modelGroup.name; // Use model group name as value
            option.textContent = modelGroup.name; // Display model group name
            modelSelect.appendChild(option);
        });
        // Trigger language and model options update for the initially selected model group
        updateModelAndLanguageOptions();
    } catch (error) {
        console.error('Error fetching models:', error);
        modelSelect.innerHTML = '<option value="">加载模型失败</option>';
        // Optionally display an error message to the user
    }
}

function updateModelAndLanguageOptions() {
    const modelGroupSelect = document.getElementById('model-select'); // This is now model group select
    const subModelSelect = document.getElementById('sub-model-select'); // Get the new sub-model select
    const languageSelect = document.getElementById('language-select');

    const selectedModelGroupName = modelGroupSelect.value;

    // Find the selected model group in the availableModels array
    const selectedModelGroup = availableModels.find(modelGroup => modelGroup.name === selectedModelGroupName);

    // Update sub-model options
    subModelSelect.innerHTML = ''; // Clear current options
    if (selectedModelGroup && selectedModelGroup.models && selectedModelGroup.models.length > 0) {
        // Sort models within the group by name
        selectedModelGroup.models.sort((a, b) => a.localeCompare(b));
        selectedModelGroup.models.forEach(modelName => {
            const option = document.createElement('option');
            option.value = modelName;
            option.textContent = modelName;
            subModelSelect.appendChild(option);
        });
    } else {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "当前模型组无可用模型";
        subModelSelect.appendChild(option);
        subModelSelect.disabled = true; // Disable if no models
    }
    subModelSelect.disabled = !(selectedModelGroup && selectedModelGroup.models && selectedModelGroup.models.length > 0); // Enable/disable based on models


    // Update language options
    languageSelect.innerHTML = ''; // Clear current options
    const autoOption = document.createElement('option');
    autoOption.value = "";
    autoOption.textContent = "自动检测或使用模型默认";
    languageSelect.appendChild(autoOption);

    if (selectedModelGroup && selectedModelGroup.language) {
        selectedModelGroup.language.forEach(lang => {
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
        <div id="voice-ref-audio-container-${voiceIndex}" class="file-upload-area">
            <label for="voice-ref-audio-${voiceIndex}">参考音频:</label>
            <input type="file" id="voice-ref-audio-${voiceIndex}" class="voice-ref-audio" accept="audio/*" required style="display: none;">
            <p>拖放音频文件到此处或点击选择</p>
            <button type="button" class="record-voice-audio-btn">录音</button>
            <span class="voice-audio-timer" style="margin-left: 10px; display: none;">00:00</span>
        </div>
        <div id="voice-ref-text-container-${voiceIndex}" class="file-upload-area">
            <label for="voice-ref-text-${voiceIndex}">参考文本 (可选):</label>
            <input type="text" class="voice-ref-text">
            <input type="file" id="voice-ref-text-file-${voiceIndex}" class="voice-ref-text-file" accept=".txt" style="display: none;">
            <p>拖放文本文件到此处或点击选择</p>
        </div>
        <button type="button" class="remove-voice-btn">移除音色</button>
        <hr>
    `;
    voicesContainer.appendChild(voiceInputGroup);

    // Setup file upload and recording for the new voice input
    setupFileUploadAndRecording(`voice-ref-audio-container-${voiceIndex}`, `voice-ref-audio-${voiceIndex}`, voiceInputGroup.querySelector('.record-voice-audio-btn').id || `record-voice-audio-btn-${voiceIndex}`, voiceInputGroup.querySelector('.voice-audio-timer').id || `voice-audio-timer-${voiceIndex}`);

    // Setup text file upload for the new voice text input
    setupTextFileUpload(`voice-ref-text-container-${voiceIndex}`, `voice-ref-text-file-${voiceIndex}`, voiceInputGroup.querySelector('.voice-ref-text').id || `voice-ref-text-${voiceIndex}`);


    // Add event listener to the remove button
    voiceInputGroup.querySelector('.remove-voice-btn').addEventListener('click', () => {
        voicesContainer.removeChild(voiceInputGroup);
    });
}


async function handleSynthesize(event) {
    console.log('handleSynthesize called'); // Add this line for debugging
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


    const groupName = document.getElementById('model-select').value; // Get selected model group name
    const refAudioFile = document.getElementById('ref-audio').files[0];
    const refText = document.getElementById('ref-text').value;
    const genText = document.getElementById('gen-text').value;
    const language = document.getElementById('language-select').value; // Get language from select dropdown

    // Find the selected model group
    const selectedModelGroup = availableModels.find(modelGroup => modelGroup.name === groupName);

    const subModelSelect = document.getElementById('sub-model-select');
    const modelName = subModelSelect.value;

    if (!groupName || !modelName || (!refAudioFile && !window.audioBase64) || !genText) {
        alert('请填写所有必需字段 (模型组, 具体模型, 参考音频, 生成文本)');
        loadingIndicator.style.display = 'none'; // Hide loading on validation error
        return;
    }

    // Convert reference audio to Base64 (either from file input or recording)
    let refAudioBase64 = null;
    if (refAudioFile) {
        refAudioBase64 = await fileToBase64(refAudioFile);
    } else if (window.audioBase64) { // Check if global audioBase64 from recording exists
        refAudioBase64 = window.audioBase64;
    }


    const requestBody = {
        group_name: groupName,
        model_name: modelName, // Use the determined modelName
        ref_audio: refAudioBase64, // Use the potentially recorded audio Base64
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

        if (voiceName && (voiceRefAudioInput.files.length > 0 || window.audioBase64)) { // Check if a file is selected (either uploaded or recorded)
            let voiceRefAudioBase64 = null;
            if (voiceRefAudioInput.files.length > 0) {
                 voiceRefAudioBase64 = await fileToBase64(voiceRefAudioInput.files[0]);
            } else if (window.audioBase64) {
                 voiceRefAudioBase64 = window.audioBase64;
            }

            voices[voiceName] = {
                ref_audio: voiceRefAudioBase64,
                ref_text: voiceRefText,
            };
        } else if (voiceName || voiceRefAudioInput.files.length > 0 || window.audioBase64) {
             alert(`请为音色 "${voiceName || (voiceRefAudioInput.files.length > 0 ? voiceRefAudioInput.files[0].name : '录音')}" 提供名称和参考音频.`);
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

        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.detail || JSON.stringify(errorData);
            throw new Error(`API error! status: ${response.status}, Detail: ${errorMessage}`);
        }

        // Check content type to determine how to handle response
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const responseData = await response.json();
            currentRequestId = responseData.request_id;
            const status = responseData.status;

            if (status === "completed") {
                // Request completed immediately, fetch and play audio
                clearInterval(pollingInterval); // Stop polling
                pollingInterval = null;
                loadingIndicator.style.display = 'none'; // Hide loading

                // Make a new request to get the audio data
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
                const position = statusData.position;
                resultDiv.innerHTML = `<h2>生成的语音:</h2><p>您的请求已加入队列，当前排队位置：${position}</p><audio id="audio-player" controls></audio>`;
                // Start polling for status
                pollingInterval = setInterval(() => checkRequestStatus(currentRequestId), 2000); // Poll every 2 seconds

            } else {
                // Unexpected status
                throw new Error(`Unexpected response status: ${status}`);
            }
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

            // Request completed, fetch the audio data
            clearInterval(pollingInterval); // Stop polling
            pollingInterval = null;
            loadingIndicator.style.display = 'none'; // Hide loading

            // The status endpoint for completed requests directly returns the audio data
            const audioBlob = await response.blob(); // Get the response as a Blob
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

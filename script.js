const API_BASE_URL = '/api';

let availableModels = []; // Store fetched models
let currentRequestId = null; // To keep track of the current request ID for polling
let pollingInterval = null; // To store the interval timer for polling

document.addEventListener('DOMContentLoaded', () => {
    fetchModels();
    setRandomBackground(); // Call the function to set random background

    const ttsForm = document.getElementById('tts-form');
    ttsForm.addEventListener('submit', handleSynthesize);

    const addVoiceBtn = document.getElementById('add-voice-btn');
    addVoiceBtn.addEventListener('click', addVoiceInput);

    const modelSelect = document.getElementById('model-select');
    modelSelect.addEventListener('change', updateLanguageOptions);

    // Add drag and drop functionality
    const refAudioContainer = document.getElementById('ref-audio-container');
    const refAudioInput = document.getElementById('ref-audio');

    refAudioContainer.addEventListener('dragover', (event) => {
        event.preventDefault();
        refAudioContainer.classList.add('dragover');
    });

    refAudioContainer.addEventListener('dragleave', () => {
        refAudioContainer.classList.remove('dragover');
    });

    refAudioContainer.addEventListener('drop', (event) => {
        event.preventDefault();
        refAudioContainer.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            refAudioInput.files = files;
            // Optionally display the selected file name
            const fileName = files[0].name;
            const pTag = refAudioContainer.querySelector('p');
            if (pTag) {
                pTag.textContent = `已选择文件: ${fileName}`;
            }
        }
    });

    // Add click to select functionality
    refAudioContainer.addEventListener('click', (event) => {
        // Only trigger file input click if the click wasn't on the record button
        const recordRefAudioBtn = document.getElementById('record-ref-audio-btn');
        if (event.target !== recordRefAudioBtn) {
            refAudioInput.click();
        }
    });

    // Update displayed file name when file is selected via click
    refAudioInput.addEventListener('change', () => {
        const files = refAudioInput.files;
        const pTag = refAudioContainer.querySelector('p');
        if (files.length > 0) {
            const fileName = files[0].name;
            if (pTag) {
                pTag.textContent = `已选择文件: ${fileName}`;
            }
        } else {
             if (pTag) {
                pTag.textContent = `拖放音频文件到此处或点击选择`;
            }
        }
    });

    // Add drag and drop and click to select functionality for reference text file
    const refTextContainer = document.getElementById('ref-text-container');
    const refTextFileInput = document.getElementById('ref-text-file');
    const refTextInput = document.getElementById('ref-text'); // Get reference to the text input

    refTextContainer.addEventListener('dragover', (event) => {
        event.preventDefault();
        refTextContainer.classList.add('dragover');
    });

    refTextContainer.addEventListener('dragleave', () => {
        refTextContainer.classList.remove('dragover');
    });

    refTextContainer.addEventListener('drop', (event) => {
        event.preventDefault();
        refTextContainer.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            handleTextFileUpload(files[0], refTextInput, refTextContainer);
        }
    });

    refTextContainer.addEventListener('click', (event) => {
         // Only trigger file input click if the click wasn't on the text input
        const refTextInput = document.getElementById('ref-text');
        if (event.target !== refTextInput) {
            refTextFileInput.click();
        }
    });

    refTextFileInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            handleTextFileUpload(files[0], refTextInput, refTextContainer);
        }
    });

    // Add drag and drop and click to select functionality for generated text file
    const genTextContainer = document.getElementById('gen-text-container');
    const genTextFileInput = document.getElementById('gen-text-file');
    const genTextInput = document.getElementById('gen-text'); // Get reference to the textarea

    genTextContainer.addEventListener('dragover', (event) => {
        event.preventDefault();
        genTextContainer.classList.add('dragover');
    });

    genTextContainer.addEventListener('dragleave', () => {
        genTextContainer.classList.remove('dragover');
    });

    genTextContainer.addEventListener('drop', (event) => {
        event.preventDefault();
        genTextContainer.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            handleTextFileUpload(files[0], genTextInput, genTextContainer);
        }
    });

    genTextContainer.addEventListener('click', (event) => {
         // Only trigger file input click if the click wasn't on the textarea
        const genTextInput = document.getElementById('gen-text');
        if (event.target !== genTextInput) {
            genTextFileInput.click();
        }
    });

    genTextFileInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            handleTextFileUpload(files[0], genTextInput, genTextContainer);
        }
    });

    // Check for microphone support
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


    // Add event listener for the main reference audio record button
    const recordRefAudioBtn = document.getElementById('record-ref-audio-btn');
    if (recordRefAudioBtn) { // Check if button exists
        recordRefAudioBtn.addEventListener('click', toggleRecording);
    }
});

// Global variables for recording
let mediaRecorder;
let audioChunks = [];
let audioBlob;
let audioBase64;
let recordingTimer;
let recordingStartTime;
const MAX_RECORDING_TIME = 60; // Maximum recording time in seconds

// Function to toggle recording
async function toggleRecording(event) {
    console.log('toggleRecording called'); // Add this line for debugging
    const button = event.target;
    const container = button.closest('.file-upload-area');
    const timerSpan = container.querySelector('span');
    const fileInput = container.querySelector('input[type="file"]');
    const fileUploadP = container.querySelector('p');


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
                audioBase64 = await blobToBase64(audioBlob);

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
                    toggleRecording(event); // Stop recording automatically
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
function handleTextFileUpload(file, targetTextArea, containerElement) {
    const reader = new FileReader();
    const pTag = containerElement.querySelector('p');

    reader.onload = (e) => {
        targetTextArea.value = e.target.result;
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
        targetTextArea.value = ''; // Clear text area on error
    };

    // Basic file type validation (optional, as accept=".txt" is in HTML)
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        reader.readAsText(file);
    } else {
        if (pTag) {
            pTag.textContent = `无效的文件类型: ${file.name} (请选择 .txt 文件)`;
            pTag.style.color = 'red'; // Indicate error
        }
        targetTextArea.value = ''; // Clear text area on error
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

    // Add event listener for the voice audio record button if microphone is supported
    const recordVoiceAudioBtn = voiceInputGroup.querySelector('.record-voice-audio-btn');
     if (recordVoiceAudioBtn && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        recordVoiceAudioBtn.addEventListener('click', toggleRecording);
    } else if (recordVoiceAudioBtn) {
         recordVoiceAudioBtn.disabled = true;
         recordVoiceAudioBtn.textContent = '录音 (不支持)';
         recordVoiceAudioBtn.style.backgroundColor = '#ccc';
         const timerSpan = voiceInputGroup.querySelector('.voice-audio-timer');
         if(timerSpan) {
             timerSpan.textContent = '不支持录音';
             timerSpan.style.display = 'inline';
         }
    }


    // Add drag and drop and click to select functionality to the new voice audio input
    const voiceRefAudioContainer = voiceInputGroup.querySelector(`#voice-ref-audio-container-${voiceIndex}`);
    const voiceRefAudioInput = voiceInputGroup.querySelector(`#voice-ref-audio-${voiceIndex}`);
    // const recordVoiceAudioBtn = voiceInputGroup.querySelector('.record-voice-audio-btn'); // Already defined above

    voiceRefAudioContainer.addEventListener('dragover', (event) => {
        event.preventDefault();
        voiceRefAudioContainer.classList.add('dragover');
    });

    voiceRefAudioContainer.addEventListener('dragleave', () => {
        voiceRefAudioContainer.classList.remove('dragover');
    });

    voiceRefAudioContainer.addEventListener('drop', (event) => {
        event.preventDefault();
        voiceRefAudioContainer.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            voiceRefAudioInput.files = files;
            // Optionally display the selected file name
            const fileName = files[0].name;
            const pTag = voiceRefAudioContainer.querySelector('p');
            if (pTag) {
                pTag.textContent = `已选择文件: ${fileName}`;
            }
        }
    });

    // Add click to select functionality
    voiceRefAudioContainer.addEventListener('click', (event) => {
        // Only trigger file input click if the click wasn't on the record button
        if (event.target !== recordVoiceAudioBtn) {
            voiceRefAudioInput.click();
        }
    });

    // Update displayed file name when file is selected via click
    voiceRefAudioInput.addEventListener('change', () => {
        const files = voiceRefAudioInput.files;
        const pTag = voiceRefAudioContainer.querySelector('p');
        if (files.length > 0) {
            const fileName = files[0].name;
            if (pTag) {
                pTag.textContent = `已选择文件: ${fileName}`;
            }
        } else {
             if (pTag) {
                pTag.textContent = `拖放音频文件到此处或点击选择`;
            }
        }
    });

    // Add event listener for the voice audio record button
    // recordVoiceAudioBtn.addEventListener('click', toggleRecording); // Moved above the drag/drop listeners


    voiceRefAudioContainer.addEventListener('dragleave', () => {
        voiceRefAudioContainer.classList.remove('dragover');
    });

    voiceRefAudioContainer.addEventListener('drop', (event) => {
        event.preventDefault();
        voiceRefAudioContainer.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            voiceRefAudioInput.files = files;
            // Optionally display the selected file name
            const fileName = files[0].name;
            const pTag = voiceRefAudioContainer.querySelector('p');
            if (pTag) {
                pTag.textContent = `已选择文件: ${fileName}`;
            }
        }
    });

    // Add click to select functionality
    voiceRefAudioContainer.addEventListener('click', (event) => {
         // Only trigger file input click if the click wasn't on the record button
        if (event.target !== recordVoiceAudioBtn) {
            voiceRefAudioInput.click();
        }
    });

    // Update displayed file name when file is selected via click
    voiceRefAudioInput.addEventListener('change', () => {
        const files = voiceRefAudioInput.files;
        const pTag = voiceRefAudioContainer.querySelector('p');
        if (files.length > 0) {
            const fileName = files[0].name;
            if (pTag) {
                pTag.textContent = `已选择文件: ${fileName}`;
            }
        } else {
             if (pTag) {
                pTag.textContent = `拖放音频文件到此处或点击选择`;
            }
        }
    });

    // Add drag and drop and click to select functionality to the new voice text file input
    const voiceRefTextContainer = voiceInputGroup.querySelector(`#voice-ref-text-container-${voiceIndex}`);
    const voiceRefTextFileInput = voiceInputGroup.querySelector(`#voice-ref-text-file-${voiceIndex}`);
    const voiceRefTextInput = voiceInputGroup.querySelector(`.voice-ref-text`); // Get reference to the text input

    voiceRefTextContainer.addEventListener('dragover', (event) => {
        event.preventDefault();
        voiceRefTextContainer.classList.add('dragover');
    });

    voiceRefTextContainer.addEventListener('dragleave', () => {
        voiceRefTextContainer.classList.remove('dragover');
    });

    voiceRefTextContainer.addEventListener('drop', (event) => {
        event.preventDefault();
        voiceRefTextContainer.classList.remove('dragover');
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            handleTextFileUpload(files[0], voiceRefTextInput, voiceRefTextContainer);
        }
    });

    voiceRefTextContainer.addEventListener('click', (event) => {
         // Only trigger file input click if the click wasn't on the text input
        if (event.target !== voiceRefTextInput) {
            voiceRefTextFileInput.click();
        }
    });

    voiceRefTextFileInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            handleTextFileUpload(files[0], voiceRefTextInput, voiceRefTextContainer);
        }
    });


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

    // Convert reference audio to Base64 (either from file input or recording)
    let refAudioBase64 = null;
    if (refAudioFile) {
        refAudioBase64 = await fileToBase64(refAudioFile);
    } else if (audioBase64) { // Check if global audioBase64 from recording exists
        refAudioBase64 = audioBase64;
    }


    const requestBody = {
        model_name: modelName,
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

        if (voiceName && voiceRefAudioInput.files.length > 0) { // Check if a file is selected (either uploaded or recorded)
            const voiceRefAudioFile = voiceRefAudioInput.files[0];
            const voiceRefAudioBase64 = await fileToBase64(voiceRefAudioFile);
            voices[voiceName] = {
                ref_audio: voiceRefAudioBase64,
                ref_text: voiceRefText,
            };
        } else if (voiceName || voiceRefAudioInput.files.length > 0) {
             alert(`请为音色 "${voiceName || (voiceRefAudioInput.files.length > 0 ? voiceRefAudioInput.files[0].name : '')}" 提供名称和参考音频.`);
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

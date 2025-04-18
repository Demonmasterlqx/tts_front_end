const API_BASE_URL = '/api';

let availableModels = []; // Store fetched models

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

    // Hide previous result and show loading indicator
    audioPlayer.src = '';
    loadingIndicator.style.display = 'block';

    const modelName = document.getElementById('model-select').value;
    const refAudioFile = document.getElementById('ref-audio').files[0];
    const refText = document.getElementById('ref-text').value;
    const genText = document.getElementById('gen-text').value;
    const language = document.getElementById('language-select').value; // Get language from select dropdown

    if (!modelName || !refAudioFile || !genText) {
        alert('请填写所有必需字段 (模型, 参考音频, 生成文本)');
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
            throw new Error(`HTTP error! status: ${response.status}, Detail: ${JSON.stringify(errorData)}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        audioPlayer.src = audioUrl;
        audioPlayer.play();

    } catch (error) {
        console.error('Error synthesizing speech:', error);
        alert('生成语音失败: ' + error.message);
        audioPlayer.src = ''; // Clear previous audio
    } finally {
        // Hide loading indicator
        loadingIndicator.style.display = 'none';
    }
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

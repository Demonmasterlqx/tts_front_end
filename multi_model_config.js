const MAX_RETRIES = 3;
const POLLING_INTERVAL = 2000;

// Define API base URL if not already defined
if (typeof API_BASE_URL === 'undefined') {
    API_BASE_URL = 'http://127.0.0.1:8000';
    console.log('API_BASE_URL set to default:', API_BASE_URL);
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('multi-model-form')) {
        initializeMultiModelConfig();
    }
});

function initializeMultiModelConfig() {
    console.log('Initializing multi-model configuration page');
    setRandomBackground();
    fetchModelsForConfig();

    const multiModelForm = document.getElementById('multi-model-form');
    multiModelForm.addEventListener('submit', handleMultiModelSynthesize);

    // Setup file upload and recording
    if (typeof setupFileUploadAndRecording === 'function') {
        setupFileUploadAndRecording('ref-audio-container', 'ref-audio', 'record-ref-audio-btn', 'ref-audio-timer');
    }

    if (typeof setupTextFileUpload === 'function') {
        setupTextFileUpload('ref-text-container', 'ref-text-file', 'ref-text');
        setupTextFileUpload('gen-text-container', 'gen-text-file', 'gen-text');
    }

    if (typeof checkMicrophoneSupportAndSetupRecording === 'function') {
        checkMicrophoneSupportAndSetupRecording();
    }
}

async function fetchModelsForConfig() {
    const modelCheckboxesContainer = document.getElementById('model-checkboxes-container');
    modelCheckboxesContainer.innerHTML = '<p>加载模型中...</p>';

    try {
        console.log('Fetching models from:', `${API_BASE_URL}/tts/models`);
        const response = await fetch(`${API_BASE_URL}/tts/models`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        availableModels = await response.json();
        availableModels.sort((a, b) => a.name.localeCompare(b.name));
        displayModelsAsCheckboxes();

    } catch (error) {
        console.error('Error fetching models:', error);
        modelCheckboxesContainer.innerHTML = '<p style="color: red;">加载模型失败</p>';
    }
}

function displayModelsAsCheckboxes() {
    const modelCheckboxesContainer = document.getElementById('model-checkboxes-container');
    modelCheckboxesContainer.innerHTML = '';

    modelCheckboxesContainer.addEventListener('change', (event) => {
        if (event.target.classList.contains('model-checkbox')) {
            const selectedModels = getSelectedModels();
            updateLanguageOptions(selectedModels);
        }
    });

    availableModels.forEach(modelGroup => {
        const groupTable = document.createElement('table');
        groupTable.classList.add('model-table');
        
        const selectAllId = `select-all-${modelGroup.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        groupTable.innerHTML = `
            <caption>
                ${modelGroup.name}
                <input type="checkbox" id="${selectAllId}" class="select-all-group">
                <label for="${selectAllId}">全选</label>
            </caption>
        `;

        if (modelGroup.models && modelGroup.models.length > 0) {
            const models = modelGroup.models.sort((a, b) => a.localeCompare(b));
            const modelsPerRow = 3;
            let row;

            models.forEach((modelName, index) => {
                if (index % modelsPerRow === 0) row = groupTable.insertRow();
                const cell = row.insertCell();
                const modelId = `${modelGroup.name.replace(/[^a-zA-Z0-9]/g, '_')}-${modelName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                cell.innerHTML = `
                    <input type="checkbox" id="${modelId}" class="model-checkbox" data-group="${modelGroup.name}" data-model="${modelName}">
                    <label for="${modelId}">${modelName}</label>
                `;
            });

            const selectAllCheckbox = groupTable.querySelector('.select-all-group');
            selectAllCheckbox.addEventListener('change', (event) => {
                const isChecked = event.target.checked;
                groupTable.querySelectorAll('.model-checkbox').forEach(checkbox => {
                    checkbox.checked = isChecked;
                });
            });
        }

        modelCheckboxesContainer.appendChild(groupTable);
    });
}

function getSelectedModels() {
    return Array.from(document.querySelectorAll('#model-checkboxes-container input[type="checkbox"].model-checkbox:checked'))
        .map(checkbox => ({
            group_name: checkbox.dataset.group,
            model_name: checkbox.dataset.model
        }));
}

function getCommonLanguages(selectedModels) {
    const languageLists = selectedModels.map(model => {
        const modelGroup = availableModels.find(g => g.name === model.group_name);
        return modelGroup?.language || [];
    });
    return languageLists.length > 0 ? languageLists.reduce((a, b) => a.filter(lang => b.includes(lang))) : [];
}

function updateLanguageOptions(selectedModels) {
    const languageSelect = document.getElementById('language-select');
    const commonLanguages = getCommonLanguages(selectedModels);
    
    languageSelect.innerHTML = '';
    commonLanguages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = lang;
        languageSelect.appendChild(option);
    });
    
    if (commonLanguages.length > 0) {
        languageSelect.value = commonLanguages[0];
    }
}

async function handleMultiModelSynthesize(event) {
    event.preventDefault();
    const submitBtn = document.getElementById('start-synthesis-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '处理中...';

    try {
        const modelCheckboxes = document.querySelectorAll('#model-checkboxes-container input[type="checkbox"].model-checkbox:checked');
        const refAudioInput = document.getElementById('ref-audio');
        const refText = document.getElementById('ref-text').value;
        const genText = document.getElementById('gen-text').value;
        const language = document.getElementById('language-select').value;

        if (modelCheckboxes.length === 0) throw new Error('请至少选择一个模型进行合成。');
        if (!language) throw new Error('请选择一种语言。');
        if (!refAudioInput.files[0] && !window.audioBase64) throw new Error('请提供参考音频和生成文本。');

        let refAudioBase64 = null;
        if (refAudioInput.files[0]) {
            refAudioBase64 = await fileToBase64(refAudioInput.files[0]);
        } else if (window.audioBase64) {
            refAudioBase64 = `data:audio/wav;base64,${window.audioBase64}`;
        }

        if (!refAudioBase64 || !genText || genText.trim().length === 0) {
            throw new Error('请提供有效的参考音频和生成文本。');
        }

        const synthesisTasks = Array.from(modelCheckboxes).map(checkbox => ({
            modelName: `${checkbox.dataset.group}/${checkbox.dataset.model}`,
            group_name: checkbox.dataset.group,
            model_name: checkbox.dataset.model,
            ref_audio: refAudioBase64,
            ref_text: refText,
            gen_text: genText,
            language: language || undefined,
            status: 'queued',
            requestId: null,
            retryCount: 0,
            maxRetries: MAX_RETRIES,
            audioBlob: null
        }));

        sessionStorage.setItem('synthesisTasks', JSON.stringify(synthesisTasks));
        window.location.href = 'results.html';

    } catch (error) {
        console.error('Error during synthesis setup:', error);
        alert(error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '开始合成';
    }
}

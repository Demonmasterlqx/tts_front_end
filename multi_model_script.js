const MAX_RETRIES = 3; // Maximum automatic retry attempts
const POLLING_INTERVAL = 2000; // Polling interval in milliseconds (2 seconds)

let synthesisTasks = []; // Array to store information about each synthesis task

document.addEventListener('DOMContentLoaded', () => {
    // Check the current page and initialize accordingly
    if (document.getElementById('multi-model-form')) {
        // This is the multi-model configuration page
        initializeMultiModelConfig();
    } else if (document.getElementById('results-container')) {
        // This is the results page
        initializeResultsPage();
    }
});

function initializeMultiModelConfig() {
    console.log('Initializing multi-model configuration page');
    setRandomBackground(); // Set background for multi-model page
    fetchModelsForConfig();

    const multiModelForm = document.getElementById('multi-model-form');
    multiModelForm.addEventListener('submit', handleMultiModelSynthesize);

    // Call setupFileUploadAndRecording from script.js for the main reference audio
    if (typeof setupFileUploadAndRecording === 'function') {
        setupFileUploadAndRecording('ref-audio-container', 'ref-audio', 'record-ref-audio-btn', 'ref-audio-timer');
    } else {
        console.error("setupFileUploadAndRecording function not found in script.js. File upload and recording for reference audio may not work.");
    }

    // Call setupTextFileUpload from script.js for reference text file
    if (typeof setupTextFileUpload === 'function') {
        setupTextFileUpload('ref-text-container', 'ref-text-file', 'ref-text');
    } else {
        console.error("setupTextFileUpload function not found in script.js. File upload for reference text may not work.");
    }

    // Call setupTextFileUpload from script.js for generated text file
    if (typeof setupTextFileUpload === 'function') {
        setupTextFileUpload('gen-text-container', 'gen-text-file', 'gen-text');
    } else {
        console.error("setupTextFileUpload function not found in script.js. File upload for generated text may not work.");
    }

    // Check for microphone support and setup recording for dynamically added voice inputs
    if (typeof checkMicrophoneSupportAndSetupRecording === 'function') {
        checkMicrophoneSupportAndSetupRecording();
    } else {
        console.error("checkMicrophoneSupportAndSetupRecording function not found in script.js. Recording for voice inputs may not work.");
    }
}

function initializeResultsPage() {
    console.log('Initializing results page');
    // Retrieve synthesis tasks from sessionStorage
    const storedTasks = sessionStorage.getItem('synthesisTasks');
    if (storedTasks) {
        synthesisTasks = JSON.parse(storedTasks);
        displaySynthesisTasks();
        startPolling();
    } else {
        // No tasks found, maybe display an error or redirect back to config
        const resultsContainer = document.getElementById('results-container');
        resultsContainer.innerHTML = '<p>没有找到待处理的语音合成任务。</p>';
    }

    // Add event listener for the download button (will be added dynamically)
    document.getElementById('overall-status').addEventListener('click', (event) => {
        if (event.target.id === 'download-all-btn') {
            downloadAllAudio();
        }
    });

     // Add event listener for manual retry buttons (delegated)
    document.getElementById('results-container').addEventListener('click', (event) => {
        if (event.target.classList.contains('retry-button')) {
            const taskIndex = event.target.dataset.taskIndex;
            if (taskIndex !== undefined) {
                manualRetryTask(parseInt(taskIndex));
            }
        }
    });
}

async function fetchModelsForConfig() {
    const modelCheckboxesContainer = document.getElementById('model-checkboxes-container');
    // Temporarily show loading
    modelCheckboxesContainer.innerHTML = '<p>加载模型中...</p>';

    try {
        if (typeof API_BASE_URL === 'undefined') {
            throw new Error('API_BASE_URL is not defined');
        }
        if (typeof availableModels === 'undefined') {
            availableModels = []; // Initialize if not defined
        }
        
        console.log('Fetching models from:', `${API_BASE_URL}/tts/models`);
        const response = await fetch(`${API_BASE_URL}/tts/models`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        availableModels = await response.json(); // Store full model data
        console.log('Received models data:', JSON.stringify(availableModels, null, 2)); // Debug log with formatted JSON
        
        if (!Array.isArray(availableModels)) {
            throw new Error('Invalid models data format: expected array');
        }

        // Sort model groups by name
        availableModels.sort((a, b) => a.name.localeCompare(b.name));

        // Display models as checkboxes
        displayModelsAsCheckboxes();

    } catch (error) {
        console.error('Error fetching models:', error);
        modelCheckboxesContainer.innerHTML = '<p style="color: red;">加载模型失败</p>';
    }
}

function getCommonLanguages(selectedModels) {
    // Get all selected models' language lists
    const languageLists = selectedModels.map(model => {
        const modelGroup = availableModels.find(g => g.name === model.group_name);
        return modelGroup?.language || [];
    });
    
    // Find intersection of all language lists
    if (languageLists.length === 0) return [];
    return languageLists.reduce((a, b) => a.filter(lang => b.includes(lang)));
}

function updateLanguageOptions(selectedModels) {
    const languageSelect = document.getElementById('language-select');
    const commonLanguages = getCommonLanguages(selectedModels);
    
    // Clear existing options
    languageSelect.innerHTML = '';
    
    // Add common languages
    commonLanguages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = lang;
        languageSelect.appendChild(option);
    });
    
    // Select first language by default if available
    if (commonLanguages.length > 0) {
        languageSelect.value = commonLanguages[0];
    }
}

function displayModelsAsCheckboxes() {
    const modelCheckboxesContainer = document.getElementById('model-checkboxes-container');
    modelCheckboxesContainer.innerHTML = ''; // Clear loading message

    if (!availableModels || availableModels.length === 0) {
        modelCheckboxesContainer.innerHTML = '<p>没有可用模型。</p>';
        return;
    }

    console.log('Displaying models:', availableModels); // Debug log

    // Add event listener for model selection changes
    modelCheckboxesContainer.addEventListener('change', (event) => {
        if (event.target.classList.contains('model-checkbox')) {
            const selectedModels = Array.from(document.querySelectorAll('#model-checkboxes-container input[type="checkbox"].model-checkbox:checked'))
                .map(checkbox => ({
                    group_name: checkbox.dataset.group,
                    model_name: checkbox.dataset.model
                }));
            updateLanguageOptions(selectedModels);
        }
    });

    availableModels.forEach(modelGroup => {
        console.log('Processing model group:', modelGroup); // Debug log
        const groupTable = document.createElement('table');
        groupTable.classList.add('model-table');
        groupTable.innerHTML = `<caption>${modelGroup.name}</caption>`;

        if (modelGroup.models && modelGroup.models.length > 0) {
            // Add caption with select all checkbox
            const selectAllId = `select-all-${modelGroup.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
            groupTable.innerHTML = `
                <caption>
                    ${modelGroup.name}
                    <input type="checkbox" id="${selectAllId}" class="select-all-group">
                    <label for="${selectAllId}">全选</label>
                </caption>
            `;

            const models = modelGroup.models.sort((a, b) => a.localeCompare(b));
            const modelsPerRow = 3; // Number of models per row in the table
            let row;

            models.forEach((modelName, index) => {
                if (index % modelsPerRow === 0) {
                    row = groupTable.insertRow();
                }
                const cell = row.insertCell();
                const modelId = `${modelGroup.name.replace(/[^a-zA-Z0-9]/g, '_')}-${modelName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                cell.innerHTML = `
                    <input type="checkbox" id="${modelId}" class="model-checkbox" data-group="${modelGroup.name}" data-model="${modelName}">
                    <label for="${modelId}">${modelName}</label>
                `;
            });

            // Add event listener for select all checkbox
            const selectAllCheckbox = groupTable.querySelector('.select-all-group');
            selectAllCheckbox.addEventListener('change', (event) => {
                const isChecked = event.target.checked;
                groupTable.querySelectorAll('.model-checkbox').forEach(checkbox => {
                    checkbox.checked = isChecked;
                });
            });

        } else {
            groupTable.innerHTML = `<caption>${modelGroup.name}</caption>`;
            const noModelsRow = groupTable.insertRow();
            const noModelsCell = noModelsRow.insertCell();
            noModelsCell.textContent = "当前模型组无可用模型";
            noModelsCell.colSpan = 3; // Span across columns
        }

        modelCheckboxesContainer.appendChild(groupTable);
    });
}


// Define API base URL if not already defined
if (typeof API_BASE_URL === 'undefined') {
    API_BASE_URL = 'http://127.0.0.1:8000';
    console.log('API_BASE_URL set to default:', API_BASE_URL);
}

async function handleMultiModelSynthesize(event) {
    event.preventDefault();
    console.log('Handling multi-model synthesis form submission');

    // Disable form during submission
    const submitBtn = document.getElementById('start-synthesis-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '处理中...';

    try {
        console.log('Checking API_BASE_URL:', API_BASE_URL);
        
        const modelCheckboxes = document.querySelectorAll('#model-checkboxes-container input[type="checkbox"].model-checkbox:checked');
        const refAudioInput = document.getElementById('ref-audio');
        const refText = document.getElementById('ref-text').value;
        const genText = document.getElementById('gen-text').value;
        const language = document.getElementById('language-select').value;

        console.log('Selected models count:', modelCheckboxes.length);
        console.log('Reference audio:', refAudioInput.files[0] ? 'file selected' : 'using recorded audio');
        console.log('Generated text length:', genText.length);
        console.log('Selected language:', language);

        if (modelCheckboxes.length === 0) {
            throw new Error('请至少选择一个模型进行合成。');
        }
        
        if (!language) {
            throw new Error('请选择一种语言。');
        }

        if (!refAudioInput.files[0] && !window.audioBase64) {
            throw new Error('请提供参考音频和生成文本。');
        }

        // Convert reference audio to Base64
        let refAudioBase64 = null;
        if (refAudioInput.files[0]) {
            if (typeof fileToBase64 === 'function') {
                refAudioBase64 = await fileToBase64(refAudioInput.files[0]);
            } else {
                throw new Error("文件处理功能不可用。");
            }
        } else if (window.audioBase64) {
            refAudioBase64 = `data:audio/wav;base64,${window.audioBase64}`;
        }

        if (!refAudioBase64 || !genText || genText.trim().length === 0) {
            throw new Error('请提供有效的参考音频和生成文本。');
        }

        // Prepare tasks data (without sending requests yet)
        synthesisTasks = Array.from(modelCheckboxes).map(checkbox => ({
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

        // Store tasks and navigate to results page immediately
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

function displaySynthesisTasks() {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = ''; // Clear previous content

    synthesisTasks.forEach((task, index) => {
        const taskElement = document.createElement('div');
        taskElement.classList.add('synthesis-task');
        taskElement.dataset.taskIndex = index; // Store index for manual retry

        let statusHtml = '';
        if (task.status === 'queued') {
            statusHtml = `<span style="color: gray;">排队中...</span>`;
        } else if (task.status === 'processing') {
            statusHtml = `<span style="color: blue;">处理中...</span>`;
        } else if (task.status === 'completed') {
            statusHtml = `<span style="color: green;">已完成</span>`;
        } else if (task.status === 'failed') {
             statusHtml = `<span style="color: orange;">失败 (重试 ${task.retryCount}/${task.maxRetries})</span>`;
        } else if (task.status === 'permanently_failed') {
            statusHtml = `<span style="color: red;">永久失败</span> <button type="button" class="retry-button" data-task-index="${index}">重试</button>`;
        }

        taskElement.innerHTML = `
            <h3>模型: ${task.modelName}</h3>
            <p>状态: ${statusHtml}</p>
            <div class="audio-result">
                <!-- Audio player will be added here if completed -->
            </div>
            <hr>
        `;
        resultsContainer.appendChild(taskElement);

        // If task is completed, display the audio player
        if (task.status === 'completed' && task.audioBlob) {
            displayAudioResult(taskElement, task.audioBlob);
        }
    });

    updateOverallStatus();
}

function updateTaskStatusDisplay(taskIndex) {
    const taskElement = document.querySelector(`.synthesis-task[data-task-index="${taskIndex}"]`);
    if (!taskElement) return;

    const task = synthesisTasks[taskIndex];
    const statusElement = taskElement.querySelector('p');

    let statusHtml = '';
    if (task.status === 'queued') {
        statusHtml = `<span style="color: gray;">排队中...</span>`;
    } else if (task.status === 'processing') {
        statusHtml = `<span style="color: blue;">处理中...</span>`;
    } else if (task.status === 'completed') {
        statusHtml = `<span style="color: green;">已完成</span>`;
        // Add audio player if completed
        if (task.audioBlob && !taskElement.querySelector('audio')) {
             displayAudioResult(taskElement, task.audioBlob);
        }
    } else if (task.status === 'failed') {
         statusHtml = `<span style="color: orange;">失败 (重试 ${task.retryCount}/${task.maxRetries})</span>`;
    } else if (task.status === 'permanently_failed') {
        statusHtml = `<span style="color: red;">永久失败</span> <button type="button" class="retry-button" data-task-index="${taskIndex}">重试</button>`;
    }

    statusElement.innerHTML = `状态: ${statusHtml}`;
    updateOverallStatus();
}

function displayAudioResult(taskElement, audioBlob) {
    const audioResultDiv = taskElement.querySelector('.audio-result');
    audioResultDiv.innerHTML = ''; // Clear previous content

    const audioUrl = URL.createObjectURL(audioBlob);
    const audioPlayer = document.createElement('audio');
    audioPlayer.controls = true;
    audioPlayer.src = audioUrl;
    audioResultDiv.appendChild(audioPlayer);

    // Add download button for individual audio
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = '下载此语音';
    downloadBtn.addEventListener('click', () => {
        const task = synthesisTasks[parseInt(taskElement.dataset.taskIndex)];
        const filename = `${task.modelName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.wav`;
        const a = document.createElement('a');
        a.href = audioUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
    audioResultDiv.appendChild(downloadBtn);
}


function updateOverallStatus() {
    const overallStatusDiv = document.getElementById('overall-status');
    const totalTasks = synthesisTasks.length;
    const completedTasks = synthesisTasks.filter(task => task.status === 'completed').length;
    const failedTasks = synthesisTasks.filter(task => task.status === 'permanently_failed').length;
    const processingTasks = synthesisTasks.filter(task => task.status === 'processing' || task.status === 'queued' || task.status === 'failed').length; // Include failed as still needing attention

    let statusText = `总任务数: ${totalTasks}, 已完成: ${completedTasks}, 失败: ${failedTasks}, 进行中: ${processingTasks}`;

    if (processingTasks === 0 && totalTasks > 0) {
        statusText += " - 所有任务已完成或失败。";
        // Show download all button if there are completed tasks
        if (completedTasks > 0) {
            if (!document.getElementById('download-all-btn')) {
                 const downloadAllBtn = document.createElement('button');
                 downloadAllBtn.id = 'download-all-btn';
                 downloadAllBtn.textContent = '下载所有语音';
                 overallStatusDiv.appendChild(downloadAllBtn);
            }
        } else {
             // Remove download button if no completed tasks
             const downloadAllBtn = document.getElementById('download-all-btn');
             if (downloadAllBtn) {
                 overallStatusDiv.removeChild(downloadAllBtn);
             }
        }
    } else {
         // Remove download button if tasks are still processing
         const downloadAllBtn = document.getElementById('download-all-btn');
         if (downloadAllBtn) {
             overallStatusDiv.removeChild(downloadAllBtn);
         }
    }

    // Update the text content, excluding the download button if it exists
    const textNode = overallStatusDiv.childNodes[0]; // Assuming the text node is the first child
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.nodeValue = statusText;
    } else {
        // If no text node exists, create one
        overallStatusDiv.insertBefore(document.createTextNode(statusText), overallStatusDiv.firstChild);
    }
}


function startPolling() {
    // Clear any existing polling interval
    if (window.pollingInterval) {
        clearInterval(window.pollingInterval);
    }

    // Start polling for tasks that are not completed or permanently failed
    window.pollingInterval = setInterval(async () => {
        const activeTasks = synthesisTasks.filter(task => task.status === 'queued' || task.status === 'processing' || task.status === 'failed');

        if (activeTasks.length === 0) {
            clearInterval(window.pollingInterval); // Stop polling if no active tasks
            window.pollingInterval = null;
            console.log('Polling stopped: No active tasks.');
            return;
        }

        // Process all queued tasks immediately
        for (const task of activeTasks) {
            if (task.status === 'queued') {
                initiateSynthesisTask(task);
            }
        }

        // After processing, update overall status and save to sessionStorage
        updateOverallStatus();
        sessionStorage.setItem('synthesisTasks', JSON.stringify(synthesisTasks.map(task => {
             // Don't store audioBlob in sessionStorage as it can be large
             const { audioBlob, ...taskWithoutBlob } = task;
             return taskWithoutBlob;
        })));

    }, POLLING_INTERVAL);
}

async function initiateSynthesisTask(task) {
    console.log(`Initiating synthesis for model: ${task.modelName}`);
    task.status = 'processing'; // Set status to processing before sending
    updateTaskStatusDisplay(synthesisTasks.indexOf(task)); // Update display

    const requestBody = {
        group_name: task.group_name,
        model_name: task.model_name,
        ref_audio: task.ref_audio,
        ref_text: task.ref_text,
        gen_text: task.gen_text,
        language: task.language
    };

    try {
        const response = await fetch(`${API_BASE_URL}/tts/synthesize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                group_name: task.group_name,
                model_name: task.model_name,
                ref_audio: task.ref_audio,
                ref_text: task.ref_text,
                gen_text: task.gen_text,
                language: task.language
            }),
        });

        console.log("dasdasdadasd")

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorText}`);
        }

        // Get audio blob directly from response
        const audioBlob = await response.blob();
        task.audioBlob = audioBlob;
        task.status = 'completed';
        updateTaskStatusDisplay(synthesisTasks.indexOf(task));
        
    } catch (error) {
        console.error(`Error initiating synthesis for ${task.modelName}:`, error);
        handleTaskFailure(task);
    }
}


function handleTaskFailure(task) {
    task.retryCount++;
    if (task.retryCount <= task.maxRetries) {
        task.status = 'failed'; // Indicate temporary failure and retrying
        console.log(`Task for ${task.modelName} failed, retrying (${task.retryCount}/${task.maxRetries})...`);
        updateTaskStatusDisplay(synthesisTasks.indexOf(task));
        // Automatically retry after a delay
        setTimeout(() => initiateSynthesisTask(task), POLLING_INTERVAL * Math.pow(2, task.retryCount - 1)); // Exponential backoff
    } else {
        task.status = 'permanently_failed';
        console.error(`Task for ${task.modelName} permanently failed after ${task.maxRetries} retries.`);
        updateTaskStatusDisplay(synthesisTasks.indexOf(task));
    }
}

function manualRetryTask(taskIndex) {
    const task = synthesisTasks[taskIndex];
    if (task.status === 'permanently_failed') {
        console.log(`Manually retrying task for model: ${task.modelName}`);
        task.retryCount = 0; // Reset retry count
        task.requestId = null; // Clear previous request ID
        task.audioBlob = null; // Clear previous audio result
        initiateSynthesisTask(task); // Initiate a new synthesis request
    }
}


async function downloadAllAudio() {
    console.log('Downloading all audio...');
    // Ensure JSZip library is loaded
    if (typeof JSZip === 'undefined') {
        console.error('JSZip library not loaded.');
        alert('下载功能所需库未加载，请稍后再试或刷新页面。');
        return;
    }

    const zip = new JSZip();
    const completedTasks = synthesisTasks.filter(task => task.status === 'completed' && task.audioBlob);

    if (completedTasks.length === 0) {
        alert('没有已完成的语音可以下载。');
        return;
    }

    for (const task of completedTasks) {
        const filename = `${task.modelName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.wav`;
        zip.file(filename, task.audioBlob);
    }

    try {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipFilename = `tts_results_${Date.now()}.zip`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(zipBlob);
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log(`Generated and triggered download for ${zipFilename}`);
    } catch (error) {
        console.error('Error generating or downloading zip:', error);
        alert('打包下载失败。');
    }
}

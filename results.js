const MAX_RETRIES = 3;
const POLLING_INTERVAL = 2000;

let synthesisTasks = [];

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('results-container')) {
        initializeResultsPage();
    }
});

function initializeResultsPage() {
    console.log('Initializing results page');
    const storedTasks = sessionStorage.getItem('synthesisTasks');
    if (storedTasks) {
        synthesisTasks = JSON.parse(storedTasks);
        displaySynthesisTasks();
        startPolling();
    } else {
        document.getElementById('results-container').innerHTML = '<p>没有找到待处理的语音合成任务。</p>';
    }

    document.getElementById('overall-status').addEventListener('click', (event) => {
        if (event.target.id === 'download-all-btn') {
            downloadAllAudio();
        }
    });

    document.getElementById('results-container').addEventListener('click', (event) => {
        if (event.target.classList.contains('retry-button')) {
            const taskIndex = event.target.dataset.taskIndex;
            if (taskIndex !== undefined) {
                manualRetryTask(parseInt(taskIndex));
            }
        }
    });
}

function displaySynthesisTasks() {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = '';

    synthesisTasks.forEach((task, index) => {
        const taskElement = document.createElement('div');
        taskElement.classList.add('synthesis-task');
        taskElement.dataset.taskIndex = index;

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
            <div class="audio-result"></div>
            <hr>
        `;
        resultsContainer.appendChild(taskElement);

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
    audioResultDiv.innerHTML = '';

    const audioUrl = URL.createObjectURL(audioBlob);
    const audioPlayer = document.createElement('audio');
    audioPlayer.controls = true;
    audioPlayer.src = audioUrl;
    audioResultDiv.appendChild(audioPlayer);

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
    const processingTasks = synthesisTasks.filter(task => task.status === 'processing' || task.status === 'queued' || task.status === 'failed').length;

    let statusText = `总任务数: ${totalTasks}, 已完成: ${completedTasks}, 失败: ${failedTasks}, 进行中: ${processingTasks}`;

    if (processingTasks === 0 && totalTasks > 0) {
        statusText += " - 所有任务已完成或失败。";
        if (completedTasks > 0 && !document.getElementById('download-all-btn')) {
            const downloadAllBtn = document.createElement('button');
            downloadAllBtn.id = 'download-all-btn';
            downloadAllBtn.textContent = '下载所有语音';
            overallStatusDiv.appendChild(downloadAllBtn);
        }
    } else if (document.getElementById('download-all-btn')) {
        overallStatusDiv.removeChild(document.getElementById('download-all-btn'));
    }

    const textNode = overallStatusDiv.childNodes[0];
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.nodeValue = statusText;
    } else {
        overallStatusDiv.insertBefore(document.createTextNode(statusText), overallStatusDiv.firstChild);
    }
}

function startPolling() {
    if (window.pollingInterval) {
        clearInterval(window.pollingInterval);
    }

    window.pollingInterval = setInterval(async () => {
        const activeTasks = synthesisTasks.filter(task => task.status === 'queued' || task.status === 'processing' || task.status === 'failed');

        if (activeTasks.length === 0) {
            clearInterval(window.pollingInterval);
            window.pollingInterval = null;
            console.log('Polling stopped: No active tasks.');
            return;
        }

        for (const task of activeTasks) {
            if (task.status === 'queued') {
                initiateSynthesisTask(task);
            }
        }

        updateOverallStatus();
        sessionStorage.setItem('synthesisTasks', JSON.stringify(synthesisTasks.map(task => {
            const { audioBlob, ...taskWithoutBlob } = task;
            return taskWithoutBlob;
        })));
    }, POLLING_INTERVAL);
}

async function initiateSynthesisTask(task) {
    console.log(`Initiating synthesis for model: ${task.modelName}`);
    task.status = 'processing';
    updateTaskStatusDisplay(synthesisTasks.indexOf(task));

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
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorText}`);
        }

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
        task.status = 'failed';
        console.log(`Task for ${task.modelName} failed, retrying (${task.retryCount}/${task.maxRetries})...`);
        updateTaskStatusDisplay(synthesisTasks.indexOf(task));
        setTimeout(() => initiateSynthesisTask(task), POLLING_INTERVAL * Math.pow(2, task.retryCount - 1));
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
        task.retryCount = 0;
        task.requestId = null;
        task.audioBlob = null;
        initiateSynthesisTask(task);
    }
}

async function downloadAllAudio() {
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
    } catch (error) {
        console.error('Error generating or downloading zip:', error);
        alert('打包下载失败。');
    }
}

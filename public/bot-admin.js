// public/bot-admin.js
// credits @sinontop | Channel: @mksln

// elements
const configForm = document.getElementById('botConfigForm');
const responseMessage = document.getElementById('responseMessage');
const configListDiv = document.getElementById('configList');

// show (message)
function showAdminMessage(message, isError = false) {
    responseMessage.textContent = message;
    responseMessage.className = 'message';
    responseMessage.classList.add(isError ? 'error' : 'success');
    responseMessage.style.display = 'block';
    setTimeout(() => {
        responseMessage.style.display = 'none';
    }, 5000);
}

// fetch (configs)
async function fetchAdminConfigs() {
    try {
        const response = await fetch('/api/bot-configs');
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        const configs = await response.json();
        renderAdminConfigs(configs);
    } catch (error) {
        console.error('Fetch configs error:', error);
        configListDiv.innerHTML = '<p style="color: #ffb3b3;">Failed to load configurations.</p>';
    }
}

// render (configs)
function renderAdminConfigs(configs) {
    configListDiv.innerHTML = '';
    if (configs.length === 0) {
        configListDiv.innerHTML = '<p>No bot configurations found.</p>';
        return;
    }
    configs.forEach(config => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'config-item';
        const tokenDisplay = config.token || 'N/A'; // Already masked by server
        itemDiv.innerHTML = `
            <span><strong>ID:</strong> ${config.id} | <strong>Token:</strong> ${tokenDisplay} | <strong>Enabled:</strong> ${config.enabled}</span>
            <button class="delete-btn" data-id="${config.id}">Delete</button>
        `;
        configListDiv.appendChild(itemDiv);
    });

    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const botId = event.target.dataset.id;
            if (confirm(`Delete configuration for bot ID: ${botId}?`)) {
                await deleteAdminConfig(botId);
            }
        });
    });
}

// delete (config)
async function deleteAdminConfig(botId) {
    try {
        const response = await fetch(`/api/bot-configs/${botId}`, {
            method: 'DELETE',
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Failed to delete.');
        }
        showAdminMessage(result.message || 'Deleted successfully.');
        fetchAdminConfigs();
    } catch (error) {
        console.error('Delete config error:', error);
        showAdminMessage(error.message, true);
    }
}

// event (form submit)
configForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(configForm);
    const data = {
        id: formData.get('botId').trim(),
        token: formData.get('botToken').trim(),
        channelIds: formData.get('channelIds').split(',').map(id => id.trim()).filter(id => id),
        enabled: true
    };

    if (!data.id || !data.token || data.channelIds.length === 0) {
        showAdminMessage('ID, Token, and Channel IDs are required.', true);
        return;
    }

    try {
        const response = await fetch('/api/bot-configs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Failed to save.');
        }
        showAdminMessage(result.message || 'Saved successfully!');
        configForm.reset();
        fetchAdminConfigs();
    } catch (error) {
        console.error('Submit error:', error);
        showAdminMessage(error.message, true);
    }
});

// initial
document.addEventListener('DOMContentLoaded', fetchAdminConfigs);

// skipped.js
import * as Const from '../common/constants.js';

document.addEventListener('DOMContentLoaded', async () => {
    const skippedList = document.getElementById('skipped-list');
    const specialUrlSection = document.getElementById('special-url-section');
    const specialUrlList = document.getElementById('special-url-list');
    const toggleSpecialUrlBtn = document.getElementById('toggle-special-url');
    const specialUrlContent = document.getElementById('special-url-content');
    const backBtn = document.getElementById('back-to-options');

    backBtn.addEventListener('click', () => {
        window.location.href = 'options.html';
    });

    // Toggle special URL section
    toggleSpecialUrlBtn.addEventListener('click', () => {
        const isVisible = specialUrlContent.classList.contains('visible');

        if (isVisible) {
            specialUrlContent.classList.remove('visible');
            specialUrlContent.classList.add('hidden');
        } else {
            specialUrlContent.classList.remove('hidden');
            specialUrlContent.classList.add('visible');
        }

        const toggleIcon = toggleSpecialUrlBtn.querySelector('.toggle-icon');
        const toggleText = toggleSpecialUrlBtn.querySelector('.toggle-text');

        if (isVisible) {
            toggleIcon.textContent = '▼';
            toggleText.textContent = 'Show';
        } else {
            toggleIcon.textContent = '▲';
            toggleText.textContent = 'Hide';
        }
    });

    function renderSkippedTabs(tabs) {
        if (!tabs || tabs.length === 0) {
            skippedList.innerHTML = '<div class="md-card"><p>No skipped tabs found.</p></div>';
            return;
        }

        // Separate special URL tabs from regular tabs
        const specialUrlTabs = tabs.filter(tab => tab.reason && tab.reason === 'special url');
        const regularTabs = tabs.filter(tab => !tab.reason || tab.reason !== 'special url');

        // Show special URL section if we have special URL tabs, but keep content hidden by default
        if (specialUrlTabs.length > 0) {
            specialUrlSection.classList.remove('hidden');
            specialUrlSection.classList.add('visible');
            renderSpecialUrlTabs(specialUrlTabs);
            // Keep content hidden by default
            specialUrlContent.classList.remove('visible');
            specialUrlContent.classList.add('hidden');
            // Update button text to show it's collapsed
            const toggleIcon = toggleSpecialUrlBtn.querySelector('.toggle-icon');
            const toggleText = toggleSpecialUrlBtn.querySelector('.toggle-text');
            toggleIcon.textContent = '▼';
            toggleText.textContent = 'Show';
        } else {
            specialUrlSection.classList.remove('visible');
            specialUrlSection.classList.add('hidden');
        }

        // Render regular tabs
        skippedList.innerHTML = '';
        if (regularTabs.length === 0) {
            skippedList.innerHTML = '<div class="md-card"><p>No regular skipped tabs found.</p></div>';
            return;
        }

        regularTabs.forEach(tab => {
            const isHttp = tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'));
            const row = document.createElement('div');
            row.className = 'skipped-tab-row md-card';

            // Suspend button (only for http(s))
            let btnHtml = '';
            if (isHttp) {
                btnHtml = `<button class="md-button compact suspend-btn" data-tabid="${tab.tabId}" title="Suspend this tab">Suspend</button>`;
            }

            row.innerHTML = `
                ${btnHtml}
                <div class="skipped-tab-info">
                    <div class="skipped-tab-title">${escapeHtml(tab.title || 'Untitled')}</div>
                    <div class="skipped-tab-url">${escapeHtml(tab.url || '')}</div>
                    <div class="skipped-tab-reason"><strong>Reason:</strong> ${escapeHtml(tab.reason || 'Unknown')}</div>
                </div>
            `;
            skippedList.appendChild(row);
        });

        // Add suspend button handlers
        document.querySelectorAll('.suspend-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tabId = Number(btn.getAttribute('data-tabid'));
                btn.disabled = true;
                btn.textContent = '...';
                try {
                    await new Promise((resolve) => chrome.runtime.sendMessage({ type: Const.MSG_SUSPEND_TAB, tabId, isManual: true }, resolve));
                    btn.textContent = '✔️';
                } catch (err) {
                    btn.textContent = '✖️';
                }
            });
        });
    }

    function renderSpecialUrlTabs(tabs) {
        specialUrlList.innerHTML = '';
        tabs.forEach(tab => {
            const row = document.createElement('div');
            row.className = 'skipped-tab-row md-card special-url-tab';
            row.innerHTML = `
                <div class="skipped-tab-info">
                    <div class="skipped-tab-title">${escapeHtml(tab.title || 'Untitled')}</div>
                    <div class="skipped-tab-url">${escapeHtml(tab.url || '')}</div>
                    <div class="skipped-tab-reason"><strong>Reason:</strong> ${escapeHtml(tab.reason || 'Unknown')}</div>
                </div>
            `;
            specialUrlList.appendChild(row);
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Fetch skipped tabs from background
    chrome.runtime.sendMessage({ type: Const.MSG_GET_SKIPPED_TABS }, (resp) => {
        if (chrome.runtime.lastError) {
            console.error('Error sending MSG_GET_SKIPPED_TABS:', chrome.runtime.lastError);
            skippedList.innerHTML = '<div class="md-card"><p>Error loading skipped tabs (CSP or messaging error).</p></div>';
            return;
        }
        if (resp && resp.success) {
            renderSkippedTabs(resp.skippedTabs);
        } else {
            console.error('Error loading skipped tabs:', resp);
            skippedList.innerHTML = '<div class="md-card"><p>Error loading skipped tabs (no data from background).</p></div>';
        }
    });
});

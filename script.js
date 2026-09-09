// ─── Data Management ──────────────────────────────────────────────
const STORAGE_KEY = 'studyHubData';

function getDefaultData() {
    return {
        files: [],
        habits: [],
        notices: [],
        notes: [],
        history: [],
        searches: [],
        lastReset: null,
    };
}

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            const def = getDefaultData();
            for (let key in def) {
                if (!(key in data)) data[key] = def[key];
            }
            return data;
        }
    } catch (e) { /* ignore */ }
    return getDefaultData();
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function resetDailyIfNeeded(data) {
    const today = new Date().toISOString().slice(0,10);
    if (data.lastReset !== today) {
        data.lastReset = today;
        saveData(data);
    }
}

function addActivity(data, type, description) {
    const now = new Date();
    data.history.push({
        type,
        description,
        date: now.toISOString().slice(0,10),
        timestamp: now.getTime(),
    });
    if (data.history.length > 500) data.history.splice(0, data.history.length - 500);
    saveData(data);
    return data;
}

// ─── File Functions ───────────────────────────────────────────────
function addFile(data, file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            data.files.push({
                name: file.name,
                size: file.size,
                data: e.target.result,
                date: new Date().toISOString(),
            });
            addActivity(data, 'file', `Uploaded "${file.name}"`);
            saveData(data);
            resolve(data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function deleteAllFiles(data) {
    data.files = [];
    addActivity(data, 'delete', 'Deleted all files');
    saveData(data);
    return data;
}

// ─── Habit Functions ──────────────────────────────────────────────
function addHabit(data, text) {
    data.habits.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
        text: text.trim(),
        completedDates: [],
    });
    addActivity(data, 'habit_add', `Created habit: "${text}"`);
    saveData(data);
    return data;
}

function completeHabit(data, habitId) {
    const habit = data.habits.find(h => h.id === habitId);
    if (!habit) return data;
    const today = new Date().toISOString().slice(0,10);
    if (!habit.completedDates.includes(today)) {
        habit.completedDates.push(today);
        addActivity(data, 'habit_complete', `Completed habit: "${habit.text}"`);
        saveData(data);
    }
    return data;
}

function deleteAllHabits(data) {
    data.habits = [];
    addActivity(data, 'delete', 'Deleted all habits');
    saveData(data);
    return data;
}

// ─── Notice Functions ─────────────────────────────────────────────
function addNotice(data, text) {
    data.notices.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
        text: text.trim(),
        date: new Date().toISOString(),
    });
    addActivity(data, 'notice_add', `Added notice: "${text}"`);
    saveData(data);
    return data;
}

function deleteAllNotices(data) {
    data.notices = [];
    addActivity(data, 'delete', 'Deleted all notices');
    saveData(data);
    return data;
}

// ─── Note Functions ───────────────────────────────────────────────
function addNote(data, text) {
    data.notes.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
        text: text.trim(),
        date: new Date().toISOString(),
    });
    addActivity(data, 'note_add', `Added note: "${text}"`);
    saveData(data);
    return data;
}

function deleteAllNotes(data) {
    data.notes = [];
    addActivity(data, 'delete', 'Deleted all notes');
    saveData(data);
    return data;
}

// ─── Search ──────────────────────────────────────────────────────
function logSearch(data, query) {
    data.searches.push({ query: query.trim(), date: new Date().toISOString() });
    addActivity(data, 'search', `Searched: "${query}"`);
    saveData(data);
    return data;
}

// ─── Clock ────────────────────────────────────────────────────────
let clockMode = 'digital';
let clockInterval = null;

function initClock() {
    const digital = document.getElementById('digitalClock');
    const analog = document.getElementById('analogClock');
    const toggle = document.getElementById('clockToggleBtn');
    const dateEl = document.getElementById('clockDate');

    if (!digital || !analog || !toggle) return;

    digital.classList.add('active');
    analog.classList.remove('active');
    toggle.textContent = '⏰ Switch to Analog';

    function updateClock() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2,'0');
        const m = String(now.getMinutes()).padStart(2,'0');
        const s = String(now.getSeconds()).padStart(2,'0');
        digital.textContent = `${h}:${m}:${s}`;

        const canvas = document.getElementById('analogCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const w = canvas.width, hc = canvas.height;
            ctx.clearRect(0, 0, w, hc);
            ctx.beginPath();
            ctx.arc(w/2, hc/2, w/2 - 4, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fill();
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 2;
            ctx.stroke();

            for (let i = 0; i < 12; i++) {
                const angle = (i * 30 - 90) * Math.PI / 180;
                const len = w/2 - 14;
                const x1 = w/2 + len * Math.cos(angle);
                const y1 = hc/2 + len * Math.sin(angle);
                const x2 = w/2 + (w/2 - 6) * Math.cos(angle);
                const y2 = hc/2 + (w/2 - 6) * Math.sin(angle);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = i % 3 === 0 ? 3 : 1.5;
                ctx.stroke();
            }

            const secAngle = (now.getSeconds() * 6 - 90) * Math.PI / 180;
            const minAngle = ((now.getMinutes() + now.getSeconds()/60) * 6 - 90) * Math.PI / 180;
            const hourAngle = ((now.getHours() % 12 + now.getMinutes()/60) * 30 - 90) * Math.PI / 180;

            function drawHand(angle, length, color, width) {
                ctx.beginPath();
                ctx.moveTo(w/2, hc/2);
                ctx.lineTo(w/2 + length * Math.cos(angle), hc/2 + length * Math.sin(angle));
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.stroke();
            }
            drawHand(hourAngle, w/2 * 0.5, '#f472b6', 5);
            drawHand(minAngle, w/2 * 0.7, '#6ee7b7', 3);
            drawHand(secAngle, w/2 * 0.8, '#fca5a5', 1.5);

            ctx.beginPath();
            ctx.arc(w/2, hc/2, 4, 0, 2*Math.PI);
            ctx.fillStyle = '#c084fc';
            ctx.fill();
        }

        dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }

    updateClock();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(updateClock, 1000);

    toggle.addEventListener('click', function() {
        if (clockMode === 'digital') {
            clockMode = 'analog';
            digital.classList.remove('active');
            analog.classList.add('active');
            this.textContent = '⏰ Switch to Digital';
        } else {
            clockMode = 'digital';
            digital.classList.add('active');
            analog.classList.remove('active');
            this.textContent = '⏰ Switch to Analog';
        }
        updateClock();
    });
}

// ─── Dashboard Render ─────────────────────────────────────────────
function renderDashboard() {
    const data = loadData();
    resetDailyIfNeeded(data);
    const today = new Date().toISOString().slice(0,10);
    document.getElementById('todayDate').textContent = today;

    const todaySearches = data.searches.filter(s => s.date.startsWith(today)).length;
    const todayFiles = data.files.filter(f => f.date && f.date.startsWith(today)).length;
    const todayTasks = data.history.filter(h => h.date === today && h.type === 'habit_complete').length;

    let streak = 0;
    if (data.habits.length > 0) {
        const allDates = new Set();
        data.habits.forEach(h => h.completedDates.forEach(d => allDates.add(d)));
        const sorted = Array.from(allDates).sort();
        if (sorted.length > 0) {
            let current = 1, maxStreak = 1;
            for (let i = 1; i < sorted.length; i++) {
                const prev = new Date(sorted[i-1]);
                const curr = new Date(sorted[i]);
                const diff = (curr - prev) / (1000*60*60*24);
                if (diff === 1) { current++; maxStreak = Math.max(maxStreak, current); }
                else { current = 1; }
            }
            streak = maxStreak;
        }
    }
    document.getElementById('statSearches').textContent = todaySearches;
    document.getElementById('statFiles').textContent = data.files.length;
    document.getElementById('statTasks').textContent = todayTasks;
    document.getElementById('statStreak').textContent = streak;

    // Today Activity
    const todayActs = data.history.filter(h => h.date === today);
    const todayContainer = document.getElementById('todayActivity');
    if (todayActs.length === 0) {
        todayContainer.innerHTML = '<p class="empty-state">No activity recorded <span class="hl-purple">today</span> yet.</p>';
    } else {
        todayContainer.innerHTML = todayActs.slice().reverse().map(h =>
            `<div class="activity-item"><span>${h.description}</span><span class="time">${new Date(h.timestamp).toLocaleTimeString()}</span></div>`
        ).join('');
    }
    document.getElementById('todayCount').textContent = todayActs.length;

    // All History
    const allHist = data.history;
    const historyContainer = document.getElementById('historyActivity');
    if (allHist.length === 0) {
        historyContainer.innerHTML = '<p class="empty-state">No history <span class="hl-purple">recorded</span> yet.</p>';
    } else {
        historyContainer.innerHTML = allHist.slice().reverse().map(h =>
            `<div class="activity-item"><span>${h.description}</span><span class="time">${h.date}</span></div>`
        ).join('');
    }
    document.getElementById('historyCount').textContent = allHist.length;

    // Setup delete buttons (they are in the HTML)
}

// ─── Delete History Functions ─────────────────────────────────────
function deleteTodayHistory() {
    if (!confirm('Delete all activity for today?')) return;
    const data = loadData();
    const today = new Date().toISOString().slice(0,10);
    data.history = data.history.filter(h => h.date !== today);
    saveData(data);
    renderDashboard();
}

function deleteAllHistory() {
    if (!confirm('Delete ALL history entries? This cannot be undone.')) return;
    const data = loadData();
    data.history = [];
    saveData(data);
    renderDashboard();
}

// ─── AI Recommendation ────────────────────────────────────────────
function setupAIRecommendation() {
    const btn = document.getElementById('aiRecommendBtn');
    if (!btn) return;
    const input = document.getElementById('aiQueryInput');
    const result = document.getElementById('aiRecommendResult');

    const recMap = {
        math: 'DeepSeek or Wolfram Alpha',
        calculus: 'DeepSeek or Wolfram Alpha',
        algebra: 'DeepSeek',
        code: 'Cursor',
        programming: 'Cursor',
        coding: 'Cursor',
        write: 'ChatGPT or Claude',
        writing: 'ChatGPT or Claude',
        essay: 'ChatGPT or Claude',
        research: 'Perplexity or Claude',
        data: 'Claude or Perplexity',
        analysis: 'Claude',
        design: 'Midjourney or Gamma',
        image: 'Midjourney',
        language: 'Duolingo',
        learn: 'Duolingo or Notion AI',
        note: 'Notion AI',
        presentation: 'Gamma',
        physics: 'Wolfram Alpha',
        stem: 'Wolfram Alpha',
    };

    btn.addEventListener('click', function() {
        const query = input.value.trim().toLowerCase();
        if (!query) { result.textContent = 'Please describe what you need help with.'; return; }
        let found = false;
        let rec = 'I recommend ';
        for (let key in recMap) {
            if (query.includes(key)) { rec += recMap[key]; found = true; break; }
        }
        if (!found) rec += 'ChatGPT – it’s a great all‑rounder for most tasks.';
        result.textContent = rec;
        const data = loadData();
        addActivity(data, 'ai_recommend', `AI recommendation for: "${query}"`);
    });
}

// ─── File Upload ──────────────────────────────────────────────────
function setupFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    if (!uploadArea) return;

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = '#c084fc'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = 'rgba(192,132,252,0.2)'; });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'rgba(192,132,252,0.2)';
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => {
        handleFiles(fileInput.files);
        fileInput.value = '';
    });

    async function handleFiles(files) {
        let data = loadData();
        for (let file of files) {
            try { data = await addFile(data, file); } catch (e) { console.error(e); }
        }
        renderFileList();
        if (document.getElementById('statFiles')) renderDashboard();
    }

    const delBtn = document.getElementById('deleteAllFilesBtn');
    if (delBtn) {
        delBtn.addEventListener('click', () => {
            if (confirm('Delete all files?')) {
                let data = loadData();
                data = deleteAllFiles(data);
                renderFileList();
                if (document.getElementById('statFiles')) renderDashboard();
            }
        });
    }
}

function renderFileList() {
    const container = document.getElementById('fileList');
    if (!container) return;
    const data = loadData();
    if (data.files.length === 0) {
        container.innerHTML = '<p class="empty-state">No files <span class="hl-purple">uploaded</span> yet.</p>';
        return;
    }
    container.innerHTML = data.files.map((f, idx) => {
        // Create a data URL for opening
        const fileData = f.data; // base64
        return `<div class="file-item">
            <a href="${fileData}" target="_blank" class="file-name">📄 ${f.name}</a>
            <span class="file-size">${(f.size/1024).toFixed(1)} KB</span>
        </div>`;
    }).join('');
}

// ─── Habits ──────────────────────────────────────────────────────
function setupHabits() {
    const input = document.getElementById('habitInput');
    const addBtn = document.getElementById('addHabitBtn');
    const list = document.getElementById('habitList');
    const delBtn = document.getElementById('deleteAllHabitsBtn');
    const streakDisplay = document.getElementById('streakDisplay');

    function renderHabits() {
        const data = loadData();
        if (data.habits.length === 0) {
            list.innerHTML = '<p class="empty-state">No habits yet. <span class="hl-purple">Add</span> one above!</p>';
        } else {
            const today = new Date().toISOString().slice(0,10);
            list.innerHTML = data.habits.map(h => {
                const done = h.completedDates.includes(today);
                return `<div class="habit-item">
                    <span class="habit-text">${h.text} ${done ? '✅' : ''}</span>
                    <div class="habit-actions">
                        <button class="complete-btn ${done ? 'done' : ''}" data-id="${h.id}">${done ? 'Done' : 'Complete'}</button>
                    </div>
                </div>`;
            }).join('');
            list.querySelectorAll('.complete-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = this.dataset.id;
                    let data = loadData();
                    data = completeHabit(data, id);
                    renderHabits();
                    updateStreak();
                    if (document.getElementById('statTasks')) renderDashboard();
                });
            });
        }
        updateStreak();
    }

    function updateStreak() {
        const data = loadData();
        let streak = 0;
        if (data.habits.length > 0) {
            const allDates = new Set();
            data.habits.forEach(h => h.completedDates.forEach(d => allDates.add(d)));
            const sorted = Array.from(allDates).sort();
            if (sorted.length > 0) {
                let current = 1, maxStreak = 1;
                for (let i = 1; i < sorted.length; i++) {
                    const prev = new Date(sorted[i-1]);
                    const curr = new Date(sorted[i]);
                    const diff = (curr - prev) / (1000*60*60*24);
                    if (diff === 1) { current++; maxStreak = Math.max(maxStreak, current); }
                    else { current = 1; }
                }
                streak = maxStreak;
            }
        }
        if (streakDisplay) streakDisplay.textContent = streak;
    }

    addBtn.addEventListener('click', function() {
        const text = input.value.trim();
        if (!text) return;
        let data = loadData();
        data = addHabit(data, text);
        input.value = '';
        renderHabits();
        if (document.getElementById('statTasks')) renderDashboard();
    });
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') addBtn.click(); });
    delBtn.addEventListener('click', function() {
        if (confirm('Delete all habits?')) {
            let data = loadData();
            data = deleteAllHabits(data);
            renderHabits();
            if (document.getElementById('statTasks')) renderDashboard();
        }
    });
    renderHabits();
}

// ─── Notice ──────────────────────────────────────────────────────
function setupNotice() {
    const input = document.getElementById('noticeInput');
    const addBtn = document.getElementById('addNoticeBtn');
    const list = document.getElementById('noticeList');
    const delBtn = document.getElementById('deleteAllNoticesBtn');
    const countEl = document.getElementById('noticeCount');

    function renderNotices() {
        const data = loadData();
        if (data.notices.length === 0) {
            list.innerHTML = '<p class="empty-state">No notices <span class="hl-purple">pinned</span> yet.</p>';
        } else {
            list.innerHTML = data.notices.map(n =>
                `<div class="notice-item"><span>${n.text}</span><span class="time">${new Date(n.date).toLocaleDateString()}</span></div>`
            ).join('');
        }
        if (countEl) countEl.textContent = data.notices.length + ' notices';
    }

    addBtn.addEventListener('click', function() {
        const text = input.value.trim();
        if (!text) return;
        let data = loadData();
        data = addNotice(data, text);
        input.value = '';
        renderNotices();
        if (document.getElementById('statTasks')) renderDashboard();
    });
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') addBtn.click(); });
    delBtn.addEventListener('click', function() {
        if (confirm('Delete all notices?')) {
            let data = loadData();
            data = deleteAllNotices(data);
            renderNotices();
            if (document.getElementById('statTasks')) renderDashboard();
        }
    });
    renderNotices();
}

// ─── Notes ──────────────────────────────────────────────────────
function setupNotes() {
    const input = document.getElementById('noteInput');
    const addBtn = document.getElementById('addNoteBtn');
    const list = document.getElementById('noteList');
    const delBtn = document.getElementById('deleteAllNotesBtn');

    function renderNotes() {
        const data = loadData();
        if (data.notes.length === 0) {
            list.innerHTML = '<p class="empty-state">No notes yet.</p>';
        } else {
            list.innerHTML = data.notes.map(n =>
                `<div class="note-item"><span>${n.text}</span><span class="time">${new Date(n.date).toLocaleDateString()}</span></div>`
            ).join('');
        }
    }

    addBtn.addEventListener('click', function() {
        const text = input.value.trim();
        if (!text) return;
        let data = loadData();
        data = addNote(data, text);
        input.value = '';
        renderNotes();
        if (document.getElementById('statTasks')) renderDashboard();
    });
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') addBtn.click(); });
    delBtn.addEventListener('click', function() {
        if (confirm('Delete all notes?')) {
            let data = loadData();
            data = deleteAllNotes(data);
            renderNotes();
            if (document.getElementById('statTasks')) renderDashboard();
        }
    });
    renderNotes();
}

// ─── Search with Suggestions & Keyboard ─────────────────────────
function setupSearch() {
    const input = document.getElementById('searchInput');
    const btn = document.getElementById('searchBtn');
    const suggestionsList = document.getElementById('suggestionsList');
    const keyboardToggle = document.getElementById('keyboardToggle');
    const keyboardContainer = document.getElementById('keyboardContainer');

    if (!input || !btn) return;

    // ── Suggestions ──
    function updateSuggestions(query) {
        const data = loadData();
        const matches = data.searches
            .map(s => s.query)
            .filter((q, i, self) => self.indexOf(q) === i) // unique
            .filter(q => q.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8);

        if (query.length === 0 || matches.length === 0) {
            suggestionsList.classList.remove('active');
            return;
        }
        suggestionsList.innerHTML = matches.map(q =>
            `<div class="suggestion-item" data-query="${q}">${q}</div>`
        ).join('');
        suggestionsList.classList.add('active');

        // Click suggestion
        suggestionsList.querySelectorAll('.suggestion-item').forEach(el => {
            el.addEventListener('click', function() {
                const val = this.dataset.query;
                input.value = val;
                suggestionsList.classList.remove('active');
                performSearch(val);
            });
        });
    }

    input.addEventListener('input', function() {
        updateSuggestions(this.value);
    });

    // Close suggestions on blur (with delay to allow click)
    input.addEventListener('blur', function() {
        setTimeout(() => suggestionsList.classList.remove('active'), 200);
    });

    // ── Search execution ──
    function performSearch(query) {
        if (!query) return;
        let data = loadData();
        data = logSearch(data, query);
        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
        input.value = '';
        suggestionsList.classList.remove('active');
        if (document.getElementById('statSearches')) renderDashboard();
    }

    btn.addEventListener('click', function() {
        performSearch(input.value.trim());
    });
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch(input.value.trim());
        }
    });

    // ── On‑Screen Keyboard ──
    if (keyboardToggle && keyboardContainer) {
        keyboardToggle.addEventListener('click', function() {
            keyboardContainer.classList.toggle('active');
            this.textContent = keyboardContainer.classList.contains('active') ? '⌨️ Hide Keyboard' : '⌨️ Show Keyboard';
        });

        // Build keyboard rows
        const rows = [
            ['1','2','3','4','5','6','7','8','9','0','Backspace'],
            ['q','w','e','r','t','y','u','i','o','p'],
            ['a','s','d','f','g','h','j','k','l'],
            ['z','x','c','v','b','n','m',',','.','?'],
            ['Space']
        ];

        rows.forEach(rowKeys => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'keyboard-row';
            rowKeys.forEach(key => {
                const btn = document.createElement('button');
                btn.className = 'key-btn';
                if (key === 'Backspace' || key === 'Space') btn.classList.add('special');
                if (key === 'Space') btn.classList.add('space');
                btn.textContent = key === 'Space' ? '␣' : key;
                btn.dataset.key = key;
                rowDiv.appendChild(btn);
            });
            keyboardContainer.appendChild(rowDiv);
        });

        // Handle key clicks
        keyboardContainer.addEventListener('click', function(e) {
            const target = e.target.closest('.key-btn');
            if (!target) return;
            const key = target.dataset.key;
            const input = document.getElementById('searchInput');
            if (!input) return;

            if (key === 'Backspace') {
                input.value = input.value.slice(0, -1);
            } else if (key === 'Space') {
                input.value += ' ';
            } else {
                input.value += key;
            }
            // Trigger input event for suggestions
            input.dispatchEvent(new Event('input'));
            input.focus();
        });
    }
}

// ─── Nav Date ──────────────────────────────────────────────────────
function updateNavDate() {
    const el = document.getElementById('navDate');
    if (el) {
        el.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
}

// ─── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    updateNavDate();
    initClock();

    const path = window.location.pathname.split('/').pop() || 'index.html';

    if (path === 'index.html' || path === '') {
        renderDashboard();
        // Setup delete buttons
        const delToday = document.getElementById('deleteTodayBtn');
        const delAll = document.getElementById('deleteAllBtn');
        if (delToday) delToday.addEventListener('click', deleteTodayHistory);
        if (delAll) delAll.addEventListener('click', deleteAllHistory);
    } else if (path === 'files.html') {
        setupFileUpload();
        renderFileList();
    } else if (path === 'habits.html') {
        setupHabits();
    } else if (path === 'notice.html') {
        setupNotice();
    } else if (path === 'notes.html') {
        setupNotes();
    } else if (path === 'search.html') {
        setupSearch();
    } else if (path === 'ai-tools.html') {
        setupAIRecommendation();
    }

    const data = loadData();
    resetDailyIfNeeded(data);
    if (path === 'index.html' || path === '') renderDashboard();
});

// ─── Data Management ──────────────────────────────────────────────
const STORAGE_KEY = 'studyHubData';

function getDefaultData() {
    return {
        files: [],          // [{ name, size, data, date }]
        habits: [],         // [{ id, text, completedDates: [] }]
        notices: [],        // [{ id, text, date }]
        notes: [],          // [{ id, text, date }]
        history: [],        // [{ type, description, date, timestamp }]
        searches: [],       // [{ query, date }]
        lastReset: null,    // date string (YYYY-MM-DD)
    };
}

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            // ensure all keys exist
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

// ─── Daily Reset ──────────────────────────────────────────────────
function resetDailyIfNeeded(data) {
    const today = new Date().toISOString().slice(0,10);
    if (data.lastReset !== today) {
        // Reset any daily counters – we store history, but we clear "today" counts by filtering later.
        // We just update lastReset.
        data.lastReset = today;
        // Also we can trim old habit completions? We keep all, but we'll filter for today's tasks in UI.
        saveData(data);
    }
}

// ─── Activity Logging ─────────────────────────────────────────────
function addActivity(data, type, description) {
    const now = new Date();
    data.history.push({
        type,
        description,
        date: now.toISOString().slice(0,10),
        timestamp: now.getTime(),
    });
    // Keep history manageable (last 500 entries)
    if (data.history.length > 500) data.history.splice(0, data.history.length - 500);
    saveData(data);
    return data;
}

// ─── File Functions ───────────────────────────────────────────────
function addFile(data, file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const fileEntry = {
                name: file.name,
                size: file.size,
                data: e.target.result,
                date: new Date().toISOString(),
            };
            data.files.push(fileEntry);
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
    const habit = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
        text: text.trim(),
        completedDates: [],
    };
    data.habits.push(habit);
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
    const notice = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
        text: text.trim(),
        date: new Date().toISOString(),
    };
    data.notices.push(notice);
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
    const note = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
        text: text.trim(),
        date: new Date().toISOString(),
    };
    data.notes.push(note);
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

// ─── Search Function ──────────────────────────────────────────────
function logSearch(data, query) {
    const entry = {
        query: query.trim(),
        date: new Date().toISOString(),
    };
    data.searches.push(entry);
    addActivity(data, 'search', `Searched: "${query}"`);
    saveData(data);
    return data;
}

// ─── Dashboard Rendering ──────────────────────────────────────────
function renderDashboard() {
    const data = loadData();
    resetDailyIfNeeded(data);

    // Today's date
    const today = new Date().toISOString().slice(0,10);
    document.getElementById('todayDate').textContent = today;

    // Stats
    const todaySearches = data.searches.filter(s => s.date.startsWith(today)).length;
    const todayFiles = data.files.filter(f => f.date && f.date.startsWith(today)).length;
    const todayTasks = data.history.filter(h => h.date === today && h.type === 'habit_complete').length;
    // Streak: longest consecutive days with at least one habit completion
    let streak = 0;
    if (data.habits.length > 0) {
        // Get all unique dates with completions
        const allDates = new Set();
        data.habits.forEach(h => h.completedDates.forEach(d => allDates.add(d)));
        const sorted = Array.from(allDates).sort();
        if (sorted.length > 0) {
            let current = 1;
            let maxStreak = 1;
            for (let i = 1; i < sorted.length; i++) {
                const prev = new Date(sorted[i-1]);
                const curr = new Date(sorted[i]);
                const diff = (curr - prev) / (1000*60*60*24);
                if (diff === 1) {
                    current++;
                    maxStreak = Math.max(maxStreak, current);
                } else {
                    current = 1;
                }
            }
            streak = maxStreak;
        }
    }
    document.getElementById('statSearches').textContent = todaySearches;
    document.getElementById('statFiles').textContent = data.files.length; // total uploaded
    document.getElementById('statTasks').textContent = todayTasks;
    document.getElementById('statStreak').textContent = streak;

    // Today's activity
    const todayActivities = data.history.filter(h => h.date === today);
    const todayContainer = document.getElementById('todayActivity');
    if (todayActivities.length === 0) {
        todayContainer.innerHTML = '<p class="empty-state">No activity recorded today yet.</p>';
    } else {
        todayContainer.innerHTML = todayActivities.slice().reverse().map(h =>
            `<div class="activity-item"><span>${h.description}</span><span class="time">${new Date(h.timestamp).toLocaleTimeString()}</span></div>`
        ).join('');
    }
    document.getElementById('todayCount').textContent = todayActivities.length;

    // All history
    const allHistory = data.history;
    const historyContainer = document.getElementById('historyActivity');
    if (allHistory.length === 0) {
        historyContainer.innerHTML = '<p class="empty-state">No history recorded yet.</p>';
    } else {
        historyContainer.innerHTML = allHistory.slice().reverse().map(h =>
            `<div class="activity-item"><span>${h.description}</span><span class="time">${h.date}</span></div>`
        ).join('');
    }
    document.getElementById('historyCount').textContent = allHistory.length;
}

// ─── AI Tools Recommendation ──────────────────────────────────────
function setupAIRecommendation() {
    const btn = document.getElementById('aiRecommendBtn');
    if (!btn) return;
    const input = document.getElementById('aiQueryInput');
    const result = document.getElementById('aiRecommendResult');

    const recommendations = {
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
        if (!query) {
            result.textContent = 'Please describe what you need help with.';
            return;
        }
        let recommendation = 'I recommend ';
        let found = false;
        for (let key in recommendations) {
            if (query.includes(key)) {
                recommendation += recommendations[key];
                found = true;
                break;
            }
        }
        if (!found) {
            recommendation += 'ChatGPT – it’s a great all‑rounder for most tasks.';
        }
        result.textContent = recommendation;
        // Log the recommendation query
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

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#2563eb';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#d1d9e6';
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#d1d9e6';
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', () => {
        handleFiles(fileInput.files);
        fileInput.value = '';
    });

    async function handleFiles(files) {
        let data = loadData();
        for (let file of files) {
            try {
                data = await addFile(data, file);
            } catch (e) {
                console.error('Upload failed', e);
            }
        }
        renderFileList();
        // Update dashboard if on index
        if (document.getElementById('statFiles')) renderDashboard();
    }

    // Delete all files
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
        container.innerHTML = '<p class="empty-state">No files uploaded yet.</p>';
        return;
    }
    container.innerHTML = data.files.map(f =>
        `<div class="file-item">
            <span class="file-name">📄 ${f.name}</span>
            <span class="file-size">${(f.size/1024).toFixed(1)} KB</span>
        </div>`
    ).join('');
}

// ─── Habits ──────────────────────────────────────────────────────
function setupHabits() {
    const input = document.getElementById('habitInput');
    const addBtn = document.getElementById('addHabitBtn');
    const list = document.getElementById('habitList');
    const delBtn = document.getElementById('deleteAllHabitsBtn');

    function renderHabits() {
        const data = loadData();
        if (data.habits.length === 0) {
            list.innerHTML = '<p class="empty-state">No habits yet. Add one above!</p>';
            return;
        }
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

        // Attach complete events
        list.querySelectorAll('.complete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                let data = loadData();
                data = completeHabit(data, id);
                renderHabits();
                if (document.getElementById('statTasks')) renderDashboard();
            });
        });
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

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });

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

    function renderNotices() {
        const data = loadData();
        if (data.notices.length === 0) {
            list.innerHTML = '<p class="empty-state">No notices yet.</p>';
            return;
        }
        list.innerHTML = data.notices.map(n =>
            `<div class="notice-item"><span>${n.text}</span><span class="time">${new Date(n.date).toLocaleDateString()}</span></div>`
        ).join('');
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

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });

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
            return;
        }
        list.innerHTML = data.notes.map(n =>
            `<div class="note-item"><span>${n.text}</span><span class="time">${new Date(n.date).toLocaleDateString()}</span></div>`
        ).join('');
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

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });

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

// ─── Search Page ──────────────────────────────────────────────────
function setupSearch() {
    const input = document.getElementById('searchInput');
    const btn = document.getElementById('searchBtn');
    if (!btn) return;

    function performSearch() {
        const query = input.value.trim();
        if (!query) return;
        let data = loadData();
        data = logSearch(data, query);
        // Open Google search
        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
        input.value = '';
        if (document.getElementById('statSearches')) renderDashboard();
    }

    btn.addEventListener('click', performSearch);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
}

// ─── Nav Date ──────────────────────────────────────────────────────
function updateNavDate() {
    const el = document.getElementById('navDate');
    if (el) {
        el.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
}

// ─── Initialization ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    updateNavDate();
    // Determine which page we are on
    const path = window.location.pathname.split('/').pop() || 'index.html';
    if (path === 'index.html' || path === '') {
        renderDashboard();
        // Also setup file upload if on dashboard? Not needed, but we can.
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
        // Also setup social block warning (already in HTML)
    }
    // For any page, we might want to ensure data is loaded and reset daily
    const data = loadData();
    resetDailyIfNeeded(data);
    // Also if we are on dashboard, we already render, but we can re-render after reset
    if (path === 'index.html' || path === '') {
        renderDashboard();
    }
});

/* ==============================================================
   STUDYHUB – COMPLETE SCRIPT (ALL FEATURES + FIXES)
   ============================================================== */

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
        assignments: [],
        goals: [],
        flashcards: { decks: [] },
        readingList: [],
        sessions: [],
        pomodoroLogs: [],
        planner: {},
        journal: {},
        subjects: ['General', 'Math', 'Science', 'Language']
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
    const today = new Date().toISOString().slice(0, 10);
    if (data.lastReset !== today) {
        data.lastReset = today;
        saveData(data);
    }
}

function addActivity(data, type, description) {
    const now = new Date();
    data.history.push({
        type: type,
        description: description,
        date: now.toISOString().slice(0, 10),
        timestamp: now.getTime()
    });
    if (data.history.length > 500) data.history.splice(0, data.history.length - 500);
    saveData(data);
    return data;
}

// ================================================================
// BURGER MENU
// ================================================================
function initBurger() {
    const btn = document.getElementById('burgerBtn');
    const links = document.querySelector('.nav-links');
    if (btn && links) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            links.classList.toggle('open');
        });
        links.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                links.classList.remove('open');
            });
        });
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.nav-container')) {
                links.classList.remove('open');
            }
        });
    }
}

// ================================================================
// CLOCK
// ================================================================
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
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        digital.textContent = h + ':' + m + ':' + s;

        const canvas = document.getElementById('analogCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const hc = canvas.height;
            ctx.clearRect(0, 0, w, hc);

            ctx.beginPath();
            ctx.arc(w / 2, hc / 2, w / 2 - 4, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fill();
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 2;
            ctx.stroke();

            for (let i = 0; i < 12; i++) {
                const angle = (i * 30 - 90) * Math.PI / 180;
                const len = w / 2 - 14;
                const x1 = w / 2 + len * Math.cos(angle);
                const y1 = hc / 2 + len * Math.sin(angle);
                const x2 = w / 2 + (w / 2 - 6) * Math.cos(angle);
                const y2 = hc / 2 + (w / 2 - 6) * Math.sin(angle);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = i % 3 === 0 ? 3 : 1.5;
                ctx.stroke();
            }

            const secAngle = (now.getSeconds() * 6 - 90) * Math.PI / 180;
            const minAngle = ((now.getMinutes() + now.getSeconds() / 60) * 6 - 90) * Math.PI / 180;
            const hourAngle = ((now.getHours() % 12 + now.getMinutes() / 60) * 30 - 90) * Math.PI / 180;

            function drawHand(angle, length, color, width) {
                ctx.beginPath();
                ctx.moveTo(w / 2, hc / 2);
                ctx.lineTo(w / 2 + length * Math.cos(angle), hc / 2 + length * Math.sin(angle));
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.stroke();
            }

            drawHand(hourAngle, w / 2 * 0.5, '#f472b6', 5);
            drawHand(minAngle, w / 2 * 0.7, '#6ee7b7', 3);
            drawHand(secAngle, w / 2 * 0.8, '#fca5a5', 1.5);

            ctx.beginPath();
            ctx.arc(w / 2, hc / 2, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#c084fc';
            ctx.fill();
        }

        dateEl.textContent = now.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
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

// ================================================================
// DASHBOARD RENDER (with individual delete for history)
// ================================================================
function renderDashboard() {
    const data = loadData();
    resetDailyIfNeeded(data);
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('todayDate').textContent = today;

    const todaySearches = data.searches.filter(function(s) { return s.date.startsWith(today); }).length;
    const todayFiles = data.files.filter(function(f) { return f.date && f.date.startsWith(today); }).length;
    const todayTasks = data.history.filter(function(h) { return h.date === today && h.type === 'habit_complete'; }).length;

    let streak = 0;
    if (data.habits.length > 0) {
        var allDates = new Set();
        data.habits.forEach(function(h) {
            h.completedDates.forEach(function(d) { allDates.add(d); });
        });
        var sorted = Array.from(allDates).sort();
        if (sorted.length > 0) {
            var current = 1;
            var maxStreak = 1;
            for (var i = 1; i < sorted.length; i++) {
                var prev = new Date(sorted[i - 1]);
                var curr = new Date(sorted[i]);
                var diff = (curr - prev) / (1000 * 60 * 60 * 24);
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
    document.getElementById('statFiles').textContent = data.files.length;
    document.getElementById('statTasks').textContent = todayTasks;
    document.getElementById('statStreak').textContent = streak;

    // Today Activity
    var todayActs = data.history.filter(function(h) { return h.date === today; });
    var tc = document.getElementById('todayActivity');
    if (todayActs.length === 0) {
        tc.innerHTML = '<p class="empty-state">No activity recorded <span class="hl-purple">today</span> yet.</p>';
    } else {
        tc.innerHTML = todayActs.slice().reverse().map(function(h) {
            return '<div class="activity-item"><span>' + h.description + '</span><span class="time">' + new Date(h.timestamp).toLocaleTimeString() + ' <button class="delete-item-btn" data-timestamp="' + h.timestamp + '">✕</button></span></div>';
        }).join('');
    }
    document.getElementById('todayCount').textContent = todayActs.length;

    // All History
    var allHist = data.history;
    var hc = document.getElementById('historyActivity');
    if (allHist.length === 0) {
        hc.innerHTML = '<p class="empty-state">No history <span class="hl-purple">recorded</span> yet.</p>';
    } else {
        hc.innerHTML = allHist.slice().reverse().map(function(h) {
            return '<div class="activity-item"><span>' + h.description + '</span><span class="time">' + h.date + ' <button class="delete-item-btn" data-timestamp="' + h.timestamp + '">✕</button></span></div>';
        }).join('');
    }
    document.getElementById('historyCount').textContent = allHist.length;

    // Upcoming Assignments
    var assignEl = document.getElementById('upcomingAssignments');
    if (assignEl) {
        var upcoming = data.assignments.filter(function(a) { return !a.completed; }).sort(function(a, b) {
            return new Date(a.due) - new Date(b.due);
        }).slice(0, 5);
        if (upcoming.length === 0) {
            assignEl.innerHTML = '<p class="empty-state">No pending assignments.</p>';
        } else {
            assignEl.innerHTML = upcoming.map(function(a) {
                return '<div class="assignment-item priority-' + a.priority + '"><span>' + a.title + ' <span class="tags">' + (a.tags ? '#' + a.tags.join(' #') : '') + '</span></span><span>' + a.due + '</span></div>';
            }).join('');
        }
    }

    // Journal
    var journalEl = document.getElementById('journalText');
    if (journalEl) {
        journalEl.value = data.journal[today] || '';
        var pastEl = document.getElementById('journalPast');
        if (pastEl) {
            var entries = Object.entries(data.journal).filter(function(entry) {
                return entry[0] !== today;
            }).sort().reverse().slice(0, 5);
            pastEl.innerHTML = entries.map(function(entry) {
                return '<div><span class="hl-cyan">' + entry[0] + ':</span> ' + entry[1].substring(0, 60) + (entry[1].length > 60 ? '...' : '') + '</div>';
            }).join('');
        }
    }

    // Pomodoro count
    var pomoCount = document.getElementById('pomoCount');
    if (pomoCount) {
        pomoCount.textContent = data.pomodoroLogs.filter(function(l) { return l.date === today; }).length;
    }

    // Attach delete listeners for history items
    document.querySelectorAll('#todayActivity .delete-item-btn, #historyActivity .delete-item-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var ts = parseInt(this.dataset.timestamp);
            if (confirm('Delete this history entry?')) {
                var data = loadData();
                data.history = data.history.filter(function(h) { return h.timestamp !== ts; });
                saveData(data);
                renderDashboard();
            }
        });
    });

    checkReminders(data);
}

// ================================================================
// DELETE HISTORY (bulk)
// ================================================================
function deleteTodayHistory() {
    if (!confirm('Delete all activity for today?')) return;
    var data = loadData();
    var today = new Date().toISOString().slice(0, 10);
    data.history = data.history.filter(function(h) { return h.date !== today; });
    saveData(data);
    renderDashboard();
}

function deleteAllHistory() {
    if (!confirm('Delete ALL history entries? This cannot be undone.')) return;
    var data = loadData();
    data.history = [];
    saveData(data);
    renderDashboard();
}

// ================================================================
// REMINDERS / NOTIFICATIONS
// ================================================================
function checkReminders(data) {
    if (!("Notification" in window) || Notification.permission === "denied") return;
    if (Notification.permission === "default") Notification.requestPermission();

    var today = new Date().toISOString().slice(0, 10);
    var tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    data.assignments.filter(function(a) {
        return !a.completed && a.due === tomorrow;
    }).forEach(function(a) {
        if (a._notified) return;
        a._notified = true;
        saveData(data);
        new Notification('⏰ Assignment Due Tomorrow', {
            body: a.title + ' (' + a.subject + ')'
        });
    });

    data.flashcards.decks.forEach(function(deck) {
        deck.cards.filter(function(c) {
            return c.dueDate && c.dueDate <= today && !c._notified;
        }).forEach(function(c) {
            c._notified = true;
            saveData(data);
            new Notification('📝 Flashcard Review Due', {
                body: 'Deck: ' + deck.name + ' - "' + c.front + '"'
            });
        });
    });
}

// ================================================================
// POMODORO
// ================================================================
function initPomodoro() {
    var display = document.getElementById('pomoDisplay');
    if (!display) return;

    var startBtn = document.getElementById('pomoStart');
    var stopBtn = document.getElementById('pomoStop');
    var resetBtn = document.getElementById('pomoReset');
    var taskSelect = document.getElementById('pomoTaskSelect');
    var durationInput = document.getElementById('pomoDuration');

    var pomoSeconds = 1500;
    var pomoRunning = false;
    var pomoTimer = null;
    var pomoTask = '';

    function updateDisplay() {
        var m = Math.floor(pomoSeconds / 60);
        var s = pomoSeconds % 60;
        display.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    if (durationInput) {
        durationInput.addEventListener('change', function() {
            if (!pomoRunning) {
                var mins = parseInt(this.value) || 25;
                if (mins < 1) mins = 1;
                if (mins > 120) mins = 120;
                pomoSeconds = mins * 60;
                updateDisplay();
            }
        });
    }

    function resetTimer() {
        clearInterval(pomoTimer);
        pomoRunning = false;
        var mins = durationInput ? parseInt(durationInput.value) || 25 : 25;
        pomoSeconds = mins * 60;
        updateDisplay();
    }

    if (startBtn) {
        startBtn.addEventListener('click', function() {
            if (pomoRunning) return;
            pomoTask = taskSelect ? taskSelect.value : 'Study';
            pomoRunning = true;
            pomoTimer = setInterval(function() {
                pomoSeconds--;
                updateDisplay();
                if (pomoSeconds <= 0) {
                    clearInterval(pomoTimer);
                    pomoRunning = false;
                    var data = loadData();
                    data.pomodoroLogs.push({
                        date: new Date().toISOString().slice(0, 10),
                        task: pomoTask,
                        duration: durationInput ? parseInt(durationInput.value) || 25 : 25
                    });
                    addActivity(data, 'pomodoro', 'Completed Pomodoro: ' + pomoTask);
                    saveData(data);
                    renderDashboard();
                    new Notification('⏱️ Timer Complete!', {
                        body: 'Great focus on ' + pomoTask + '!'
                    });
                    resetTimer();
                }
            }, 1000);
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', function() {
            clearInterval(pomoTimer);
            pomoRunning = false;
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetTimer);
    }

    if (taskSelect) {
        var data = loadData();
        var options = '<option value="Study">Study</option>';
        data.habits.forEach(function(h) {
            options += '<option value="' + h.text + '">' + h.text + '</option>';
        });
        taskSelect.innerHTML = options;
    }

    resetTimer();
}

// ================================================================
// AI SUMMARIZER
// ================================================================
function setupSummarizer() {
    var btn = document.getElementById('summarizeBtn');
    if (!btn) return;
    var input = document.getElementById('summarizeInput');
    var output = document.getElementById('summarizeOutput');

    btn.addEventListener('click', function() {
        var text = input.value.trim();
        if (!text) {
            output.textContent = 'Please paste some text to summarize.';
            return;
        }

        var sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        if (sentences.length <= 2) {
            output.textContent = text;
            return;
        }

        var words = text.toLowerCase().match(/\b\w+\b/g) || [];
        var freq = {};
        words.forEach(function(w) {
            if (w.length > 3) freq[w] = (freq[w] || 0) + 1;
        });

        var scores = sentences.map(function(s) {
            var sw = s.toLowerCase().match(/\b\w+\b/g) || [];
            var score = 0;
            sw.forEach(function(w) {
                if (freq[w]) score += freq[w];
            });
            return { sentence: s.trim(), score: score / (sw.length || 1) };
        });

        scores.sort(function(a, b) { return b.score - a.score; });
        var top = scores.slice(0, Math.max(3, Math.ceil(sentences.length * 0.3)))
            .sort(function(a, b) {
                return sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence);
            });

        output.textContent = top.map(function(s) { return s.sentence; }).join(' ');
        var data = loadData();
        addActivity(data, 'ai_summary', 'Generated AI summary');
        saveData(data);
    });
}

// ================================================================
// FILE UPLOAD + individual delete
// ================================================================
function setupFileUpload() {
    var uploadArea = document.getElementById('uploadArea');
    if (!uploadArea) return;
    var fileInput = document.getElementById('fileInput');

    uploadArea.addEventListener('click', function() {
        fileInput.click();
    });

    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = '#c084fc';
    });

    uploadArea.addEventListener('dragleave', function() {
        uploadArea.style.borderColor = 'rgba(192,132,252,0.2)';
    });

    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = 'rgba(192,132,252,0.2)';
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', function() {
        handleFiles(fileInput.files);
        fileInput.value = '';
    });

    async function handleFiles(files) {
        var data = loadData();
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            try {
                var reader = new FileReader();
                var result = await new Promise(function(resolve, reject) {
                    reader.onload = function(e) { resolve(e.target.result); };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                data.files.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    name: file.name,
                    size: file.size,
                    data: result,
                    date: new Date().toISOString()
                });
                addActivity(data, 'file', 'Uploaded "' + file.name + '"');
                saveData(data);
            } catch (e) {
                console.error(e);
            }
        }
        renderFileList();
        if (document.getElementById('statFiles')) renderDashboard();
    }

    var delBtn = document.getElementById('deleteAllFilesBtn');
    if (delBtn) {
        delBtn.addEventListener('click', function() {
            if (confirm('Delete all files?')) {
                var data = loadData();
                data.files = [];
                addActivity(data, 'delete', 'Deleted all files');
                saveData(data);
                renderFileList();
                if (document.getElementById('statFiles')) renderDashboard();
            }
        });
    }
}

function renderFileList() {
    var container = document.getElementById('fileList');
    if (!container) return;
    var data = loadData();
    if (data.files.length === 0) {
        container.innerHTML = '<p class="empty-state">No files <span class="hl-purple">uploaded</span> yet.</p>';
        return;
    }
    container.innerHTML = data.files.map(function(f) {
        return '<div class="file-item"><a href="' + f.data + '" target="_blank" class="file-name">📄 ' + f.name + '</a><span class="file-size">' + (f.size / 1024).toFixed(1) + ' KB</span><button class="delete-item-btn" data-id="' + f.id + '">✕</button></div>';
    }).join('');

    container.querySelectorAll('.delete-item-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = this.dataset.id;
            if (confirm('Delete this file?')) {
                var data = loadData();
                data.files = data.files.filter(function(f) { return f.id !== id; });
                saveData(data);
                renderFileList();
                if (document.getElementById('statFiles')) renderDashboard();
            }
        });
    });
}

// ================================================================
// HABITS
// ================================================================
function setupHabits() {
    var input = document.getElementById('habitInput');
    var addBtn = document.getElementById('addHabitBtn');
    var list = document.getElementById('habitList');
    var delBtn = document.getElementById('deleteAllHabitsBtn');
    var streakDisplay = document.getElementById('streakDisplay');

    function renderHabits() {
        var data = loadData();
        if (data.habits.length === 0) {
            list.innerHTML = '<p class="empty-state">No habits yet. <span class="hl-purple">Add</span> one above!</p>';
        } else {
            var today = new Date().toISOString().slice(0, 10);
            list.innerHTML = data.habits.map(function(h) {
                var done = h.completedDates.includes(today);
                return '<div class="habit-item"><span class="habit-text">' + h.text + (done ? ' ✅' : '') + '</span><div class="habit-actions"><button class="complete-btn ' + (done ? 'done' : '') + '" data-id="' + h.id + '">' + (done ? 'Done' : 'Complete') + '</button></div></div>';
            }).join('');

            list.querySelectorAll('.complete-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var id = this.dataset.id;
                    var data = loadData();
                    var habit = data.habits.find(function(h) { return h.id === id; });
                    if (habit) {
                        var today = new Date().toISOString().slice(0, 10);
                        if (!habit.completedDates.includes(today)) {
                            habit.completedDates.push(today);
                            addActivity(data, 'habit_complete', 'Completed habit: "' + habit.text + '"');
                            saveData(data);
                            renderHabits();
                            updateStreak();
                            if (document.getElementById('statTasks')) renderDashboard();
                        }
                    }
                });
            });
        }
        updateStreak();
    }

    function updateStreak() {
        var data = loadData();
        var streak = 0;
        if (data.habits.length > 0) {
            var allDates = new Set();
            data.habits.forEach(function(h) {
                h.completedDates.forEach(function(d) { allDates.add(d); });
            });
            var sorted = Array.from(allDates).sort();
            if (sorted.length > 0) {
                var current = 1;
                var maxStreak = 1;
                for (var i = 1; i < sorted.length; i++) {
                    var prev = new Date(sorted[i - 1]);
                    var curr = new Date(sorted[i]);
                    var diff = (curr - prev) / (1000 * 60 * 60 * 24);
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
        if (streakDisplay) streakDisplay.textContent = streak;
    }

    addBtn.addEventListener('click', function() {
        var text = input.value.trim();
        if (!text) return;
        var data = loadData();
        data.habits.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            text: text,
            completedDates: []
        });
        addActivity(data, 'habit_add', 'Created habit: "' + text + '"');
        saveData(data);
        input.value = '';
        renderHabits();
        if (document.getElementById('statTasks')) renderDashboard();
    });

    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addBtn.click();
    });

    delBtn.addEventListener('click', function() {
        if (confirm('Delete all habits?')) {
            var data = loadData();
            data.habits = [];
            addActivity(data, 'delete', 'Deleted all habits');
            saveData(data);
            renderHabits();
            if (document.getElementById('statTasks')) renderDashboard();
        }
    });

    renderHabits();
}

// ================================================================
// NOTICE (with individual delete)
// ================================================================
function setupNotice() {
    var input = document.getElementById('noticeInput');
    var addBtn = document.getElementById('addNoticeBtn');
    var list = document.getElementById('noticeList');
    var delBtn = document.getElementById('deleteAllNoticesBtn');
    var countEl = document.getElementById('noticeCount');

    function renderNotices() {
        var data = loadData();
        if (data.notices.length === 0) {
            list.innerHTML = '<p class="empty-state">No notices <span class="hl-purple">pinned</span> yet.</p>';
        } else {
            list.innerHTML = data.notices.map(function(n) {
                return '<div class="notice-item"><span>' + n.text + '</span><span class="time">' + new Date(n.date).toLocaleDateString() + ' <button class="delete-item-btn" data-id="' + n.id + '">✕</button></span></div>';
            }).join('');
        }
        if (countEl) countEl.textContent = data.notices.length + ' notices';

        list.querySelectorAll('.delete-item-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.dataset.id;
                if (confirm('Delete this notice?')) {
                    var data = loadData();
                    data.notices = data.notices.filter(function(n) { return n.id !== id; });
                    saveData(data);
                    renderNotices();
                    if (document.getElementById('statTasks')) renderDashboard();
                }
            });
        });
    }

    addBtn.addEventListener('click', function() {
        var text = input.value.trim();
        if (!text) return;
        var data = loadData();
        data.notices.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            text: text,
            date: new Date().toISOString()
        });
        addActivity(data, 'notice_add', 'Added notice: "' + text + '"');
        saveData(data);
        input.value = '';
        renderNotices();
        if (document.getElementById('statTasks')) renderDashboard();
    });

    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addBtn.click();
    });

    delBtn.addEventListener('click', function() {
        if (confirm('Delete all notices?')) {
            var data = loadData();
            data.notices = [];
            addActivity(data, 'delete', 'Deleted all notices');
            saveData(data);
            renderNotices();
            if (document.getElementById('statTasks')) renderDashboard();
        }
    });

    renderNotices();
}

// ================================================================
// NOTES (with individual delete)
// ================================================================
function setupNotes() {
    var input = document.getElementById('noteInput');
    var addBtn = document.getElementById('addNoteBtn');
    var list = document.getElementById('noteList');
    var delBtn = document.getElementById('deleteAllNotesBtn');

    function renderNotes() {
        var data = loadData();
        if (data.notes.length === 0) {
            list.innerHTML = '<p class="empty-state">No notes yet.</p>';
        } else {
            list.innerHTML = data.notes.map(function(n) {
                return '<div class="note-item"><span>' + n.text + '</span><span class="time">' + new Date(n.date).toLocaleDateString() + ' <button class="delete-item-btn" data-id="' + n.id + '">✕</button></span></div>';
            }).join('');
        }

        list.querySelectorAll('.delete-item-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.dataset.id;
                if (confirm('Delete this note?')) {
                    var data = loadData();
                    data.notes = data.notes.filter(function(n) { return n.id !== id; });
                    saveData(data);
                    renderNotes();
                    if (document.getElementById('statTasks')) renderDashboard();
                }
            });
        });
    }

    addBtn.addEventListener('click', function() {
        var text = input.value.trim();
        if (!text) return;
        var data = loadData();
        data.notes.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            text: text,
            date: new Date().toISOString()
        });
        addActivity(data, 'note_add', 'Added note: "' + text + '"');
        saveData(data);
        input.value = '';
        renderNotes();
        if (document.getElementById('statTasks')) renderDashboard();
    });

    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addBtn.click();
    });

    delBtn.addEventListener('click', function() {
        if (confirm('Delete all notes?')) {
            var data = loadData();
            data.notes = [];
            addActivity(data, 'delete', 'Deleted all notes');
            saveData(data);
            renderNotes();
            if (document.getElementById('statTasks')) renderDashboard();
        }
    });

    renderNotes();
}

// ================================================================
// SEARCH (merged into dashboard)
// ================================================================
function setupSearch() {
    var input = document.getElementById('searchInput');
    var btn = document.getElementById('searchBtn');
    var suggestionsList = document.getElementById('suggestionsList');
    var keyboardToggle = document.getElementById('keyboardToggle');
    var keyboardContainer = document.getElementById('keyboardContainer');

    if (!input || !btn) return;

    function updateSuggestions(query) {
        var data = loadData();
        var matches = data.searches
            .map(function(s) { return s.query; })
            .filter(function(q, i, self) { return self.indexOf(q) === i; })
            .filter(function(q) { return q.toLowerCase().includes(query.toLowerCase()); })
            .slice(0, 8);

        if (query.length === 0 || matches.length === 0) {
            suggestionsList.classList.remove('active');
            return;
        }

        suggestionsList.innerHTML = matches.map(function(q) {
            return '<div class="suggestion-item" data-query="' + q + '">' + q + '</div>';
        }).join('');
        suggestionsList.classList.add('active');

        suggestionsList.querySelectorAll('.suggestion-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var val = this.dataset.query;
                input.value = val;
                suggestionsList.classList.remove('active');
                performSearch(val);
            });
        });
    }

    input.addEventListener('input', function() {
        updateSuggestions(this.value);
    });

    input.addEventListener('blur', function() {
        setTimeout(function() { suggestionsList.classList.remove('active'); }, 200);
    });

    function performSearch(query) {
        if (!query) return;
        var data = loadData();
        data.searches.push({ query: query, date: new Date().toISOString() });
        addActivity(data, 'search', 'Searched: "' + query + '"');
        saveData(data);
        window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank');
        input.value = '';
        suggestionsList.classList.remove('active');
        if (document.getElementById('statSearches')) renderDashboard();
    }

    btn.addEventListener('click', function() {
        performSearch(input.value.trim());
    });

    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch(input.value.trim());
        }
    });

    if (keyboardToggle && keyboardContainer) {
        keyboardToggle.addEventListener('click', function() {
            keyboardContainer.classList.toggle('active');
            this.textContent = keyboardContainer.classList.contains('active') ? '⌨️ Hide Keyboard' : '⌨️ Show Keyboard';
        });

        var rows = [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Backspace'],
            ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
            ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
            ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '?'],
            ['Space']
        ];

        rows.forEach(function(rowKeys) {
            var rowDiv = document.createElement('div');
            rowDiv.className = 'keyboard-row';
            rowKeys.forEach(function(key) {
                var btn = document.createElement('button');
                btn.className = 'key-btn';
                if (key === 'Backspace' || key === 'Space') btn.classList.add('special');
                if (key === 'Space') btn.classList.add('space');
                btn.textContent = key === 'Space' ? '␣' : key;
                btn.dataset.key = key;
                rowDiv.appendChild(btn);
            });
            keyboardContainer.appendChild(rowDiv);
        });

        keyboardContainer.addEventListener('click', function(e) {
            var target = e.target.closest('.key-btn');
            if (!target) return;
            var key = target.dataset.key;
            var inp = document.getElementById('searchInput');
            if (!inp) return;

            if (key === 'Backspace') {
                inp.value = inp.value.slice(0, -1);
            } else if (key === 'Space') {
                inp.value += ' ';
            } else {
                inp.value += key;
            }
            inp.dispatchEvent(new Event('input'));
            inp.focus();
        });
    }
}

// ================================================================
// ASSIGNMENTS
// ================================================================
function setupAssignments() {
    var form = document.getElementById('assignmentForm');
    if (!form) return;
    var list = document.getElementById('assignmentList');

    function renderAssignments() {
        var data = loadData();
        if (data.assignments.length === 0) {
            list.innerHTML = '<p class="empty-state">No assignments.</p>';
            return;
        }

        list.innerHTML = data.assignments.sort(function(a, b) {
            return new Date(a.due) - new Date(b.due);
        }).map(function(a) {
            return '<div class="assignment-item priority-' + a.priority + '"><div><span>' + a.title + '</span> <span class="tags">#' + a.subject + (a.tags ? a.tags.map(function(t) { return ' #' + t; }).join('') : '') + '</span> ' + (a.completed ? '✅' : '') + '</div><div>' + a.due + ' <button class="btn-danger-sm" data-id="' + a.id + '">Delete</button> <button class="btn-primary-sm" data-id="' + a.id + '" data-action="toggle">' + (a.completed ? 'Undo' : 'Done') + '</button></div></div>';
        }).join('');

        list.querySelectorAll('[data-id]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.dataset.id;
                var action = this.dataset.action;
                var data = loadData();
                var idx = data.assignments.findIndex(function(a) { return a.id === id; });
                if (idx === -1) return;
                if (action === 'toggle') {
                    data.assignments[idx].completed = !data.assignments[idx].completed;
                } else {
                    data.assignments.splice(idx, 1);
                }
                addActivity(data, 'assignment', 'Updated assignment');
                saveData(data);
                renderAssignments();
                if (document.getElementById('upcomingAssignments')) renderDashboard();
            });
        });
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        var title = document.getElementById('assignTitle').value.trim();
        var subject = document.getElementById('assignSubject').value;
        var due = document.getElementById('assignDue').value;
        var priority = document.getElementById('assignPriority').value;
        var tags = document.getElementById('assignTags').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

        if (!title || !due) return;
        var data = loadData();
        data.assignments.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            title: title,
            subject: subject,
            due: due,
            priority: priority,
            tags: tags,
            completed: false
        });
        addActivity(data, 'assignment_add', 'Added assignment: "' + title + '"');
        saveData(data);
        renderAssignments();
        form.reset();
        if (document.getElementById('upcomingAssignments')) renderDashboard();
    });

    renderAssignments();
}

// ================================================================
// PLANNER
// ================================================================
function setupPlanner() {
    var grid = document.getElementById('plannerGrid');
    if (!grid) return;
    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var hours = ['8:00', '9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

    function renderPlanner() {
        var data = loadData();
        grid.innerHTML = '';

        grid.innerHTML += '<div class="time-label"></div>';
        days.forEach(function(d) {
            grid.innerHTML += '<div class="time-label" style="font-weight:700;">' + d + '</div>';
        });

        hours.forEach(function(h) {
            grid.innerHTML += '<div class="time-label">' + h + '</div>';
            days.forEach(function(d) {
                var key = d + '_' + h;
                var val = data.planner[key] || '';
                var cell = document.createElement('div');
                cell.className = 'planner-cell' + (val ? ' filled' : '');
                cell.textContent = val;
                cell.addEventListener('click', function() {
                    var newVal = prompt('Plan for ' + d + ' ' + h + ':', val || '');
                    if (newVal === null) return;
                    var data = loadData();
                    if (newVal.trim() === '') {
                        delete data.planner[key];
                    } else {
                        data.planner[key] = newVal.trim();
                    }
                    saveData(data);
                    renderPlanner();
                });
                grid.appendChild(cell);
            });
        });
    }

    renderPlanner();
}

// ================================================================
// FLASHCARDS (FIXED)
// ================================================================
function setupFlashcards() {
    var list = document.getElementById('flashcardList');

    function renderFlashcards() {
        var data = loadData();
        list.innerHTML = '';

        data.flashcards.decks.forEach(function(deck) {
            var div = document.createElement('div');
            div.className = 'glass-card';
            div.style.padding = '1rem';

            var dueCount = deck.cards.filter(function(c) {
                return c.dueDate && c.dueDate <= new Date().toISOString().slice(0, 10);
            }).length;

            div.innerHTML = '<h3>' + deck.name + ' <span class="hl-cyan">(' + deck.cards.length + ' cards, ' + dueCount + ' due)</span></h3>' +
                '<button class="btn-primary-sm" data-deck="' + deck.id + '" data-action="review">Review</button> ' +
                '<button class="btn-danger-sm" data-deck="' + deck.id + '" data-action="delete">Delete Deck</button>' +
                '<div style="margin-top:0.5rem;"><input class="input-dark" placeholder="Front" id="front_' + deck.id + '"> <input class="input-dark" placeholder="Back" id="back_' + deck.id + '"> <button class="btn-primary-sm" data-deck="' + deck.id + '" data-action="addcard">Add Card</button></div>';

            list.appendChild(div);
        });

        list.querySelectorAll('[data-deck]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var deckId = this.dataset.deck;
                var action = this.dataset.action;
                var data = loadData();
                var deck = data.flashcards.decks.find(function(d) { return d.id === deckId; });
                if (!deck) return;

                if (action === 'delete') {
                    if (confirm('Delete deck?')) {
                        data.flashcards.decks = data.flashcards.decks.filter(function(d) { return d.id !== deckId; });
                        saveData(data);
                        renderFlashcards();
                    }
                } else if (action === 'addcard') {
                    var front = document.getElementById('front_' + deckId).value.trim();
                    var back = document.getElementById('back_' + deckId).value.trim();
                    if (!front || !back) return;
                    deck.cards.push({
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        front: front,
                        back: back,
                        dueDate: new Date().toISOString().slice(0, 10),
                        level: 0
                    });
                    saveData(data);
                    renderFlashcards();
                } else if (action === 'review') {
                    startReview(deckId);
                }
            });
        });
    }

    function startReview(deckId) {
        var data = loadData();
        var deck = data.flashcards.decks.find(function(d) { return d.id === deckId; });
        if (!deck) return;

        var dueCards = deck.cards.filter(function(c) {
            return c.dueDate && c.dueDate <= new Date().toISOString().slice(0, 10);
        });

        if (dueCards.length === 0) {
            alert('No cards due for review!');
            return;
        }

        var idx = 0;
        var reviewContainer = document.getElementById('flashcardReview');
        reviewContainer.style.display = 'block';
        var frontEl = document.getElementById('reviewFront');
        var backEl = document.getElementById('reviewBack');
        var diffBtns = document.querySelectorAll('.flashcard-difficulty button');

        function showCard() {
            if (idx >= dueCards.length) {
                reviewContainer.style.display = 'none';
                alert('Review complete!');
                renderFlashcards();
                return;
            }
            var card = dueCards[idx];
            frontEl.textContent = card.front;
            backEl.textContent = card.back;
            document.querySelector('.flashcard-review').classList.remove('show-back');
        }

        showCard();

        document.querySelector('.flashcard-review').addEventListener('click', function(e) {
            if (e.target.tagName !== 'BUTTON') {
                this.classList.toggle('show-back');
            }
        });

        diffBtns.forEach(function(btn) {
            btn.onclick = function() {
                var diff = parseInt(this.dataset.diff);
                var card = dueCards[idx];
                var data = loadData();
                var deck2 = data.flashcards.decks.find(function(d) { return d.id === deckId; });
                var c = deck2.cards.find(function(c) { return c.id === card.id; });
                if (c) {
                    var level = c.level || 0;
                    if (diff === 1) level = Math.max(0, level - 1);
                    else if (diff === 3) level = Math.min(5, level + 1);
                    else if (diff === 2) level = Math.min(5, level + 0.5);
                    c.level = level;
                    var days = [1, 2, 4, 8, 16, 32];
                    var next = new Date();
                    next.setDate(next.getDate() + days[Math.min(5, Math.round(level))]);
                    c.dueDate = next.toISOString().slice(0, 10);
                    saveData(data);
                }
                idx++;
                showCard();
                if (idx === dueCards.length) {
                    setTimeout(function() {
                        reviewContainer.style.display = 'none';
                        renderFlashcards();
                    }, 500);
                }
            };
        });
    }

    // New Deck button
    document.getElementById('addDeckBtn').addEventListener('click', function() {
        var name = prompt('Deck name:');
        if (!name) return;
        var data = loadData();
        data.flashcards.decks.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name: name,
            cards: []
        });
        saveData(data);
        renderFlashcards();
    });

    renderFlashcards();
}

// ================================================================
// READING LIST
// ================================================================
function setupReading() {
    var form = document.getElementById('readingForm');
    if (!form) return;
    var list = document.getElementById('readingList');

    function renderReading() {
        var data = loadData();
        if (data.readingList.length === 0) {
            list.innerHTML = '<p class="empty-state">No items.</p>';
            return;
        }

        list.innerHTML = data.readingList.map(function(r) {
            return '<div class="assignment-item"><span>' + r.title + (r.read ? ' ✅' : ' 📖') + ' <span class="tags">#' + r.subject + (r.tags ? r.tags.map(function(t) { return ' #' + t; }).join('') : '') + '</span></span><span><a href="' + r.url + '" target="_blank" style="color:#c084fc;">Link</a> <button class="btn-danger-sm" data-id="' + r.id + '">Delete</button> <button class="btn-primary-sm" data-id="' + r.id + '" data-action="toggle">' + (r.read ? 'Unread' : 'Read') + '</button></span></div>';
        }).join('');

        list.querySelectorAll('[data-id]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.dataset.id;
                var action = this.dataset.action;
                var data = loadData();
                var item = data.readingList.find(function(r) { return r.id === id; });
                if (!item) return;
                if (action === 'toggle') {
                    item.read = !item.read;
                } else {
                    data.readingList = data.readingList.filter(function(r) { return r.id !== id; });
                }
                saveData(data);
                renderReading();
            });
        });
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        var title = document.getElementById('readTitle').value.trim();
        var url = document.getElementById('readUrl').value.trim();
        var subject = document.getElementById('readSubject').value;
        var tags = document.getElementById('readTags').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

        if (!title || !url) return;
        var data = loadData();
        data.readingList.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            title: title,
            url: url,
            subject: subject,
            tags: tags,
            read: false
        });
        saveData(data);
        renderReading();
        form.reset();
    });

    renderReading();
}

// ================================================================
// FOCUS MODE
// ================================================================
function setupFocusMode() {
    var btn = document.getElementById('focusToggle');
    if (!btn) return;

    btn.addEventListener('click', function() {
        document.body.classList.toggle('focus-mode');
        this.classList.toggle('active');
        this.textContent = document.body.classList.contains('focus-mode') ? '🔒 Focus On' : '🔓 Focus Off';
    });
}

// ================================================================
// AI RECOMMENDATION
// ================================================================
function setupAIRecommendation() {
    var btn = document.getElementById('aiRecommendBtn');
    if (!btn) return;
    var input = document.getElementById('aiQueryInput');
    var result = document.getElementById('aiRecommendResult');

    var recMap = {
        math: 'DeepSeek or Wolfram Alpha',
        calculus: 'DeepSeek or Wolfram Alpha',
        code: 'Cursor',
        programming: 'Cursor',
        write: 'ChatGPT or Claude',
        research: 'Perplexity or Claude',
        data: 'Claude',
        design: 'Midjourney',
        language: 'Duolingo',
        presentation: 'Gamma',
        physics: 'Wolfram Alpha'
    };

    btn.addEventListener('click', function() {
        var q = input.value.trim().toLowerCase();
        if (!q) {
            result.textContent = 'Please describe what you need help with.';
            return;
        }
        var rec = 'I recommend ';
        var found = false;
        for (var key in recMap) {
            if (q.includes(key)) {
                rec += recMap[key];
                found = true;
                break;
            }
        }
        if (!found) rec += 'ChatGPT – it’s a great all‑rounder for most tasks.';
        result.textContent = rec;
        var data = loadData();
        addActivity(data, 'ai_recommend', 'AI recommendation for: "' + q + '"');
        saveData(data);
    });
}

// ================================================================
// NAV DATE & SCROLL GRADIENT
// ================================================================
function updateNavDate() {
    var el = document.getElementById('navDate');
    if (el) {
        el.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }
}

function updateScrollGradient() {
    var scrollTop = window.scrollY;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var p = docHeight > 0 ? scrollTop / docHeight : 0;

    var blue = [30, 58, 138];
    var green = [6, 95, 70];
    var purple = [88, 28, 135];
    var r, g, b;

    if (p < 0.5) {
        var t = p / 0.5;
        r = blue[0] + (green[0] - blue[0]) * t;
        g = blue[1] + (green[1] - blue[1]) * t;
        b = blue[2] + (green[2] - blue[2]) * t;
    } else {
        var t = (p - 0.5) / 0.5;
        r = green[0] + (purple[0] - green[0]) * t;
        g = green[1] + (purple[1] - green[1]) * t;
        b = green[2] + (purple[2] - green[2]) * t;
    }

    document.body.style.background = 'radial-gradient(ellipse at top left, rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + '), #0d0618)';
}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    initBurger();
    updateNavDate();
    initClock();
    updateScrollGradient();
    window.addEventListener('scroll', updateScrollGradient);
    window.addEventListener('resize', updateScrollGradient);

    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    var path = window.location.pathname.split('/').pop() || 'index.html';

    if (path === 'index.html' || path === '') {
        renderDashboard();
        initPomodoro();
        setupSearch();

        var dToday = document.getElementById('deleteTodayBtn');
        if (dToday) dToday.addEventListener('click', deleteTodayHistory);

        var dAll = document.getElementById('deleteAllBtn');
        if (dAll) dAll.addEventListener('click', deleteAllHistory);

        var journal = document.getElementById('journalText');
        if (journal) {
            journal.addEventListener('input', function() {
                var data = loadData();
                var today = new Date().toISOString().slice(0, 10);
                data.journal[today] = this.value;
                saveData(data);
            });
        }

        setupFocusMode();

    } else if (path === 'files.html') {
        setupFileUpload();
        renderFileList();

    } else if (path === 'habits.html') {
        setupHabits();

    } else if (path === 'notice.html') {
        setupNotice();

    } else if (path === 'notes.html') {
        setupNotes();

    } else if (path === 'ai-tools.html') {
        setupAIRecommendation();
        setupSummarizer();

    } else if (path === 'assignments.html') {
        setupAssignments();

    } else if (path === 'planner.html') {
        setupPlanner();

    } else if (path === 'flashcards.html') {
        setupFlashcards();

    } else if (path === 'reading.html') {
        setupReading();
    }

    var data = loadData();
    resetDailyIfNeeded(data);
    if (path === 'index.html' || path === '') renderDashboard();
});
// ================================================================
// TRANSLATION ENGINE (top 15 languages)
// ================================================================

const translations = {
    en: {
        // Dashboard
        'dash_title': 'Dashboard',
        'dash_subtitle': 'Your study hub at a glance — today\'s progress & all-time history.',
        'stat_searches': 'Searches Today',
        'stat_files': 'Files Uploaded',
        'stat_tasks': 'Tasks Done Today',
        'stat_streak': 'Longest Streak',
        'stat_pomodoros': 'Pomodoros Today',
        'today_activity': 'Today\'s Activity',
        'all_history': 'All History',
        'delete_today': 'Delete Today\'s Activity',
        'delete_all': 'Delete All History',
        'search_placeholder': 'What are you looking for?',
        'search_button': 'Search',
        'search_tip': 'All searches are logged in your history.',
        'show_keyboard': 'Show Keyboard',
        'hide_keyboard': 'Hide Keyboard',
        'task_timer': 'Task Timer',
        'start': 'Start',
        'stop': 'Stop',
        'reset': 'Reset',
        'completed_today': 'Completed today',
        'daily_reflection': 'Daily Reflection',
        'journal_placeholder': 'How did your study session go? What did you learn?',
        'upcoming_assignments': 'Upcoming Assignments',
        'no_assignments': 'No pending assignments.',
        'no_activity': 'No activity recorded today yet.',
        'no_history': 'No history recorded yet.',
        'no_files': 'No files uploaded yet.',
        'no_notes': 'No notes yet.',
        'no_notices': 'No notices pinned yet.',
        'no_habits': 'No habits yet. Add one above!',
        'no_items': 'No items.',
        'add_habit': 'Add Habit',
        'add_note': 'Add Note',
        'add_notice': 'Add Notice',
        'delete_all': 'Delete All',
        'complete': 'Complete',
        'done': 'Done',
        'ai_tools': 'AI Tools',
        'ai_subtitle': 'Curated AI assistants + built‑in text summarizer.',
        'recommend_title': 'Not sure which AI to use?',
        'recommend_text': 'Tell me what you\'re working on.',
        'recommend_button': 'Recommend',
        'summarizer_title': 'AI Summarizer',
        'summarizer_desc': 'Paste any text and get a concise summary (works offline).',
        'summarize_button': 'Summarize',
        'summarize_placeholder': 'Paste your text here...',
        'social_blocked': 'Social Media Blocked',
        'social_blocked_desc': 'To keep you focused, all social media platforms (except YouTube) are blocked while using StudyHub.',
        // ... more strings for all pages
    },
    es: { /* Spanish translations */ },
    zh: { /* Mandarin */ },
    hi: { /* Hindi */ },
    ar: { /* Arabic */ },
    fr: { /* French */ },
    ru: { /* Russian */ },
    pt: { /* Portuguese */ },
    bn: { /* Bengali */ },
    ur: { /* Urdu */ },
    id: { /* Indonesian */ },
    de: { /* German */ },
    ja: { /* Japanese */ },
    sw: { /* Swahili */ },
    tr: { /* Turkish */ },
};

let currentLang = 'en';

function applyTranslations(lang) {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.dataset.i18n;
        if (translations[lang] && translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });
    // Also handle placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        if (translations[lang] && translations[lang][key]) {
            el.placeholder = translations[lang][key];
        }
    });
    // Handle title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.dataset.i18nTitle;
        if (translations[lang] && translations[lang][key]) {
            el.title = translations[lang][key];
        }
    });
    // Update language selector
    const selector = document.getElementById('langSelector');
    if (selector) selector.value = lang;
    currentLang = lang;
    localStorage.setItem('studyHubLang', lang);
}

function initTranslations() {
    const saved = localStorage.getItem('studyHubLang');
    if (saved && translations[saved]) {
        currentLang = saved;
    }
    applyTranslations(currentLang);

    // Language selector change event
    const selector = document.getElementById('langSelector');
    if (selector) {
        selector.addEventListener('change', function() {
            applyTranslations(this.value);
        });
    }
}

// Call initTranslations() in DOMContentLoaded

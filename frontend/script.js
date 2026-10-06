// ================================================================
// STUDYHUB – COMPLETE SCRIPT (ALL FEATURES + ALL 15 LANGUAGES)
// ================================================================

const STORAGE_KEY = 'studyHubData';

// ================================================================
// STUDYHUB AI — shared bridge to the provider configured by a
// developer in Admin > AI. The server resolves the validated key
// (app_settings over OPENAI_* env); only its status reaches clients.
// Every feature keeps its offline engine and falls back to it when
// no provider is configured or a provider call fails.
// ================================================================
const StudyHubAI = (function () {
    'use strict';
    var statusCache = null;          // { configured, model, source, hasKey }
    var statusFetchedAt = 0;

    function fetchJson(url, opts) {
        opts = opts || {};
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeoutMs || 30000) : null;
        var p = fetch(url, {
            method: opts.method || 'GET',
            headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
            body: opts.body ? JSON.stringify(opts.body) : undefined,
            credentials: 'same-origin',
            signal: ctrl ? ctrl.signal : undefined
        }).then(function (r) {
            return r.text().then(function (t) {
                var data = null;
                try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
                if (!r.ok) {
                    var msg = (data && (data.error || data.message)) || ('HTTP ' + r.status);
                    throw new Error(typeof msg === 'string' ? msg : 'HTTP ' + r.status);
                }
                return data;
            });
        });
        if (timer) p = p.finally(function () { clearTimeout(timer); });
        return p;
    }

    /** Provider status with a 60s cache; never throws (offline-safe). */
    function status(force) {
        if (!force && statusCache && Date.now() - statusFetchedAt < 60000) return Promise.resolve(statusCache);
        return fetchJson('/api/ai/config').then(function (d) {
            statusCache = (d && d.provider) || { configured: false };
            statusFetchedAt = Date.now();
            return statusCache;
        }).catch(function () {
            statusCache = { configured: false };
            statusFetchedAt = Date.now();
            return statusCache;
        });
    }

    /**
     * One-shot chat completion. Returns { text } or throws with a
     * human-readable message. jsonMode asks the provider for JSON output
     * (best effort; providers without response_format just get the prompt).
     */
    function chat(messages, opts) {
        opts = opts || {};
        return status().then(function (st) {
            if (!st.configured) throw new Error('no provider');
            var body = {
                messages: messages,
                temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
                max_tokens: opts.maxTokens || 600
            };
            if (opts.model) body.model = opts.model;
            if (opts.task) body.task = opts.task;
            if (opts.jsonMode) body.response_format = { type: 'json_object' };
            return fetchJson('/api/ai/chat/completions', { method: 'POST', body: body, timeoutMs: opts.timeoutMs || 45000 })
                .then(function (d) {
                    var text = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
                    if (!text) throw new Error('empty provider response');
                    return { text: text };
                });
        });
    }

    /** Parse a JSON object out of a model reply (tolerates fences/prose). */
    function parseJsonReply(text) {
        if (!text) return null;
        var m = text.match(/\{[\s\S]*\}/);
        if (!m) return null;
        try { return JSON.parse(m[0]); } catch (e) { return null; }
    }

    return { status: status, chat: chat, parseJsonReply: parseJsonReply };
})();

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
        subjects: ['General', 'Math', 'Science', 'Language'],
        // ===== NEW FEATURE STORAGE =====
        priorityMatrix: {
            'urgent-important': [],
            'not-urgent-important': [],
            'urgent-not-important': [],
            'not-urgent-not-important': []
        },
        deepWorkLogs: [],
        blockerOn: false,
        trash: [],
        fileAnnotations: {}
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
// AUTO-HIGHLIGHT THE CORRECT NAV LINK (regardless of HTML)
// ================================================================
function setActiveNavLink() {
    var path = window.location.pathname.split('/').pop() || 'index.html';
    if (path === '') path = 'index.html';

    var links = document.querySelectorAll('.nav-links a');
    if (!links.length) return;

    links.forEach(function(link) {
        link.classList.remove('active');
        var href = link.getAttribute('href');
        // Match exact file name; support both "notes.html" and "./notes.html"
        if (href === path || href === './' + path) {
            link.classList.add('active');
        }
    });
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
let analogRafId = null;

function initClock() {
    const digital = document.getElementById('digitalClock');
    const analog = document.getElementById('analogClock');
    const toggle = document.getElementById('clockToggleBtn');
    const dateEl = document.getElementById('clockDate');

    if (!digital || !analog || !toggle) return;

    // --- DPI-aware canvas setup (runs once) ---
    const canvas = document.getElementById('analogCanvas');
    let ctx = null;
    let logicalSize = 120;
    if (canvas) {
        logicalSize = parseInt(canvas.getAttribute('width'), 10) || 120;
        const dpr = Math.min(window.devicePixelRatio || 1, 3); // cap at 3 for perf
        canvas.width = logicalSize * dpr;
        canvas.height = logicalSize * dpr;
        canvas.style.width = logicalSize + 'px';
        canvas.style.height = logicalSize + 'px';
        ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    digital.classList.add('active');
    analog.classList.remove('active');
    toggle.innerHTML = '<i class="ph ph-alarm" aria-hidden="true"></i> Switch to Analog';

    // ---------- ANALOG DRAW ----------
    function drawAnalog(now) {
        if (!ctx) return;
        const w = logicalSize;
        const hc = logicalSize;
        const cx = w / 2;
        const cy = hc / 2;
        const radius = w / 2 - 6;

        ctx.clearRect(0, 0, w, hc);

        // -- Face background (radial gradient) --
        const faceGrad = ctx.createRadialGradient(cx, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
        faceGrad.addColorStop(0, 'rgba(15, 35, 55, 0.95)');
        faceGrad.addColorStop(0.7, 'rgba(6, 18, 30, 0.95)');
        faceGrad.addColorStop(1, 'rgba(2, 8, 14, 0.98)');
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = faceGrad;
        ctx.fill();

        // -- Outer bezel ring --
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(94, 234, 212, 0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // -- Inner rim glow --
        const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.75, cx, cy, radius);
        glowGrad.addColorStop(0, 'rgba(94, 234, 212, 0)');
        glowGrad.addColorStop(1, 'rgba(94, 234, 212, 0.15)');
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // -- 60 minute ticks (thin, muted) --
        for (let i = 0; i < 60; i++) {
            if (i % 5 === 0) continue;
            const angle = (i * 6 - 90) * Math.PI / 180;
            const outer = radius - 4;
            const inner = radius - 8;
            ctx.beginPath();
            ctx.moveTo(cx + outer * Math.cos(angle), cy + outer * Math.sin(angle));
            ctx.lineTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle));
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
            ctx.lineWidth = 1;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // -- 12 hour markers (bold, gradient) --
        for (let i = 0; i < 12; i++) {
            const angle = (i * 30 - 90) * Math.PI / 180;
            const outer = radius - 4;
            const inner = radius - 12;
            const x1 = cx + outer * Math.cos(angle);
            const y1 = cy + outer * Math.sin(angle);
            const x2 = cx + inner * Math.cos(angle);
            const y2 = cy + inner * Math.sin(angle);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            const grad = ctx.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, '#5eead4');
            grad.addColorStop(1, '#7dd3fc');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // -- Hour numerals (12 / 3 / 6 / 9) --
        ctx.font = 'bold ' + Math.round(radius * 0.22) + 'px Inter, sans-serif';
        ctx.fillStyle = 'rgba(238, 244, 251, 0.85)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        [12, 3, 6, 9].forEach(function (num) {
            const angle = (num * 30 - 90) * Math.PI / 180;
            const r = radius - 22;
            ctx.fillText(String(num), cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        });

        // -- Compute angles (second hand uses ms for smooth sweep) --
        const sec = now.getSeconds();
        const ms  = now.getMilliseconds();
        const min = now.getMinutes() + sec / 60;
        const hr  = (now.getHours() % 12) + min / 60;

        const secAngle  = ((sec + ms / 1000) * 6 - 90) * Math.PI / 180;
        const minAngle  = (min * 6 - 90) * Math.PI / 180;
        const hourAngle = (hr * 30 - 90) * Math.PI / 180;

        // -- Hand drawing helper --
        function drawHand(angle, length, tailLength, color, width, glowColor) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cx - tailLength * Math.cos(angle), cy - tailLength * Math.sin(angle));
            ctx.lineTo(cx + length * Math.cos(angle), cy + length * Math.sin(angle));
            ctx.lineCap = 'round';
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            if (glowColor) {
                ctx.shadowColor = glowColor;
                ctx.shadowBlur = 8;
            }
            ctx.stroke();
            ctx.restore();
        }

        // Hour hand — pink→purple gradient, thick
        const hourGrad = ctx.createLinearGradient(
            cx, cy,
            cx + radius * 0.5 * Math.cos(hourAngle),
            cy + radius * 0.5 * Math.sin(hourAngle)
        );
        hourGrad.addColorStop(0, '#f472b6');
        hourGrad.addColorStop(1, '#c084fc');
        drawHand(hourAngle, radius * 0.5, radius * 0.12, hourGrad, Math.max(3, radius * 0.07), 'rgba(244, 114, 182, 0.6)');

        // Minute hand — mint
        drawHand(minAngle, radius * 0.72, radius * 0.14, '#6ee7b7', Math.max(2, radius * 0.05), 'rgba(110, 231, 183, 0.5)');

        // Second hand — cyan, thin, extra glow
        drawHand(secAngle, radius * 0.85, radius * 0.2, '#5eead4', Math.max(1, radius * 0.018), 'rgba(94, 234, 212, 0.9)');

        // -- Center cap (three layers) --
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.07, 0, Math.PI * 2);
        ctx.fillStyle = '#c084fc';
        ctx.shadowColor = 'rgba(192, 132, 252, 0.8)';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.035, 0, Math.PI * 2);
        ctx.fillStyle = '#0a1824';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.02, 0, Math.PI * 2);
        ctx.fillStyle = '#5eead4';
        ctx.fill();
    }

        // ---------- HIGH-LEVEL TICK ----------
    function updateClock() {
        const now = new Date();

        let h = now.getHours() % 12;
        if (h === 0) h = 12;                                  // 0 → 12 (midnight/noon)
        const ampm = now.getHours() < 12 ? 'AM' : 'PM';
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        digital.textContent = h + ':' + m + ':' + s + ' ' + ampm;

        // Only redraw analog when it's visible — avoids wasted work in digital mode
        if (analog.classList.contains('active')) drawAnalog(now);

        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        }
    }

    // ---------- SMOOTH SECOND HAND LOOP ----------
    function analogLoop() {
        if (!analog.classList.contains('active')) {
            analogRafId = null;
            return;
        }
        drawAnalog(new Date());
        analogRafId = requestAnimationFrame(analogLoop);
    }

    function startAnalogLoop() {
        if (analogRafId === null) {
            analogRafId = requestAnimationFrame(analogLoop);
        }
    }

    function stopAnalogLoop() {
        if (analogRafId !== null) {
            cancelAnimationFrame(analogRafId);
            analogRafId = null;
        }
    }

    // First paint
    updateClock();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(updateClock, 1000);

    // ---------- TOGGLE ----------
    toggle.addEventListener('click', function () {
        if (clockMode === 'digital') {
            clockMode = 'analog';
            digital.classList.remove('active');
            analog.classList.add('active');
            this.innerHTML = '<i class="ph ph-clock" aria-hidden="true"></i> Switch to Digital';
            startAnalogLoop();
        } else {
            clockMode = 'digital';
            digital.classList.add('active');
            analog.classList.remove('active');
            this.innerHTML = '<i class="ph ph-alarm" aria-hidden="true"></i> Switch to Analog';
            stopAnalogLoop();
            updateClock();
        }
    });
}
// ================================================================
// 30-MINUTE SOFT MELODY REMINDER
// ================================================================
function playSoftMelody() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [523.25, 587.33, 659.25, 783.99, 880.00, 783.99, 659.25, 587.33];
        const durations = [0.3, 0.3, 0.3, 0.4, 0.4, 0.3, 0.3, 0.5];
        let time = audioCtx.currentTime + 0.1;

        notes.forEach((freq, index) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(0.15, time + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, time + durations[index] - 0.1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(time);
            osc.stop(time + durations[index]);
            time += durations[index] + 0.1;
        });
    } catch (e) {
        // Silent fail if audio context is blocked
    }
}

function initMelodyTimer() {
    const key = 'studyHubStartTime';
    const interval = 30 * 60 * 1000; // 30 minutes
    let startTime = localStorage.getItem(key);
    const now = Date.now();

    if (!startTime) {
        startTime = now;
        localStorage.setItem(key, startTime);
    }

    const elapsed = now - parseInt(startTime, 10);

    if (elapsed >= interval) {
        playSoftMelody();
        localStorage.setItem(key, now);
    } else {
        const remaining = interval - elapsed;
        setTimeout(() => {
            playSoftMelody();
            localStorage.setItem(key, Date.now());
        }, remaining);
    }
}



/* ================================================================
   Translation engine removed — replaced by live Google Translate
   (eduhub-translate.js, navbar). This shim keeps every internal
   getTranslation() call site working with English strings.
   ================================================================ */
var __EH_EN = {
  no_notes:'No notes yet.', no_habits:'No habits yet. Add one above!',
  no_notices:'No notices pinned yet.', no_assignments:'No pending assignments.',
  no_history:'No history recorded yet.', no_files:'No files uploaded yet.',
  no_items:'No items.', notices_count:'notices', entries:'entries', entry:'entry',
  complete:'Complete', done:'Done', add:'Add', delete_all:'Delete All',
  show_keyboard:'Show Keyboard', hide_keyboard:'Hide Keyboard',
  focus_off:'Focus Off', focus_on:'Focus On',
  today:'Today', days:'days', notes:'Notes', habits:'Habits', notice:'Notice',
  files:'Files', assignments:'Assignments', planner:'Planner',
  flashcards:'Flashcards', reading:'Reading', today_word:'today',
  reset_confirm:'Reset? This cannot be undone.',
  quiz_next:'Next', quiz_results:'Results', quiz_score:'Score', quiz_review:'Review',
  quiz_source:'From your note', quiz_fill_blank:'Fill in the blank',
  quiz_cards_saved:'Wrong answers saved to your flashcards.', quiz_retry_missed:'Retry missed',
  ai_summary_empty:'Paste some text above to see a summary.',
  ai_summary_log:'Generated an AI summary',
  ai_empty_query:"Type what you're working on first.",
  ai_fallback:'Could you be more specific? Try mentioning a subject, task, or keyword.',
  ai_offline_note:'Offline summary (connect a provider key in Admin > AI for full AI summaries).',
  ai_error_note:'AI request failed: offline summary shown instead.',
  ai_quiz_empty:'Add at least 3 notes to generate a quiz.',
  ai_quiz_offline:'Offline quiz from your notes.',
  ai_fc_none:'No notes available. Add some notes first!',
  act_ai_recommend:'Asked AI for a recommendation: "{q}"',
  generate_quiz_btn:'Generate Quiz from Notes', clear_quiz_btn:'Clear Quiz',
  auto_flashcards_btn:'Auto-Generate from Notes',
  blocker_on:'Blocker On', blocker_off:'Blocker Off',
  trash_label:'Trash', switch_analog:'Switch to Analog', switch_digital:'Switch to Digital',
  ai_planner_title:'StudyHub AI Planner',
    ai_planner_desc:'Describe what you want — full daily routines now include wake-up, shower, meals, prayers (optional), sports, rest, wind-down and sleep around your study blocks. Try "make a full daily routine with prayers and gym" or "intense exam week, sleep at 11".',
  ai_planner_placeholder:'Type your request here...',
  generate_plan_btn:'Generate Plan',
  chip_auto:'Auto routine', chip_easy:'Easy', chip_exam:'Exam week', chip_weekend:'Weekend',
  chip_math_physics:'Math + Physics', chip_surprise:'Surprise', chip_3h:'3h today',
  reset_planner_btn:'Reset Planner'
};
function getTranslation(key) { return (__EH_EN && __EH_EN[key]) || key; }
function applyTranslations() { /* removed — live Google Translate handles page translation */ }
function initTranslations() { /* removed — see above */ }


// ================================================================
// DELETE HISTORY (bulk)
// ================================================================
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
        new Notification('Assignment Due Tomorrow', {
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
// DASHBOARD RENDER
// ================================================================
function renderDashboard() {
    const data = loadData();
    resetDailyIfNeeded(data);
   const today = new Date().toISOString().slice(0, 10);
var todayEl = document.getElementById('todayDate');
if (todayEl) todayEl.textContent = today;

    const todaySearches = data.searches.filter(function(s) { return s.date.startsWith(today); }).length;
    const todayFiles = data.files.filter(function(f) { return f.date && f.date.startsWith(today); }).length;
    const todayTasks = data.history.filter(function(h) { return h.date === today && h.type === 'habit_complete'; }).length;

  // ---- LONGEST streak — persisted across sessions ----
let longestStreak = data.longestStreak || 0;
if (data.habits.length > 0) {
    var allDates = new Set();
    data.habits.forEach(function(h) {
        (h.completedDates || []).forEach(function(d) { allDates.add(d); });
    });
    var sorted = Array.from(allDates).sort();
    if (sorted.length > 0) {
        var run = 1;
        if (run > longestStreak) longestStreak = run;
        for (var i = 1; i < sorted.length; i++) {
            var diff = (new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000;
            if (diff === 1) {
                run++;
                if (run > longestStreak) longestStreak = run;
            } else {
                run = 1;
            }
        }
    }
}
if (longestStreak > (data.longestStreak || 0)) {
    data.longestStreak = longestStreak;
    saveData(data);
}

// ---- CURRENT streak — count back from today ----
let currentStreak = 0;
if (data.habits.length > 0) {
    var todayStr = new Date().toISOString().slice(0, 10);
    var dateSet = new Set();
    data.habits.forEach(function(h) {
        (h.completedDates || []).forEach(function(d) { dateSet.add(d); });
    });
    var cur = new Date();
    if (!dateSet.has(todayStr)) cur.setDate(cur.getDate() - 1);
    while (dateSet.has(cur.toISOString().slice(0, 10))) {
        currentStreak++;
        cur.setDate(cur.getDate() - 1);
    }
}

document.getElementById('statSearches').textContent = todaySearches;
document.getElementById('statFiles').textContent = data.files.length;
document.getElementById('statTasks').textContent = todayTasks;
document.getElementById('statStreak').textContent = longestStreak;  // stat card shows longest

    // All History (rendered inside the history overlay)
    var allHist = data.history;
    var hc = document.getElementById('historyActivity');
    if (allHist.length === 0) {
        hc.innerHTML = '<p class="empty-state">' + getTranslation('no_history') + '</p>';
    } else {
        hc.innerHTML = allHist.slice().reverse().map(function(h) {
            return '<div class="activity-item"><span>' + escapeUserHtml(h.description) + '</span><span class="time">' + h.date + ' <button class="delete-item-btn" data-timestamp="' + h.timestamp + '">✕</button></span></div>';
        }).join('');
    }
    document.getElementById('historyCount').textContent = allHist.length + ' ' + getTranslation(allHist.length === 1 ? 'entry' : 'entries');

    // Upcoming Assignments
    var assignEl = document.getElementById('upcomingAssignments');
    if (assignEl) {
        var upcoming = data.assignments.filter(function(a) { return !a.completed; }).sort(function(a, b) {
            return new Date(a.due) - new Date(b.due);
        }).slice(0, 5);
        if (upcoming.length === 0) {
            assignEl.innerHTML = '<p class="empty-state">' + getTranslation('no_assignments') + '</p>';
        } else {
            assignEl.innerHTML = upcoming.map(function(a) {
                return '<div class="assignment-item priority-' + a.priority + '"><span>' + escapeUserHtml(a.title) + ' <span class="tags">' + (a.tags ? '#' + a.tags.map(escapeUserHtml).join(' #') : '') + '</span></span><span>' + a.due + '</span></div>';
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
    document.querySelectorAll('#historyActivity .delete-item-btn').forEach(function(btn) {
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
// AI SUMMARIZER v3 — fused TL;DR · redundancy filter · entity topics
// chunk-safe for long docs · Brief/Standard/Detailed · 10–40% length
// bullets↔paragraph · download · provider-first, offline always works
// ================================================================
function setupSummarizer() {
  var btn = document.getElementById('summarizeBtn');
  if (!btn) return;
  var input = document.getElementById('summarizeInput');
  var output = document.getElementById('summarizeOutput');

  if (!document.getElementById('sumxStyles')) {
    var stl = document.createElement('style');
    stl.id = 'sumxStyles';
    stl.textContent = [
      '.sumx-controls{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.6rem 0}',
      '.sumx-chip{background:var(--surface-2,rgba(148,163,184,.06));border:1px solid var(--line,#2a3648);color:var(--muted,#8d9aa9);border-radius:999px;padding:.32rem .85rem;font:600 12px var(--font,sans-serif);cursor:pointer;transition:all .15s}',
      '.sumx-chip:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}',
      '.sumx-chip.on{background:var(--accent-soft,rgba(63,210,176,.12));border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}',
      '.sumx-len{display:inline-flex;align-items:center;gap:.45rem;font:600 11px var(--font,sans-serif);color:var(--muted,#8d9aa9)}',
      '.sumx-len input[type=range]{accent-color:var(--accent,#3fd2b0);width:110px;cursor:pointer}',
      '.sumx-out{background:var(--surface-2,rgba(148,163,184,.05));border:1px solid var(--line,rgba(148,163,184,.14));border-left:3px solid var(--accent,#3fd2b0);border-radius:12px;padding:1rem 1.1rem;margin-top:.8rem}',
      '.sumx-tldr{font:650 15px/1.6 var(--font,inherit);color:var(--ink,#edf2f7);margin-bottom:.7rem}',
      '.sumx-label{font:700 10.5px var(--font,sans-serif);text-transform:uppercase;letter-spacing:.14em;color:var(--accent,#3fd2b0);margin:.8rem 0 .45rem}',
      '.sumx-points{list-style:none;padding:0;margin:0}',
      '.sumx-points li{position:relative;padding:.3rem 0 .3rem 1.1rem;color:var(--ink-2,#cfd9e3);font-size:13.5px;line-height:1.6}',
      '.sumx-points li::before{content:"▸";position:absolute;left:0;color:var(--accent,#3fd2b0);font-weight:800}',
      '.sumx-para{color:var(--ink-2,#cfd9e3);font-size:13.5px;line-height:1.7;margin:0 0 .6rem}',
      '.sumx-kw{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.5rem}',
      '.sumx-kw span{background:rgba(63,210,176,.1);border:1px solid rgba(63,210,176,.25);color:var(--accent,#3fd2b0);border-radius:999px;padding:.15rem .6rem;font:600 11px var(--font,sans-serif)}',
      '.sumx-stats{display:flex;flex-wrap:wrap;gap:1rem;font:600 11px var(--mono,monospace);color:var(--faint,#7a8a9e);margin-top:.9rem;padding-top:.7rem;border-top:1px dashed var(--line,rgba(148,163,184,.14))}',
      '.sumx-stats b{color:var(--ink,#edf2f7)}',
      '.sumx-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem}',
      '.sumx-actions button{background:transparent;border:1px solid var(--line,#2a3648);color:var(--ink-2,#cfd9e3);border-radius:8px;padding:.4rem .85rem;font:600 12px var(--font,sans-serif);cursor:pointer;transition:all .15s}',
      '.sumx-actions button:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}',
      '.sumx-msg{color:var(--muted,#8d9aa9);font-size:13px;line-height:1.6}'
    ].join('');
    document.head.appendChild(stl);
  }

  var mode = 'standard', pct = 25, paraMode = false;
  var controls = document.createElement('div');
  controls.className = 'sumx-controls';
  controls.innerHTML =
    '<button type="button" class="sumx-chip on" data-mode="brief">✦ Brief</button>' +
    '<button type="button" class="sumx-chip" data-mode="standard">☰ Standard</button>' +
    '<button type="button" class="sumx-chip" data-mode="detailed">≣ Detailed</button>' +
    '<span class="sumx-len">Length <input type="range" id="sumxLen" min="10" max="40" step="5" value="25"> <span id="sumxLenV">25%</span></span>' +
    '<button type="button" class="sumx-chip" id="sumxFormat">¶ Paragraph</button>';
  input.parentNode.insertBefore(controls, input.nextSibling);
  controls.querySelectorAll('.sumx-chip[data-mode]').forEach(function (c) {
    c.addEventListener('click', function () {
      mode = this.dataset.mode;
      controls.querySelectorAll('.sumx-chip[data-mode]').forEach(function (x) { x.classList.toggle('on', x === c); });
    });
  });
  var lenIn = controls.querySelector('#sumxLen');
  lenIn.addEventListener('input', function () {
    pct = +this.value;
    controls.querySelector('#sumxLenV').textContent = pct + '%';
  });
  controls.querySelector('#sumxFormat').addEventListener('click', function () {
    paraMode = !paraMode;
    this.classList.toggle('on', paraMode);
    this.textContent = paraMode ? '¶ Paragraph' : '• Bullets';
  });

  /* ---------- NLP core ---------- */
  var STOP = {};
  ('a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my no nor not of off on once only or other ought our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your also may might must upon among within without across along etc via per'.split(' ')).forEach(function (w) { STOP[w] = 1; });
  var CUE = /\b(in conclusion|in summary|the main|the key|important|significant|therefore|thus|hence|overall|essential|crucial|the point is|we (found|conclude|show)|this (shows|means|demonstrates))\b/i;
  function words(s) { return (String(s).toLowerCase().match(/[a-z][a-z'\-]*/g) || []); }
  function cw(s) { return words(s).filter(function (w) { return w.length > 2 && !STOP[w]; }); }
  function stem(w) { return w.replace(/(ations?|itions?)$/, 'ate').replace(/(ing|ed|ly|es|s)$/, ''); }
  function splitSentences(p) {
    var x = String(p).replace(/\b(Mr|Mrs|Dr|vs|etc|e\.g|i\.e)\./gi, '$1\u0001');
    var out = [], buf = '';
    for (var i = 0; i < x.length; i++) {          /* ES5-safe splitter */
      buf += x[i];
      if (/[.!?]/.test(x[i]) && (i + 1 >= x.length || /\s/.test(x[i + 1] || ' '))) {
        var s = buf.trim().replace(/\u0001/g, '.');
        if (s.length > 2) out.push(s);
        buf = '';
      }
    }
    if (buf.trim().length > 2) out.push(buf.trim());
    return out;
  }
  /* chunking: long docs scored per ~1200-word chunk so late paragraphs compete fairly */
  function summarizeText(text) {
    var paras = String(text).replace(/\r/g, '').split(/\n{2,}/).map(function (p) { return p.trim(); }).filter(Boolean);
    if (!paras.length) paras = [String(text).trim()];
    var sents = [], wordCount = 0;
    paras.forEach(function (p, pi) {
      splitSentences(p).forEach(function (s, si) {
        sents.push({ s: s, p: pi, i: si });
        wordCount += cw(s).length;
      });
    });
    if (!sents.length) return null;
    var CHUNK = 200;                               /* sentences per scoring chunk */
    var chunks = [];
    for (var c = 0; c < sents.length; c += CHUNK) chunks.push(sents.slice(c, c + CHUNK));
    chunks.forEach(function (chunk) {
      var freq = {}, maxF = 1;
      chunk.forEach(function (en) { cw(en.s).forEach(function (w) { var k = stem(w); freq[k] = (freq[k] || 0) + 1; }); });
      Object.keys(freq).forEach(function (k) { if (freq[k] > maxF) maxF = freq[k]; });
      chunk.forEach(function (en) {
        var toks = cw(en.s).map(stem), wc = toks.length || 1, score = 0;
        toks.forEach(function (w) { score += (freq[w] || 0) / maxF; });
        score /= Math.sqrt(wc);
        if (en.i === 0) score *= 1.35;
        if (en.p === 0 && en.i === 0) score *= 1.2;
        if (CUE.test(en.s)) score *= 1.25;
        var nums = (en.s.match(/\b\d+(\.\d+)?%?\b/g) || []).length;
        score *= 1 + Math.min(0.25, nums * 0.05);
        if (wc < 5) score *= 0.6; else if (wc > 45) score *= 0.85;
        en.score = score;
      });
    });
    var target = Math.max(1, Math.min(16, Math.round(sents.length * (pct / 100))));
    if (mode === 'brief') target = Math.min(target, 2);
    if (mode === 'standard') target = Math.max(2, Math.min(target, 6));
    if (mode === 'detailed') target = Math.max(3, Math.min(target, 12));
    var picked = sents.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, target);
    picked.sort(function (a, b) { return a.idx - b.idx; });
    /* redundancy filter: >60% shared content words with a kept sentence = duplicate */
    var kept = [];
    picked.forEach(function (en) {
      var ws = {};
      cw(en.s).forEach(function (w) { ws

// ================================================================
// HABITS  (event-delegation — delete + complete work on every render)
// ================================================================
function setupHabits() {
    var input          = document.getElementById('habitInput');
    var addBtn         = document.getElementById('addHabitBtn');
    var list           = document.getElementById('habitList');
    var delBtn         = document.getElementById('deleteAllHabitsBtn');
    var streakDisplay  = document.getElementById('streakDisplay');

    if (!list) return;

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function(c) {
            return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
        });
    }

    // ---------- RENDER ----------
    function renderHabits() {
        var data = loadData();

        if (data.habits.length === 0) {
            list.innerHTML = '<p class="empty-state">' + getTranslation('no_habits') + '</p>';
            updateStreak();
            return;
        }

        var today = new Date().toISOString().slice(0, 10);

        list.innerHTML = data.habits.map(function(h) {
            var done = h.completedDates && h.completedDates.includes(today);
            return '<div class="habit-item">' +
                       '<span class="habit-text">' + escapeHtml(h.text) + (done ? ' ✅' : '') + '</span>' +
                       '<div class="habit-actions">' +
                           '<button class="complete-btn ' + (done ? 'done' : '') + '" ' +
                                   'data-id="' + h.id + '" ' +
                                   'data-action="complete-habit" ' +
                                   'type="button">' +
                               (done ? getTranslation('done') : getTranslation('complete')) +
                           '</button>' +
                           '<button class="delete-item-btn" ' +
                                   'data-id="' + h.id + '" ' +
                                   'data-action="delete-habit" ' +
                                   'type="button" ' +
                                   'title="Delete habit">✕</button>' +
                       '</div>' +
                   '</div>';
        }).join('');

        updateStreak();
    }

 // ---------- STREAK (daily current + persisted longest) ----------
function updateStreak() {
    var data = loadData();

    // ---- Collect all unique completed dates across every habit ----
    var allDates = new Set();
    data.habits.forEach(function(h) {
        (h.completedDates || []).forEach(function(d) { allDates.add(d); });
    });

    // ---- CURRENT streak — count backwards from today ----
    // If today has no completion yet, start from yesterday (grace period
    // so you don't see 0 every morning before you've done anything).
    var today = new Date();
    var todayStr = today.toISOString().slice(0, 10);

    var cursor = new Date(today);
    if (!allDates.has(todayStr)) {
        cursor.setDate(cursor.getDate() - 1);
    }

    var currentStreak = 0;
    while (allDates.has(cursor.toISOString().slice(0, 10))) {
        currentStreak++;
        cursor.setDate(cursor.getDate() - 1);
    }

    // ---- LONGEST streak — scan the sorted date list ----
    var sorted = Array.from(allDates).sort();
    var longestStreak = 0;
    if (sorted.length > 0) {
        var run = 1;
        longestStreak = 1;
        for (var i = 1; i < sorted.length; i++) {
            var diff = (new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000;
            if (diff === 1) {
                run++;
                if (run > longestStreak) longestStreak = run;
            } else {
                run = 1;
            }
        }
    }

    // ---- Persist the longest streak so browser cache clearing can't lose it ----
    if (!data.longestStreak) data.longestStreak = 0;
    if (longestStreak > data.longestStreak) {
        data.longestStreak = longestStreak;
        saveData(data);
    }
    // If we have more recent history than what's persisted, use the larger one
    var recordedLongest = Math.max(longestStreak, data.longestStreak || 0);

    // ---- Update every streak display on the page ----
    // #streakDisplay is used on habits.html
    if (streakDisplay) streakDisplay.textContent = currentStreak;

    // Optional secondary slots if your HTML has them (safe no-ops otherwise)
    var longestEl = document.getElementById('longestStreakDisplay');
    if (longestEl) longestEl.textContent = recordedLongest;

    var currentEl = document.getElementById('currentStreakDisplay');
    if (currentEl) currentEl.textContent = currentStreak;

    // Dashboard stat (index.html): show the longest record
    var dashEl = document.getElementById('statStreak');
    if (dashEl) dashEl.textContent = recordedLongest;
}

    // ---------- ONE delegated listener on the container ----------
    if (!list.dataset.habitsHooked) {
        list.dataset.habitsHooked = '1';

        list.addEventListener('click', function(e) {
            var btn = e.target.closest('button[data-action]');
            if (!btn) return;

            var action = btn.dataset.action;
            var id     = btn.dataset.id;
            if (!id) return;

            e.preventDefault();
            e.stopPropagation();

            // ---------- COMPLETE ----------
            if (action === 'complete-habit') {
                var data = loadData();
                var habit = data.habits.find(function(h) { return h.id === id; });
                if (!habit) return;

                var today = new Date().toISOString().slice(0, 10);
                if (!habit.completedDates) habit.completedDates = [];

                if (!habit.completedDates.includes(today)) {
                    habit.completedDates.push(today);
                    if (typeof addActivity === 'function') {
                        addActivity(data, 'habit_complete', 'Completed habit: "' + habit.text + '"');
                    }
                    saveData(data);
                    renderHabits();
                    if (document.getElementById('statTasks') && typeof renderDashboard === 'function') {
                        renderDashboard();
                    }
                }
                return;
            }

            // ---------- DELETE ----------
            if (action === 'delete-habit') {
                if (!confirm('Delete this habit? It will go to Trash for 24 hours.')) return;

                var d2 = loadData();
                var item = d2.habits.find(function(h) { return h.id === id; });
                if (!item) return;

                if (typeof pushToTrash === 'function') pushToTrash(d2, 'habit', item);
                d2.habits = d2.habits.filter(function(h) { return h.id !== id; });

                if (typeof addActivity === 'function') {
                    addActivity(d2, 'delete', 'Moved habit to trash');
                }
                saveData(d2);

                renderHabits();
                if (typeof updateTrashCount === 'function') updateTrashCount();
                if (document.getElementById('statTasks') && typeof renderDashboard === 'function') {
                    renderDashboard();
                }
                return;
            }
        });
    }

    // ---------- ADD ----------
    if (addBtn && !addBtn.dataset.habitsHooked) {
        addBtn.dataset.habitsHooked = '1';
        addBtn.addEventListener('click', function() {
            var text = input.value.trim();
            if (!text) return;
            var data = loadData();
            data.habits.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                text: text,
                completedDates: []
            });
            if (typeof addActivity === 'function') {
                addActivity(data, 'habit_add', 'Created habit: "' + text + '"');
            }
            saveData(data);
            input.value = '';
            renderHabits();
            if (document.getElementById('statTasks') && typeof renderDashboard === 'function') {
                renderDashboard();
            }
        });
    }

    if (input && !input.dataset.habitsHooked) {
        input.dataset.habitsHooked = '1';
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addBtn.click();
            }
        });
    }

    // ---------- DELETE ALL ----------
    if (delBtn && !delBtn.dataset.habitsHooked) {
        delBtn.dataset.habitsHooked = '1';
        delBtn.addEventListener('click', function() {
            if (!confirm('Move all habits to Trash? They will be recoverable for 24 hours.')) return;
            var data = loadData();
            data.habits.forEach(function(h) {
                if (typeof pushToTrash === 'function') pushToTrash(data, 'habit', h);
            });
            data.habits = [];
            if (typeof addActivity === 'function') {
                addActivity(data, 'delete', 'Moved all habits to trash');
            }
            saveData(data);
            renderHabits();
            if (typeof updateTrashCount === 'function') updateTrashCount();
            if (document.getElementById('statTasks') && typeof renderDashboard === 'function') {
                renderDashboard();
            }
        });
    }

    renderHabits();
}

// ================================================================
// NOTICE — pinned announcements  (idempotent, safe to call twice)
// ================================================================
function setupNotice() {
    var input   = document.getElementById('noticeInput');
    var addBtn  = document.getElementById('addNoticeBtn');
    var list    = document.getElementById('noticeList');
    var delBtn  = document.getElementById('deleteAllNoticesBtn');
    var countEl = document.getElementById('noticeCount');

    if (!list) return;

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function(c) {
            return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
        });
    }

    // ---------- RENDER ----------
    function renderNotices() {
        var data = loadData();

        if (data.notices.length === 0) {
            list.innerHTML = '<p class="empty-state">' + getTranslation('no_notices') + '</p>';
        } else {
            list.innerHTML = data.notices.map(function(n) {
                var dateStr = new Date(n.date).toLocaleDateString();
                return '<div class="notice-item">' +
                           '<span>' + escapeHtml(n.text) + '</span>' +
                           '<span class="time">' + dateStr +
                               ' <button class="delete-item-btn" type="button" ' +
                                       'data-id="' + n.id + '" data-action="delete-notice" ' +
                                       'title="Delete notice">✕</button>' +
                           '</span>' +
                       '</div>';
            }).join('');
        }

        if (countEl) countEl.textContent = data.notices.length + ' ' + getTranslation('notices_count');
    }

    // ---------- PIN ----------
    function pinNotice() {
        if (!input) return;
        var text = input.value.trim();
        if (!text) {
            input.style.borderColor = '#fca5a5';
            input.style.boxShadow = '0 0 0 3px rgba(252, 165, 165, 0.18)';
            input.focus();
            setTimeout(function () {
                input.style.borderColor = '';
                input.style.boxShadow = '';
            }, 1200);
            return;
        }
        var data = loadData();
        data.notices.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            text: text,
            date: new Date().toISOString()
        });
        if (typeof addActivity === 'function') {
            addActivity(data, 'notice_add', 'Added notice: "' + text + '"');
        }
        saveData(data);
        input.value = '';
        renderNotices();
        if (document.getElementById('statTasks') && typeof renderDashboard === 'function') {
            renderDashboard();
        }
    }

    // Expose globally so an inline onclick attribute also works
    window.__pinNotice = pinNotice;

    // ---------- ONE delegated listener on the list (delete) ----------
    if (!list.dataset.noticeHooked) {
        list.dataset.noticeHooked = '1';

        list.addEventListener('click', function(e) {
            var btn = e.target.closest('.delete-item-btn[data-action="delete-notice"]');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            var id = btn.dataset.id;
            if (!id) return;
            if (!confirm('Delete this notice? It will go to Trash for 24 hours.')) return;

            var data = loadData();
            var item = data.notices.find(function(n) { return n.id === id; });
            if (!item) return;

            if (typeof pushToTrash === 'function') pushToTrash(data, 'notice', item);
            data.notices = data.notices.filter(function(n) { return n.id !== id; });

            if (typeof addActivity === 'function') addActivity(data, 'delete', 'Moved notice to trash');
            saveData(data);

            renderNotices();
            if (typeof updateTrashCount === 'function') updateTrashCount();
            if (document.getElementById('statTasks') && typeof renderDashboard === 'function') {
                renderDashboard();
            }
        });
    }

    // ---------- PIN BUTTON ----------
    if (addBtn && !addBtn.dataset.noticePinHooked) {
        addBtn.dataset.noticePinHooked = '1';
        addBtn.addEventListener('click', function(e) {
            e.preventDefault();
            pinNotice();
        });
    }

    // ---------- ENTER KEY ----------
    if (input && !input.dataset.noticeInputHooked) {
        input.dataset.noticeInputHooked = '1';
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                pinNotice();
            }
        });
    }

    // ---------- DELETE ALL ----------
    if (delBtn && !delBtn.dataset.noticeDelAllHooked) {
        delBtn.dataset.noticeDelAllHooked = '1';
        delBtn.addEventListener('click', function() {
            if (!confirm('Move all notices to Trash? They will be recoverable for 24 hours.')) return;
            var data = loadData();
            data.notices.forEach(function(n) {
                if (typeof pushToTrash === 'function') pushToTrash(data, 'notice', n);
            });
            data.notices = [];
            if (typeof addActivity === 'function') addActivity(data, 'delete', 'Moved all notices to trash');
            saveData(data);
            renderNotices();
            if (typeof updateTrashCount === 'function') updateTrashCount();
            if (document.getElementById('statTasks') && typeof renderDashboard === 'function') {
                renderDashboard();
            }
        });
    }

    renderNotices();
}


// ================================================================
// NOTES  (event-delegation — delete works reliably on every render)
// ================================================================
function setupNotes() {
    var input  = document.getElementById('noteInput');
    var addBtn = document.getElementById('addNoteBtn');
    var list   = document.getElementById('noteList');
    var delBtn = document.getElementById('deleteAllNotesBtn');

    if (!list) return;

    // ---- Render ----
    function renderNotes() {
        var data = loadData();
        if (data.notes.length === 0) {
            list.innerHTML = '<p class="empty-state">' + getTranslation('no_notes') + '</p>';
            return;
        }
        list.innerHTML = data.notes.map(function(n) {
            var dateStr = new Date(n.date).toLocaleDateString();
            return '<div class="note-item">' +
                       '<span class="note-text">' + escapeNoteHtml(n.text) + '</span>' +
                       '<span class="time">' + dateStr +
                           ' <button class="delete-item-btn" data-id="' + n.id + '" ' +
                           'data-action="delete-note" type="button" title="Delete note">✕</button>' +
                       '</span>' +
                   '</div>';
        }).join('');
    }

    // Small HTML escape so user text can't break the DOM
    function escapeNoteHtml(s) {
        return String(s).replace(/[&<>"']/g, function(c) {
            return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
        });
    }

    // ---- ONE delegated listener on the container (survives re-renders) ----
    if (!list.dataset.notesHooked) {
        list.dataset.notesHooked = '1';

        list.addEventListener('click', function(e) {
            var btn = e.target.closest('.delete-item-btn[data-action="delete-note"]');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            var id = btn.dataset.id;
            if (!id) return;

            if (!confirm('Delete this note? It will go to Trash for 24 hours.')) return;

            var data = loadData();
            var item = data.notes.find(function(n) { return n.id === id; });
            if (!item) return;

            // Soft-delete → Trash
            if (typeof pushToTrash === 'function') pushToTrash(data, 'note', item);
            data.notes = data.notes.filter(function(n) { return n.id !== id; });

            if (typeof addActivity === 'function') {
                addActivity(data, 'delete', 'Moved note to trash');
            }
            saveData(data);

            renderNotes();
            if (typeof updateTrashCount === 'function') updateTrashCount();
            if (document.getElementById('statTasks') && typeof renderDashboard === 'function') {
                renderDashboard();
            }
        });
    }

    // ---- Add note ----
    if (addBtn && !addBtn.dataset.notesHooked) {
        addBtn.dataset.notesHooked = '1';
        addBtn.addEventListener('click', function() {
            var text = input.value.trim();
            var hasFiles = pendingFiles && pendingFiles.length > 0;
            if (!text && !hasFiles) return;
            var data = loadData();

            // Add inline text as a note
            if (text) {
                data.notes.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    text: text,
                    date: new Date().toISOString()
                });
            }

            // Add each extracted file as a separate note
            if (hasFiles) {
                pendingFiles.forEach(function(f) {
                    data.notes.push({
                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                        text: f.text,
                        date: new Date().toISOString(),
                        source: f.name
                    });
                });
                var logText = 'Imported ' + pendingFiles.length + ' file(s) as notes';
                if (typeof addActivity === 'function') addActivity(data, 'note_add', logText);
                pendingFiles = [];
                if (chipsContainer) chipsContainer.innerHTML = '';
            } else {
                if (typeof addActivity === 'function') addActivity(data, 'note_add', 'Added note: "' + text + '"');
            }

            saveData(data);
            if (input) input.value = '';
            renderNotes();
            if (document.getElementById('statTasks') && typeof renderDashboard === 'function') {
                renderDashboard();
            }
        });
    }

    if (input && !input.dataset.notesHooked) {
        input.dataset.notesHooked = '1';
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addBtn.click();
            }
        });
    }

    // ---- Delete all notes ----
    if (delBtn && !delBtn.dataset.notesHooked) {
        delBtn.dataset.notesHooked = '1';
        delBtn.addEventListener('click', function() {
            if (!confirm('Move all notes to Trash? They will be recoverable for 24 hours.')) return;
            var data = loadData();
            data.notes.forEach(function(n) {
                if (typeof pushToTrash === 'function') pushToTrash(data, 'note', n);
            });
            data.notes = [];
            if (typeof addActivity === 'function') addActivity(data, 'delete', 'Moved all notes to trash');
            saveData(data);
            renderNotes();
            if (typeof updateTrashCount === 'function') updateTrashCount();
            if (document.getElementById('statTasks') && typeof renderDashboard === 'function') {
                renderDashboard();
            }
        });
    }

    // ---- File upload zone ----
    var uploadZone = document.getElementById('noteUploadArea');
    var fileInput = document.getElementById('noteFileInput');
    var browseBtn = document.getElementById('noteFileBrowse');
    var chipsContainer = document.getElementById('noteFileChips');
    var pendingFiles = []; // { name, text, size }

    if (uploadZone && fileInput) {
        // Click to browse
        if (browseBtn) browseBtn.addEventListener('click', function(e) {
            e.preventDefault();
            fileInput.click();
        });
        uploadZone.addEventListener('click', function(e) {
            if (e.target === browseBtn || browseBtn && browseBtn.contains(e.target)) return;
            fileInput.click();
        });

        // Drag and drop
        uploadZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });
        uploadZone.addEventListener('dragleave', function() {
            uploadZone.classList.remove('drag-over');
        });
        uploadZone.addEventListener('drop', function(e) {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            handleFiles(e.dataTransfer.files);
        });

        // File input change
        fileInput.addEventListener('change', function() {
            handleFiles(fileInput.files);
            fileInput.value = '';
        });
    }

    function handleFiles(fileList) {
        if (!fileList || !fileList.length) return;
        Array.from(fileList).forEach(function(file) {
            var ext = file.name.split('.').pop().toLowerCase();
            if (!['txt', 'md', 'pdf'].includes(ext)) {
                alert('Unsupported file type: .' + ext + '. Only TXT, MD, PDF are supported.');
                return;
            }
            // Show chip with extracting state
            var chipId = 'chip-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
            addFileChip(chipId, file.name, file.size, true);

            if (ext === 'pdf') {
                extractPdfText(file, function(text) {
                    onFileExtracted(chipId, file.name, file.size, text);
                });
            } else {
                extractPlainText(file, function(text) {
                    onFileExtracted(chipId, file.name, file.size, text);
                });
            }
        });
    }

    function addFileChip(chipId, name, size, extracting) {
        if (!chipsContainer) return;
        var chip = document.createElement('div');
        chip.className = 'file-chip';
        chip.id = chipId;
        var sizeStr = size < 1024 ? size + ' B' : size < 1048576 ? (size / 1024).toFixed(1) + ' KB' : (size / 1048576).toFixed(1) + ' MB';
        chip.innerHTML = '<i class="ph ph-file-text" aria-hidden="true"></i>' +
            '<span class="file-chip-name">' + escapeHtml(name) + '</span>' +
            '<span class="file-chip-size">' + sizeStr + '</span>' +
            (extracting ? '<span class="extracting">extracting...</span>' : '') +
            '<button class="file-chip-remove" data-chip="' + chipId + '" title="Remove">&times;</button>';
        chipsContainer.appendChild(chip);

        chip.querySelector('.file-chip-remove').addEventListener('click', function() {
            pendingFiles = pendingFiles.filter(function(f) { return f.chipId !== chipId; });
            chip.remove();
        });
    }

    function onFileExtracted(chipId, name, size, text) {
        if (!text || !text.trim()) {
            var chip = document.getElementById(chipId);
            if (chip) {
                var extractingEl = chip.querySelector('.extracting');
                if (extractingEl) extractingEl.textContent = 'no text found';
            }
            return;
        }
        pendingFiles.push({ chipId: chipId, name: name, size: size, text: text.trim() });
        var chip = document.getElementById(chipId);
        if (chip) {
            var extractingEl = chip.querySelector('.extracting');
            if (extractingEl) extractingEl.remove();
        }
    }

    function extractPlainText(file, callback) {
        var reader = new FileReader();
        reader.onload = function(e) { callback(e.target.result || ''); };
        reader.onerror = function() { callback(''); };
        reader.readAsText(file);
    }

    function extractPdfText(file, callback) {
        // Use pdf.js if available, otherwise fall back to reading as text
        if (typeof pdfjsLib !== 'undefined') {
            var reader = new FileReader();
            reader.onload = function(e) {
                var typedarray = new Uint8Array(e.target.result);
                pdfjsLib.getDocument(typedarray).promise.then(function(pdf) {
                    var texts = [];
                    var pending = pdf.numPages;
                    for (var i = 1; i <= pdf.numPages; i++) {
                        pdf.getPage(i).then(function(page) {
                            page.getTextContent().then(function(content) {
                                texts.push(content.items.map(function(item) { return item.str; }).join(' '));
                                pending--;
                                if (pending === 0) callback(texts.join('\n\n'));
                            });
                        });
                    }
                }).catch(function() { callback(''); });
            };
            reader.readAsArrayBuffer(file);
        } else {
            // Fallback: read as text (won't work for binary PDFs but won't crash)
            extractPlainText(file, callback);
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function(c) {
            return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
        });
    }

    renderNotes();
}

// ================================================================
// SEARCH
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
            this.textContent = keyboardContainer.classList.contains('active') ? getTranslation('hide_keyboard') : getTranslation('show_keyboard');
        });

        // ============ KEYBOARD LAYOUTS ============
        var LETTER_ROWS = [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Backspace'],
            ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
            ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
            ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '?'],
            ['Space']
        ];

        var SYMBOL_ROWS = [
            ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', 'Backspace'],
            ['-', '_', '=', '+', '[', ']', '{', '}', '\\', '|'],
            [';', ':', "'", '"', '<', '>', '/', '~', '`'],
            ['€', '£', '¥', '©', '®', '™', '°', '·', '•', '…'],
            ['Space']
        ];

        var layoutMode = 'letters';   // 'letters' | 'symbols'

        function renderKeyboard() {
            keyboardContainer.innerHTML = '';
            var rows = (layoutMode === 'letters') ? LETTER_ROWS : SYMBOL_ROWS;

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

            // Bottom row: layout toggle (like Android's "?123 / ABC" key)
            var toggleRow = document.createElement('div');
            toggleRow.className = 'keyboard-row';

            var layoutBtn = document.createElement('button');
            layoutBtn.className = 'key-btn special keyboard-layout-toggle';
            layoutBtn.type = 'button';
            layoutBtn.dataset.action = 'toggle-layout';
            layoutBtn.textContent = (layoutMode === 'letters') ? '?123' : 'ABC';
            layoutBtn.title = (layoutMode === 'letters') ? 'Switch to symbols' : 'Switch to letters';
            layoutBtn.style.cssText = 'background:rgba(192,132,252,0.15);border-color:rgba(192,132,252,0.45);color:#c084fc;font-weight:700;min-width:4rem;';

            toggleRow.appendChild(layoutBtn);
            keyboardContainer.appendChild(toggleRow);
        }

        renderKeyboard();

        keyboardContainer.addEventListener('click', function(e) {
            var target = e.target.closest('.key-btn');
            if (!target) return;

            // Layout toggle handled first
            if (target.dataset.action === 'toggle-layout') {
                layoutMode = (layoutMode === 'letters') ? 'symbols' : 'letters';
                renderKeyboard();
                return;
            }

            // Normal key press
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
            list.innerHTML = '<p class="empty-state">' + getTranslation('no_assignments') + '</p>';
            return;
        }

        list.innerHTML = data.assignments.sort(function(a, b) {
            return new Date(a.due) - new Date(b.due);
        }).map(function(a) {
            return '<div class="assignment-item priority-' + a.priority + '"><div><span>' + escapeUserHtml(a.title) + '</span> <span class="tags">#' + escapeUserHtml(a.subject) + (a.tags ? a.tags.map(function(t) { return ' #' + escapeUserHtml(t); }).join('') : '') + '</span> ' + (a.completed ? '<i class="ph ph-check-circle" aria-hidden="true"></i>' : '') + '</div><div>' + a.due + ' <button class="btn-danger-sm" data-id="' + a.id + '">' + getTranslation('delete_all') + '</button> <button class="btn-primary-sm" data-id="' + a.id + '" data-action="toggle">' + (a.completed ? 'Undo' : getTranslation('done')) + '</button></div></div>';
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
                '<button class="btn-danger-sm" data-deck="' + deck.id + '" data-action="delete">' + getTranslation('delete_all') + '</button>' +
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
            list.innerHTML = '<p class="empty-state">' + getTranslation('no_items') + '</p>';
            return;
        }

        list.innerHTML = data.readingList.map(function(r) {
            return '<div class="assignment-item"><span>' + escapeUserHtml(r.title) + (r.read ? ' <i class="ph ph-check-circle" aria-hidden="true"></i>' : ' <i class="ph ph-book-open" aria-hidden="true"></i>') + ' <span class="tags">#' + escapeUserHtml(r.subject) + (r.tags ? r.tags.map(function(t) { return ' #' + escapeUserHtml(t); }).join('') : '') + '</span></span><span><a href="' + escapeUserHtml(r.url) + '" target="_blank" rel="noopener" style="color:#c084fc;">Link</a> <button class="btn-danger-sm" data-id="' + r.id + '">' + getTranslation('delete_all') + '</button> <button class="btn-primary-sm" data-id="' + r.id + '" data-action="toggle">' + (r.read ? 'Unread' : getTranslation('read')) + '</button></span></div>';
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
        this.innerHTML = '<i class="ph ' + (document.body.classList.contains('focus-mode') ? 'ph-lock' : 'ph-lock-open') + '" aria-hidden="true"></i> ' + getTranslation(document.body.classList.contains('focus-mode') ? 'focus_on' : 'focus_off');
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

    // Weighted knowledge base — every entry maps keywords → tool + reason
    var KNOWLEDGE = [
        { keywords: ['calculus','integral','derivative','limit','algebra','equation','matrix','geometry','trigonometry','logarithm','theorem','solve for','quadratic','polynomial','probability'], tool: 'DeepSeek', why: 'advanced step-by-step math solver' },
        { keywords: ['physics','kinematics','force','energy','quantum','thermodynamics','relativity','momentum','newton'], tool: 'Wolfram Alpha', why: 'computational STEM engine' },
        { keywords: ['chemistry','chemical','reaction','molecule','periodic','organic','stoichiometry'], tool: 'Wolfram Alpha', why: 'computational STEM engine' },
        { keywords: ['code','coding','programming','python','javascript','java','c++','c#','rust','golang','function','debug','algorithm','software','script','api','backend','frontend','react','node'], tool: 'Cursor', why: 'AI code editor with full-project context' },
        { keywords: ['essay','write','writing','paragraph','email','letter','story','blog','article','rewrite','paraphrase','grammar','proofread','draft'], tool: 'ChatGPT or Claude', why: 'strong writing assistants' },
        { keywords: ['research','paper','study','source','cite','citation','evidence','literature','academic'], tool: 'Perplexity', why: 'AI search with real citations' },
        { keywords: ['data','analysis','excel','spreadsheet','statistics','dataset','chart','graph','visualize','trend'], tool: 'Claude', why: 'strong at reasoning over data' },
        { keywords: ['design','poster','logo','banner','graphic','illustration','art','image','draw'], tool: 'Midjourney or Canva', why: 'AI design tools' },
        { keywords: ['presentation','slides','pitch','deck','powerpoint','slide'], tool: 'Gamma or Canva', why: 'AI presentation generators' },
        { keywords: ['language','translate','translation','vocabulary','conversation','learn spanish','learn french','learn german','learn japanese'], tool: 'Duolingo', why: 'AI language learning' },
        { keywords: ['note','notes','summarize','summary','organize','schedule','plan my'], tool: 'Notion AI', why: 'AI productivity & note-taking' },
        { keywords: ['video','tutorial','lecture','youtube','watch'], tool: 'YouTube', why: 'free educational videos' }
    ];

    btn.addEventListener('click', function () {
        var q = input.value.trim().toLowerCase();
        if (!q) { result.textContent = getTranslation('ai_empty_query'); return; }

        function localAnswer() {
            // Score each entry — longer matched keyword = higher weight
            var best = null, bestScore = 0;
            KNOWLEDGE.forEach(function (entry) {
                var score = 0;
                entry.keywords.forEach(function (kw) {
                    if (q.indexOf(kw) !== -1) score += kw.length;
                });
                if (score > bestScore) { bestScore = score; best = entry; }
            });
            if (best && bestScore > 0) {
                return 'For that, I recommend ' + best.tool + ': ' + best.why + '.';
            }
            return getTranslation('ai_fallback');
        }

        function log() {
            try {
                var data = loadData();
                addActivity(data, 'ai_recommend', t('act_ai_recommend', { q: q }));
                saveData(data);
            } catch (e) {}
        }

        btn.disabled = true;
        StudyHubAI.status().then(function (st) {
            if (!st.configured) {
                result.textContent = localAnswer();
                btn.disabled = false;
                log();
                return undefined;
            }
            return StudyHubAI.chat([
                { role: 'system', content: 'You are a study-tools advisor for students. Given a short description of what they are working on, recommend the best AI tool or study approach for them. Reply with 1 or 2 short plain-text sentences, no markdown.' },
                { role: 'user', content: q }
            ], { maxTokens: 120, temperature: 0.5 }).then(function (res) {
                result.textContent = String(res.text || '').trim().replace(/\s+/g, ' ').slice(0, 400);
                btn.disabled = false;
                log();
            }).catch(function () {
                result.textContent = localAnswer();
                btn.disabled = false;
                log();
            });
        }).catch(function () {
            result.textContent = localAnswer();
            btn.disabled = false;
            log();
        });
    });
}


// ================================================================
// FILE UPLOAD (missing function — required by files.html)
// ================================================================
function setupFileUpload() {
    var uploadArea = document.getElementById('uploadArea');
    if (!uploadArea) return;
    var fileInput = document.getElementById('fileInput');
    if (!fileInput) return;

    uploadArea.addEventListener('click', function () { fileInput.click(); });

    uploadArea.addEventListener('dragover', function (e) {
        e.preventDefault();
        uploadArea.style.borderColor = '#c084fc';
    });
    uploadArea.addEventListener('dragleave', function () {
        uploadArea.style.borderColor = 'rgba(192,132,252,0.2)';
    });
    uploadArea.addEventListener('drop', function (e) {
        e.preventDefault();
        uploadArea.style.borderColor = 'rgba(192,132,252,0.2)';
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', function () {
        handleFiles(fileInput.files);
        fileInput.value = '';
    });

    async function handleFiles(files) {
        var data = loadData();
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            try {
                var reader = new FileReader();
                var result = await new Promise(function (resolve, reject) {
                    reader.onload = function (e) { resolve(e.target.result); };
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
        if (typeof renderFileList === 'function') renderFileList();
        if (document.getElementById('statFiles') && typeof renderDashboard === 'function') renderDashboard();
    }

    var delBtn = document.getElementById('deleteAllFilesBtn');
    if (delBtn) {
        delBtn.addEventListener('click', function () {
            if (confirm('Move all files to Trash? They will be recoverable for 24 hours.')) {
                var data = loadData();
                data.files.forEach(function (f) { pushToTrash(data, 'file', f); });
                data.files = [];
                addActivity(data, 'delete', 'Moved all files to trash');
                saveData(data);
                renderFileList();
                updateTrashCount();
                if (document.getElementById('statFiles') && typeof renderDashboard === 'function') renderDashboard();
            }
        });
    }
}

// ================================================================
// HELPER t() — used by AI Recommend
// ================================================================
function t(key, params) {
    var s = getTranslation(key);
    if (params) {
        for (var k in params) {
            s = s.split('{' + k + '}').join(params[k]);
        }
    }
    return s;
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
    // If the user has chosen a background via the picker, don't override it.
    var savedBg = null;
    try { savedBg = localStorage.getItem('studyHubBackground'); } catch (e) {}
    if (savedBg) return;

    document.body.style.background =
        'radial-gradient(ellipse at top left, #0a1a3a, #050a18)';
}

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    initBurger();
    setActiveNavLink();
    updateNavDate();
    initClock();
    updateScrollGradient();
    window.addEventListener('scroll', updateScrollGradient);
    window.addEventListener('resize', updateScrollGradient);

    // ===== TRANSLATIONS =====
    initTranslations();

    // ===== 30-MINUTE MELODY TIMER =====
    initMelodyTimer();


    if (document.getElementById('trashBtn')) setupTrash();

    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    var path = window.location.pathname.split('/').pop() || 'index.html';

    if (path === 'index.html' || path === '') {
        renderDashboard();
        initPomodoro();
        setupSearch();

        // History opens as an overlay, mirroring the calendar: trigger from the
        // sidebar card, dismiss via the close button, the backdrop or Escape.
        var historyModal = document.getElementById('historyModal');
        var historyOpen = document.getElementById('historyOpenBtn');
        var historyClose = document.getElementById('historyCloseBtn');
        if (historyModal && historyOpen) {
            historyOpen.addEventListener('click', function() { historyModal.style.display = 'flex'; });
        }
        if (historyModal && historyClose) {
            historyClose.addEventListener('click', function() { historyModal.style.display = 'none'; });
        }
        if (historyModal) {
            historyModal.addEventListener('click', function(e) {
                if (e.target === historyModal) historyModal.style.display = 'none';
            });
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && historyModal.style.display === 'flex') historyModal.style.display = 'none';
            });
        }

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
// ================================================================
// STUDYHUB – NEW FEATURES BLOCK
// Calendar, Calculator, Priority Matrix, Deep Work, Focus Sound,
// Quiz Generator, Flashcard Auto-Gen, Blocker, Trash, Ctrl+K,
// File Annotations, Break Reminder.
// ================================================================
// ================================================================

// ================================================================
// CALENDAR WIDGET (2000–2050)
// ================================================================
var calView = { month: new Date().getMonth(), year: new Date().getFullYear() };
var CAL_MIN_YEAR = 2000;
var CAL_MAX_YEAR = 2050;

function initCalendar() {
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    function updateCompact() {
        var d = new Date();
        var cd = document.getElementById('calCompactDay');
        var cdt = document.getElementById('calCompactDate');
        var cm = document.getElementById('calCompactMonth');
        if (cd) cd.textContent = dayNames[d.getDay()];
        if (cdt) cdt.textContent = d.getDate();
        if (cm) cm.textContent = monthNames[d.getMonth()].slice(0,3) + ' ' + d.getFullYear();
    }

    function renderCalendar() {
        var grid = document.getElementById('calendarGrid');
        if (!grid) return;
        grid.innerHTML = '';
        var title = document.getElementById('calModalTitle');
        if (title) title.textContent = monthNames[calView.month] + ' ' + calView.year;

        ['S','M','T','W','T','F','S'].forEach(function(d) {
            var h = document.createElement('div');
            h.className = 'cal-header';
            h.textContent = d;
            grid.appendChild(h);
        });

        var firstDay = new Date(calView.year, calView.month, 1).getDay();
        var daysInMonth = new Date(calView.year, calView.month + 1, 0).getDate();
        var today = new Date();

        for (var i = 0; i < firstDay; i++) {
            var e = document.createElement('div');
            e.className = 'cal-cell empty';
            grid.appendChild(e);
        }
        for (var d = 1; d <= daysInMonth; d++) {
            var c = document.createElement('div');
            c.className = 'cal-cell';
            c.textContent = d;
            if (d === today.getDate() && calView.month === today.getMonth() && calView.year === today.getFullYear()) {
                c.classList.add('today');
            }
            grid.appendChild(c);
        }
    }

    updateCompact();
    setInterval(updateCompact, 60000);

    var expandBtn = document.getElementById('calendarExpandBtn');
    var modal = document.getElementById('calendarModal');
    var closeBtn = document.getElementById('calendarCloseBtn');

    if (expandBtn && modal) {
        expandBtn.addEventListener('click', function() {
            var now = new Date();
            calView.month = now.getMonth();
            calView.year = now.getFullYear();
            renderCalendar();
            modal.style.display = 'flex';
        });
    }
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', function() { modal.style.display = 'none'; });
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.style.display = 'none'; });
    }
    var prevM = document.getElementById('calPrevMonth');
    var nextM = document.getElementById('calNextMonth');
    var prevY = document.getElementById('calPrevYear');
    var nextY = document.getElementById('calNextYear');
    if (prevM) prevM.addEventListener('click', function() {
        calView.month--;
        if (calView.month < 0) { calView.month = 11; calView.year--; if (calView.year < CAL_MIN_YEAR) { calView.year = CAL_MIN_YEAR; calView.month = 0; } }
        renderCalendar();
    });
    if (nextM) nextM.addEventListener('click', function() {
        calView.month++;
        if (calView.month > 11) { calView.month = 0; calView.year++; if (calView.year > CAL_MAX_YEAR) { calView.year = CAL_MAX_YEAR; calView.month = 11; } }
        renderCalendar();
    });
    if (prevY) prevY.addEventListener('click', function() { if (calView.year > CAL_MIN_YEAR) { calView.year--; renderCalendar(); } });
    if (nextY) nextY.addEventListener('click', function() { if (calView.year < CAL_MAX_YEAR) { calView.year++; renderCalendar(); } });
}

// ================================================================
// CALCULATOR
// ================================================================
function initCalculator() {
    var display = document.getElementById('calcDisplay');
    if (!display) return;
    var buttons = document.querySelectorAll('.calc-btn');
    var expr = '';

    buttons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var key = this.dataset.key;
            if (key === 'C') { expr = ''; display.textContent = '0'; }
            else if (key === '←') { expr = expr.slice(0, -1); display.textContent = expr || '0'; }
            else if (key === '=') {
                try {
                    var safe = expr.replace(/[^0-9+\-*/.%()]/g, '');
                    if (!safe) { display.textContent = '0'; return; }
                    var result = Function('"use strict";return (' + safe + ')')();
                    if (typeof result === 'number' && isFinite(result)) {
                        result = Math.round(result * 100000000) / 100000000;
                        display.textContent = result;
                        expr = String(result);
                    } else { display.textContent = 'Err'; expr = ''; }
                } catch (e) { display.textContent = 'Err'; expr = ''; }
            }
            else {
                expr += key;
                display.textContent = expr;
            }
        });
    });
}

// ================================================================
// PRIORITY MATRIX (Eisenhower)
// ================================================================
// Canonical escaper for every user-text innerHTML sink (activity feed,
// priority matrix, assignments, reading list). Top-level so every module
// reaches it regardless of which page sections initialized.
function escapeUserHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
        return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
}

function setupPriorityMatrix() {
    var input = document.getElementById('priorityInput');
    var quadrant = document.getElementById('priorityQuadrant');
    var addBtn = document.getElementById('addPriorityBtn');
    if (!addBtn) return;

    function render() {
        var data = loadData();
        var matrix = data.priorityMatrix || {};
        ['urgent-important','not-urgent-important','urgent-not-important','not-urgent-not-important'].forEach(function(q) {
            var container = document.getElementById('pq-' + q);
            if (!container) return;
            var list = matrix[q] || [];
            if (list.length === 0) {
                container.innerHTML = '<span style="color:#64748b; font-size:0.75rem;">Empty</span>';
            } else {
                container.innerHTML = list.map(function(t) {
                    return '<div class="priority-task"><span>' + escapeUserHtml(t.text) + '</span><button class="delete-item-btn" data-q="' + q + '" data-id="' + t.id + '">✕</button></div>';
                }).join('');
            }
        });
        document.querySelectorAll('.priority-task .delete-item-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var q = this.dataset.q;
                var id = this.dataset.id;
                var data = loadData();
                data.priorityMatrix[q] = data.priorityMatrix[q].filter(function(t) { return t.id !== id; });
                saveData(data);
                render();
            });
        });
    }

    addBtn.addEventListener('click', function() {
        var text = input.value.trim();
        if (!text) return;
        var q = quadrant.value;
        var data = loadData();
        if (!data.priorityMatrix) data.priorityMatrix = {};
        if (!data.priorityMatrix[q]) data.priorityMatrix[q] = [];
        data.priorityMatrix[q].push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            text: text
        });
        addActivity(data, 'priority', 'Added priority task: "' + text + '"');
        saveData(data);
        input.value = '';
        render();
    });
    input.addEventListener('keypress', function(e) { if (e.key === 'Enter') addBtn.click(); });
    render();
}

// ================================================================
// DEEP WORK TIMER
// ================================================================
var dwSeconds = 0, dwRunning = false, dwTimer = null;

function initDeepWork() {
    var display = document.getElementById('deepworkDisplay');
    if (!display) return;
    var start = document.getElementById('dwStart');
    var stop = document.getElementById('dwStop');
    var reset = document.getElementById('dwReset');

    function update() {
        var h = Math.floor(dwSeconds / 3600);
        var m = Math.floor((dwSeconds % 3600) / 60);
        var s = dwSeconds % 60;
        display.textContent = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }
    function updateStats() {
        var data = loadData();
        var today = new Date().toISOString().slice(0,10);
        var todayMin = (data.deepWorkLogs || []).filter(function(l) { return l.date === today; }).reduce(function(a,b) { return a + b.minutes; }, 0);
        var totalMin = (data.deepWorkLogs || []).reduce(function(a,b) { return a + b.minutes; }, 0);
        var el1 = document.getElementById('dwToday');
        var el2 = document.getElementById('dwTotal');
        if (el1) el1.textContent = todayMin;
        if (el2) el2.textContent = totalMin;
    }

    if (start) start.addEventListener('click', function() {
        if (dwRunning) return;
        dwRunning = true;
        dwTimer = setInterval(function() { dwSeconds++; update(); }, 1000);
    });
    if (stop) stop.addEventListener('click', function() {
        if (!dwRunning) return;
        clearInterval(dwTimer);
        dwRunning = false;
        var mins = Math.floor(dwSeconds / 60);
        if (mins > 0) {
            var data = loadData();
            data.deepWorkLogs.push({
                date: new Date().toISOString().slice(0,10),
                minutes: mins
            });
            addActivity(data, 'deepwork', 'Completed deep work: ' + mins + ' min');
            saveData(data);
            updateStats();
        }
        dwSeconds = 0;
        update();
    });
    if (reset) reset.addEventListener('click', function() {
        clearInterval(dwTimer);
        dwRunning = false;
        dwSeconds = 0;
        update();
    });
    update();
    updateStats();
}

// ================================================================
// FOCUS SOUND (for Pomodoro)
// ================================================================
var focusAudioCtx = null;
var focusNoiseNode = null;
var focusGainNode = null;

function startFocusSound(type) {
    stopFocusSound();
    if (type === 'none' || !type) return;
    try {
        focusAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var bufferSize = 2 * focusAudioCtx.sampleRate;
        var noiseBuffer = focusAudioCtx.createBuffer(1, bufferSize, focusAudioCtx.sampleRate);
        var output = noiseBuffer.getChannelData(0);
        var b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
        for (var i = 0; i < bufferSize; i++) {
            var white = Math.random() * 2 - 1;
            if (type === 'rain' || type === 'lofi') {
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
                b6 = white * 0.115926;
            } else {
                output[i] = white * 0.25;
            }
        }
        focusNoiseNode = focusAudioCtx.createBufferSource();
        focusNoiseNode.buffer = noiseBuffer;
        focusNoiseNode.loop = true;
        focusGainNode = focusAudioCtx.createGain();
        focusGainNode.gain.value = type === 'lofi' ? 0.08 : 0.12;
        focusNoiseNode.connect(focusGainNode);
        focusGainNode.connect(focusAudioCtx.destination);
        focusNoiseNode.start();
    } catch (e) { /* silent */ }
}

function stopFocusSound() {
    try {
        if (focusNoiseNode) { focusNoiseNode.stop(); focusNoiseNode.disconnect(); focusNoiseNode = null; }
        if (focusGainNode) { focusGainNode.disconnect(); focusGainNode = null; }
        if (focusAudioCtx) { focusAudioCtx.close(); focusAudioCtx = null; }
    } catch (e) { /* silent */ }
}

function attachFocusSoundToPomodoro() {
    var pomoStartEl = document.getElementById('pomoStart');
    var pomoStopEl = document.getElementById('pomoStop');
    var pomoResetEl = document.getElementById('pomoReset');
    var pomoSoundEl = document.getElementById('pomoSound');
    if (!pomoStartEl || !pomoSoundEl) return;
    pomoStartEl.addEventListener('click', function() {
        var s = pomoSoundEl.value;
        if (s && s !== 'none') startFocusSound(s);
    });
    if (pomoStopEl) pomoStopEl.addEventListener('click', stopFocusSound);
    if (pomoResetEl) pomoResetEl.addEventListener('click', stopFocusSound);
}

// ================================================================
// QUIZ GENERATOR
// ================================================================
var quizState = null;

/* Function words carry no topic meaning: never blanked, never a distractor. */
var QUIZ_STOPWORDS = ['about', 'above', 'after', 'again', 'against', 'almost', 'along', 'also', 'although',
    'always', 'among', 'another', 'any', 'anyone', 'anything', 'around', 'back', 'because', 'become', 'been',
    'before', 'behind', 'being', 'below', 'beside', 'better', 'between', 'beyond', 'both', 'cannot', 'could',
    'did', 'does', 'doing', 'done', 'down', 'during', 'each', 'either', 'else', 'enough', 'even', 'ever',
    'every', 'everything', 'except', 'few', 'first', 'found', 'from', 'further', 'gave', 'give', 'goes',
    'going', 'gone', 'good', 'got', 'had', 'has', 'have', 'having', 'here', 'hers', 'himself', 'however',
    'into', 'itself', 'just', 'keep', 'kept', 'know', 'known', 'last', 'later', 'least', 'less', 'like',
    'little', 'long', 'made', 'make', 'many', 'might', 'mine', 'more', 'most', 'much', 'must', 'near', 'need',
    'never', 'next', 'none', 'nothing', 'often', 'once', 'only', 'other', 'others', 'ought', 'over', 'own',
    'perhaps', 'quite', 'rather', 'really', 'same', 'said', 'several', 'shall', 'should', 'since', 'some',
    'someone', 'something', 'sometimes', 'still', 'such', 'take', 'taken', 'than', 'that', 'their', 'them',
    'themselves', 'then', 'there', 'therefore', 'these', 'they', 'thing', 'things', 'this', 'those', 'though',
    'through', 'thus', 'time', 'together', 'too', 'toward', 'under', 'until', 'upon', 'used', 'using', 'very',
    'want', 'well', 'were', 'what', 'when', 'where', 'whether', 'which', 'while', 'whom', 'whose', 'will',
    'with', 'within', 'without', 'would', 'your', 'yours'];

function quizIsStopword(word) {
    return QUIZ_STOPWORDS.indexOf(String(word).toLowerCase()) !== -1;
}

function quizId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function quizEsc(s) {
    return escapeUserHtml(String(s == null ? '' : s));
}

function quizContainer() {
    return document.getElementById('quizContainer');
}

/* Sentences long enough to hide a term in, short enough to read as a question. */
function quizSentences(text) {
    var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    var out = [], buf = '';
    for (var i = 0; i < s.length; i++) {
        buf += s[i];
        if (s[i] === '.' || s[i] === '!' || s[i] === '?') {
            var t = buf.trim();
            if (t.length >= 30 && t.length <= 220) out.push(t);
            buf = '';
        }
    }
    var tail = buf.trim();
    if (tail.length >= 30 && tail.length <= 220) out.push(tail);
    return out;
}

/* Meaningful words in a sentence, longest first: the longest reads as the key term. */
function quizTerms(text) {
    var seen = {}, terms = [];
    String(text == null ? '' : text).split(/[^A-Za-z0-9'\u00c0-\u024f]+/).forEach(function (w) {
        var t = w.replace(/^'+|'+$/g, '');
        if (t.length < 5 || quizIsStopword(t) || /^\d+$/.test(t)) return;
        var key = t.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        terms.push(t);
    });
    return terms.sort(function (a, b) { return b.length - a.length; });
}

function quizEscapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Distractors of comparable length to the answer. Nothing is padded with filler
 * when the pool is thin - an obvious length giveaway, or a bogus "none of the
 * above (2)" option, makes a question worth nothing - so a note that cannot
 * produce honest options is skipped instead.
 */
function quizDistractors(pool, correctKey, correctLength, howMany) {
    var tolerance = Math.max(2, Math.round(correctLength * 0.6));
    var seen = {}, ranked = [];
    pool.forEach(function (term) {
        var key = String(term).toLowerCase();
        if (key === correctKey || seen[key]) return;
        if (Math.abs(term.length - correctLength) > tolerance) return;
        seen[key] = true;
        ranked.push(term);
    });
    ranked.sort(function (a, b) {
        return Math.abs(a.length - correctLength) - Math.abs(b.length - correctLength);
    });
    return ranked.slice(0, howMany * 3).sort(function () { return Math.random() - 0.5; }).slice(0, howMany);
}

/* Every usable term in the notebook, the pool distractors come from. */
function quizTermPool(notes) {
    var seen = {}, pool = [];
    notes.forEach(function (note) {
        quizTerms(note.text).forEach(function (t) {
            var key = t.toLowerCase();
            if (seen[key]) return;
            seen[key] = true;
            pool.push(t);
        });
    });
    return pool;
}

/* How often a term appears in a sentence (word boundaries, case-insensitive). */
function quizOccurrences(sentence, term) {
    var found = String(sentence).match(new RegExp('\\b' + quizEscapeRe(term) + '\\b', 'gi'));
    return found ? found.length : 0;
}

/* One cloze question from a note, or null when it has nothing usable. */
function quizClozeQuestion(note, pool) {
    var candidates = [];
    quizSentences(note.text).forEach(function (sentence) {
        var terms = quizTerms(sentence);
        if (!terms.length) return;
        // A term used twice in the sentence leaks its own answer the moment the
        // first one is blanked, so a single-occurrence term is always preferred.
        var once = terms.filter(function (t) { return quizOccurrences(sentence, t) === 1; });
        var term = (once.length ? once : terms)[0];
        candidates.push({
            sentence: sentence,
            term: term,
            // Prefer a meaty term inside a sentence of comfortable length.
            score: term.length + (sentence.length >= 60 && sentence.length <= 160 ? 4 : 0) + (once.length ? 6 : 0)
        });
    });
    if (!candidates.length) return null;
    candidates.sort(function (a, b) { return b.score - a.score; });
    var best = candidates[0];

    // Blank every occurrence, so nothing of the answer survives in the prompt.
    var blanked = best.sentence.replace(new RegExp('\\b' + quizEscapeRe(best.term) + '\\b', 'gi'), '_____');
    if (blanked === best.sentence) return null;   // the term was not found verbatim

    var distractors = quizDistractors(pool, best.term.toLowerCase(), best.term.length, 3);
    if (distractors.length < 2) return null;      // no honest question without real options

    return {
        kind: 'cloze',
        question: blanked,
        correct: best.term,
        options: [best.term].concat(distractors).sort(function () { return Math.random() - 0.5; }),
        why: best.sentence,
        sourceId: note.id,
        sourceText: String(note.text).slice(0, 120),
        promptKey: 'quiz_fill_blank'
    };
}

function quizBuildCloze(notes, count, pool) {
    var used = {}, questions = [];
    notes.forEach(function (note) {
        if (questions.length >= count) return;
        var q = quizClozeQuestion(note, pool);
        if (!q) return;
        var key = q.question.toLowerCase();
        if (used[key]) return;
        used[key] = true;
        questions.push(q);
    });
    return questions;
}

/**
 * Order notes by what is worth asking next: never-asked first, then the weakest
 * accuracy, then the one left alone longest. Plain random sampling re-asked the
 * same notes while others were never touched.
 */
function quizPickNotes(notes, count) {
    var rows = notes.map(function (note) {
        var s = note.quizStats || {};
        var asked = Number(s.asked) || 0;
        return {
            note: note,
            asked: asked,
            accuracy: asked ? (Number(s.correct) || 0) / asked : -1,
            lastAskedAt: Number(s.lastAskedAt) || 0
        };
    });
    rows.sort(function (a, b) {
        if ((a.asked === 0) !== (b.asked === 0)) return a.asked === 0 ? -1 : 1;
        if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
        if (a.lastAskedAt !== b.lastAskedAt) return a.lastAskedAt - b.lastAskedAt;
        return Math.random() - 0.5;
    });
    return rows.slice(0, count).map(function (r) { return r.note; });
}

function quizBatches(notes, budget) {
    var batches = [], current = [], size = 0;
    notes.forEach(function (note) {
        var text = String(note.text).slice(0, 400);
        if (current.length && size + text.length > budget) {
            batches.push(current);
            current = [];
            size = 0;
        }
        current.push({ id: note.id, text: text });
        size += text.length;
    });
    if (current.length) batches.push(current);
    return batches;
}

/* Is the answer actually in the note a question claims to come from? */
function quizSourceMatches(noteText, answer) {
    var text = String(noteText || '').toLowerCase();
    var ans = String(answer || '').toLowerCase().trim();
    if (!text || !ans) return false;
    if (text.indexOf(ans) !== -1) return true;
    // Paraphrased answers: fall back to the answer's most distinctive word.
    var words = ans.split(/[^a-z0-9\u00c0-\u024f]+/).filter(function (w) { return w.length >= 5; });
    if (!words.length) return false;
    words.sort(function (a, b) { return b.length - a.length; });
    return text.indexOf(words[0]) !== -1;
}

/**
 * Keep only well-formed questions, and reject the classic giveaway where the
 * correct answer is by far the longest option - a model that pads the right
 * answer produces a question that can be answered without knowing anything.
 */
function quizCleanAi(raw, batch, remaining) {
    if (!Array.isArray(raw)) return [];
    var byIndex = {};
    batch.forEach(function (n, i) { byIndex[i + 1] = n; });
    var seen = {}, out = [];
    raw.slice(0, remaining).forEach(function (q) {
        if (!q || typeof q.question !== 'string' || typeof q.correct !== 'string') return;
        if (!Array.isArray(q.wrong)) return;
        var correct = q.correct.trim();
        if (!correct) return;

        var wrongs = [];
        q.wrong.slice(0, 6).forEach(function (w) {
            if (typeof w !== 'string') return;
            var t = w.trim();
            if (!t || t.toLowerCase() === correct.toLowerCase()) return;
            if (wrongs.indexOf(t) === -1) wrongs.push(t);
        });
        if (wrongs.length < 2) return;

        // Reject a length giveaway, but only when the gap is large in both
        // relative and absolute terms: "Newtons second law" against "Ohms law"
        // is a good question, not a giveaway, so the rule must not fire on a
        // handful of characters.
        var lens = wrongs.map(function (w) { return w.length; });
        var shortest = Math.min.apply(null, lens);
        var longest = Math.max.apply(null, lens);
        if (correct.length >= 8 && shortest >= 3) {
            if (correct.length > Math.max(longest * 2.5, longest + 40)) return;
            if (shortest > Math.max(correct.length * 2.5, correct.length + 40)) return;
        }

        var text = q.question.trim();
        var qKey = text.toLowerCase();
        if (!text || seen[qKey]) return;
        seen[qKey] = true;

        // A model can cite the wrong note. A wrong "from your note" claim - and
        // the quiz stats it would pollute - is worse than none, so the question
        // keeps its place but loses the attribution when the answer is not in
        // the note it pointed at.
        var src = byIndex[q.sourceIndex] || null;
        if (src && !quizSourceMatches(src.text, correct)) src = null;
        out.push({
            kind: 'ai',
            question: text,
            correct: correct,
            options: [correct].concat(wrongs.slice(0, 3)).sort(function () { return Math.random() - 0.5; }),
            why: typeof q.why === 'string' && q.why.trim() ? q.why.trim().slice(0, 300) : '',
            sourceId: src ? src.id : null,
            sourceText: src ? String(src.text).slice(0, 120) : '',
            promptKey: null
        });
    });
    return out;
}

function quizAiBatch(batch, remaining) {
    var corpus = batch.map(function (n, i) { return (i + 1) + '. ' + n.text; }).join('\n');
    return StudyHubAI.chat([
        {
            role: 'system',
            content: 'You write multiple-choice quiz questions from study notes. Reply with ONLY a JSON object: ' +
                '{"questions":[{"question": string, "correct": string, "wrong": [three plausible but clearly wrong answers], "sourceIndex": number, "why": string}]}. ' +
                '"sourceIndex" is the number of the note the question came from. "why" is one short sentence explaining the correct answer. ' +
                'Every option must be similar in length and style to the correct answer so the answer is not obvious from its shape. ' +
                'Write at most ' + remaining + ' questions. No markdown, no prose.'
        },
        { role: 'user', content: corpus }
    ], { jsonMode: true, maxTokens: 1200, temperature: 0.5, timeoutMs: 40000, task: 'quiz' }).then(function (res) {
        var j = StudyHubAI.parseJsonReply(res.text);
        return quizCleanAi(j && j.questions, batch, remaining);
    }).catch(function () { return []; });
}

/**
 * Questions written by the configured provider.
 *
 * Notes are batched by size instead of truncating one corpus at 8000
 * characters: that truncation (and the fixed 20-note slice) silently quizzed
 * only the oldest notes in a large notebook. Batches are requested until the
 * requested count is met or the notes run out.
 */
function quizAiQuestions(notes, count) {
    if (typeof StudyHubAI === 'undefined') return Promise.resolve([]);
    return StudyHubAI.status().then(function (st) {
        if (!st || !st.configured) return [];
        var batches = quizBatches(notes, 6000);
        var collected = [];
        function next(i) {
            if (i >= batches.length || collected.length >= count) return Promise.resolve();
            var remaining = count - collected.length;
            return quizAiBatch(batches[i], remaining).then(function (qs) {
                collected = collected.concat(qs);
                return next(i + 1);
            });
        }
        return next(0).then(function () { return collected; });
    }).catch(function () { return []; });
}

function quizNoteById(data, id) {
    var found = null;
    (data.notes || []).forEach(function (n) { if (n.id === id) found = n; });
    return found;
}

/* Remember how this note went, so later quizzes prefer the weak material. */
function quizRecordAnswer(data, noteId, wasCorrect) {
    var note = quizNoteById(data, noteId);
    if (!note) return;
    var s = note.quizStats || { asked: 0, correct: 0, lastAskedAt: 0 };
    s.asked = (Number(s.asked) || 0) + 1;
    if (wasCorrect) s.correct = (Number(s.correct) || 0) + 1;
    s.lastAskedAt = Date.now();
    note.quizStats = s;
}

/* Missed answers become cards, due today, for the flashcards page to surface. */
function quizSaveMissed(data, missed) {
    if (!missed.length) return 0;
    if (!data.flashcards) data.flashcards = { decks: [] };
    if (!Array.isArray(data.flashcards.decks)) data.flashcards.decks = [];

    var deck = data.flashcards.decks.find(function (d) { return d.name === 'Auto from Quiz'; });
    if (!deck) {
        deck = { id: quizId(), name: 'Auto from Quiz', cards: [] };
        data.flashcards.decks.push(deck);
    }
    if (!Array.isArray(deck.cards)) deck.cards = [];

    var today = new Date().toISOString().slice(0, 10);
    missed.forEach(function (q) {
        deck.cards.push({
            id: quizId(),
            front: String(q.question || '').slice(0, 200),
            back: String(q.correct || '').slice(0, 1000),
            dueDate: today,
            level: 0
        });
    });
    return missed.length;
}

function quizRender() {
    var container = quizContainer();
    if (!container || !quizState) return;
    if (quizState.index >= quizState.questions.length) { quizRenderResults(container); return; }

    var total = quizState.questions.length;
    var i = quizState.index;
    var q = quizState.questions[i];
    var answered = quizState.answers[i] || null;

    var html = '<div class="quiz-progress">' +
        '<div class="quiz-progress-row"><span>' + (i + 1) + ' / ' + total + '</span>' +
        (quizState.engineKey ? '<span class="quiz-engine">' + quizEsc(getTranslation(quizState.engineKey)) + '</span>' : '') +
        '</div><div class="quiz-progress-bar"><span style="width:' + Math.round((i / total) * 100) + '%"></span></div>' +
        '</div>';

    html += '<div class="quiz-question"><h4>' +
        (q.promptKey ? '<span class="quiz-prompt">' + quizEsc(getTranslation(q.promptKey)) + '</span> ' : '') +
        quizEsc(q.question) + '</h4><div class="quiz-options">';
    q.options.forEach(function (opt, idx) {
        var cls = 'quiz-option';
        if (answered) {
            if (opt === q.correct) cls += ' correct';
            else if (opt === answered.chosen) cls += ' wrong';
        }
        html += '<button type="button" class="' + cls + '" data-idx="' + idx + '"' + (answered ? ' disabled' : '') + '>' + quizEsc(opt) + '</button>';
    });
    html += '</div>';

    if (answered) {
        html += '<div class="quiz-feedback ' + (answered.correct ? 'is-correct' : 'is-wrong') + '">' +
            '<p class="quiz-verdict">' + quizEsc(answered.correct ? q.correct : answered.chosen + ' \u2192 ' + q.correct) + '</p>' +
            (q.why ? '<p class="quiz-why">' + quizEsc(q.why) + '</p>' : '') +
            (q.sourceText ? '<p class="quiz-source">' + quizEsc(getTranslation('quiz_source')) + ': ' + quizEsc(q.sourceText) + '</p>' : '') +
            '</div>' +
            '<div class="del-history-buttons"><button type="button" id="quizNextBtn" class="btn-primary-sm">' +
            quizEsc(getTranslation(i + 1 === total ? 'quiz_results' : 'quiz_next')) +
            ' <i class="ph ph-arrow-right" aria-hidden="true"></i></button></div>';
    }
    html += '</div>';

    container.innerHTML = html;

    container.querySelectorAll('.quiz-option').forEach(function (btn) {
        btn.addEventListener('click', function () { quizAnswer(parseInt(this.dataset.idx, 10)); });
    });
    var nextBtn = document.getElementById('quizNextBtn');
    if (nextBtn) nextBtn.addEventListener('click', quizAdvance);
}

function quizAnswer(optionIndex) {
    if (!quizState || quizState.answers[quizState.index]) return;
    var q = quizState.questions[quizState.index];
    var chosen = q.options[optionIndex];
    if (chosen == null) return;
    quizState.answers[quizState.index] = { chosen: chosen, correct: chosen === q.correct };
    quizRender();
}

function quizAdvance() {
    if (!quizState) return;
    quizState.index++;
    if (quizState.index >= quizState.questions.length) quizFinish();
    quizRender();
}

/* Score once per attempt: stats, flashcards and the activity entry. */
function quizFinish() {
    if (!quizState || quizState.persisted) return;
    quizState.persisted = true;

    var data = loadData();
    var correct = 0, missed = [];
    quizState.questions.forEach(function (q, i) {
        var a = quizState.answers[i];
        var ok = !!(a && a.correct);
        if (ok) correct++; else missed.push(q);
        if (q.sourceId) quizRecordAnswer(data, q.sourceId, ok);
    });

    quizState.score = { correct: correct, total: quizState.questions.length };
    quizState.missed = missed;
    quizState.cardsAdded = quizSaveMissed(data, missed);

    // addActivity() persists the document, so the stats and cards land with it.
    addActivity(data, 'quiz', 'Scored ' + correct + '/' + quizState.questions.length + ' on a quiz');
}

function quizRenderResults(container) {
    var s = quizState.score || { correct: 0, total: quizState.questions.length };
    var pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
    var missed = quizState.missed || [];

    var html = '<div class="quiz-question quiz-results"><h4>' + quizEsc(getTranslation('quiz_results')) + '</h4>' +
        '<div class="quiz-score"><span class="quiz-score-value">' + s.correct + '/' + s.total + '</span>' +
        '<span class="quiz-score-label">' + quizEsc(getTranslation('quiz_score')) + ' \u00b7 ' + pct + '%</span></div>';

    if (quizState.cardsAdded) {
        html += '<p class="quiz-hint">' + quizEsc(getTranslation('quiz_cards_saved')) + '</p>';
    }

    if (missed.length) {
        html += '<div class="quiz-review"><h5>' + quizEsc(getTranslation('quiz_review')) + ' \u00b7 ' + missed.length + '</h5>';
        missed.forEach(function (q) {
            html += '<div class="quiz-review-item"><p class="quiz-review-q">' + quizEsc(q.question) + '</p>' +
                '<p class="quiz-review-a">' + quizEsc(q.correct) + '</p>' +
                (q.why && q.why !== q.correct ? '<p class="quiz-why">' + quizEsc(q.why) + '</p>' : '') +
                '</div>';
        });
        html += '</div>';
        html += '<div class="del-history-buttons"><button type="button" id="quizRetryMissed" class="btn-primary-sm">' +
            '<i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i> ' + quizEsc(getTranslation('quiz_retry_missed')) +
            '</button></div>';
    }
    html += '</div>';

    container.innerHTML = html;

    var retry = document.getElementById('quizRetryMissed');
    if (retry) retry.addEventListener('click', quizRetryMissed);
}

function quizRetryMissed() {
    if (!quizState || !quizState.missed || !quizState.missed.length) return;
    quizState = { questions: quizState.missed.slice(), index: 0, answers: [], engineKey: null, persisted: false };
    quizRender();
}

function generateQuizFromNotes() {
    var container = quizContainer();
    if (!container) return;

    var data = loadData();
    var notes = (data.notes || []).filter(function (n) {
        return n && String(n.text == null ? '' : n.text).trim().length >= 30;
    });
    if (!notes.length) {
        quizState = null;
        container.innerHTML = '<p class="empty-state">' + quizEsc(getTranslation('ai_quiz_empty')) + '</p>';
        return;
    }

    var countSel = document.getElementById('quizCountSelect');
    var count = countSel ? parseInt(countSel.value, 10) : 10;
    if (!count || count < 1) count = 10;

    var picked = quizPickNotes(notes, count);
    var cloze = quizBuildCloze(picked, count, quizTermPool(notes));

    function start(questions, engineKey) {
        var seen = {}, unique = [];
        questions.forEach(function (q) {
            var key = String(q.question).toLowerCase();
            if (seen[key]) return;
            seen[key] = true;
            unique.push(q);
        });
        if (!unique.length) {
            quizState = null;
            container.innerHTML = '<p class="empty-state">' + quizEsc(getTranslation('ai_quiz_empty')) + '</p>';
            return;
        }
        quizState = { questions: unique.slice(0, count), index: 0, answers: [], engineKey: engineKey, persisted: false };
        quizRender();
    }

    quizAiQuestions(picked, count).then(function (aiQuestions) {
        if (aiQuestions && aiQuestions.length) {
            // Provider questions first, topped up with cloze so the requested
            // count is met instead of falling back wholesale. The badge is for
            // the heuristic path only - saying "connect a provider key" while a
            // key is answering would be a lie, and each cloze question carries
            // its own "fill in the blank" label anyway.
            start(aiQuestions.concat(cloze), null);
            return;
        }
        start(cloze, 'ai_quiz_offline');
    }).catch(function () { start(cloze, 'ai_quiz_offline'); });
}

// ================================================================
// FLASHCARD AUTO-GENERATE FROM NOTES
// ================================================================
function autoGenerateFlashcards() {
    var data = loadData();
    var notes = data.notes || [];
    if (notes.length === 0) {
        alert(getTranslation('ai_fc_none'));
        return;
    }

    function makeCard(front, back) {
        return {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            front: String(front || '').trim().slice(0, 200) || 'Note',
            back: String(back || '').trim().slice(0, 1000),
            dueDate: new Date().toISOString().slice(0,10),
            level: 0
        };
    }

    function commit(cards, logText) {
        var data2 = loadData();
        var deck = data2.flashcards.decks.find(function(d) { return d.name === 'Auto from Notes'; });
        if (!deck) {
            deck = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                name: 'Auto from Notes',
                cards: []
            };
            data2.flashcards.decks.push(deck);
        }
        deck.cards = deck.cards.concat(cards);
        addActivity(data2, 'flashcard_auto', logText);
        saveData(data2);
        if (typeof setupFlashcards === 'function') setupFlashcards();
        alert('Added ' + cards.length + ' flashcards to "Auto from Notes" deck!');
    }

    function localCards() {
        var newCards = notes.map(function(n) {
            var words = n.text.split(/\s+/);
            var front = words.slice(0, Math.min(5, words.length)).join(' ');
            return makeCard(front + (words.length > 5 ? '…' : ''), n.text);
        });
        commit(newCards, 'Auto-generated ' + newCards.length + ' flashcards from notes');
    }

    // AI path: Q/A pairs authored from the note contents.
    StudyHubAI.status().then(function (st) {
        if (!st.configured) { localCards(); return undefined; }
        var corpus = notes.slice(0, 20).map(function (n, i) { return (i + 1) + '. ' + String(n.text).slice(0, 300); }).join('\n');
        return StudyHubAI.chat([
            { role: 'system', content: 'You create flashcards from study notes. Reply with ONLY a JSON object: {"cards": [{"front": a short question or term, "back": the answer}]}. One card per distinct idea, at most 20 cards. No markdown, no prose.' },
            { role: 'user', content: corpus.slice(0, 8000) }
        ], { jsonMode: true, maxTokens: 1400, temperature: 0.4, timeoutMs: 40000, task: 'flashcards' }).then(function (res) {
            var j = StudyHubAI.parseJsonReply(res.text);
            var raw = j && Array.isArray(j.cards) ? j.cards : [];
            var cards = raw.filter(function (c) {
                return c && typeof c.front === 'string' && typeof c.back === 'string' && c.front.trim() && c.back.trim();
            }).slice(0, 20).map(function (c) { return makeCard(c.front, c.back); });
            if (cards.length < 2) { localCards(); return undefined; }
            commit(cards, 'AI-generated ' + cards.length + ' flashcards from notes');
        }).catch(function () { localCards(); });
    }).catch(function () { localCards(); });
}

// ================================================================
// FLASHCARDS FROM UPLOADED FILES (uses file-sourced notes)
// ================================================================
function generateFlashcardsFromFiles() {
    var data = loadData();
    var fileNotes = (data.notes || []).filter(function(n) { return n.source; });
    if (fileNotes.length === 0) {
        alert('No file-based notes found. Upload files on the Notes page first.');
        return;
    }

    function makeCard(front, back) {
        return {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            front: String(front || '').trim().slice(0, 200) || 'Note',
            back: String(back || '').trim().slice(0, 1000),
            dueDate: new Date().toISOString().slice(0,10),
            level: 0
        };
    }

    function commit(cards, logText) {
        var data2 = loadData();
        var deck = data2.flashcards.decks.find(function(d) { return d.name === 'Auto from Files'; });
        if (!deck) {
            deck = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                name: 'Auto from Files',
                cards: []
            };
            data2.flashcards.decks.push(deck);
        }
        deck.cards = deck.cards.concat(cards);
        addActivity(data2, 'flashcard_auto', logText);
        saveData(data2);
        if (typeof setupFlashcards === 'function') setupFlashcards();
        alert('Added ' + cards.length + ' flashcards to "Auto from Files" deck!');
    }

    function localCards() {
        var newCards = fileNotes.map(function(n) {
            var words = n.text.split(/\s+/);
            var front = words.slice(0, Math.min(8, words.length)).join(' ');
            return makeCard(front + (words.length > 8 ? '…' : ''), n.text.slice(0, 1000));
        });
        commit(newCards, 'Auto-generated ' + newCards.length + ' flashcards from files');
    }

    StudyHubAI.status().then(function (st) {
        if (!st.configured) { localCards(); return undefined; }
        var corpus = fileNotes.slice(0, 10).map(function (n, i) {
            return (i + 1) + '. [Source: ' + (n.source || 'note') + '] ' + String(n.text).slice(0, 3000);
        }).join('\n');
        return StudyHubAI.chat([
            { role: 'system', content: 'You create flashcards from study material extracted from files. Reply with ONLY a JSON object: {"cards": [{"front": a short question or term, "back": the answer}]}. One card per distinct idea, at most 25 cards. Focus on key concepts, definitions, and important facts. No markdown, no prose.' },
            { role: 'user', content: corpus.slice(0, 12000) }
        ], { jsonMode: true, maxTokens: 2000, temperature: 0.4, timeoutMs: 50000, task: 'flashcards' }).then(function (res) {
            var j = StudyHubAI.parseJsonReply(res.text);
            var raw = j && Array.isArray(j.cards) ? j.cards : [];
            var cards = raw.filter(function (c) {
                return c && typeof c.front === 'string' && typeof c.back === 'string' && c.front.trim() && c.back.trim();
            }).slice(0, 25).map(function (c) { return makeCard(c.front, c.back); });
            if (cards.length < 2) { localCards(); return undefined; }
            commit(cards, 'AI-generated ' + cards.length + ' flashcards from files');
        }).catch(function () { localCards(); });
    }).catch(function () { localCards(); });
}



// ================================================================
// TRASH / UNDO (soft delete, 24h retention)
// ================================================================
var TRASH_RETENTION_MS = 24 * 60 * 60 * 1000;

function pushToTrash(data, itemType, itemData) {
    if (!data.trash) data.trash = [];
    data.trash.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        type: itemType,
        data: itemData,
        deletedAt: Date.now()
    });
    data.trash = data.trash.filter(function(t) { return Date.now() - t.deletedAt < TRASH_RETENTION_MS; });
}

function updateTrashCount() {
    var btn = document.getElementById('trashBtn');
    if (!btn) return;
    var data = loadData();
    if (data.trash) {
        data.trash = data.trash.filter(function(t) { return Date.now() - t.deletedAt < TRASH_RETENTION_MS; });
        saveData(data);
    }
    var count = (data.trash || []).length;
    btn.innerHTML = '<i class="ph ph-trash" aria-hidden="true"></i> Trash (' + count + ')';
}

function setupTrash() {
    var btn = document.getElementById('trashBtn');
    if (!btn) return;
    updateTrashCount();
    btn.addEventListener('click', openTrashModal);
}

function openTrashModal() {
    var data = loadData();
    if (data.trash) {
        data.trash = data.trash.filter(function(t) { return Date.now() - t.deletedAt < TRASH_RETENTION_MS; });
        saveData(data);
    }
    var items = data.trash || [];

    var existing = document.getElementById('trashModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.className = 'trash-modal';
    modal.id = 'trashModal';
    modal.innerHTML = '<div class="trash-modal-content">' +
        '<div class="trash-modal-header"><h2>🗑️ Trash (' + items.length + ')</h2><button id="trashCloseBtn" class="btn-danger-sm">Close</button></div>' +
        (items.length === 0 ? '<p class="empty-state">Trash is empty.</p>' :
            items.map(function(t) {
                var label = (t.data.text || t.data.name || t.data.title || t.type);
                return '<div class="trash-item"><span>' + label + ' <small style="color:#64748b;">(' + t.type + ')</small></span>' +
                    '<span><button class="btn-primary-sm" data-restore="' + t.id + '">Restore</button> ' +
                    '<button class="btn-danger-sm" data-purge="' + t.id + '">Delete</button></span></div>';
            }).join('')) +
        '<div style="margin-top:1rem; text-align:right;"><button id="emptyTrashBtn" class="btn-danger">Empty Trash</button></div>' +
        '</div>';
    document.body.appendChild(modal);

    document.getElementById('trashCloseBtn').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    modal.querySelectorAll('[data-restore]').forEach(function(b) {
        b.addEventListener('click', function() {
            var id = this.dataset.restore;
            var data = loadData();
            var item = data.trash.find(function(t) { return t.id === id; });
            if (!item) return;
            if (item.type === 'note') {
                data.notes.push(item.data);
                addActivity(data, 'restore', 'Restored note');
            } else if (item.type === 'file') {
                data.files.push(item.data);
                addActivity(data, 'restore', 'Restored file: "' + item.data.name + '"');
            } else if (item.type === 'notice') {
                data.notices.push(item.data);
                addActivity(data, 'restore', 'Restored notice');
            } else if (item.type === 'habit') {
                data.habits.push(item.data);
                addActivity(data, 'restore', 'Restored habit');
            }
            data.trash = data.trash.filter(function(t) { return t.id !== id; });
            saveData(data);
            modal.remove();
            updateTrashCount();
            refreshCurrentPage();
        });
    });
    modal.querySelectorAll('[data-purge]').forEach(function(b) {
        b.addEventListener('click', function() {
            var id = this.dataset.purge;
            var data = loadData();
            data.trash = data.trash.filter(function(t) { return t.id !== id; });
            saveData(data);
            modal.remove();
            updateTrashCount();
            openTrashModal();
        });
    });
    var emptyBtn = document.getElementById('emptyTrashBtn');
    if (emptyBtn) emptyBtn.addEventListener('click', function() {
        if (!confirm('Empty trash permanently?')) return;
        var data = loadData();
        data.trash = [];
        saveData(data);
        modal.remove();
        updateTrashCount();
    });
}

function refreshCurrentPage() {
    var path = window.location.pathname.split('/').pop() || 'index.html';
    if (path === 'index.html' || path === '') { if (typeof renderDashboard === 'function') renderDashboard(); }
    else if (path === 'files.html') { if (typeof renderFileList === 'function') renderFileList(); }
    else if (path === 'notes.html') { if (typeof setupNotes === 'function') setupNotes(); }
    else if (path === 'notice.html') { if (typeof setupNotice === 'function') setupNotice(); }
    else if (path === 'habits.html') { if (typeof setupHabits === 'function') setupHabits(); }
}

// ================================================================
// FILE ANNOTATION (overrides renderFileList to add note inputs + trash)
// ================================================================
function renderFileList() {
    var container = document.getElementById('fileList');
    if (!container) return;
    var data = loadData();
    if (!data.fileAnnotations) data.fileAnnotations = {};

    if (data.files.length === 0) {
        container.innerHTML = '<p class="empty-state">' + getTranslation('no_files') + '</p>';
        return;
    }

    container.innerHTML = data.files.map(function (f) {
        var note = data.fileAnnotations[f.id] || '';
        return '<div class="file-item" style="flex-direction:column; align-items:stretch; gap:0.4rem;">' +
            '<div class="file-item-row">' +
                '<a href="#" class="file-name" data-fileid="' + f.id + '">📄 ' + f.name + '</a>' +
                '<span class="file-size">' + (f.size / 1024).toFixed(1) + ' KB</span>' +
                '<button class="btn-primary-sm" data-action="download" data-fileid="' + f.id + '">⬇ Download</button>' +
                '<button class="delete-item-btn" data-id="' + f.id + '">✕</button>' +
            '</div>' +
            '<input type="text" class="file-note-input" placeholder="📝 Add note about this file..." data-fileid="' + f.id + '" value="' + note.replace(/"/g, '&quot;') + '" />' +
        '</div>';
    }).join('');

    // Open link (Blob URL — reliable for every file type)
    container.querySelectorAll('.file-name').forEach(function (a) {
        a.addEventListener('click', function (e) {
            e.preventDefault();
            openFile(this.dataset.fileid, 'open');
        });
    });

    // Download button (Blob URL + download attribute)
    container.querySelectorAll('[data-action="download"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            openFile(this.dataset.fileid, 'download');
        });
    });

    // Delete single file (soft delete → Trash)
    container.querySelectorAll('.delete-item-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var id = this.dataset.id;
            if (confirm('Delete this file? It will be moved to Trash for 24 hours.')) {
                var d = loadData();
                var item = d.files.find(function (x) { return x.id === id; });
                if (item) pushToTrash(d, 'file', item);
                d.files = d.files.filter(function (x) { return x.id !== id; });
                addActivity(d, 'delete', 'Moved file to trash');
                saveData(d);
                renderFileList();
                updateTrashCount();
                if (document.getElementById('statFiles') && typeof renderDashboard === 'function') renderDashboard();
            }
        });
    });

    // Per-file annotation
    container.querySelectorAll('.file-note-input').forEach(function (inp) {
        inp.addEventListener('change', function () {
            var fileId = this.dataset.fileid;
            var d = loadData();
            if (!d.fileAnnotations) d.fileAnnotations = {};
            d.fileAnnotations[fileId] = this.value;
            saveData(d);
        });
        inp.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') this.blur();
        });
    });
}

// Convert base64 data URL → Blob → blob: URL, then open or download
function openFile(fileId, mode) {
    var data = loadData();
    var file = data.files.find(function (f) { return f.id === fileId; });
    if (!file) return;

    try {
        // Parse base64 data URL: "data:<mime>;base64,<payload>"
        var parts = file.data.split(',');
        var mimeMatch = parts[0].match(/data:(.*?);base64/);
        var mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        var b64 = parts[1];
        var binary = atob(b64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var blob = new Blob([bytes], { type: mime });
        var blobUrl = URL.createObjectURL(blob);

        if (mode === 'download') {
            var a = document.createElement('a');
            a.href = blobUrl;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 5000);
        } else {
            window.open(blobUrl, '_blank');
            setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 30000);
        }
    } catch (e) {
        alert('Could not open file: ' + e.message);
    }
}

// ================================================================
// COMMAND PALETTE v3 — every command verified, no-op-proof
// Ctrl+K to open · Esc to close · ↑↓ navigate · Enter run · Tab autocomplete
// ================================================================
(function () {
    'use strict';

    // ---------- Helpers (bulletproof) ----------
    function clickIfPresent(id) {
        var el = document.getElementById(id);
        if (el) {
            el.click();
            return true;
        }
        return false;
    }

    function goThenFocus(url, inputId, delay) {
        // If we're already on the target page, just focus — no reload
        var current = window.location.pathname.split('/').pop() || 'index.html';
        var target = url;
        if (current === target) {
            var inp = document.getElementById(inputId);
            if (inp) {
                inp.focus();
                if (inp.select) inp.select();
                inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
        // Different page: stash the focus request, navigate, let boot() pick it up
        try {
            sessionStorage.setItem('studyHubFocusAfterNav', inputId);
        } catch (e) {}
        location.href = url;
    }

    function scrollToSelector(sel) {
        var el = document.querySelector(sel);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Flash it so the user sees what was highlighted
            el.style.transition = 'box-shadow 0.3s ease';
            el.style.boxShadow = '0 0 0 3px rgba(94,234,212,0.55), 0 0 40px rgba(94,234,212,0.35)';
            setTimeout(function () {
                el.style.boxShadow = '';
            }, 1500);
            return true;
        }
        return false;
    }

    function openBlockerSettingsSafe() {
        if (window.studyHubBlocker && typeof window.studyHubBlocker.settings === 'function') {
            window.studyHubBlocker.settings();
        } else {
            // Fallback: dispatch Shift+Click behavior on the blocker button if it exists
            var btn = document.getElementById('blockerToggle');
            if (btn) {
                // Simulate the shift-click path
                var ev = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true });
                btn.dispatchEvent(ev);
            }
        }
    }

    function openTrashSafe() {
        if (typeof window.openTrashModal === 'function') {
            window.openTrashModal();
            return;
        }
        // Fallback: click the trash button
        var btn = document.getElementById('trashBtn');
        if (btn) btn.click();
    }

    function openCalendarSafe() {
        var btn = document.getElementById('calendarExpandBtn');
        if (btn) {
            btn.click();
            return;
        }
        // Fallback: some pages render the modal directly
        var modal = document.getElementById('calendarModal');
        if (modal) {
            modal.style.display = 'flex';
            // Trigger a re-render if the calendar init exists
            if (typeof window.initCalendar === 'function') {
                try { window.initCalendar(); } catch (e) {}
            }
        }
    }

    // ---------- Command registry ----------
    // Groups: 'recent', 'go', 'do', 'make', 'tool', 'theme'
    var CP_COMMANDS = [
        // ---- Navigation ----
        { id: 'go.dash',    group: 'go', icon: '<i class="ph ph-rocket-launch" aria-hidden="true"></i>', label: 'Dashboard',         hint: 'home · overview · stats',    keywords: ['home','main','start','overview'], action: function () { location.href = 'index.html'; } },
        { id: 'go.notes',   group: 'go', icon: '<i class="ph ph-pen-nib" aria-hidden="true"></i>', label: 'Notes',             hint: 'jot · writing · ideas',      keywords: ['note','jot','write'],             action: function () { location.href = 'notes.html'; } },
        { id: 'go.habits',  group: 'go', icon: '<i class="ph ph-fire" aria-hidden="true"></i>', label: 'Habits',            hint: 'streak · routine · daily',   keywords: ['habit','streak','routine'],       action: function () { location.href = 'habits.html'; } },
        { id: 'go.ai',      group: 'go', icon: '<i class="ph ph-robot" aria-hidden="true"></i>', label: 'AI Tools',          hint: 'summarize · gpt · tools',    keywords: ['ai','gpt','tools','assistant'],   action: function () { location.href = 'ai-tools.html'; } },
        { id: 'go.files',   group: 'go', icon: '<i class="ph ph-folder-open" aria-hidden="true"></i>', label: 'Files',             hint: 'upload · storage · docs',    keywords: ['file','upload','storage'],        action: function () { location.href = 'files.html'; } },
        { id: 'go.assign',  group: 'go', icon: '<i class="ph ph-clipboard-text" aria-hidden="true"></i>', label: 'Assignments',       hint: 'homework · deadline · due',  keywords: ['assignment','homework','task'],   action: function () { location.href = 'assignments.html'; } },
        { id: 'go.planner', group: 'go', icon: '<i class="ph ph-calendar-blank" aria-hidden="true"></i>', label: 'Planner',           hint: 'schedule · timetable',       keywords: ['planner','schedule','calendar'],  action: function () { location.href = 'planner.html'; } },
        { id: 'go.flash',   group: 'go', icon: '<i class="ph ph-cards" aria-hidden="true"></i>', label: 'Flashcards',        hint: 'cards · decks · review',     keywords: ['flash','card','deck','review'],   action: function () { location.href = 'flashcards.html'; } },
        { id: 'go.read',    group: 'go', icon: '<i class="ph ph-book-open" aria-hidden="true"></i>', label: 'Reading',           hint: 'articles · links · read',    keywords: ['read','article','bookmark'],      action: function () { location.href = 'reading.html'; } },
        { id: 'go.notice',  group: 'go', icon: '<i class="ph ph-megaphone" aria-hidden="true"></i>', label: 'Notice',            hint: 'pinboard · bulletin',        keywords: ['notice','announce','bulletin'],   action: function () { location.href = 'notice.html'; } },

        // ---- Actions ----
        { id: 'do.pomoStart', group: 'do', icon: '<i class="ph ph-play" aria-hidden="true"></i>',  label: 'Start Pomodoro',    hint: 'timer · focus 25',      keywords: ['pomo','timer','focus','start'],  action: function () { clickIfPresent('pomoStart'); } },
        { id: 'do.pomoStop',  group: 'do', icon: '<i class="ph ph-stop" aria-hidden="true"></i>',  label: 'Stop Pomodoro',     hint: 'pause timer',           keywords: ['stop','pause','pomo'],           action: function () { clickIfPresent('pomoStop'); } },
        { id: 'do.pomoReset', group: 'do', icon: '<i class="ph ph-arrow-clockwise" aria-hidden="true"></i>',  label: 'Reset Pomodoro',    hint: 'clear timer',           keywords: ['reset','clear','pomo'],          action: function () { clickIfPresent('pomoReset'); } },
        { id: 'do.dwStart',   group: 'do', icon: '<i class="ph ph-timer" aria-hidden="true"></i>',  label: 'Start Deep Work',   hint: 'flow · long focus',     keywords: ['deepwork','deep','flow','start'],action: function () { clickIfPresent('dwStart'); } },
        { id: 'do.dwStop',    group: 'do', icon: '<i class="ph ph-pause" aria-hidden="true"></i>',  label: 'Stop Deep Work',    hint: 'end deep session',      keywords: ['deepwork','stop','end'],         action: function () { clickIfPresent('dwStop'); } },
        { id: 'do.dwReset',   group: 'do', icon: '<i class="ph ph-arrow-clockwise" aria-hidden="true"></i>',  label: 'Reset Deep Work',   hint: 'clear deep timer',      keywords: ['deepwork','reset'],              action: function () { clickIfPresent('dwReset'); } },
        { id: 'do.focusOn',   group: 'do', icon: '<i class="ph ph-lock-open" aria-hidden="true"></i>', label: 'Toggle Focus Mode', hint: 'do not disturb · zen',  keywords: ['focus','zen','distraction'],     action: function () { clickIfPresent('focusToggle'); } },
        { id: 'do.blocker',   group: 'do', icon: '<i class="ph ph-shield-check" aria-hidden="true"></i>', label: 'Blocker Settings',  hint: 'block · distractions',  keywords: ['block','shield','distraction'],  action: openBlockerSettingsSafe },
        { id: 'do.blockerLog',group: 'do', icon: '<i class="ph ph-scroll" aria-hidden="true"></i>', label: 'Blocker Log',       hint: 'blocked attempts',      keywords: ['block','log','history'],         action: function () {
            if (window.studyHubBlocker && typeof window.studyHubBlocker.log === 'function') {
                window.studyHubBlocker.log();
            }
        } },

        // ---- Create ----
        { id: 'make.note',   group: 'make', icon: '<i class="ph ph-note-pencil" aria-hidden="true"></i>', label: 'New Note',   hint: 'create · jot',    keywords: ['new','add','note','create'],  action: function () { goThenFocus('notes.html', 'noteInput'); } },
        { id: 'make.habit',  group: 'make', icon: '<i class="ph ph-plus" aria-hidden="true"></i>', label: 'New Habit',  hint: 'create · add',    keywords: ['new','add','habit','create'], action: function () { goThenFocus('habits.html', 'habitInput'); } },
        { id: 'make.notice', group: 'make', icon: '<i class="ph ph-push-pin" aria-hidden="true"></i>', label: 'New Notice', hint: 'pin · announce',  keywords: ['new','add','notice','pin'],   action: function () { goThenFocus('notice.html', 'noticeInput'); } },

        // ---- Tools ----
        { id: 'tool.trash',    group: 'tool', icon: '<i class="ph ph-trash" aria-hidden="true"></i>', label: 'Open Trash',        hint: 'restore · deleted',    keywords: ['trash','deleted','restore'],     action: openTrashSafe },
        { id: 'tool.calendar', group: 'tool', icon: '<i class="ph ph-calendar-blank" aria-hidden="true"></i>', label: 'Open Calendar',     hint: 'month · view',         keywords: ['calendar','month','date'],       action: openCalendarSafe },
        { id: 'tool.calc',     group: 'tool', icon: '<i class="ph ph-calculator" aria-hidden="true"></i>', label: 'Jump to Calculator',hint: 'math · numbers',       keywords: ['calc','calculator','math'],      action: function () {
            if (!scrollToSelector('.calculator-widget')) {
                location.href = 'calculator.html';
            }
        } },
        { id: 'tool.search',   group: 'tool', icon: '<i class="ph ph-magnifying-glass" aria-hidden="true"></i>', label: 'Focus Quick Search',hint: 'search bar',           keywords: ['search','find','query'],         action: function () {
            var inp = document.getElementById('searchInput');
            if (inp) {
                inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
                inp.focus();
            }
        } },

        // ---- Appearance ----
        { id: 'theme.picker',  group: 'theme', icon: '<i class="ph ph-palette" aria-hidden="true"></i>', label: 'Customize Theme', hint: 'colors · wallpaper', keywords: ['theme','color','background','wallpaper'], action: function () {
            var b = document.querySelector('.theme-picker-fab');
            if (b) b.click();
        } }
    ];

    // ---------- Group meta ----------
    var GROUP_ORDER = ['recent', 'go', 'do', 'make', 'tool', 'theme'];
    var GROUP_META = {
        recent: { label: 'Recently Used', icon: '<i class="ph ph-clock" aria-hidden="true"></i>' },
        go:     { label: 'Go To',         icon: '<i class="ph ph-compass" aria-hidden="true"></i>' },
        do:     { label: 'Actions',       icon: '<i class="ph ph-lightning" aria-hidden="true"></i>' },
        make:   { label: 'Create',        icon: '<i class="ph ph-sparkle" aria-hidden="true"></i>' },
        tool:   { label: 'Tools',         icon: '<i class="ph ph-toolbox" aria-hidden="true"></i>' },
        theme:  { label: 'Appearance',    icon: '<i class="ph ph-palette" aria-hidden="true"></i>' }
    };

    // ---------- Recent uses ----------
    var RECENT_KEY = 'studyHubCmdRecent';
    function loadRecent() {
        try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
        catch (e) { return []; }
    }
    function pushRecent(id) {
        var list = loadRecent().filter(function (x) { return x !== id; });
        list.unshift(id);
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 4))); } catch (e) {}
    }

    // ---------- Fuzzy match ----------
    function fuzzyMatch(query, text) {
        if (!query) return { score: 0, hits: [] };
        var q = query.toLowerCase();
        var t = text.toLowerCase();
        var qi = 0, score = 0, hits = [], lastMatch = -1;
        for (var ti = 0; ti < t.length && qi < q.length; ti++) {
            if (t[ti] === q[qi]) {
                if (lastMatch === ti - 1) score += 4;
                if (ti === 0) score += 6;
                score += 2;
                hits.push(ti);
                lastMatch = ti;
                qi++;
            }
        }
        if (qi < q.length) return { score: -1, hits: [] };
        score += Math.max(0, 12 - text.length / 4);
        return { score: score, hits: hits };
    }

    // ---------- State ----------
    var cpActive = false;
    var cpSelectedIdx = 0;
    var cpFiltered = [];
    var cpInput = null;
    var cpResultsEl = null;
    var cpPreviewEl = null;

    // ---------- Public init ----------
    function initCommandPalette() {
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (cpActive) closeCommandPalette();
                else openCommandPalette();
                return;
            }
            if (!cpActive) return;

            if (e.key === 'Escape') { e.preventDefault(); closeCommandPalette(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
            else if (e.key === 'Home') { e.preventDefault(); cpSelectedIdx = 0; renderCpResults(); }
            else if (e.key === 'End') { e.preventDefault(); cpSelectedIdx = Math.max(0, cpFiltered.length - 1); renderCpResults(); }
            else if (e.key === 'Enter') { e.preventDefault(); runSelected(); }
            else if (e.key === 'Tab') {
                e.preventDefault();
                if (cpFiltered[cpSelectedIdx]) {
                    cpInput.value = cpFiltered[cpSelectedIdx].cmd.label;
                    onInput();
                }
            }
        });
    }

    // ---------- Open / Close ----------
    function openCommandPalette(initialQuery) {
        if (cpActive) return;
        cpActive = true;

        var pal = document.createElement('div');
        pal.className = 'command-palette';
        pal.id = 'commandPalette';
        pal.innerHTML = [
            '<div class="cp-content" role="dialog" aria-label="Command palette">',
                '<div class="cp-input-wrap">',
                    '<span class="cp-prompt" aria-hidden="true">›</span>',
                    '<input type="text" id="cpInput" placeholder="Type a command or search…" autocomplete="off" spellcheck="false" />',
                    '<span class="cp-kbd-hint"><kbd>Esc</kbd></span>',
                '</div>',
                '<div class="cp-body">',
                    '<div class="cp-results" id="cpResults"></div>',
                    '<div class="cp-preview" id="cpPreview"></div>',
                '</div>',
                '<div class="cp-footer">',
                    '<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>',
                    '<span><kbd>↵</kbd> run</span>',
                    '<span><kbd>Tab</kbd> autocomplete</span>',
                    '<span class="cp-footer-spacer"></span>',
                    '<span id="cpCounter"></span>',
                '</div>',
            '</div>'
        ].join('');
        document.body.appendChild(pal);

        cpInput     = document.getElementById('cpInput');
        cpResultsEl = document.getElementById('cpResults');
        cpPreviewEl = document.getElementById('cpPreview');

        cpInput.addEventListener('input', onInput);
        pal.addEventListener('click', function (e) { if (e.target === pal) closeCommandPalette(); });

        if (initialQuery) cpInput.value = initialQuery;

        onInput();
        requestAnimationFrame(function () { cpInput.focus(); });
    }

    function closeCommandPalette() {
        if (!cpActive) return;
        cpActive = false;
        var pal = document.getElementById('commandPalette');
        if (pal) pal.remove();
        cpInput = cpResultsEl = cpPreviewEl = null;
    }

    // ---------- Filter ----------
    function onInput() {
        var raw = cpInput.value.trim();
        var query = raw.replace(/^[>#@]\s*/, '').trim();

        var allowedGroups = null;
        if (raw.indexOf('>') === 0) allowedGroups = ['do', 'make'];
        else if (raw.indexOf('@') === 0) allowedGroups = ['go'];
        else if (raw.indexOf('#') === 0) allowedGroups = ['tool', 'theme'];

        var recent = loadRecent();
        var pool = CP_COMMANDS.filter(function (c) {
            return !allowedGroups || allowedGroups.indexOf(c.group) !== -1;
        });

        var scored = pool.map(function (cmd) {
            var haystack = [cmd.label, cmd.hint || '', (cmd.keywords || []).join(' ')].join(' ');
            var m = fuzzyMatch(query, haystack);
            var score = m.score;
            if (!query && recent.indexOf(cmd.id) !== -1) score += 500 - recent.indexOf(cmd.id) * 10;
            score += (GROUP_ORDER.length - GROUP_ORDER.indexOf(cmd.group)) * 0.5;
            return { cmd: cmd, score: score, hits: m.hits };
        }).filter(function (x) { return x.score >= 0; });

        scored.sort(function (a, b) { return b.score - a.score; });

        cpFiltered = [];
        if (!query) {
            recent.slice(0, 4).forEach(function (id) {
                var found = scored.find(function (x) { return x.cmd.id === id; });
                if (found) cpFiltered.push({ cmd: found.cmd, score: found.score, hits: [], group: 'recent' });
            });
            scored.forEach(function (x) {
                if (!cpFiltered.some(function (y) { return y.cmd.id === x.cmd.id; })) {
                    cpFiltered.push({ cmd: x.cmd, score: x.score, hits: x.hits, group: x.cmd.group });
                }
            });
        } else {
            cpFiltered = scored.map(function (x) {
                return { cmd: x.cmd, score: x.score, hits: x.hits, group: x.cmd.group };
            });
        }

        cpSelectedIdx = 0;
        renderCpResults();
    }

    // ---------- Selection ----------
    function moveSelection(delta) {
        if (!cpFiltered.length) return;
        cpSelectedIdx = (cpSelectedIdx + delta + cpFiltered.length) % cpFiltered.length;
        renderCpResults();
        var sel = cpResultsEl && cpResultsEl.querySelector('.cp-item.selected');
        if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
    }

    function runSelected() {
        var item = cpFiltered[cpSelectedIdx];
        if (!item) return;
        runCommand(item.cmd);
    }

    function runCommand(cmd) {
        pushRecent(cmd.id);
        closeCommandPalette();
        setTimeout(function () {
            try { cmd.action(); }
            catch (e) {
                console.error('[cmd]', cmd.id, e);
                // Last-resort fallback: warn the user
                if (typeof window.showToast === 'function') {
                    window.showToast('Command failed: ' + cmd.label, 'err');
                }
            }
        }, 30);
    }

    // ---------- Render ----------
    function renderCpResults() {
        if (!cpResultsEl) return;

        var counter = document.getElementById('cpCounter');
        if (counter) counter.textContent = cpFiltered.length + ' result' + (cpFiltered.length === 1 ? '' : 's');

        if (!cpFiltered.length) {
            cpResultsEl.innerHTML =
                '<div class="cp-empty">' +
                    '<div class="cp-empty-icon">🔍</div>' +
                    '<div class="cp-empty-title">No commands match</div>' +
                    '<div class="cp-empty-hint">Try a different word, or press <kbd>Esc</kbd> to close.</div>' +
                '</div>';
            if (cpPreviewEl) cpPreviewEl.innerHTML = '';
            return;
        }

        var groups = [];
        var current = null;
        cpFiltered.forEach(function (item, idx) {
            if (!current || current.key !== item.group) {
                current = { key: item.group, items: [] };
                groups.push(current);
            }
            current.items.push({ item: item, idx: idx });
        });

        var html = groups.map(function (g) {
            var meta = GROUP_META[g.key] || { label: g.key, icon: '•' };
            var rows = g.items.map(function (entry) {
                var i = entry.idx;
                var item = entry.item;
                var selected = i === cpSelectedIdx;
                var labelHtml = highlightLabel(item.cmd.label, item.hits);
                return [
                    '<div class="cp-item', selected ? ' selected' : '', '"',
                        ' data-idx="', i, '"',
                        ' role="option"',
                        ' aria-selected="', selected ? 'true' : 'false', '">',
                        '<span class="cp-icon" aria-hidden="true">', item.cmd.icon || '•', '</span>',
                        '<span class="cp-label">', labelHtml, '</span>',
                        '<span class="cp-hint">', item.cmd.hint || '', '</span>',
                        '<span class="cp-enter" aria-hidden="true">↵</span>',
                    '</div>'
                ].join('');
            }).join('');
            return [
                '<div class="cp-group">',
                    '<div class="cp-group-title">',
                        '<span class="cp-group-icon">', meta.icon, '</span>',
                        '<span>', meta.label, '</span>',
                    '</div>',
                    rows,
                '</div>'
            ].join('');
        }).join('');

        cpResultsEl.innerHTML = html;

        cpResultsEl.querySelectorAll('.cp-item').forEach(function (el) {
            el.addEventListener('mousemove', function () {
                var idx = parseInt(el.dataset.idx, 10);
                if (idx !== cpSelectedIdx) {
                    cpSelectedIdx = idx;
                    renderCpResults();
                }
            });
            el.addEventListener('click', function () {
                var idx = parseInt(el.dataset.idx, 10);
                cpSelectedIdx = idx;
                runSelected();
            });
        });

        renderPreview();
    }

    function highlightLabel(label, hits) {
        if (!hits || !hits.length) return escapeHtml(label);
        var set = new Set(hits);
        var out = '';
        for (var i = 0; i < label.length; i++) {
            var ch = label[i];
            out += set.has(i) ? '<mark>' + escapeHtml(ch) + '</mark>' : escapeHtml(ch);
        }
        return out;
    }

    function renderPreview() {
        if (!cpPreviewEl) return;
        var item = cpFiltered[cpSelectedIdx];
        if (!item) { cpPreviewEl.innerHTML = ''; return; }

        var c = item.cmd;
        var meta = GROUP_META[c.group] || { label: c.group, icon: '•' };
        cpPreviewEl.innerHTML = [
            '<div class="cp-preview-icon">', c.icon || '•', '</div>',
            '<div class="cp-preview-body">',
                '<div class="cp-preview-label">', escapeHtml(c.label), '</div>',
                c.hint ? '<div class="cp-preview-hint">' + escapeHtml(c.hint) + '</div>' : '',
                '<div class="cp-preview-group">',
                    '<span class="cp-preview-group-icon">', meta.icon, '</span>',
                    '<span>', meta.label, '</span>',
                '</div>',
                '<div class="cp-preview-id">#', escapeHtml(c.id), '</div>',
            '</div>'
        ].join('');
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    // ---------- Boot: honor deferred focus from goThenFocus ----------
    function boot() {
        try {
            var wantFocus = sessionStorage.getItem('studyHubFocusAfterNav');
            if (wantFocus) {
                sessionStorage.removeItem('studyHubFocusAfterNav');
                setTimeout(function () {
                    var inp = document.getElementById(wantFocus);
                    if (inp) {
                        inp.focus();
                        if (inp.select) inp.select();
                        inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 500);
            }
        } catch (e) {}
    }

    // ---------- Expose ----------
    window.initCommandPalette = initCommandPalette;
    window.openCommandPalette = openCommandPalette;
    window.closeCommandPalette = closeCommandPalette;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

// ================================================================
// BREAK REMINDER — every 50 minutes, repeats forever
// ================================================================
function initBreakReminder() {
    var breakKey = 'studyHubLastBreakReminder';
    var INTERVAL  = 50 * 60 * 1000;  // 50 minutes of active study
    var STALE     = 10 * 60 * 1000;  // away > 10 min = the break already happened
    var HEARTBEAT = 30 * 1000;       // keeps the session timestamp fresh while visible
    var breakTick = null, heartTick = null, hiddenAt = 0;

    function getLast() { try { return parseInt(localStorage.getItem(breakKey) || '0', 10) || 0; } catch (e) { return 0; } }
    function setLast(t) { try { localStorage.setItem(breakKey, String(t)); } catch (e) {} }

    function fireReminder() {
        try { notifyBreak(); } catch (e) {}
        setLast(Date.now());
        if (typeof window.showToast === 'function') {
            try { window.showToast('☕ Time for a break! You have been studying for 50 minutes.', 'ok'); } catch (e) {}
        }
    }

    /* Arm ONE shot for `remaining`, then settle into a repeating 50-min cycle. */
    function arm(remaining) {
        if (breakTick) { clearTimeout(breakTick); clearInterval(breakTick); breakTick = null; }
        breakTick = setTimeout(function () {
            fireReminder();
            breakTick = setInterval(fireReminder, INTERVAL);
        }, Math.max(5000, remaining));
    }

    /* Session continuity:
       gap < 10 min  → same study session (refresh / quick alt-tab) → resume remaining time
       gap ≥ 10 min  → the user was genuinely away → FRESH clock, never fire on open */
    function start() {
        var gap = Date.now() - getLast();
        arm(gap > 0 && gap < STALE ? INTERVAL - gap : INTERVAL);
        if (!heartTick) {
            heartTick = setInterval(function () { if (!document.hidden) setLast(Date.now()); }, HEARTBEAT);
        }
    }
    function pause() {
        if (breakTick) { clearTimeout(breakTick); clearInterval(breakTick); breakTick = null; }
    }

    /* Boot: opened after a shutdown / long absence → new session, NO reminder on open. */
    var last = getLast();
    if (last && (Date.now() - last) >= STALE) setLast(Date.now());
    start();

    /* Hidden = paused. Returning after a long idle counts as the break itself. */
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            hiddenAt = Date.now();
            pause();
        } else {
            if (hiddenAt && (Date.now() - hiddenAt) > STALE) setLast(Date.now());
            start();
            hiddenAt = 0;
        }
    });

    /* Same public API as before — nothing else in your code breaks. */
    window.studyHubBreakReminder = {
        reset: function () { setLast(Date.now()); start(); },
        fire: fireReminder,
        stop: function () { pause(); if (heartTick) { clearInterval(heartTick); heartTick = null; } }
    };
}

// ================================================================
// INIT NEW FEATURES (secondary DOMContentLoaded listener)
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    initCalendar();
    initCalculator();
    setupPriorityMatrix();
    initDeepWork();
    
    setupTrash();
    initCommandPalette();
    initBreakReminder();
    attachFocusSoundToPomodoro();

    // Quiz Generator
    var genQuizBtn = document.getElementById('generateQuizBtn');
    if (genQuizBtn) genQuizBtn.addEventListener('click', generateQuizFromNotes);
    var clearQuizBtn = document.getElementById('clearQuizBtn');
    if (clearQuizBtn) clearQuizBtn.addEventListener('click', function() {
        quizState = null;   // no half-finished attempt left in memory
        var c = document.getElementById('quizContainer');
        if (c) c.innerHTML = '';
    });

    // The quiz is built from JS, so the app's own [data-i18n] pass cannot
    // translate it: an attempt in progress redraws itself on a language change.
    // The delay matches refreshNewElements(): let applyTranslations() run first.
    var quizLangSel = document.getElementById('langSelector');
    if (quizLangSel) quizLangSel.addEventListener('change', function() {
        setTimeout(function () { if (quizState) quizRender(); }, 30);
    });

    // Auto Flashcards
    var autoFcBtn = document.getElementById('autoGenFlashcardsBtn');
    if (autoFcBtn) autoFcBtn.addEventListener('click', autoGenerateFlashcards);

    // ---- Flashcards from files button ----
    var genFilesBtn = document.getElementById('genFlashcardsFromFilesBtn');
    if (genFilesBtn && !genFilesBtn.dataset.hooked) {
        genFilesBtn.dataset.hooked = '1';
        genFilesBtn.addEventListener('click', function() {
            generateFlashcardsFromFiles();
        });
    }

 

    updateTrashCount();
});

// ================================================================
// BLOCKER + TRASH — SELF-CONTAINED (works on every page)
// ================================================================
(function () {
    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    ready(function () {

       
        // ---------- TRASH ----------
        var trashBtn = document.getElementById('trashBtn');
        if (trashBtn) {
            function readState() {
                try { return JSON.parse(localStorage.getItem('studyHubData') || '{}'); }
                catch (e) { return {}; }
            }
            function writeState(d) {
                localStorage.setItem('studyHubData', JSON.stringify(d));
            }
            function cleanTrash(d) {
                if (!d.trash) d.trash = [];
                var now = Date.now();
                d.trash = d.trash.filter(function (t) {
                    return (now - t.deletedAt) < 24 * 60 * 60 * 1000;
                });
                return d;
            }
            function paint() {
                var d = cleanTrash(readState());
                writeState(d);
                trashBtn.innerHTML = '<i class="ph ph-trash" aria-hidden="true"></i> Trash (' + d.trash.length + ')';
            }

            paint();
            trashBtn.addEventListener('click', function () {
                var d = cleanTrash(readState());
                var items = d.trash;

                var old = document.getElementById('trashModal');
                if (old) old.remove();

                var modal = document.createElement('div');
                modal.className = 'trash-modal';
                modal.id = 'trashModal';
                modal.innerHTML =
                    '<div class="trash-modal-content">' +
                        '<div class="trash-modal-header">' +
                            '<h2><i class="ph ph-trash" aria-hidden="true"></i> Trash (' + items.length + ')</h2>' +
                            '<button id="trashCloseBtn" class="btn-danger-sm">Close</button>' +
                        '</div>' +
                        (items.length === 0
                            ? '<p class="empty-state">Trash is empty.</p>'
                            : items.map(function (t) {
                                var label = (t.data && (t.data.text || t.data.name || t.data.title)) || t.type;
                                return '<div class="trash-item">' +
                                    '<span>' + label + ' <small style="color:#64748b;">(' + t.type + ')</small></span>' +
                                    '<span>' +
                                        '<button class="btn-primary-sm" data-restore="' + t.id + '">Restore</button> ' +
                                        '<button class="btn-danger-sm" data-purge="' + t.id + '">Delete</button>' +
                                    '</span>' +
                                '</div>';
                            }).join('')) +
                        '<div style="margin-top:1rem; text-align:right;">' +
                            '<button id="emptyTrashBtn" class="btn-danger">Empty Trash</button>' +
                        '</div>' +
                    '</div>';
                document.body.appendChild(modal);

                document.getElementById('trashCloseBtn').addEventListener('click', function () {
                    modal.remove();
                });
                modal.addEventListener('click', function (e) {
                    if (e.target === modal) modal.remove();
                });

                // Restore
                modal.querySelectorAll('[data-restore]').forEach(function (b) {
                    b.addEventListener('click', function () {
                        var id = this.dataset.restore;
                        var d2 = cleanTrash(readState());
                        var item = d2.trash.find(function (x) { return x.id === id; });
                        if (!item) { modal.remove(); return; }
                        if (item.type === 'note')        d2.notes.push(item.data);
                        else if (item.type === 'file')   d2.files.push(item.data);
                        else if (item.type === 'notice') d2.notices.push(item.data);
                        else if (item.type === 'habit')  d2.habits.push(item.data);
                        d2.trash = d2.trash.filter(function (x) { return x.id !== id; });
                        writeState(d2);
                        modal.remove();
                        paint();
                        location.reload();
                    });
                });

                // Purge one
                modal.querySelectorAll('[data-purge]').forEach(function (b) {
                    b.addEventListener('click', function () {
                        var id = this.dataset.purge;
                        var d2 = cleanTrash(readState());
                        d2.trash = d2.trash.filter(function (x) { return x.id !== id; });
                        writeState(d2);
                        modal.remove();
                        paint();
                        trashBtn.click();
                    });
                });

                // Empty trash
                var emptyBtn = document.getElementById('emptyTrashBtn');
                if (emptyBtn) {
                    emptyBtn.addEventListener('click', function () {
                        if (!confirm('Empty trash permanently?')) return;
                        var d2 = cleanTrash(readState());
                        d2.trash = [];
                        writeState(d2);
                        modal.remove();
                        paint();
                    });
                }
            });
        }
    });
})();

// ================================================================
// AI PLANNER v4.5 — full-day routines: study + LIFE, logically placed
// • Life layer: wake · shower · breakfast · lunch(+prayer) · rest ·
//   Asr/Maghrib · sports · dinner(+Isha) · wind-down · sleep
// • Collision-free placement (firstFree scanning), chronological study
// • Slot-preference parsing ("study in the morning"), daily rotation
// • TEST PREVIEW gate — planner grid untouched until Apply/Replace
// • Timeline view · 5:00–23:00 grid · provider-AI + offline engine
// ================================================================
(function () {
  'use strict';
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  var ALL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var ALL_HOURS = (function () { var a = []; for (var h = 5; h <= 23; h++) a.push(h + ':00'); return a; })();
  var DAY_NAMES = { mon:'Mon',tue:'Tue',wed:'Wed',thu:'Thu',fri:'Fri',sat:'Sat',sun:'Sun',
    monday:'Mon',tuesday:'Tue',wednesday:'Wed',thursday:'Thu',friday:'Fri',saturday:'Sat',sunday:'Sun' };

  var LIFE = {
    wake:{i:'⏰',c:'#7dd3fc'}, shower:{i:'🚿',c:'#7fb3d9'}, breakfast:{i:'🍳',c:'#f0b46a'},
    lunch:{i:'🍽️',c:'#f0b46a'}, rest:{i:'😌',c:'#a78bfa'}, prayer:{i:'🕌',c:'#5fd6a4'},
    sports:{i:'🏃',c:'#f472b6'}, dinner:{i:'🍽️',c:'#f0b46a'}, wind:{i:'🛏️',c:'#8d9aa9'}, sleep:{i:'😴',c:'#5a6b7d'}
  };
  var LIFE_EMOJIS = ['⏰','🚿','🍳','🍽️','😌','🕌','🏃','🛏️','😴'];
  function isLife(v) { v = String(v || ''); for (var i = 0; i < LIFE_EMOJIS.length; i++) if (v.indexOf(LIFE_EMOJIS[i]) === 0) return true; return false; }
  function life(k, extra) { return LIFE[k].i + ' ' + k.charAt(0).toUpperCase() + k.slice(1) + (extra ? ' · ' + extra : ''); }

  var SUBJECT_MAP = { math:'Math',maths:'Math',mathematics:'Math',algebra:'Math',calculus:'Math',geometry:'Math',trig:'Math',trigonometry:'Math',statistics:'Stats',stats:'Stats',probability:'Stats',physics:'Physics',phy:'Physics',chemistry:'Chemistry',chem:'Chemistry',biology:'Biology',bio:'Biology',science:'Science',sci:'Science',coding:'Coding',code:'Coding',programming:'Coding',cs:'Computer Science','computer science':'Computer Science',dsa:'Data Structures',algorithms:'Algorithms',algo:'Algorithms','machine learning':'ML',ml:'ML',ai:'AI','artificial intelligence':'AI',web:'Web Dev','web dev':'Web Dev',python:'Python',java:'Java',cpp:'C++','c++':'C++',english:'English',eng:'English',bangla:'Bangla',bengali:'Bangla',spanish:'Spanish',french:'French',german:'German',arabic:'Arabic',hindi:'Hindi',chinese:'Chinese',japanese:'Japanese',history:'History',geography:'Geography',economics:'Economics',econ:'Economics',literature:'Literature',philosophy:'Philosophy',psychology:'Psychology',revision:'Revision',revise:'Revision',review:'Revision',homework:'Homework',hw:'Homework',practice:'Practice',problems:'Practice',project:'Project',writing:'Writing',essay:'Writing' };
  var DIFFICULTY = { Math:3,Physics:3,Chemistry:3,'Computer Science':3,Algorithms:3,'Data Structures':3,ML:3,Stats:2,Biology:2,Coding:3,Python:2,Java:3,'C++':3,'Web Dev':2,English:2,Bangla:1,Spanish:2,French:2,German:3,Arabic:3,Hindi:2,Chinese:3,Japanese:3,History:2,Geography:2,Economics:3,Literature:2,Philosophy:3,Psychology:2,Revision:1,Homework:2,Practice:2,Project:2,Writing:2 };

  function escH(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  /* ---------- PARSER ---------- */
  function parseRequest(text) {
    var t = ' ' + String(text).toLowerCase().replace(/\s+/g, ' ') + ' ';
    var req = { mode:'balanced', scope:'all', bias:'all', hours:0, sessionMin:60,
      subjects:[], focus:null, wake:null, sleep:null, prayers:null, sports:null, raw:text };
    if (/\b(easy|light|chill|relaxed|casual|minimal|gentle)\b/.test(t)) req.mode = 'easy';
    else if (/\b(intense|intensive|heavy|hard|exam|sprint|crunch|maximum|max|jam|packed|marathon)\b/.test(t)) req.mode = 'intense';

    if (/\b(weekend|sat(urday)?|sun(day)?)\b/.test(t)) req.scope = 'weekend';
    else if (/\b(weekdays|work\s?week|school\s?week)\b/.test(t)) req.scope = 'weekday';
    else if (/\b(today|tonight)\b/.test(t)) req.scope = 'today';
    else if (/\btomorrow\b/.test(t)) req.scope = 'tomorrow';
    var dm = t.match(/\b(?:on|for|this)\s+(mon|tue|wed|thu|fri|sat|sun)(day)?\b/);
    if (dm) { req.scope = 'specific-day'; req.specificDay = DAY_NAMES[dm[1]]; }

    if (/\b(in the |at |during )?morning\b|\bearly\b/.test(t) && !/evening/.test(t)) req.bias = 'morning';
    else if (/\b(in the |at |during )?evening\b|\bnight\b|\btonight\b/.test(t)) req.bias = 'evening';

    var mh = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
    var mm = t.match(/(\d+)\s*(?:minutes?|mins?|m)\b/);
    if (mh) req.hours = parseFloat(mh[1]); else if (mm) req.hours = parseFloat(mm[1]) / 60;

    Object.keys(SUBJECT_MAP).forEach(function (k) {
      var re = new RegExp('(?:^|[\\s|])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[\\s|])');
      if (re.test(t) && req.subjects.indexOf(SUBJECT_MAP[k]) === -1) req.subjects.push(SUBJECT_MAP[k]);
    });
    var fm = t.match(/(?:focus on|concentrate on|mainly|mostly|priority on)\s+([a-z ]+)/);
    if (fm) { Object.keys(SUBJECT_MAP).forEach(function (k) { if (!req.focus && fm[1].indexOf(k) !== -1) req.focus = SUBJECT_MAP[k]; }); }

    var w = t.match(/\bwake(?:\s*up)?(?:\s*at)?\s+(\d{1,2})/);
    if (w) req.wake = Math.max(4, Math.min(10, +w[1]));
    var s = t.match(/\bsleep(?:\s*at)?\s+(\d{1,2})/);
    if (s) { var n = +s[1]; if (n >= 7 && n <= 11) n += 12; else if (n >= 1 && n <= 6) n += 24; req.sleep = Math.min(23, n); }

    if (/no (prayer|prayers|namaz|salah)|without (prayer|prayers|namaz)/.test(t)) req.prayers = false;
    else if (/pray|prayers|namaz|salah|salat|fajr|dhuhr|asr|maghrib|isha/.test(t)) req.prayers = true;
    if (/no (gym|sports|exercise|workout)|without (gym|sports|exercise)/.test(t)) req.sports = false;
    else if (/gym|workout|exercis|\bsports?\b|\btraining\b|running|football practice|cricket practice/.test(t)) req.sports = true;
    return req;
  }

  /* ---------- LIFE LAYER — collision-free ---------- */
  function pickDays(req) {
    if (req.scope === 'weekend') return ['Sat','Sun'];
    if (req.scope === 'weekday') return ['Mon','Tue','Wed','Thu','Fri'];
    if (req.scope === 'today') return [['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]];
    if (req.scope === 'tomorrow') return [['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][(new Date().getDay()+1)%7]];
    if (req.scope === 'specific-day') return [req.specificDay];
    return ALL_DAYS.slice();
  }
  function put(life, day, hour, label) {
    var k = day + '_' + hour;
    if (!life[k]) life[k] = label;
  }
  function firstFree(life, day, start, end) {
    var s = Math.max(5, start), e = (end === undefined) ? 23 : Math.min(end, 23);
    for (var h = s; h <= e; h++) if (!life[day + '_' + h]) return h;
    return -1;
  }
  function buildLife(req, eff, days) {
    var life = {};
    var wake = req.wake || eff.wake;
    var sleepH = req.sleep || eff.sleep;
    var prayers = req.prayers !== null ? req.prayers : eff.prayers;
    var sports = req.sports !== null ? req.sports : eff.sports;
    days.forEach(function (day) {
      put(life, day, wake, life('wake', prayers ? 'Fajr' : ''));
      var sh = firstFree(life, day, wake + 1); if (sh > -1) put(life, day, sh, life('shower'));
      var br = firstFree(life, day, sh + 1, 11); if (br > -1) put(life, day, br, life('breakfast'));
      var lu = firstFree(life, day, 12); if (lu > -1) put(life, day, lu, prayers ? LIFE.lunch.i + ' Lunch · Dhuhr' : LIFE.lunch.i + ' Lunch');
      if (eff.rest) { var rs = firstFree(life, day, 13, 15); if (rs > -1) put(life, day, rs, life('rest')); }
      if (prayers) {
        var as = firstFree(life, day, 15, 17); if (as > -1) put(life, day, as, LIFE.prayer.i + ' Asr');
        var mg = firstFree(life, day, 18, 19); if (mg > -1) put(life, day, mg, LIFE.prayer.i + ' Maghrib');
      }
      if (sports) {
        var sp = firstFree(life, day, (req.bias === 'morning' ? wake + 3 : 16), 18);
        if (sp > -1) put(life, day, sp, life('sports'));
      }
      var dn = firstFree(life, day, 19, 21); if (dn > -1) put(life, day, dn, prayers ? LIFE.dinner.i + ' Dinner · Isha' : LIFE.dinner.i + ' Dinner');
      var wn = firstFree(life, day, sleepH - 1); if (wn > -1) put(life, day, wn, life('wind'));
      if (sleepH <= 23) put(life, day, sleepH, life('sleep'));
    });
    return life;
  }

  /* ---------- STUDY LAYER ---------- */
  function shuffle(a, seed) { var x = a.slice(), s = seed || 1;
    for (var i = x.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280;
      var j = Math.floor((s / 233280) * (i + 1)); var t = x[i]; x[i] = x[j]; x[j] = t; } return x; }
  function interleave(pool) {
    if (pool.length <= 1) return pool.slice();
    var byCat = {}; pool.forEach(function (s) { var c = (DIFFICULTY[s] || 2) >= 3 ? 'hard' : 'soft';
      (byCat[c] = byCat[c] || []).push(s); });
    var cats = Object.keys(byCat), out = [], guard = 0;
    while (out.length < pool.length && guard++ < 400) {
      var c = cats[Math.floor(Math.random() * cats.length)];
      if (byCat[c] && byCat[c].length) out.push(byCat[c].shift());
    }
    pool.forEach(function (s) { if (out.indexOf(s) === -1) out.push(s); });
    return out;
  }
  function energyOrder(pool, bias) {
    var s = pool.slice().sort(function (a, b) { return (DIFFICULTY[b] || 2) - (DIFFICULTY[a] || 2); });
    return bias === 'evening' ? s.reverse() : s;
  }

  function buildPlan(req, eff, variant) {
    variant = variant || { name: 'Balanced', intensity: 'balanced', seedMult: 1 };
    var days = pickDays(req);
    var life = buildLife(req, eff, days);
    var seed = variant.seedMult * 7919 + req.raw.length;

    var pool = req.subjects.slice();
    if (req.focus && pool.indexOf(req.focus) === -1) pool.unshift(req.focus);
    if (!pool.length) {
      if (req.mode === 'intense') pool = ['Math','Physics','Revision','Practice','Reading'];
      else if (req.mode === 'easy') pool = ['Reading','Revision','Note Review','Practice'];
      else pool = ['Math','Science','English','Reading','Revision','Practice'];
    }
    var ordered = interleave(energyOrder(shuffle(pool, seed + 13), req.bias));

    var target = req.hours > 0 ? Math.max(1, Math.round(req.hours))
      : req.mode === 'intense' ? 6 : req.mode === 'easy' ? 3 : 5;

    var plan = {}, dayOf = {}, perSubject = {};
    days.forEach(function (day, di) {
      var free = ALL_HOURS.filter(function (h) { return !life[day + '_' + h]; });
      /* slot preferences: "study in the morning" → prioritize morning free hours */
      var pref = null;
      if (/\bstudy\s+(?:in\s+the\s+)?morning\b/.test(' ' + req.raw.toLowerCase()) ) pref = 'morning';
      if (/\bstudy\s+(?:in\s+the\s+|at\s+)?(?:evening|night)\b/.test(' ' + req.raw.toLowerCase())) pref = req.bias === 'morning' ? 'morning' : 'evening';
      var ordered_ = free.slice().sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
      if (pref === 'morning') ordered_.sort(function (a, b) { return parseInt(a,10) - parseInt(b,10); });
      if (pref === 'evening') ordered_.sort(function (a, b) { return parseInt(b,10) - parseInt(a,10); });
      var dayHours = shuffle(ordered_, seed + di * 37).slice(0, target)
        .sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
      var si = 0; dayOf[day] = { hours: [], subjects: [] };
      ALL_HOURS.forEach(function (h) {
        var lk = day + '_' + h, v = null;
        if (life[lk]) v = life[lk];
        else if (dayHours.indexOf(h) !== -1) {
          /* daily rotation: every subject appears each day when pool is small */
          v = (pool.length <= target) ? ordered[(si + di) % ordered.length] : ordered[si % ordered.length];
          si++;
          perSubject[v] = (perSubject[v] || 0) + 1;
          dayOf[day].hours.push(h); dayOf[day].subjects.push(v);
        }
        if (v) plan[lk] = v;
      });
    });
    return { plan: plan, days: days, dayOf: dayOf, pool: ordered, perSubject: perSubject,
             variant: variant, sessionMin: req.sessionMin || 60 };
  }

  function analyze(result) {
    var studySessions = Object.keys(result.dayOf).reduce(function (a, d) { return a + result.dayOf[d].hours.length; }, 0);
    var lifeCount = Object.keys(result.plan).filter(function (k) { return isLife(result.plan[k]); }).length;
    var warnings = [];
    if (studySessions === 0) warnings.push('⚠️ No study hours fit — widen the window (earlier wake / later sleep).');
    if (studySessions > 0 && studySessions < 3) warnings.push('ℹ️ Light plan — good for recovery days.');
    if (lifeCount === 0) warnings.push('⚠️ No life blocks placed — check wake/sleep settings.');
    return { studySessions: studySessions, studyHours: (studySessions * result.sessionMin / 60).toFixed(1),
             lifeCount: lifeCount, perSubject: result.perSubject, warnings: warnings };
  }

  var SUBJ_COLORS = ['#5eead4','#7dd3fc','#c4b5fd','#f472b6','#fdba74','#6ee7b7','#f9a8d4','#a78bfa','#22d3ee','#fbbf24'];
  function colorFor(v, pool) {
    var idx = pool.indexOf(v);
    if (idx < 0) idx = v.charCodeAt(0) % SUBJ_COLORS.length;
    return SUBJ_COLORS[idx % SUBJ_COLORS.length];
  }

  /* ---------- RENDER ---------- */
  var lastResult = null, lastRequest = null, lastThree = [];

  function renderAnalytics(an) {
    var h = '<div class="planner-analytics">';
    h += '<div class="pa-stat"><span class="pa-label">Study</span><span class="pa-val">' + an.studySessions + '</span></div>';
    h += '<div class="pa-stat"><span class="pa-label">Hours</span><span class="pa-val">' + an.studyHours + 'h</span></div>';
    h += '<div class="pa-stat"><span class="pa-label">Subjects</span><span class="pa-val">' + Object.keys(an.perSubject).length + '</span></div>';
    h += '<div class="pa-stat"><span class="pa-label">Life blocks</span><span class="pa-val">' + an.lifeCount + '</span></div>';
    h += '</div>';
    if (an.warnings.length) {
      h += '<div class="planner-warnings">';
      an.warnings.forEach(function (w) { h += '<div class="pw-item">' + w + '</div>'; });
      h += '</div>';
    }
    return h;
  }
  function renderPreview(result) {
    var days = result.days, used = {};
    Object.keys(result.plan).forEach(function (k) { used[k.split('_')[1]] = true; });
    var showHours = ALL_HOURS.filter(function (h) { return used[h]; });
    if (!showHours.length) showHours = ALL_HOURS.slice();
    var from = ALL_HOURS.indexOf(showHours[0]), to = ALL_HOURS.indexOf(showHours[showHours.length - 1]);
    showHours = ALL_HOURS.slice(Math.max(0, from - 1), Math.min(ALL_HOURS.length, to + 2));

    var html = '<div class="planner-ai-preview" style="grid-template-columns:60px repeat(' + days.length + ', minmax(80px,1fr));">';
    html += '<div class="ai-label"></div>';
    days.forEach(function (d) { html += '<div class="ai-label">' + d + '</div>'; });
    showHours.forEach(function (h) {
      html += '<div class="ai-label">' + h + '</div>';
      days.forEach(function (d) {
        var v = result.plan[d + '_' + h] || '';
        var life = isLife(v);
        var style = '';
        if (v) {
          if (life) {
            var e = v.split(' ')[0], meta = null;
            Object.keys(LIFE).forEach(function (k) { if (LIFE[k].i === e && !meta) meta = LIFE[k]; });
            var c = meta ? meta.c : '#7fb3d9';
            style = 'background:' + c + '22;border-color:' + c + '66;color:' + c + ';';
          } else {
            var c2 = colorFor(v, result.pool);
            style = 'background:' + c2 + '20;border-color:' + c2 + '60;color:' + c2 + ';';
          }
        }
        html += '<div class="ai-cell' + (v ? '' : ' empty') + (life ? ' ai-life' : '') + '" style="' + style + '">' + escH(v) + '</div>';
      });
    });
    html += '</div>';
    return html;
  }
  function renderTimeline(result) {
    var h = '<div style="margin-top:.9rem;">';
    h += '<div style="font:700 10.5px var(--font,sans-serif);text-transform:uppercase;letter-spacing:.14em;color:var(--accent,#3fd2b0);margin-bottom:.5rem;">📋 Routine timeline (Monday-style, per selected day)</div>';
    result.days.slice(0, 7).forEach(function (day) {
      var rows = ALL_HOURS.filter(function (h2) { return result.plan[day + '_' + h2]; });
      if (!rows.length) return;
      h += '<div style="margin-bottom:.55rem;"><b style="font:700 12px var(--font,sans-serif);color:var(--ink,#edf2f7)">' + day + '</b>' +
           '<div style="font:500 12px/1.7 var(--font,sans-serif);color:var(--muted,#8d9aa9);margin-top:.15rem">' +
           rows.map(function (h2) { return '<span style="white-space:nowrap;display:inline-block;margin-right:.6rem"><b style="color:var(--ink-2,#cfd9e3)">' + h2 + '</b> ' + escH(result.plan[day + '_' + h2]) + '</span>'; }).join('') +
           '</div></div>';
    });
    h += '</div>';
    return h;
  }
  function renderLegend(result) {
    var h = '<div class="planner-legend">';
    Object.keys(result.perSubject).forEach(function (s) {
      var c = colorFor(s, result.pool);
      h += '<span class="legend-pill" style="background:' + c + '20;border-color:' + c + '60;color:' + c + '">' + escH(s) + ' × ' + result.perSubject[s] + '</span>';
    });
    h += '</div>';
    h += '<div class="planner-legend" style="margin-top:.4rem;">';
    h += '<span class="legend-pill" style="background:rgba(125,211,252,.12);border-color:rgba(125,211,252,.4);color:#7dd3fc">⏰ Life blocks auto-placed</span>';
    h += '</div>';
    return h;
  }
  function renderDescription(req, eff, result) {
    var modeLabel = { easy:'Easy / light', balanced:'Balanced', intense:'Intense' }[req.mode];
    var scopeLabel = { all:'Full week', weekend:'Weekend only', weekday:'Weekdays only', today:'Today only', tomorrow:'Tomorrow only', 'specific-day':(req.specificDay || 'One day') }[req.scope];
    var h = '<div class="planner-ai-summary"><strong>🧠 Here\'s your routine:</strong> ';
    h += '<span class="tag">' + modeLabel + '</span> · <span class="tag">' + scopeLabel + '</span>';
    h += ' · <span class="tag">Wake ' + (req.wake || eff.wake) + ':00</span> · <span class="tag">Sleep ' + (req.sleep || eff.sleep) + ':00</span>';
    h += (req.prayers !== false && eff.prayers) ? ' · <span class="tag">🕌 Prayers ×5</span>' : '';
    h += (req.sports !== false && eff.sports) ? ' · <span class="tag">🏃 Sports</span>' : '';
    h += ' · <span class="tag">😌 Rest</span>';
    h += '<br><strong>📚 Subjects:</strong> ' + (result.pool.slice(0, 8).join(', ') || '—') + '.';
    if (req.focus) h += ' <em>Focus on ' + escH(req.focus) + '.</em>';
    h += '</div>';
    return h;
  }
  function renderOutput(req, eff, result, an) {
    var output = document.getElementById('plannerAiOutput');
    var html = '<div style="border:1px solid rgba(240,180,106,.35);background:rgba(240,180,106,.07);color:var(--warn,#f0b46a);border-radius:10px;padding:.6rem .9rem;margin-bottom:.8rem;font:600 12.5px var(--font,sans-serif);">🧪 TEST PREVIEW — nothing applied yet. Review the routine, then <b>Apply to Planner</b> (merge) or <b>Replace Planner</b> (wipe &amp; apply).</div>';
    html += renderDescription(req, eff, result) + renderAnalytics(an) + renderPreview(result) + renderLegend(result) + renderTimeline(result);
    html += '<div class="planner-variants"><div class="pv-label">Try another style:</div>' +
      '<button class="pv-btn" data-variant="balanced">⚖️ Balanced</button>' +
      '<button class="pv-btn" data-variant="intense">🔥 Intense</button>' +
      '<button class="pv-btn" data-variant="relaxed">🌿 Relaxed</button></div>';
    html += '<div class="planner-ai-actions">' +
      '<button id="aiApplyBtn" class="btn-primary">✅ Apply to Planner</button>' +
      '<button id="aiReplaceBtn" class="btn-primary" style="background:rgba(252,165,165,.15);color:#fca5a5;border-color:rgba(252,165,165,.3);">🔁 Replace Planner</button>' +
      '<button id="aiUndoBtn" class="btn-danger"' + (lastThree.length > 1 ? '' : ' disabled style="opacity:.4;cursor:not-allowed;"') + '>↩ Undo</button></div>';
    output.innerHTML = html;
    document.getElementById('aiApplyBtn').addEventListener('click', function () { applyPlan(false); });
    document.getElementById('aiReplaceBtn').addEventListener('click', function () { applyPlan(true); });
    var undo = document.getElementById('aiUndoBtn');
    if (undo && lastThree.length > 1) undo.addEventListener('click', undoLast);
    output.querySelectorAll('.pv-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var freshReq = parseRequest(lastRequest);
        var eff = readEff();
        var nr = buildPlan(freshReq, eff, variantPreset(this.dataset.variant));
        lastResult = nr; lastThree.push(nr); if (lastThree.length > 3) lastThree.shift();
        renderOutput(freshReq, eff, nr, analyze(nr));
      });
    });
  }
  function variantPreset(name) {
    if (name === 'intense') return { name:'Intense', intensity:'intense', seedMult:3 };
    if (name === 'relaxed') return { name:'Relaxed', intensity:'relaxed', seedMult:5 };
    return { name:'Balanced', intensity:'balanced', seedMult:1 };
  }
  function undoLast() {
    if (lastThree.length <= 1) return;
    lastThree.pop();
    var prev = lastThree[lastThree.length - 1]; if (!prev) return;
    var req = parseRequest(lastRequest);
    var eff = readEff();
    lastResult = prev; renderOutput(req, eff, prev, analyze(prev));
  }

  /* ---------- provider AI path ---------- */
  function sanitizeAiPlan(raw) {
    try {
      var src = raw && raw.plan ? raw.plan : null;
      if (!src || typeof src !== 'object') return null;
      var plan = {}, used = {}, cells = 0, hourSet = {};
      ALL_HOURS.forEach(function (h) { hourSet[h] = 1; });
      Object.keys(src).forEach(function (k) {
        var m = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)_(\d{1,2}:00)$/.exec(String(k));
        if (!m || !hourSet[m[2]]) return;
        var v = String(src[k] || '').trim().slice(0, 40);
        if (!v) return;
        plan[m[1] + '_' + m[2]] = v; cells++;
        if (!isLife(v)) used[v] = 1;
      });
      if (cells < 3) return null;
      var dayOf = {}, days = [];
      ALL_DAYS.forEach(function (day) {
        var hours = [];
        ALL_HOURS.forEach(function (h) { if (plan[day + '_' + h]) hours.push(h); });
        if (hours.length) { days.push(day); dayOf[day] = { hours: hours, subjects: hours.map(function (h) { return plan[day + '_' + h]; }).filter(function (v) { return !isLife(v); }) }; }
      });
      if (!days.length) return null;
      var pool = Object.keys(used);
      return { plan: plan, days: days, dayOf: dayOf, pool: pool.length ? pool : ['Study'],
               perSubject: (function(){ var p={}; Object.keys(plan).forEach(function(k){ var v=plan[k]; if(!isLife(v)) p[v]=(p[v]||0)+1; }); return p; })(),
               variant: { name:'AI', intensity:'balanced', seedMult:1 }, sessionMin: 50 };
    } catch (e) { return null; }
  }

  /* ---------- SETTINGS + GENERATE ---------- */
  function readEff() {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    var c = function (id) { var e = document.getElementById(id); return e ? e.checked : true; };
    return {
      wake: Math.max(4, Math.min(10, parseInt(g('plnWake'), 10) || 6)),
      sleep: Math.max(20, Math.min(23, parseInt(g('plnSleep'), 10) || 23)),
      prayers: c('plnPrayers'),
      sports: c('plnSports'),
      rest: c('plnRest')
    };
  }
  function generate() {
    var inputEl = document.getElementById('plannerAiInput');
    var btn = document.getElementById('plannerAiBtn');
    var output = document.getElementById('plannerAiOutput');
    var text = inputEl.value.trim();
    var eff = readEff();
    if (!text) {
      output.innerHTML = '<div class="planner-ai-summary"><i class="ph ph-note-pencil"></i> Type what you want to plan — or click a chip above. Tip: try "make a full daily routine with prayers and gym, sleep at 11".</div>';
      return;
    }
    lastRequest = text;
    function local() {
      var req = parseRequest(text);
      var result = buildPlan(req, eff, variantPreset('balanced'));
      lastResult = result; lastThree = [result];
      renderOutput(req, eff, result, analyze(result));
    }
    if (typeof StudyHubAI === 'undefined') { local(); return; }
    StudyHubAI.status().then(function (st) {
      if (!st.configured) { local(); return undefined; }
      btn.disabled = true;
      return StudyHubAI.chat([
        { role: 'system', content: 'You build full-day student ROUTINES that mix study with daily life, placed logically and chronologically. Reply with ONLY a JSON object {"plan": {"Mon_6:00": "⏰ Wake up · Fajr", ...}}. ' +
          'Rules: day keys Mon Tue Wed Thu Fri Sat Sun; hour keys whole hours "5:00" to "23:00"; one activity per slot; never overlap. ' +
          'INCLUDE life blocks with these emoji labels: ⏰ wake, 🚿 shower, 🍳 breakfast, 🍽️ lunch, 😌 rest/nap, 🕌 prayers (Fajr with wake, Dhuhr with lunch, Asr 15-17, Maghrib 18-19, Isha with dinner), 🏃 sports, 🛏️ wind-down, 😴 sleep — ' +
          'but include prayers ONLY if the user mentions praying, and sports ONLY if mentioned or requested. ' +
          'Chronology: wake → shower → breakfast → study → lunch → study/rest → Asr → study → sports → Maghrib → dinner+Isha → study → wind-down → sleep. ' +
          'Place the hardest subjects in morning slots. Study blocks use short subject names (1-3 words). No markdown, no prose.' },
        { role: 'user', content: text.slice(0, 600) }
      ], { jsonMode: true, maxTokens: 1600, temperature: 0.4, timeoutMs: 30000
      }).then(function (res) {
        btn.disabled = false;
        var result = sanitizeAiPlan(StudyHubAI.parseJsonReply(res.text));
        if (!result) { local(); return undefined; }
        var req = parseRequest(text);
        lastResult = result; lastThree = [result];
        renderOutput(req, eff, result, analyze(result));
      }).catch(function () { btn.disabled = false; local(); });
    }).catch(function () { local(); });
  }
  function applyPlan(replace) {
    if (!lastResult) return;
    var data = loadData();
    if (!data.planner) data.planner = {};
    if (!data.plannerUndoStack) data.plannerUndoStack = [];
    data.plannerUndoStack.push(JSON.parse(JSON.stringify(data.planner)));
    if (data.plannerUndoStack.length > 5) data.plannerUndoStack.shift();
    if (replace) data.planner = {};
    Object.keys(lastResult.plan).forEach(function (k) { data.planner[k] = lastResult.plan[k]; });
    saveData(data);
    if (typeof addActivity === 'function') {
      addActivity(data, 'planner_ai', replace ? 'Replaced planner with AI routine' : 'Merged AI routine into planner');
      saveData(data);
    }
    if (typeof setupPlanner === 'function') setupPlanner();
    var toast = document.createElement('div');
    toast.className = 'fbt-toast show';
    toast.innerHTML = replace ? 'Planner replaced' : 'Routine merged into planner';
    toast.style.borderColor = '#6ee7b7';
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.remove('show'); setTimeout(function () { toast.remove(); }, 400); }, 2200);
  }

  /* ---------- ENHANCED GRID ---------- */
  setupPlanner = function () {
    var grid = document.getElementById('plannerGrid');
    if (!grid) return;
    var days = ALL_DAYS;
    function renderPlanner() {
      var data = loadData();
      grid.innerHTML = '';
      grid.innerHTML += '<div class="time-label"></div>';
      days.forEach(function (d) { grid.innerHTML += '<div class="time-label" style="font-weight:700;">' + d + '</div>'; });
      ALL_HOURS.forEach(function (h) {
        grid.innerHTML += '<div class="time-label">' + h + '</div>';
        days.forEach(function (d) {
          var key = d + '_' + h;
          var val = data.planner[key] || '';
          var cell = document.createElement('div');
          cell.className = 'planner-cell' + (val ? ' filled' : '') + (val && isLife(val) ? ' life' : '');
          cell.textContent = val;
          cell.title = val ? 'Click to edit' : 'Click to plan ' + d + ' ' + h;
          cell.addEventListener('click', function () {
            var newVal = prompt('Plan for ' + d + ' ' + h + ':', val || '');
            if (newVal === null) return;
            var dd = loadData();
            if (newVal.trim() === '') delete dd.planner[key];
            else dd.planner[key] = newVal.trim();
            saveData(dd);
            renderPlanner();
          });
          grid.appendChild(cell);
        });
      });
    }
    renderPlanner();
  };

  /* ---------- CSS + SETTINGS ---------- */
  var CSS =
    '.pln-settings{display:flex;gap:.9rem;flex-wrap:wrap;align-items:center;background:var(--surface-2,rgba(148,163,184,.05));border:1px solid var(--line,rgba(148,163,184,.14));border-radius:12px;padding:.65rem .9rem;margin-bottom:.8rem;font-size:.8rem;color:var(--muted,#8d9aa9)}' +
    '.pln-settings b{font:700 .68rem var(--font,sans-serif);text-transform:uppercase;letter-spacing:.1em;color:var(--faint,#7a8a9e);margin-right:.1rem}' +
    '.pln-settings select{background:var(--panel-2,#0B0F1A);border:1px solid var(--line,#2a3648);color:var(--ink,#edf2f7);border-radius:8px;padding:.3rem .5rem;font:500 12.5px var(--font,inherit);cursor:pointer}' +
    '.pln-settings label{display:inline-flex;align-items:center;gap:.35rem;cursor:pointer;user-select:none}' +
    '.pln-settings input[type=checkbox]{accent-color:var(--accent,#3fd2b0);width:14px;height:14px;cursor:pointer}' +
    '.planner-cell.life{background:color-mix(in srgb, #7fb3d9 12%, transparent) !important;border-color:rgba(127,179,217,.4) !important;color:var(--ink-2,#cfd9e3) !important;font-size:.72rem !important;font-weight:600}' +
    '.ai-cell.ai-life{font-size:.72rem !important;font-weight:600}' +
    '.fbt-toast{position:fixed;bottom:24px;left:50%;transform:translate(-50%,12px);background:var(--surface-raised,#101623);border:1px solid var(--line,#2a3648);color:var(--ink,#edf2f7);padding:.7rem 1.2rem;border-radius:10px;font:600 13px var(--font,sans-serif);opacity:0;transition:all .25s;z-index:10050;pointer-events:none}' +
    '.fbt-toast.show{opacity:1;transform:translate(-50%,0)}';
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  ready(function () {
    var inputEl = document.getElementById('plannerAiInput');
    var btn = document.getElementById('plannerAiBtn');
    var inputRow = inputEl ? inputEl.parentNode : null;
    if (inputRow && !document.getElementById('plnWake')) {
      var set = document.createElement('div');
      set.className = 'pln-settings';
      set.innerHTML = '<b>Daily life</b>' +
        '<span>Wake <select id="plnWake">' + [5,6,7,8,9,10].map(function(h){return '<option value="'+h+'"'+(h===6?' selected':'')+'>'+h+':00</option>';}).join('') + '</select></span>' +
        '<span>Sleep <select id="plnSleep">' + [20,21,22,23].map(function(h){return '<option value="'+h+'"'+(h===23?' selected':'')+'>'+(h===23?'23:00':h+':00')+'</option>';}).join('') + '</select></span>' +
        '<label><input type="checkbox" id="plnPrayers" checked> 🕌 Prayers ×5</label>' +
        '<label><input type="checkbox" id="plnSports" checked> 🏃 Sports</label>' +
        '<label><input type="checkbox" id="plnRest" checked> 😌 Rest</label>';
      inputRow.parentNode.insertBefore(set, inputRow);
    }
    var chips = document.querySelector('.planner-ai-chips');
    if (chips && !document.getElementById('chipRoutine')) {
      var c = document.createElement('button');
      c.className = 'planner-chip'; c.id = 'chipRoutine'; c.type = 'button';
      c.setAttribute('data-prompt', 'make a full daily routine for me with prayers, sports and sleep at 11');
      c.innerHTML = '<i class="ph ph-moon-stars" aria-hidden="true"></i> Daily routine';
      chips.appendChild(c);
    }
    if (btn) btn.addEventListener('click', generate);
    document.querySelectorAll('.planner-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        inputEl.value = this.dataset.prompt;
        generate();
      });
    });
    inputEl.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generate(); }
    });
  });
})();
// ================================================================
// RESET PLANNER
// ================================================================
(function () {
    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    ready(function () {
        var btn = document.getElementById('resetPlannerBtn');
        if (!btn) return;

        btn.addEventListener('click', function () {
            if (!confirm(getTranslation('reset_confirm'))) return;
            var data = loadData();
            data.planner = {};
            if (typeof addActivity === 'function') {
                addActivity(data, 'planner_reset', 'Reset the planner');
            }
            saveData(data);

            // Re-render grid without reloading the page
            if (typeof setupPlanner === 'function') {
                setupPlanner();
            } else {
                location.reload();
            }
        });
    });
})();

// ================================================================
// APPLY TRANSLATIONS TO NEW UI ELEMENTS
// ================================================================
(function () {
    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    function getNewTranslation(key) {
        try { return getTranslation(key); } catch (e) { return key; }
    }

    function refreshNewElements() {
        // Blocker button
        var blocker = document.getElementById('blockerToggle');
        if (blocker) {
            var on = blocker.classList.contains('active');
            blocker.innerHTML = '<i class="ph ph-shield-check" aria-hidden="true"></i> ' + getNewTranslation(on ? 'blocker_on' : 'blocker_off');
        }
        // Trash button
        var trash = document.getElementById('trashBtn');
        if (trash) {
            var m = trash.textContent.match(/\((\d+)\)/);
            var n = m ? m[1] : '0';
            trash.innerHTML = '<i class="ph ph-trash" aria-hidden="true"></i> ' + getNewTranslation('trash_label') + ' (' + n + ')';
        }
        // Clock toggle
        var clockBtn = document.getElementById('clockToggleBtn');
        if (clockBtn) {
            var isAnalog = document.getElementById('analogClock') && document.getElementById('analogClock').classList.contains('active');
            var label = isAnalog ? getNewTranslation('switch_digital') : getNewTranslation('switch_analog');
            clockBtn.innerHTML = '<i class="ph ' + (isAnalog ? 'ph-clock' : 'ph-alarm') + '" aria-hidden="true"></i> ' + label;
        }
        // AI planner title + description + placeholder
        var aiTitle = document.querySelector('.planner-ai-section h2 span[data-i18n]');
        if (!aiTitle) {
            var h2s = document.querySelectorAll('.planner-ai-section h2');
            if (h2s.length) {
                h2s[0].innerHTML = '<span class="hl-purple"><i class="ph ph-brain" aria-hidden="true"></i></span> <span class="neon-text">' + getNewTranslation('ai_planner_title') + '</span>';
            }
        }
        var aiDesc = document.querySelector('.planner-ai-section p');
        if (aiDesc) aiDesc.textContent = getNewTranslation('ai_planner_desc');
        var aiInput = document.getElementById('plannerAiInput');
        if (aiInput) aiInput.placeholder = getNewTranslation('ai_planner_placeholder');
        var aiBtn = document.getElementById('plannerAiBtn');
        if (aiBtn) aiBtn.innerHTML = '<i class="ph ph-sparkle" aria-hidden="true"></i>' + getNewTranslation('generate_plan_btn');
        // Chips
        var chipKeys = ['chip_auto','chip_easy','chip_exam','chip_weekend','chip_math_physics','chip_surprise','chip_3h'];
        var chipEmojis = ['🎲','☕','🔥','🏖️','📚','🎁','⏱'];
        var chips = document.querySelectorAll('.planner-chip');
        chips.forEach(function (c, i) {
            if (i < chipKeys.length) {
                c.textContent = chipEmojis[i] + ' ' + getNewTranslation(chipKeys[i]);
            }
        });
        // Reset planner button
        var resetBtn = document.getElementById('resetPlannerBtn');
        if (resetBtn) resetBtn.innerHTML = '<i class="ph ph-arrow-clockwise" aria-hidden="true"></i>' + getNewTranslation('reset_planner_btn');
        // Quiz button texts (notes page)
        var genQuiz = document.getElementById('generateQuizBtn');
        if (genQuiz) genQuiz.innerHTML = '<i class="ph ph-lightning" aria-hidden="true"></i>' + getNewTranslation('generate_quiz_btn');
        var clearQuiz = document.getElementById('clearQuizBtn');
        if (clearQuiz) clearQuiz.textContent = getNewTranslation('clear_quiz_btn');
        // Flashcards auto-gen
        var autoFc = document.getElementById('autoGenFlashcardsBtn');
        if (autoFc) autoFc.innerHTML = '<i class="ph ph-lightning" aria-hidden="true"></i>' + getNewTranslation('auto_flashcards_btn');
    }

    ready(function () {
        refreshNewElements();
        // Re-apply translations whenever the language selector changes
        var sel = document.getElementById('langSelector');
        if (sel) {
            sel.addEventListener('change', function () {
                // small delay so applyTranslations() runs first
                setTimeout(refreshNewElements, 30);
            });
        }
    });

    // Expose for other scripts
    window.refreshNewElements = refreshNewElements;
})();




// ================================================================
// THEME & WALLPAPER PICKER  (v2 — richer themes + 20 photos)
//  • Button + modal only on index.html (dashboard)
//  • Color theme tints the default body glow + accent colors
//  • 30 backgrounds: 10 gradients + 20 photos
//  • Choice persists in localStorage
// ================================================================
(function () {
    'use strict';

    const COLOR_KEY = 'studyHubColorTheme';
    const BG_KEY    = 'studyHubBackground';

    // ---------- 10 COLOR THEMES (each also has a body-glow tint) ----------
    const COLOR_THEMES = {
        aurora:   { name: 'Aurora',   accent: '#5eead4', accent2: '#7dd3fc', brand: '#c4b5fd', brandHot: '#c084fc' },
        sunset:   { name: 'Sunset',   accent: '#fdba74', accent2: '#fb923c', brand: '#f472b6', brandHot: '#e11d48' },
        ocean:    { name: 'Ocean',    accent: '#38bdf8', accent2: '#22d3ee', brand: '#818cf8', brandHot: '#6366f1' },
        forest:   { name: 'Forest',   accent: '#6ee7b7', accent2: '#34d399', brand: '#10b981', brandHot: '#059669' },
        rose:     { name: 'Rose',     accent: '#f9a8d4', accent2: '#fda4af', brand: '#fb7185', brandHot: '#e11d48' },
        mono:     { name: 'Mono',     accent: '#cbd5e1', accent2: '#94a3b8', brand: '#e2e8f0', brandHot: '#f1f5f9' },
        midnight: { name: 'Midnight', accent: '#a78bfa', accent2: '#8b5cf6', brand: '#c4b5fd', brandHot: '#7c3aed' },
        cyber:    { name: 'Cyber',    accent: '#22d3ee', accent2: '#f472b6', brand: '#f0abfc', brandHot: '#e879f9' },
        amber:    { name: 'Amber',    accent: '#fbbf24', accent2: '#f59e0b', brand: '#fb923c', brandHot: '#ea580c' },
        lavender: { name: 'Lavender', accent: '#c4b5fd', accent2: '#ddd6fe', brand: '#a78bfa', brandHot: '#8b5cf6' }
    };

   const BACKGROUNDS = [
    // --- Default ---
    { id: 'bg-default',  name: 'Default',     type: 'default',  css: '' },

    // --- 10 GRADIENTS (darkened so UI stays readable) ---
    { id: 'bg-deepsea',  name: 'Deep Sea',    type: 'gradient', css: 'linear-gradient(135deg, #041418 0%, #0f766e 50%, #041418 100%)' },
    { id: 'bg-twilight', name: 'Twilight',    type: 'gradient', css: 'linear-gradient(135deg, #0f0a1e 0%, #4c1d95 50%, #0f0a1e 100%)' },
    { id: 'bg-ember',    name: 'Ember',       type: 'gradient', css: 'linear-gradient(135deg, #1a0707 0%, #b91c1c 50%, #1a0707 100%)' },
    { id: 'bg-forest-g', name: 'Forest',      type: 'gradient', css: 'linear-gradient(135deg, #051410 0%, #065f46 50%, #051410 100%)' },
    { id: 'bg-sunset-g', name: 'Sunset',      type: 'gradient', css: 'linear-gradient(135deg, #1a0a1a 0%, #9a3412 50%, #1a0a1a 100%)' },
    { id: 'bg-cyber-g',  name: 'Cyber',       type: 'gradient', css: 'linear-gradient(135deg, #0a0014 0%, #7c3aed 40%, #06b6d4 100%)' },
    { id: 'bg-arctic',   name: 'Arctic',      type: 'gradient', css: 'linear-gradient(135deg, #071825 0%, #0284c7 50%, #071825 100%)' },
    { id: 'bg-gold',     name: 'Orange',      type: 'gradient', css: 'linear-gradient(135deg, #1a1000 0%, #b45309 50%, #1a1000 100%)' },
    { id: 'bg-plum',     name: 'Plum',        type: 'gradient', css: 'linear-gradient(135deg, #130513 0%, #86198f 50%, #130513 100%)' },
    { id: 'bg-crimson',  name: 'Crimson',     type: 'gradient', css: 'linear-gradient(135deg, #1a0510 0%, #831843 50%, #1a0510 100%)' },

    // ============================================================
    // NATURAL PHOTOS — mountains, water, forests, sky, deserts
    // All Unsplash CDN — free, stable, high quality
    // ============================================================

    // ---------- MOUNTAINS ----------
    { id: 'bg-mountain-lake', name: 'Mountain Lake',    type: 'photo', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-snow-peaks',    name: 'Snow Peaks',       type: 'photo', url: 'https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-alpine-meadow', name: 'Alpine Meadow',    type: 'photo', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-blue-mountains',name: 'Blue Mountains',   type: 'photo', url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-lake-louise',   name: 'Lake Louise',      type: 'photo', url: 'https://images.unsplash.com/photo-1503614472-8c93d56e92ce?w=1920&q=80&auto=format&fit=crop' },

    // ---------- WATER / OCEAN ----------
    { id: 'bg-ocean-waves',   name: 'Ocean Waves',      type: 'photo', url: 'https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-tropical',      name: 'Tropical Island',  type: 'photo', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-waterfall',     name: 'Waterfall',        type: 'photo', url: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-maldives',      name: 'Turquoise Water',  type: 'photo', url: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-misty-lake',    name: 'Misty Lake',       type: 'photo', url: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1920&q=80&auto=format&fit=crop' },

    // ---------- FORESTS ----------
    { id: 'bg-forest-path',   name: 'Forest Path',      type: 'photo', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-autumn-forest', name: 'Autumn Forest',    type: 'photo', url: 'https://images.unsplash.com/photo-1476820865390-c52aeebb9891?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-mist-forest',   name: 'Misty Forest',     type: 'photo', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-pine-forest',   name: 'Pine Forest',      type: 'photo', url: 'https://images.unsplash.com/photo-1511497584788-876760111969?w=1920&q=80&auto=format&fit=crop' },

    // ---------- SKY / NIGHT ----------
    { id: 'bg-milky-way',     name: 'Milky Way',        type: 'photo', url: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-northern',      name: 'Northern Lights',  type: 'photo', url: 'https://images.unsplash.com/photo-1483347756197-71ef80e95f73?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-starry-night',  name: 'Starry Night',     type: 'photo', url: 'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-sunset-sky',    name: 'Sunset Sky',       type: 'photo', url: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-pink-clouds',   name: 'Pink Clouds',      type: 'photo', url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-golden-hour',   name: 'Golden Hour',      type: 'photo', url: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1920&q=80&auto=format&fit=crop' },

    // ---------- DESERTS & CANYONS ----------
    { id: 'bg-desert-dunes',  name: 'Desert Dunes',     type: 'photo', url: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-red-canyon',    name: 'Red Canyon',       type: 'photo', url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1920&q=80&auto=format&fit=crop' },

    // ---------- COUNTRYSIDE / FIELDS ----------
    { id: 'bg-lavender',      name: 'Lavender Fields',  type: 'photo', url: 'https://images.unsplash.com/photo-1499002238440-d264edd596ec?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-green-hills',   name: 'Green Hills',      type: 'photo', url: 'https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-meadow-field',  name: 'Meadow Field',     type: 'photo', url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1920&q=80&auto=format&fit=crop' },

    // ---------- UNIQUE / ATMOSPHERIC ----------
    { id: 'bg-aurora',        name: 'Aurora Ice',       type: 'photo', url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-iceland',       name: 'Iceland Canyon',   type: 'photo', url: 'https://images.unsplash.com/photo-1504893524553-b855bce32c67?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-yosemite',      name: 'Yosemite Valley',  type: 'photo', url: 'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-fjord',         name: 'Norwegian Fjord',  type: 'photo', url: 'https://images.unsplash.com/photo-1601439678777-b2b3c56fa627?w=1920&q=80&auto=format&fit=crop' },

    // ---------- NEW BATCH — 10 more curated naturals ----------
    { id: 'bg-cherry',        name: 'Cherry Blossom',   type: 'photo', url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-firefly',       name: 'Firefly Forest',   type: 'photo', url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-snow-forest',   name: 'Snowy Forest',     type: 'photo', url: 'https://images.unsplash.com/photo-1483664852095-d6cc6870702d?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-coastal-cliffs',name: 'Coastal Cliffs',   type: 'photo', url: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-waterfall-glen',name: 'Waterfall Glen',   type: 'photo', url: 'https://images.unsplash.com/photo-1467890947394-8171244e5410?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-canyon-river',  name: 'Canyon River',     type: 'photo', url: 'https://images.unsplash.com/photo-1439853949127-fa647821eba0?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-red-sunset',    name: 'Red Sunset',       type: 'photo', url: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-thunderstorm',  name: 'Thunderstorm',     type: 'photo', url: 'https://images.unsplash.com/photo-1429552077091-836152271555?w=1920&q=80&auto=format&fit=crop' },
    { id: 'bg-rainbow-hills', name: 'Rainbow Hills',    type: 'photo', url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&q=80&auto=format&fit=crop' },

];
    // ---------- Storage helpers ----------
    function getColor() { try { return localStorage.getItem(COLOR_KEY) || 'aurora'; } catch (e) { return 'aurora'; } }
    function getBg()    { try { return localStorage.getItem(BG_KEY) || 'bg-default'; } catch (e) { return 'bg-default'; } }
    function setColor(id) { try { localStorage.setItem(COLOR_KEY, id); } catch (e) {} }
    function setBg(id)    { try { localStorage.setItem(BG_KEY, id); } catch (e) {} }

    // Hex → rgba
    function hexToRgba(hex, a) {
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
        var r = parseInt(hex.substr(0, 2), 16);
        var g = parseInt(hex.substr(2, 2), 16);
        var b = parseInt(hex.substr(4, 2), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    // Build the "Default" body background so it uses the current color theme's glow
    function buildThemedBody(t) {
        return [
            'radial-gradient(1200px 600px at 8% -10%, ' + hexToRgba(t.accent, 0.16) + ', transparent 50%)',
            'radial-gradient(900px 500px at 100% 0%, ' + hexToRgba(t.brand, 0.18) + ', transparent 48%)',
            'linear-gradient(180deg, #07131d 0%, #050a14 55%, #071018 100%)'
        ].join(', ');
    }

    // Build a photo body background (with dark overlay + theme tint)
    function buildPhotoBody(url, t) {
        return [
            'linear-gradient(' + hexToRgba(t.accent, 0.06) + ', ' + hexToRgba(t.brand, 0.10) + ')',
            'linear-gradient(rgba(3,10,20,0.72), rgba(3,10,20,0.85))',
            'url("' + url + '") center/cover no-repeat fixed'
        ].join(', ');
    }

    // ---------- Apply color theme (every page) ----------
    function applyColorTheme(id) {
        const t = COLOR_THEMES[id] || COLOR_THEMES.aurora;
        document.body.style.setProperty('--accent', t.accent);
        document.body.style.setProperty('--accent-2', t.accent2);
        document.body.style.setProperty('--brand', t.brand);
        document.body.style.setProperty('--brand-hot', t.brandHot);
        document.body.dataset.colorTheme = id;
    }

    // ---------- Apply background (every page) ----------
    function applyBackground(id) {
        const bg  = BACKGROUNDS.find(function (b) { return b.id === id; }) || BACKGROUNDS[0];
        const t   = COLOR_THEMES[getColor()] || COLOR_THEMES.aurora;

        if (bg.type === 'default') {
            // Use the color theme's glow — this is the "theme applies to the web" part
            document.body.style.background = buildThemedBody(t);
        } else if (bg.type === 'gradient') {
            document.body.style.background = bg.css;
        } else if (bg.type === 'photo') {
            document.body.style.background = buildPhotoBody(bg.url, t);
        }
    }

    // ---------- Boot: apply saved theme on EVERY page ----------
    function boot() {
        applyColorTheme(getColor());
        applyBackground(getBg());
    }

    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot);

    // ---------- Only build the picker UI on index.html ----------
    function isDashboard() {
        var p = window.location.pathname.split('/').pop() || 'index.html';
        return p === 'index.html' || p === '' || p === '/' || /index\.html?$/i.test(p);
    }
    if (!isDashboard()) return;

    // Build FAB
    var fab = document.createElement('button');
    fab.className = 'theme-picker-fab';
    fab.type = 'button';
    fab.title = 'Customize theme & background';
    fab.innerHTML = '<i class="ph ph-palette" aria-hidden="true"></i>';
    document.body.appendChild(fab);

    // Build overlay + panel
    var overlay = document.createElement('div');
    overlay.className = 'theme-picker-overlay';
    overlay.innerHTML = `
        <div class="theme-picker-panel" role="dialog" aria-label="Theme and background picker">
            <div class="theme-picker-header">
                <h2><i class="ph ph-palette" aria-hidden="true"></i> Customize</h2>
                <button class="theme-picker-close" type="button" aria-label="Close">✕</button>
            </div>
            <div class="theme-picker-tabs">
                <button class="theme-picker-tab active" data-tab="colors" type="button"><i class="ph ph-palette" aria-hidden="true"></i> Color Theme</button>
                <button class="theme-picker-tab" data-tab="backgrounds" type="button"><i class="ph ph-image" aria-hidden="true"></i> Background</button>
            </div>
            <div class="theme-picker-body">
                <div class="theme-picker-section active" data-section="colors">
                    <h3>Choose a color theme</h3>
                    <div class="theme-swatch-grid" id="themeSwatchGrid"></div>
                </div>
                <div class="theme-picker-section" data-section="backgrounds">
                    <h3>Gradients</h3>
                    <div class="theme-bg-grid" id="themeBgGradients"></div>
                    <h3 style="margin-top:1.2rem;">Photos</h3>
                    <div class="theme-bg-grid" id="themeBgPhotos"></div>
                </div>
            </div>
            <div class="theme-picker-actions">
                <button class="reset-btn" type="button" id="themePickerReset">↺ Reset to default</button>
                <button type="button" id="themePickerDone">✓ Done</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Color swatches
    var swatchGrid = overlay.querySelector('#themeSwatchGrid');
    Object.keys(COLOR_THEMES).forEach(function (key) {
        var t = COLOR_THEMES[key];
        var s = document.createElement('button');
        s.type = 'button';
        s.className = 'theme-swatch';
        s.dataset.theme = key;
        s.innerHTML =
            '<span class="swatch-check">✓</span>' +
            '<div class="swatch-dots">' +
                '<span class="swatch-dot" style="background:' + t.accent + '"></span>' +
                '<span class="swatch-dot" style="background:' + t.brand + '"></span>' +
                '<span class="swatch-dot" style="background:' + t.accent2 + '"></span>' +
            '</div>' +
            '<div class="swatch-name">' + t.name + '</div>';
        s.addEventListener('click', function () {
            setColor(key);
            applyColorTheme(key);
            // Re-apply the background so the themed glow updates instantly
            applyBackground(getBg());
            refreshSwatches();
        });
        swatchGrid.appendChild(s);
    });

    // Background thumbnails
    var bgGradientsEl = overlay.querySelector('#themeBgGradients');
    var bgPhotosEl    = overlay.querySelector('#themeBgPhotos');

    BACKGROUNDS.forEach(function (bg) {
        if (bg.type === 'default') return; // skip default from thumbnails, reset button handles it

        var thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = 'theme-bg-thumb';
        thumb.dataset.bg = bg.id;

        if (bg.type === 'gradient') {
            thumb.style.background = bg.css;
        } else if (bg.type === 'photo') {
            thumb.style.background = 'url("' + bg.url + '") center/cover no-repeat';
        }

        thumb.innerHTML =
            '<span class="bg-check">✓</span>' +
            '<span class="bg-label">' + bg.name + '</span>';

        thumb.addEventListener('click', function () {
            setBg(bg.id);
            applyBackground(bg.id);
            refreshBgThumbs();
        });

        if (bg.type === 'photo') bgPhotosEl.appendChild(thumb);
        else bgGradientsEl.appendChild(thumb);
    });

    function refreshSwatches() {
        var current = getColor();
        swatchGrid.querySelectorAll('.theme-swatch').forEach(function (s) {
            s.classList.toggle('active', s.dataset.theme === current);
        });
    }
    function refreshBgThumbs() {
        var current = getBg();
        overlay.querySelectorAll('.theme-bg-thumb').forEach(function (t) {
            t.classList.toggle('active', t.dataset.bg === current);
        });
    }
    refreshSwatches();
    refreshBgThumbs();

    // Tabs
    overlay.querySelectorAll('.theme-picker-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            overlay.querySelectorAll('.theme-picker-tab').forEach(function (t) { t.classList.remove('active'); });
            overlay.querySelectorAll('.theme-picker-section').forEach(function (s) { s.classList.remove('active'); });
            tab.classList.add('active');
            overlay.querySelector('.theme-picker-section[data-section="' + tab.dataset.tab + '"]').classList.add('active');
        });
    });

    // Open / close
    function openPicker()  { overlay.classList.add('open'); }
    function closePicker() { overlay.classList.remove('open'); }
    fab.addEventListener('click', openPicker);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closePicker(); });
    overlay.querySelector('.theme-picker-close').addEventListener('click', closePicker);
    overlay.querySelector('#themePickerDone').addEventListener('click', closePicker);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay.classList.contains('open')) closePicker();
    });

    // Reset
    overlay.querySelector('#themePickerReset').addEventListener('click', function () {
        if (!confirm('Reset theme and background to default?')) return;
        setColor('aurora');
        setBg('bg-default');
        applyColorTheme('aurora');
        applyBackground('bg-default');
        refreshSwatches();
        refreshBgThumbs();
    });

    // Public API
    window.setStudyHubColorTheme = function (id) { setColor(id); applyColorTheme(id); applyBackground(getBg()); refreshSwatches(); };
    window.setStudyHubBackground = function (id) { setBg(id); applyBackground(id); refreshBgThumbs(); };
})();
// ================================================================
// SEARCH SHORTCUTS — user-defined quick-launch tiles  (v4 · edit)
//  • Add / Edit / Delete shortcuts with auto-fetched favicons
//  • Blocks social media + shorteners + redirect wrappers
//  • Deep-scans the FULL URL (path & query)
//  • Purges any previously-saved shortcut that now matches the blocklist
//  • Persists in localStorage
// ================================================================
(function () {
    'use strict';

    var SHORTCUTS_KEY = 'studyHubShortcuts';
    var editingId = null;   // when set, submitShortcut updates in place

    // ---- Hostname blocklist ----
    var SOCIAL_HOSTS = [
        'facebook.com', 'fb.com', 'fb.me', 'fb.watch', 'messenger.com', 'm.me', 'fbsbx.com',
        'instagram.com', 'instagr.am', 'igtv.com',
        'twitter.com', 'x.com', 't.co',
        'tiktok.com', 'douyin.com', 'vt.tiktok.com',
        'snapchat.com', 'snap.com',
        'reddit.com', 'redd.it', 'redditmedia.com',
        'pinterest.com', 'pin.it', 'pinimg.com',
        'tumblr.com',
        'linkedin.com', 'lnkd.in',
        'whatsapp.com', 'wa.me', 'whatsapp.net',
        'telegram.org', 'telegram.me', 'telegram.dog', 'telegram.im',
        'telegram.link', 'telegram.ws', 'telegram.group', 'telegram.black',
        'telegram.blue', 'telegram.pink', 'telegram.red', 'telegramchat.com',
        't.me', 'tlgrm.eu', 'tlgrm.ru', 'teleg.run', 'tx.me', 'telesco.pe', 'tg.dev',
        'telegramdesktop.com', 'telegramlite.org',
        'discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net',
        'wechat.com', 'weixin.qq.com', 'wx.qq.com', 'qq.com',
        'vk.com', 'vkontakte.ru', 'vk.me', 'ok.ru', 'odnoklassniki.ru',
        'weibo.com', 'weibo.cn', 'douban.com', 'zhihu.com', 'xiaohongshu.com',
        'threads.net', 'threads.com', 'mastodon.social', 'mastodon.online',
        'bsky.app', 'blueskyweb.xyz', 'truthsocial.com', 'truth.social',
        'parler.com', 'gab.com', 'clubhouse.com', 'clubhouse.io',
        'line.me', 'kakao.com', 'kaokao.com', 'bereal.com', 'be-real.app',
        'yik-yak.com', 'yikyak.com', '4chan.org', '8chan.co', '8kun.top',
        'imgur.com', '9gag.com', '9gag.tv', 'ifunny.co',
        'flickr.com', 'flic.kr', 'meetup.com', 'nextdoor.com',
        'netflix.com', 'hulu.com', 'disneyplus.com', 'disney.com',
        'primevideo.com', 'hbomax.com', 'max.com', 'peacocktv.com',
        'twitch.tv', 'kick.com', 'rumble.com', 'dailymotion.com',
        'vimeo.com', 'spotify.com', 'soundcloud.com', 'deezer.com'
    ];

    var SHORTENER_HOSTS = [
        'bit.ly', 'bitly.com', 'tinyurl.com', 'tiny.cc', 'cutt.ly', 'cutt.us',
        'shorturl.at', 'rebrand.ly', 'rebrandly.com', 'is.gd', 'v.gd',
        'ow.ly', 'buff.ly', 'bl.ink', 'shorte.st', 'adf.ly', 'bc.vc',
        'rb.gy', 'rb.link', 'urlz.fr', 'urlshort.com', 'tiny.pl',
        't.ly', 'soo.gd', 's2r.co', 'clck.ru', 'clc.kz', 'goo.gl',
        'surl.li', 'snip.ly', 'x.co', 'mcaf.ee', 'trib.al', 'po.st',
        'hyperurl.co', 'short.gy', 'shrtco.de', '1link.club', '2.gp',
        '3.ly', '4.ly', '6.ly', '7.ly', '9.ly', '0.gp', 'yep.it',
        'xlink.link', 'shrinkme.io', 'shrinkearn.com', 'linkvertise.com',
        'linkvertise.net', 'linkshrink.net', 'ouo.io', 'ouo.press',
        'fc.lc', 'exe.io', 'exee.io', 'gplinks.co', 'gplinks.in',
        'mdiskshortner.com', 'mdisk.me', 'urlcash.net', 'urlcash.org',
        'upfiles.pro', 'upfiles.com', 'za.gl', 'zagl.xyz', 'gurl.lv',
        'sh.st', 'ceesty.com', 'corneey.com', 'festyy.com', 'gestyy.com',
        'destyy.com', 'swarvel.com', 'swarvel.net', 'tii.ai', 'tii.la',
        'tolink.co', 'tolink.pw', 'tolink.me', 'clk.sh', 'clk.asia',
        'clk.ink', 'cuty.io', 'cuty.me', 'cutpaid.com', 'cutwin.com',
        'kutt.it', 'polr.me', 'polr.xyz', 'vurl.io', 'vurl.me',
        'shr.be', 'shr.link', 'shrt.li', 'short.am', 'zzb.bz',
        'tr.im', 'tweez.me', 'tinurl.com', 'tinylink.co', 'zpr.io'
    ];

    var SOCIAL_KEYWORDS = [
        'telegram', 'facebook', 'instagram', 'twitter', 'tiktok', 'snapchat',
        'reddit', 'pinterest', 'discord', 'whatsapp', 'tumblr', 'linkedin',
        'wechat', 'weixin', 'vkontakte', 'mastodon', 'bluesky', 'threads.net',
        'clubhouse', 'truthsocial', 'netflix', 'twitch.tv', 'spotify',
        'soundcloud', 'dailymotion', 'shorte.st', 'linkvertise', 'shrinkme',
        'gplinks', 'mdiskshort', 'mdisk.me'
    ];

    var SHORTENER_KEYWORDS = [
        'bit.ly', 'bitly.com', 'tinyurl', 'cutt.ly', 'cutt.us',
        'shorturl.at', 'rebrand.ly', 'rebrandly', 'shorte.st', 'adf.ly',
        'shrinkme', 'shrinkearn', 'linkvertise', 'linkshrink', 'urlcash',
        'gplinks', 'mdiskshort', 'ouo.io', 'gestyy', 'corneey', 'destyy',
        'hyperurl', 'shrtco.de', 'shorturl', 'shrinkforcloud'
    ];

    function matchHost(host, list) {
        var h = String(host || '').toLowerCase().replace(/^www\./, '');
        for (var i = 0; i < list.length; i++) {
            var d = list[i].toLowerCase();
            if (h === d || h.slice(-(d.length + 1)) === '.' + d) return d;
        }
        return null;
    }
    function isSocialHost(host)    { return matchHost(host, SOCIAL_HOSTS); }
    function isShortenerHost(host) { return matchHost(host, SHORTENER_HOSTS); }

    function deepScan(fullUrl) {
        var lower = String(fullUrl || '').toLowerCase();
        for (var i = 0; i < SOCIAL_KEYWORDS.length; i++) {
            if (lower.indexOf(SOCIAL_KEYWORDS[i]) !== -1) return { kind: 'social', domain: SOCIAL_KEYWORDS[i] };
        }
        for (var j = 0; j < SHORTENER_KEYWORDS.length; j++) {
            if (lower.indexOf(SHORTENER_KEYWORDS[j]) !== -1) return { kind: 'shortener', domain: SHORTENER_KEYWORDS[j] };
        }
        return null;
    }
    function checkUrl(fullUrl, hostname) {
        var s = isSocialHost(hostname);    if (s) return { kind: 'social', domain: s };
        var h = isShortenerHost(hostname); if (h) return { kind: 'shortener', domain: h };
        var d = deepScan(fullUrl);         if (d) return d;
        return null;
    }

    // ---- Storage ----
    function loadShortcuts() {
        try {
            var raw = localStorage.getItem(SHORTCUTS_KEY);
            if (!raw) return [];
            var arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }
    function saveShortcuts(list) {
        try { localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(list)); } catch (e) {}
    }

    function purgeBlockedShortcuts() {
        var list = loadShortcuts();
        if (!list.length) return 0;
        var kept = [], removed = 0, lastBlocked = null;
        for (var i = 0; i < list.length; i++) {
            var sc = list[i];
            var host = '';
            try { host = new URL(sc.url).hostname.replace(/^www\./, ''); } catch (e) {}
            var verdict = checkUrl(sc.url, host);
            if (verdict) { removed++; lastBlocked = { item: sc, verdict: verdict }; }
            else kept.push(sc);
        }
        if (removed > 0) {
            saveShortcuts(kept);
            if (lastBlocked) {
                setTimeout(function () {
                    showToast('removed', lastBlocked.verdict.domain, removed, lastBlocked.item.name);
                }, 500);
            }
        }
        return removed;
    }

    // ---- URL parsing ----
    function normalizeUrl(input) {
        var u = String(input || '').trim();
        if (!u) return null;
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        try {
            var parsed = new URL(u);
            if (!parsed.hostname.includes('.')) return null;
            return parsed;
        } catch (e) { return null; }
    }
    function prettyName(host, given) {
        if (given && given.trim()) return given.trim();
        var h = String(host || '').replace(/^www\./, '');
        var first = h.split('.')[0];
        return first.charAt(0).toUpperCase() + first.slice(1);
    }
    function faviconFor(host) {
        return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64';
    }

    // ---- Toast ----
    function showToast(kind, domain, extraCount, extraName) {
        var old = document.getElementById('shortcutBlockToast');
        if (old) old.remove();
        var icon, heading, body;
        if (kind === 'shortener') {
            icon = '⛓️'; heading = 'Shortened links aren\'t allowed.';
            body = 'Please enter the site&rsquo;s real address. A shortener could be hiding anything.';
        } else if (kind === 'redirect') {
            icon = '🔁'; heading = 'Redirect links aren\'t allowed.';
            body = 'Please enter the site&rsquo;s real address directly, not through a redirect service.';
        } else if (kind === 'removed') {
            icon = '<i class="ph ph-broom" aria-hidden="true"></i>'; heading = 'Removed a blocked shortcut.';
            body = '"' + (extraName || domain) + '" matched our blocked list (' + domain + ').';
            if (extraCount > 1) body += ' ' + extraCount + ' shortcuts were removed.';
        } else {
            icon = '<i class="ph ph-shield-warning" aria-hidden="true"></i>'; heading = 'Social media is banned here.';
            body = '"' + domain + '" can\'t be added. StudyHub is a distraction-free space for students.';
        }
        var t = document.createElement('div');
        t.className = 'shortcut-block-toast';
        t.id = 'shortcutBlockToast';
        t.innerHTML =
            '<span style="font-size:1.2rem;">' + icon + '</span>' +
            '<span><strong>' + heading + '</strong><br>' + body + '</span>' +
            '<button class="toast-close" aria-label="Close"><i class="ph ph-x" aria-hidden="true"></i></button>';
        document.body.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('show'); });
        t.querySelector('.toast-close').addEventListener('click', function () {
            t.classList.remove('show');
            setTimeout(function () { t.remove(); }, 320);
        });
        setTimeout(function () {
            if (!document.body.contains(t)) return;
            t.classList.remove('show');
            setTimeout(function () { t.remove(); }, 320);
        }, 5200);
    }

    // ---- Render ----
    function renderShortcuts() {
        var grid  = document.getElementById('shortcutsGrid');
        var empty = document.getElementById('shortcutsEmpty');
        if (!grid) return;

        var list = loadShortcuts();
        grid.innerHTML = '';

        list.forEach(function (sc) {
            var tile = document.createElement('a');
            tile.className = 'shortcut-tile';
            tile.href = sc.url;
            tile.target = '_blank';
            tile.rel = 'noopener noreferrer';
            tile.title = sc.url;

            // Logo
            var logo = document.createElement('div');
            logo.className = 'sc-logo';
            var img = document.createElement('img');
            img.alt = '';
            img.loading = 'lazy';
            img.src = faviconFor(sc.host);
            img.onerror = function () {
                logo.innerHTML = '<span class="sc-fallback">' + (sc.name || '?').charAt(0) + '</span>';
            };
            logo.appendChild(img);

            // Name
            var name = document.createElement('div');
            name.className = 'sc-name';
            name.textContent = sc.name;

            // Edit button (top-left)
            var editBtn = document.createElement('button');
            editBtn.className = 'sc-edit';
            editBtn.type = 'button';
            editBtn.title = 'Edit shortcut';
            editBtn.innerHTML = '<i class="ph ph-pencil-simple" aria-hidden="true"></i>';
            editBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                openEditModal(sc);
            });

            // Delete button (top-right)
            var delBtn = document.createElement('button');
            delBtn.className = 'sc-delete';
            delBtn.type = 'button';
            delBtn.title = 'Remove shortcut';
            delBtn.innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>';
            delBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (!confirm('Remove "' + sc.name + '" shortcut?')) return;
                var fresh = loadShortcuts().filter(function (x) { return x.id !== sc.id; });
                saveShortcuts(fresh);
                renderShortcuts();
            });

            tile.appendChild(editBtn);
            tile.appendChild(delBtn);
            tile.appendChild(logo);
            tile.appendChild(name);
            grid.appendChild(tile);
        });

        var addTile = document.createElement('button');
        addTile.type = 'button';
        addTile.className = 'shortcut-add-tile';
        addTile.innerHTML = '<span class="add-plus">+</span><span class="add-label">Add</span>';
        addTile.addEventListener('click', openAddModal);
        grid.appendChild(addTile);

        if (empty) empty.style.display = list.length === 0 ? 'block' : 'none';
    }

    // ---- Modal ----
    var modal = null;
    function buildModal() {
        if (modal) return modal;
        modal = document.createElement('div');
        modal.className = 'shortcut-modal';
        modal.id = 'shortcutModal';
        modal.innerHTML = `
            <div class="shortcut-modal-panel" role="dialog" aria-label="Shortcut editor">
                <h3 id="scModalTitle">🔗 Add a shortcut</h3>
                <div class="field">
                    <label for="scUrlInput">Website URL</label>
                    <input type="text" id="scUrlInput" placeholder="e.g. khanacademy.org" autocomplete="off" />
                    <div class="hint">Paste the site&rsquo;s real address. No shorteners, no redirects.</div>
                </div>
                <div class="field">
                    <label for="scNameInput">Display name <span style="opacity:.6;text-transform:none;letter-spacing:0;">(optional)</span></label>
                    <input type="text" id="scNameInput" placeholder="e.g. Khan Academy" autocomplete="off" />
                </div>
                <div class="btn-row">
                    <button type="button" class="btn-cancel" id="scCancelBtn">Cancel</button>
                    <button type="button" class="btn-save" id="scSaveBtn">Save shortcut</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', function (e) { if (e.target === modal) closeAddModal(); });
        modal.querySelector('#scCancelBtn').addEventListener('click', closeAddModal);
        modal.querySelector('#scSaveBtn').addEventListener('click', submitShortcut);
        modal.querySelector('#scUrlInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); submitShortcut(); }
        });
        modal.querySelector('#scNameInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); submitShortcut(); }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.classList.contains('open')) closeAddModal();
        });
        return modal;
    }

    function openAddModal() {
        editingId = null;
        var m = buildModal();
        m.querySelector('#scModalTitle').innerHTML = '<i class="ph ph-link" aria-hidden="true"></i>Add a shortcut';
        m.querySelector('#scSaveBtn').textContent = 'Save shortcut';
        m.querySelector('#scUrlInput').value = '';
        m.querySelector('#scNameInput').value = '';
        m.querySelector('#scUrlInput').style.borderColor = '';
        m.classList.add('open');
        setTimeout(function () { m.querySelector('#scUrlInput').focus(); }, 60);
    }

    function openEditModal(sc) {
        editingId = sc.id;
        var m = buildModal();
        m.querySelector('#scModalTitle').innerHTML = '<i class="ph ph-pencil-simple" aria-hidden="true"></i>Edit shortcut';
        m.querySelector('#scSaveBtn').textContent = 'Save changes';
        m.querySelector('#scUrlInput').value = sc.url;
        m.querySelector('#scNameInput').value = sc.name;
        m.querySelector('#scUrlInput').style.borderColor = '';
        m.classList.add('open');
        setTimeout(function () {
            var inp = m.querySelector('#scUrlInput');
            inp.focus();
            inp.select();
        }, 60);
    }

    function closeAddModal() {
        if (modal) modal.classList.remove('open');
        editingId = null;
    }

    function submitShortcut() {
        var m = buildModal();
        var urlInp  = m.querySelector('#scUrlInput');
        var nameInp = m.querySelector('#scNameInput');

        var parsed = normalizeUrl(urlInp.value);
        if (!parsed) {
            urlInp.focus();
            urlInp.style.borderColor = '#fca5a5';
            setTimeout(function () { urlInp.style.borderColor = ''; }, 1400);
            return;
        }

        var host = parsed.hostname.replace(/^www\./, '');
        var verdict = checkUrl(parsed.href, host);
        if (verdict) {
            showToast(verdict.kind, verdict.domain);
            closeAddModal();
            return;
        }

        var list = loadShortcuts();

        // Duplicate check — ignore the entry we're currently editing
        var dupe = list.some(function (s) {
            return s.host === host && s.id !== editingId;
        });
        if (dupe) {
            urlInp.style.borderColor = '#fbbf24';
            setTimeout(function () { urlInp.style.borderColor = ''; }, 1400);
            return;
        }

        var newName = prettyName(host, nameInp.value);

        if (editingId) {
            // ---- EDIT: update in place ----
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === editingId) {
                    list[i].name = newName;
                    list[i].url  = parsed.href;
                    list[i].host = host;
                    break;
                }
            }
        } else {
            // ---- ADD: new entry ----
            list.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                name: newName,
                url: parsed.href,
                host: host
            });
        }

        saveShortcuts(list);
        renderShortcuts();
        closeAddModal();
    }

    // ---- Boot ----
    function boot() {
        if (!document.getElementById('shortcutsGrid')) return;
        purgeBlockedShortcuts();
        renderShortcuts();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // Public API
    window.addStudyHubShortcut = function (url, name) {
        var parsed = normalizeUrl(url);
        if (!parsed) return false;
        var host = parsed.hostname.replace(/^www\./, '');
        var verdict = checkUrl(parsed.href, host);
        if (verdict) { showToast(verdict.kind, verdict.domain); return false; }
        var list = loadShortcuts();
        list.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name: prettyName(host, name),
            url: parsed.href,
            host: host
        });
        saveShortcuts(list);
        renderShortcuts();
        return true;
    };
})();
// ================================================================
// FOCUS MODE + DISTRACTION BLOCKER — FULL POWER EDITION (v2)
// ================================================================
(function () {
    'use strict';

    const STORAGE = 'studyHubData';
    const FOCUS_GOAL_DEFAULT = 60;

    function readD() { try { return JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch (e) { return {}; } }
    function writeD(d) { try { localStorage.setItem(STORAGE, JSON.stringify(d)); } catch (e) {} }
    function today() { return new Date().toISOString().slice(0,10); }
    function yest() { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }

    // ---------- Categories ----------
    const CATS = {
        social:   { label: '📱 Social Media',       domains: ['facebook.com','fb.com','fb.me','messenger.com','instagram.com','instagr.am','twitter.com','x.com','t.co','tiktok.com','douyin.com','snapchat.com','reddit.com','redd.it','pinterest.com','pin.it','tumblr.com','linkedin.com','lnkd.in','whatsapp.com','wa.me','telegram.org','telegram.me','t.me','telegram.dog','teleg.run','discord.com','discord.gg','wechat.com','vk.com','vkontakte.ru','weibo.com','threads.net','threads.com','mastodon.social','bsky.app','clubhouse.com','bereal.com','4chan.org','imgur.com','9gag.com','quora.com','flickr.com','meetup.com','nextdoor.com'] },
        video:    { label: '🎬 Video & Streaming',  domains: ['netflix.com','hulu.com','disneyplus.com','primevideo.com','hbomax.com','max.com','peacocktv.com','twitch.tv','kick.com','rumble.com','dailymotion.com','vimeo.com','spotify.com','soundcloud.com','deezer.com','tidal.com'] },
        gaming:   { label: '🎮 Gaming',             domains: ['steamcommunity.com','steampowered.com','epicgames.com','roblox.com','minecraft.net','playstation.com','xbox.com','ign.com','gamespot.com','polygon.com'] },
        shopping: { label: '🛒 Shopping',           domains: ['amazon.com','ebay.com','aliexpress.com','alibaba.com','etsy.com','walmart.com','target.com','bestbuy.com','shein.com','temu.com','wish.com','daraz.com','flipkart.com'] }
    };

    // Categories that can NEVER be turned off
    const LOCKED_CATS = { social: true, video: true, gaming: true };

    function buildBlockedSet() {
        const d = readD();
        const enabled = d.blockerCategories || { social: true, video: true, gaming: true, shopping: false };
        const set = {};
        Object.keys(CATS).forEach(function (k) {
            // Locked categories are ALWAYS on, regardless of stored value
            if (LOCKED_CATS[k] || enabled[k]) {
                CATS[k].domains.forEach(function (dom) { set[dom] = k; });
            }
        });
        (d.blockerCustomBlocked || []).forEach(function (dom) {
            set[String(dom).toLowerCase().replace(/^www\./, '')] = 'custom';
        });
        (d.blockerCustomAllowed || []).forEach(function (dom) {
            delete set[String(dom).toLowerCase().replace(/^www\./, '')];
        });
        return set;
    }

    function matchBlocked(host) {
        host = String(host || '').toLowerCase().replace(/^www\./, '');
        const d = readD();
        const wl = d.blockerWhitelist || {};
        if (wl[host] && wl[host] > Date.now()) return null;
        const set = buildBlockedSet();
        if (set[host]) return { domain: host, cat: set[host] };
        const parts = host.split('.');
        for (let i = 1; i < parts.length - 1; i++) {
            const sub = parts.slice(i).join('.');
            if (set[sub]) return { domain: sub, cat: set[sub] };
        }
        return null;
    }

       // Blocker is permanently on. The optional console override lets you
    // disable it for the current session only (resets on reload).
    function isBlockerOn() {
        if (window.__blockerEmergencyOff) return false;
        return true;
    }

    function logBlocked(domain, cat, source) {
        const d = readD();
        if (!d.blockerLog) d.blockerLog = [];
        d.blockerLog.push({ ts: Date.now(), domain: domain, cat: cat || 'other', src: source || 'click' });
        if (d.blockerLog.length > 200) d.blockerLog.splice(0, d.blockerLog.length - 200);
        if (!d.blockerStats) d.blockerStats = { today: 0, total: 0, lastReset: '' };
        if (d.blockerStats.lastReset !== today()) { d.blockerStats.today = 0; d.blockerStats.lastReset = today(); }
        d.blockerStats.today++;
        d.blockerStats.total++;
        writeD(d);
        updateBannerCount();
    }

    function updateBannerCount() {
        const banner = document.getElementById('blockerBanner');
        if (!banner) return;
        const d = readD();
        const s = d.blockerStats || { today: 0, total: 0 };
        const t = (s.lastReset === today()) ? s.today : 0;
        const el = banner.querySelector('.blocker-count');
        if (el) el.textContent = t;
    }

    // ---------- Intercepts ----------
    function interceptClick(e) {
        if (!isBlockerOn()) return;
        const a = e.target.closest && e.target.closest('a');
        if (!a) return;
        let host = '';
        try { host = new URL(a.href).hostname; } catch (err) { return; }
        const m = matchBlocked(host);
        if (!m) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        logBlocked(m.domain, m.cat, 'click');
        showBlockPopup(m.domain, m.cat);
    }

    function interceptOpen() {
        if (window.__fbOpenHooked) return;
        window.__fbOpenHooked = true;
        const orig = window.open;
        window.open = function (url) {
            if (isBlockerOn() && url) {
                let host = '';
                try { host = new URL(url, location.href).hostname; } catch (err) {}
                const m = matchBlocked(host);
                if (m) {
                    logBlocked(m.domain, m.cat, 'window.open');
                    showBlockPopup(m.domain, m.cat);
                    return null;
                }
            }
            return orig.apply(window, arguments);
        };
    }

    function interceptSubmit() {
        if (window.__fbSubmitHooked) return;
        window.__fbSubmitHooked = true;
        document.addEventListener('submit', function (e) {
            if (!isBlockerOn()) return;
            const form = e.target;
            if (!form || !form.action) return;
            let host = '';
            try { host = new URL(form.action).hostname; } catch (err) { return; }
            const m = matchBlocked(host);
            if (!m) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            logBlocked(m.domain, m.cat, 'form');
            showBlockPopup(m.domain, m.cat);
        }, true);
    }

    // ---------- Popups ----------
    function showBlockPopup(domain, cat) {
        const old = document.getElementById('blockerModal');
        if (old) old.remove();
        const label = (CATS[cat] && CATS[cat].label) || '🚫 Blocked';
        const modal = document.createElement('div');
        modal.className = 'blocker-modal';
        modal.id = 'blockerModal';
        modal.innerHTML =
            '<div class="blocker-modal-panel">' +
                '<div class="blocker-modal-icon"><i class="ph ph-shield-warning" aria-hidden="true"></i></div>' +
                '<h3>Blocked!</h3>' +
                '<p class="blocker-domain">' + domain + '</p>' +
                '<p class="blocker-cat">' + label + '</p>' +
                '<p class="blocker-msg">This site is on your distraction list. Stay focused. You can do this.</p>' +
                '<div class="blocker-actions">' +
                    '<button class="btn-allow-once" data-domain="' + domain + '">Allow 5 min</button>' +
                    '<button class="btn-close-blocker">Got it</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        requestAnimationFrame(function () { modal.classList.add('open'); });
        modal.querySelector('.btn-close-blocker').addEventListener('click', function () {
            modal.classList.remove('open');
            setTimeout(function () { modal.remove(); }, 220);
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) { modal.classList.remove('open'); setTimeout(function () { modal.remove(); }, 220); }
        });
        modal.querySelector('.btn-allow-once').addEventListener('click', function () {
            const d = readD();
            if (!d.blockerWhitelist) d.blockerWhitelist = {};
            d.blockerWhitelist[domain] = Date.now() + 5 * 60 * 1000;
            writeD(d);
            modal.classList.remove('open');
            setTimeout(function () { modal.remove(); }, 220);
            showToast('Allowed ' + domain + ' for 5 minutes', 'ok');
        });
    }

    function showToast(msg, type) {
        const old = document.getElementById('fbtToast');
        if (old) old.remove();
        const t = document.createElement('div');
        t.className = 'fbt-toast' + (type ? ' ' + type : '');
        t.id = 'fbtToast';
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('show'); });
        setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2600);
    }

       function paintBlocker() {
        // Blocker is always on — no button to update.
        document.body.classList.add('blocker-active');

        let banner = document.getElementById('blockerBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'blocker-banner';
            banner.id = 'blockerBanner';
            const main = document.querySelector('main.container') || document.body;
            main.insertBefore(banner, main.firstChild);
        }

        // (Re)build the banner's inner content if it doesn't already have our buttons.
        // This handles the static banner that already exists inside index.html.
        if (!banner.querySelector('.blocker-banner-btn')) {
            banner.innerHTML =
                '<i class="ph ph-shield-check" aria-hidden="true"></i> <strong>Blocker is on.</strong>' +
                '<span class="blocker-count-chip"><span class="blocker-count">0</span> blocked today</span>' +
                '<button class="blocker-banner-btn" data-act="settings"><i class="ph ph-gear" aria-hidden="true"></i>Settings</button>' +
                '<button class="blocker-banner-btn" data-act="log"><i class="ph ph-scroll" aria-hidden="true"></i>Log</button>';
            banner.addEventListener('click', function (e) {
                const b = e.target.closest('.blocker-banner-btn');
                if (!b) return;
                const act = b.dataset.act;
                if (act === 'settings') openBlockerSettings();
                else if (act === 'log') openBlockerLog();
            });
        }

        banner.style.display = 'flex';
        updateBannerCount();
    }

    function setupBlockerButton() {
        const btn = document.getElementById('blockerToggle');
        if (!btn || btn.dataset.fbtHooked) return;
        btn.dataset.fbtHooked = '1';
        btn.addEventListener('click', function (e) {
            if (e.shiftKey) { openBlockerSettings(); return; }
            const d = readD();
            d.blockerOn = !d.blockerOn;
            writeD(d);
            paintBlocker();
        });
        btn.addEventListener('contextmenu', function (e) { e.preventDefault(); openBlockerSettings(); });
    }

    function openBlockerSettings() {
    const ex = document.getElementById('blockerSettingsModal');
    if (ex) ex.remove();
    const d = readD();
    const enabled = d.blockerCategories || { social: true, video: true, gaming: true, shopping: false };
    const custom = d.blockerCustomBlocked || [];
    const allowed = d.blockerCustomAllowed || [];

    const modal = document.createElement('div');
    modal.className = 'blocker-settings-modal';
    modal.id = 'blockerSettingsModal';
    let html = '<div class="blocker-settings-panel">';
    html += '<div class="blocker-settings-head"><h2><i class="ph ph-shield-gear" aria-hidden="true"></i> Blocker Settings</h2><button class="bs-close" type="button"><i class="ph ph-x" aria-hidden="true"></i></button></div>';
    html += '<p class="bs-desc">Choose which site categories to block while studying. Shift-click the shield button (or right-click it) to reopen this panel.</p>';
    html += '<div class="bs-section"><h3>Categories <span style="font-weight:400;opacity:.55;text-transform:none;letter-spacing:0;font-size:.7rem;">· 🔒 locked ones can\'t be removed</span></h3><div class="bs-cats">';
    Object.keys(CATS).forEach(function (k) {
        var locked = !!LOCKED_CATS[k];
        html += '<label class="bs-cat' + (locked ? ' bs-cat-locked' : '') + '"' +
                (locked ? ' title="This category is locked on and cannot be removed"' : '') + '>' +
                '<input type="checkbox" data-cat="' + k + '" ' +
                    (locked || enabled[k] ? 'checked' : '') + ' ' +
                    (locked ? 'disabled' : '') + '>' +
                '<span>' + CATS[k].label + '</span>' +
                (locked ? '<span class="bs-lock-badge">🔒 Locked</span>' : '') +
                '<span class="bs-cat-count">' + CATS[k].domains.length + '</span></label>';
    });
    html += '</div></div>';
    html += '<div class="bs-section"><h3>Custom blocklist</h3>';
    html += '<div class="bs-add-row"><input type="text" id="bsAddInput" placeholder="e.g. example.com"><button class="bs-add-btn" type="button">+ Add</button></div>';
    html += '<div class="bs-custom-list" id="bsCustomList">';
    if (!custom.length) html += '<div class="bs-empty">No custom domains yet.</div>';
    else custom.forEach(function (dom) {
        html += '<div class="bs-custom-item"><span>' + dom + '</span><button data-remove="' + dom + '" type="button">✕</button></div>';
    });
    html += '</div></div>';
    if (allowed.length) {
        html += '<div class="bs-section"><h3>Always allowed</h3><div class="bs-custom-list">';
        allowed.forEach(function (dom) {
            html += '<div class="bs-custom-item bs-allowed"><span>' + dom + '</span><button data-unallow="' + dom + '" type="button">✕</button></div>';
        });
        html += '</div></div>';
    }
    html += '<div class="bs-section bs-stats">';
    html += '<div class="bs-stat"><b>' + ((d.blockerStats && d.blockerStats.total) || 0) + '</b><span>total blocked</span></div>';
    html += '<div class="bs-stat"><b>' + ((d.blockerLog && d.blockerLog.length) || 0) + '</b><span>recent events</span></div>';
    html += '</div></div>';

    modal.innerHTML = html;
    document.body.appendChild(modal);
    requestAnimationFrame(function () { modal.classList.add('open'); });

    // ---- Close behaviour ----
    function close() {
        modal.classList.remove('open');
        setTimeout(function () { modal.remove(); }, 220);
        paintBlocker();
    }

    // ✕ button
    var closeBtn = modal.querySelector('.bs-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            close();
        });
    }

    // Click backdrop to close
    modal.addEventListener('click', function (e) {
        if (e.target === modal) close();
    });

    // ESC to close
    var escHandler = function (e) {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // ---- Category checkboxes ----
    modal.querySelectorAll('input[data-cat]').forEach(function (cb) {
        cb.addEventListener('change', function () {
            const dd = readD();
            if (!dd.blockerCategories) dd.blockerCategories = { social: true, video: true, gaming: true, shopping: false };
            dd.blockerCategories[cb.dataset.cat] = cb.checked;
            writeD(dd);
        });
    });

    // ---- Custom blocklist ----
    const addInp = modal.querySelector('#bsAddInput');
    function addCustom() {
        const raw = modal.querySelector('#bsAddInput').value.trim().toLowerCase();
        const val = raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        if (!val || val.indexOf('.') === -1) {
            addInp.style.borderColor = '#fca5a5';
            setTimeout(function () { addInp.style.borderColor = ''; }, 1200);
            return;
        }
        const dd = readD();
        if (!dd.blockerCustomBlocked) dd.blockerCustomBlocked = [];
        if (dd.blockerCustomBlocked.indexOf(val) === -1) dd.blockerCustomBlocked.push(val);
        if (dd.blockerCustomAllowed) dd.blockerCustomAllowed = dd.blockerCustomAllowed.filter(function (x) { return x !== val; });
        writeD(dd);
        close();
        setTimeout(openBlockerSettings, 250);
    }
    modal.querySelector('.bs-add-btn').addEventListener('click', addCustom);
    addInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') addCustom(); });

    modal.querySelectorAll('[data-remove]').forEach(function (b) {
        b.addEventListener('click', function () {
            const dd = readD();
            dd.blockerCustomBlocked = (dd.blockerCustomBlocked || []).filter(function (x) { return x !== b.dataset.remove; });
            writeD(dd);
            b.parentElement.remove();
        });
    });

    modal.querySelectorAll('[data-unallow]').forEach(function (b) {
        b.addEventListener('click', function () {
            const dd = readD();
            dd.blockerCustomAllowed = (dd.blockerCustomAllowed || []).filter(function (x) { return x !== b.dataset.unallow; });
            writeD(dd);
            b.parentElement.remove();
        });
    });
}

    function openBlockerLog() {
        const ex = document.getElementById('blockerLogModal');
        if (ex) ex.remove();
        const d = readD();
        const log = (d.blockerLog || []).slice().reverse();
        const modal = document.createElement('div');
        modal.className = 'blocker-settings-modal';
        modal.id = 'blockerLogModal';
        let html = '<div class="blocker-settings-panel">';
        html += '<div class="blocker-settings-head"><h2>📜 Blocked attempts</h2><button class="bs-close" type="button">✕</button></div>';
        html += '<p class="bs-desc">Every time you (or a link) tried to reach a blocked site.</p>';
        if (!log.length) {
            html += '<div class="bs-empty" style="padding:2rem 0;text-align:center;">🎉 No blocked attempts yet. Keep it up!</div>';
        } else {
            html += '<div class="blocker-log-list">';
            log.forEach(function (item) {
                const t = new Date(item.ts);
                const time = t.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                html += '<div class="blocker-log-item"><span class="bl-dot"></span><div class="bl-info">' +
                        '<span class="bl-domain">' + item.domain + '</span>' +
                        '<span class="bl-meta">' + time + ' · ' + (item.src || 'click') + '</span></div></div>';
            });
            html += '</div>';
        }
        html += '</div>';
             modal.innerHTML = html;
        document.body.appendChild(modal);
        requestAnimationFrame(function () { modal.classList.add('open'); });

        function close() {
            modal.classList.remove('open');
            setTimeout(function () { modal.remove(); }, 220);
        }

        // ✅ Attach close handlers AFTER the modal is in the DOM
        var logCloseBtn = modal.querySelector('.bs-close');
        if (logCloseBtn) {
            logCloseBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                close();
            });
        }
        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

        // Also allow ESC to close
        var logEscHandler = function (e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', logEscHandler);
            }
        };
        document.addEventListener('keydown', logEscHandler);
      }
    // ---------- FOCUS MODE ----------
    let focusTick = null;

    function getFocusSession() { return readD().focusSession || null; }
    function setFocusSession(s) { const d = readD(); d.focusSession = s; writeD(d); }
    function getFocusGoal() { return readD().focusGoalMin || FOCUS_GOAL_DEFAULT; }
    function isFocusOn() { return document.body.classList.contains('focus-mode'); }

    function startFocusSession() {
        const session = {
            startTs: Date.now(),
            distract: 0,
            goalMin: getFocusGoal(),
            blockerWasOn: isBlockerOn()
        };
        setFocusSession(session);
        const d = readD();
        if (!d.blockerOn) { d.blockerOn = true; writeD(d); paintBlocker(); }
    }

        function endFocusSession() {
        const s = getFocusSession();

        // No session → just clean up UI and bail
        if (!s) {
            document.body.classList.remove('focus-mode');
            paintFocusButton();
            return;
        }

        const durMin = Math.round((Date.now() - s.startTs) / 60000);

        // Very short session (< 1 min) → discard, no summary, but still repaint
        if (durMin < 1) {
            setFocusSession(null);
            document.body.classList.remove('focus-mode');
            if (s.blockerWasOn === false) {
                const d = readD();
                if (d.blockerOn) { d.blockerOn = false; writeD(d); paintBlocker(); }
            }
            paintFocusButton();   // ← FIX
            return;
        }

        let score = 100 - (s.distract * 5);
        if (durMin < s.goalMin * 0.5) score -= 15;
        if (durMin < 5) score -= 20;
        score = Math.max(0, Math.min(100, score));
        const goalMet = durMin >= s.goalMin;

        const d = readD();
        if (!d.focusLog) d.focusLog = [];
        d.focusLog.push({
            date: today(),
            startTs: s.startTs,
            endTs: Date.now(),
            minutes: durMin,
            distract: s.distract,
            score: score,
            goalMet: goalMet
        });
        if (d.focusLog.length > 500) d.focusLog.splice(0, d.focusLog.length - 500);
        d.focusSession = null;
        writeD(d);

        if (s.blockerWasOn === false) {
            const dd = readD();
            if (dd.blockerOn) { dd.blockerOn = false; writeD(dd); paintBlocker(); }
        }

        document.body.classList.remove('focus-mode');
        paintFocusButton();   // ← FIX
        showFocusSummary({ durMin: durMin, distract: s.distract, score: score, goalMet: goalMet, goalMin: s.goalMin });
    }

    function showFocusSummary(data) {
        const streak = computeFocusStreak();
        const todayMin = computeTodayFocusMin();
        const msg = data.goalMet
            ? '🏆 Goal crushed! You\'re on fire.'
            : data.durMin >= data.goalMin * 0.5
                ? '👍 Solid session. Keep going!'
                : '💪 Every minute counts. Try again!';

        const modal = document.createElement('div');
        modal.className = 'focus-summary-modal';
        modal.innerHTML =
            '<div class="focus-summary-panel">' +
                '<div class="fs-icon">' + (data.goalMet ? '🏆' : '🎯') + '</div>' +
                '<h2>Session Complete</h2>' +
                '<div class="fs-grid">' +
                    '<div class="fs-stat"><span class="fs-label">Duration</span><span class="fs-val">' + data.durMin + '<small>min</small></span></div>' +
                    '<div class="fs-stat"><span class="fs-label">Goal</span><span class="fs-val">' + data.goalMin + '<small>min</small></span></div>' +
                    '<div class="fs-stat"><span class="fs-label">Distractions</span><span class="fs-val">' + data.distract + '</span></div>' +
                    '<div class="fs-stat"><span class="fs-label">Score</span><span class="fs-val">' + data.score + '<small>/100</small></span></div>' +
                '</div>' +
                '<div class="fs-badge ' + (data.goalMet ? 'met' : '') + '">' + (data.goalMet ? '✅ Goal met' : '⚠️ Goal not met') + '</div>' +
                '<div class="fs-extra"><span>🔥 ' + streak + ' day streak</span><span>📅 ' + todayMin + ' min today</span></div>' +
                '<p class="fs-msg">' + msg + '</p>' +
                '<button class="fs-close" type="button">Close</button>' +
            '</div>';
        document.body.appendChild(modal);
        requestAnimationFrame(function () { modal.classList.add('open'); });
        function close() { modal.classList.remove('open'); setTimeout(function () { modal.remove(); }, 300); }
        modal.querySelector('.fs-close').addEventListener('click', close);
        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    }

    function computeFocusStreak() {
        const log = readD().focusLog || [];
        if (!log.length) return 0;
        const dates = Array.from(new Set(log.map(function (l) { return l.date; }))).sort().reverse();
        if (!dates.length) return 0;
        let check = today();
        if (dates[0] !== check) {
            if (dates[0] !== yest()) return 0;
            check = yest();
        }
        let streak = 0;
        const set = new Set(dates);
        const cursor = new Date(check);
        while (set.has(cursor.toISOString().slice(0,10))) {
            streak++;
            cursor.setDate(cursor.getDate() - 1);
        }
        return streak;
    }

    function computeTodayFocusMin() {
        const log = readD().focusLog || [];
        const t = today();
        return log.filter(function (l) { return l.date === t; }).reduce(function (s, l) { return s + l.minutes; }, 0);
    }

    function ensureFocusBar() {
        let bar = document.getElementById('focusIndicatorBar');
        if (bar && bar.dataset.v2) return bar;
        if (bar) bar.remove();
        bar = document.createElement('div');
        bar.id = 'focusIndicatorBar';
        bar.className = 'focus-indicator-bar';
        bar.dataset.v2 = '1';
        bar.innerHTML =
            '<span>🔒</span>' +
            '<span>FOCUS MODE</span>' +
            '<span class="fb-timer" id="fbTimer">00:00</span>' +
            '<span class="fb-sep">·</span>' +
            '<span class="fb-stat">Goal <b id="fbGoal">60</b>m</span>' +
            '<span class="fb-sep">·</span>' +
            '<span class="fb-stat">👀 <b id="fbDist">0</b></span>' +
            '<span class="fb-sep">·</span>' +
            '<span class="fb-stat">⚡ <b id="fbScore">100</b></span>' +
            '<button class="fb-icon-btn" id="fbGoalBtn" title="Change goal">⚙</button>' +
            '<button class="fb-end" id="fbEndBtn" type="button">End</button>';
        document.body.insertBefore(bar, document.body.firstChild);
        bar.querySelector('#fbEndBtn').addEventListener('click', function () {
            if (confirm('End this focus session?')) endFocusSession();
        });
        bar.querySelector('#fbGoalBtn').addEventListener('click', function () {
            const cur = getFocusGoal();
            const n = parseInt(prompt('Daily focus goal (minutes):', cur), 10);
            if (!isNaN(n) && n > 0) {
                const d = readD();
                d.focusGoalMin = Math.max(5, Math.min(480, n));
                writeD(d);
                const s = getFocusSession();
                if (s) { s.goalMin = d.focusGoalMin; setFocusSession(s); }
                tickFocusBar();
            }
        });
        return bar;
    }

    function tickFocusBar() {
        const s = getFocusSession();
        if (!s || !isFocusOn()) return;
        const elapsed = Math.floor((Date.now() - s.startTs) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const sec = String(elapsed % 60).padStart(2, '0');
        const t = document.getElementById('fbTimer');
        if (t) t.textContent = m + ':' + sec;
        const g = document.getElementById('fbGoal');
        if (g) g.textContent = s.goalMin;
        const dd = document.getElementById('fbDist');
        if (dd) dd.textContent = s.distract;
        let score = 100 - (s.distract * 5);
        if (elapsed / 60 < 5) score = Math.min(score, 70);
        const sc = document.getElementById('fbScore');
        if (sc) sc.textContent = Math.max(0, score);
    }

    function paintFocusButton() {
        const btn = document.getElementById('focusToggle');
        if (!btn) return;
        const on = isFocusOn();
        btn.innerHTML = '<i class="ph ' + (on ? 'ph-lock' : 'ph-lock-open') + '" aria-hidden="true"></i> ' + (on ? 'Focus On' : 'Focus Off');
        btn.classList.toggle('active', on);
    }

    function setupFocusButton() {
        const btn = document.getElementById('focusToggle');
        if (!btn || btn.dataset.fbtHooked) return;
        btn.dataset.fbtHooked = '1';
        btn.addEventListener('click', function () {
            if (isFocusOn()) {
                endFocusSession();
                paintFocusButton();
            } else {
                document.body.classList.add('focus-mode');
                ensureFocusBar();
                startFocusSession();
                paintFocusButton();
            }
        });
    }

    document.addEventListener('visibilitychange', function () {
        if (!isFocusOn()) return;
        const s = getFocusSession();
        if (!s) return;
        if (document.hidden) {
            window.__focusHiddenAt = Date.now();
        } else {
            if (window.__focusHiddenAt && (Date.now() - window.__focusHiddenAt) > 3000) {
                const s2 = getFocusSession();
                if (s2) {
                    s2.distract = (s2.distract || 0) + 1;
                    setFocusSession(s2);
                    const bar = document.getElementById('focusIndicatorBar');
                    if (bar) { bar.classList.add('warning'); setTimeout(function () { bar.classList.remove('warning'); }, 2500); }
                }
            }
            window.__focusHiddenAt = 0;
        }
    });

    // ---------- BOOT ----------
    function boot() {
        setupBlockerButton();
        paintBlocker();
        document.addEventListener('click', interceptClick, true);
        interceptOpen();
        interceptSubmit();
        setupFocusButton();
        paintFocusButton();
        if (focusTick) clearInterval(focusTick);
        focusTick = setInterval(tickFocusBar, 1000);
        setInterval(function () {
            const d = readD();
            if (d.blockerStats && d.blockerStats.lastReset !== today()) {
                d.blockerStats.today = 0;
                d.blockerStats.lastReset = today();
                writeD(d);
                updateBannerCount();
            }
        }, 60000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    // Public API
    window.studyHubFocus = {
        start: function () { if (!isFocusOn()) document.getElementById('focusToggle').click(); },
        end: function () { if (isFocusOn()) { endFocusSession(); paintFocusButton(); } },
        isOn: isFocusOn,
        setGoal: function (min) { const d = readD(); d.focusGoalMin = Math.max(5, Math.min(480, min)); writeD(d); },
        getStreak: computeFocusStreak,
        getTodayMinutes: computeTodayFocusMin,
        log: function () { return readD().focusLog || []; }
    };
       window.studyHubBlocker = {
        isOn: isBlockerOn,
        // Blocker cannot be toggled off — this is a no-op.
        toggle: function () { /* locked */ },
        settings: openBlockerSettings,
        log: openBlockerLog,
        allowOnce: function (domain, min) {
            const d = readD();
            if (!d.blockerWhitelist) d.blockerWhitelist = {};
            d.blockerWhitelist[domain] = Date.now() + (min || 5) * 60000;
            writeD(d);
        },
        // Emergency session-only disable. Resets on next page reload.
        // Use only if the blocker is breaking something you truly need.
        emergencyDisable: function () {
            if (!confirm('Disable the blocker for THIS SESSION only? Reload the page to restore it.')) return;
            window.__blockerEmergencyOff = true;
            paintBlocker();
            if (typeof showToast === 'function') showToast('Blocker disabled for this session.', 'ok');
        }
    };
})();

// ================================================================
// STREAK DAILY REFRESH
// Recomputes the streak automatically:
//   • Every time the tab regains focus
//   • At local midnight while the tab is open
//   • Every 5 minutes as a safety net
// ================================================================
(function () {
    'use strict';

    function refreshStreaks() {
        // Habits page uses updateStreak via setupHabits' closure — but we can
        // recompute here directly and update every known element.
        try {
            var data = loadData();

            // ---- Longest ----
            var allDates = new Set();
            (data.habits || []).forEach(function (h) {
                (h.completedDates || []).forEach(function (d) { allDates.add(d); });
            });
            var sorted = Array.from(allDates).sort();
            var longest = data.longestStreak || 0;
            if (sorted.length > 0) {
                var run = 1;
                if (run > longest) longest = run;
                for (var i = 1; i < sorted.length; i++) {
                    var diff = (new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000;
                    if (diff === 1) { run++; if (run > longest) longest = run; }
                    else run = 1;
                }
            }
            if (longest > (data.longestStreak || 0)) {
                data.longestStreak = longest;
                saveData(data);
            }

            // ---- Current ----
            var todayStr = new Date().toISOString().slice(0, 10);
            var cur = new Date();
            if (!allDates.has(todayStr)) cur.setDate(cur.getDate() - 1);
            var current = 0;
            while (allDates.has(cur.toISOString().slice(0, 10))) {
                current++;
                cur.setDate(cur.getDate() - 1);
            }

            // ---- Update DOM ----
            var el;

            el = document.getElementById('streakDisplay');
            if (el) el.textContent = current;

            el = document.getElementById('currentStreakDisplay');
            if (el) el.textContent = current;

            el = document.getElementById('longestStreakDisplay');
            if (el) el.textContent = longest;

            el = document.getElementById('statStreak');
            if (el) el.textContent = longest;

        } catch (e) { /* silent */ }
    }

    // 1) Run once on load
    refreshStreaks();

    // 2) Run when the tab becomes visible again
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) refreshStreaks();
    });

    // 3) Run when the window regains focus
    window.addEventListener('focus', refreshStreaks);

    // 4) Every 5 minutes as a safety net
    setInterval(refreshStreaks, 5 * 60 * 1000);

    // 5) At local midnight — schedule a one-shot
    (function scheduleMidnight() {
        var now = new Date();
        var midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        var ms = midnight - now;
        setTimeout(function () {
            refreshStreaks();
            scheduleMidnight();  // reschedule for the next midnight
        }, ms);
    })();

    // Expose for manual triggering from the console
    window.studyHubRefreshStreaks = refreshStreaks;
})();

/* ── Scroll Reveal + Stagger Animations ── */
(function() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  // Add reveal class to major content sections
  const revealTargets = document.querySelectorAll('.glass-card, .stat-card, .tool-card, .overview-strip, .dash-header, .page-header');
  revealTargets.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
  });

  // Stagger children in grids
  const staggerTargets = document.querySelectorAll('.stats-grid, .tools-grid, .overview-strip, .priority-grid');
  staggerTargets.forEach(grid => {
    const children = grid.children;
    Array.from(children).forEach((child, i) => {
      child.style.opacity = '0';
      child.style.transform = 'translateY(16px)';
      child.style.transition = `opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.06}s, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.06}s`;
    });
  });

  // IntersectionObserver for reveals
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  revealTargets.forEach(el => observer.observe(el));

  // Stagger observer
  const staggerObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const children = entry.target.children;
        Array.from(children).forEach(child => {
          child.style.opacity = '1';
          child.style.transform = 'translateY(0)';
        });
        staggerObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  staggerTargets.forEach(el => staggerObserver.observe(el));
})();


/* ================================================================
   TRASH CORE v2.1 — single-writer, schema-proof, self-diagnosing
   Covers: notes · notices · habits · files · assignments · goals ·
   readingList · flashcard decks · LISTS (List Maker).
   Handles both capture format {type,name,item,ts} and the site's
   pushToTrash format {id,type,data,deletedAt}. Planner excluded.
   Integrations required elsewhere in script.js:
     • getDefaultData() must contain  lists: [],
     • notes.html loads eduhub-lists.js (exposes renderListMaker).
   ================================================================ */
(function () {
  'use strict';
  if (window.__TRASH_CORE__) return;
  window.__TRASH_CORE__ = true;

  var WATCH = ['notes','notices','habits','files','assignments','goals','readingList','lists'];
  var MAX_TRASH = 80, QUOTA = 4300000;
  var prev = null, armed = -1, armedEmpty = false, armedT = null, armedEmptyT = null, q = '';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function innerItem(e){ return e && typeof e==='object' ? (e.item!=null?e.item:(e.data!=null?e.data:(e.payload!=null?e.payload:e))) : e; }

  /* label = preferred key, else FIRST readable string anywhere in the object */
  function labelOf(it){
    if(it==null) return '';
    if(typeof it!=='object') return String(it).slice(0,60);
    var prefer=['name','title','text','label','fileName','task','content','front','question','body','note','desc','description','subject','url'];
    for(var i=0;i<prefer.length;i++){ var v=it[prefer[i]];
      if(typeof v==='string'&&v.trim()&&v.indexOf('data:')!==0) return v.slice(0,60); }
    for(var k in it){ var s=it[k];
      if(typeof s==='string'&&s.trim()&&s.length<300&&s.indexOf('data:')!==0&&s.indexOf('<')!==0) return s.slice(0,60); }
    var nest=['item','data','payload'];
    for(var j=0;j<nest.length;j++){ if(it[nest[j]]&&typeof it[nest[j]]==='object'){ var r=labelOf(it[nest[j]]); if(r&&r!=='?') return r; } }
    try{ var js=JSON.stringify(it); return js&&js.length>2 ? 'Item '+(it.id!=null?'('+it.id+')':'') : '?'; }catch(e){ return '?'; }
  }
  function keyOf(it){
    if(!it||typeof it!=='object') return 'p:'+String(it);
    if(it.id!=null&&it.id!=='') return 'id:'+it.id;
    var prefer=['name','title','text','label','fileName','task','content','front','question','body','url'];
    for(var i=0;i<prefer.length;i++){ if(it[prefer[i]]!=null&&it[prefer[i]]!=='') return prefer[i]+':'+it[prefer[i]]; }
    try{ return 'j:'+JSON.stringify(it); }catch(e){ return 'u:'+Math.random(); }
  }
  function guessType(o){
    if(!o||typeof o!=='object') return null;
    var ks=Object.keys(o).join(' ');
    if(/createdAt|updatedAt|items/i.test(ks)&&/name/i.test(ks)) return 'lists';
    if(/front|deck|card/i.test(ks)) return 'flashcards';
    if(/streak|done/i.test(ks)) return 'habits';
    if(/size|dataUrl/i.test(ks)) return 'files';
    if(/due|priority/i.test(ks)) return 'assignments';
    if(/(^| )url|author/i.test(ks)) return 'readingList';
    if(/pinned/i.test(ks)) return 'notices';
    if(/text|body|content/i.test(ks)) return 'notes';
    return null;
  }
  function diff(oldA,newA){
    var removed=[],added=[],map=new Map();
    (oldA||[]).forEach(function(it){ var k=keyOf(it),e=map.get(k); if(e)e.c++; else map.set(k,{c:1,it:it}); });
    (newA||[]).forEach(function(it){ var k=keyOf(it),e=map.get(k); if(e&&e.c>0)e.c--; else added.push(it); });
    map.forEach(function(e){ if(e.c>0) removed.push(e.it); });
    return {removed:removed,added:added};
  }
  function decksOf(d){ return (d.flashcards&&d.flashcards.decks)?d.flashcards.decks:[]; }
  function snap(d){
    var s={}; WATCH.forEach(function(k){ s[k]=(d[k]||[]).slice(); });
    s._decks=decksOf(d).slice();
    s._tk=(d.trash||[]).map(function(e){ return keyOf(innerItem(e)); });
    return s;
  }
  function count(){ try{ return (loadData().trash||[]).length; }catch(e){ return 0; } }
  function toast(m){ var t=document.getElementById('eh-toast');
    if(t){ t.textContent=m; t.hidden=false; t.classList.add('show');
      setTimeout(function(){ t.classList.remove('show'); t.hidden=true; },2200); }
    else console.log('[Trash]',m); }
  function when(w){ try{ if(!w.ts&&!w.deletedAt) return '—';
    var d=new Date(w.ts||w.deletedAt);
    return d.toLocaleDateString(undefined,{day:'numeric',month:'short'})+' · '+
      d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); }catch(e){ return '—'; } }
  function updateBadge(){ var b=document.getElementById('trashBtn'); if(!b) return; var n=count();
    if(/\(\d+\)/.test(b.innerHTML)) b.innerHTML=b.innerHTML.replace(/\(\d+\)/,'('+n+')');
    else b.innerHTML=b.innerHTML+' ('+n+')'; }

  /* ---------- CAPTURE (single writer, identity-deduped) ---------- */
  var origSave = saveData;
  function wrappedSave(d){
    var cap=[];
    try{
      if(!prev) prev=snap(loadData());
      if(d&&typeof d==='object'){
        WATCH.forEach(function(k){
          var r=diff(prev[k]||[],d[k]||[]);
          if(!r.removed.length||r.added.length) return;
          r.removed.forEach(function(it){ if(it&&typeof it==='object')
            cap.push({type:k,name:labelOf(it),item:it,ts:Date.now()}); });
        });
        var rd=diff(prev._decks||[],decksOf(d));
        if(rd.removed.length&&!rd.added.length) rd.removed.forEach(function(it){
          if(it&&typeof it==='object')
            cap.push({type:'flashcards',name:labelOf(it),item:it,ts:Date.now()}); });
        if(cap.length&&d.trash&&d.trash.length){
          /* identity dedup: skip if an equivalent item was added to trash during THIS save
             (by the site's own pushToTrash, or any other writer) */
          var prevSet={}; (prev._tk||[]).forEach(function(k){ prevSet[k]=1; });
          var fresh={};
          d.trash.forEach(function(e){ var k=keyOf(innerItem(e)); if(!prevSet[k]) fresh[k]=1; });
          cap=cap.filter(function(c){ return !fresh[keyOf(c.item)]; });
        }
        if(cap.length){
          d.trash=(d.trash&&d.trash.push)?d.trash:[];
          cap.forEach(function(c){ d.trash.push(c); });
          while(d.trash.length>MAX_TRASH) d.trash.shift();
          try{ var size=JSON.stringify(d).length;
            while(size>QUOTA&&d.trash.length){ d.trash.shift(); size=JSON.stringify(d).length; } }catch(e){}
          toast(cap.length+' item'+(cap.length>1?'s':'')+' moved to Trash');
        }
      }
    }catch(e){}
    try{ prev=snap(d); }catch(e){}
    var r2=origSave(d);
    updateBadge();
    return r2;
  }
  try{ prev=snap(loadData()); }catch(e){ prev={}; }
  if(!saveData.__tcWrapped){ saveData=wrappedSave; saveData.__tcWrapped=true; }

  /* ---------- OPERATIONS ---------- */
  var RESTORE={
    notes:'notes',note:'notes',notices:'notices',notice:'notices',
    habits:'habits',habit:'habits',files:'files',file:'files',
    assignments:'assignments',assignment:'assignments',
    goals:'goals',goal:'goals',
    readinglist:'readingList',reading:'readingList',
    lists:'lists',list:'lists',
    flashcards:'flashcards.decks',deck:'flashcards.decks' };
  function arrFor(d,type){ var c=d;
    String(RESTORE[(type||'').toLowerCase()]||'').split('.').forEach(function(k){ c=c?c[k]:null; });
    return (c&&c.push)?c:null; }

  /* ---------- SCREEN REFRESH after restore ---------- */
  /* notes/habits/notices/files/lists have safe global entry points → instant.
     assignments/reading/decks have no safe re-render → auto-reload (correct). */
  var RENDER_CANDIDATES = {
    notes:['renderNotes','initNotes','loadNotes','displayNotes','showNotes'],
    notices:['renderNotices','initNotices','loadNotices','displayNotices'],
    habits:['renderHabits','initHabits','loadHabits','displayHabits'],
    files:['renderFiles','initFiles','loadFiles','displayFiles'],
    assignments:['renderAssignments','initAssignments','loadAssignments','displayAssignments'],
    goals:['renderGoals','initGoals','loadGoals'],
    readingList:['renderReading','initReading','loadReading','displayReading'],
    flashcards:['renderFlashcards','renderDecks','initFlashcards','loadFlashcards'],
    lists:['renderListMaker']
  };
  function refreshLists(types){
    var hit = 0;
    var safe = { notes:'setupNotes', notices:'setupNotice', habits:'setupHabits',
                 files:'renderFileList', lists:'renderListMaker' };
    (types||[]).forEach(function(t){
      if(safe[t]){ try{ if(typeof window[safe[t]]==='function'){ window[safe[t]](); hit++; } }catch(e){} }
      (RENDER_CANDIDATES[t]||[]).forEach(function(n){
        if(safe[t]===n) return;   /* already tried the safe one */
        try{ if(typeof window[n]==='function'){ window[n](); hit++; } }catch(e){}
      });
    });
    ['refreshCurrentPage','renderDashboard'].forEach(function(n){
      try{ if(typeof window[n]==='function'){ window[n](); hit++; } }catch(e){}
    });
    /* nothing matched → guaranteed-correct fallback */
    if(!hit && !window.TRASH_NO_RELOAD) setTimeout(function(){ location.reload(); }, 350);
  }

  function restoreAt(i){ var d=loadData(); if(!d||!d.trash||!d.trash[i]) return;
    var it=d.trash[i], back=innerItem(it), type=it.type||guessType(back), a=type?arrFor(d,type):null;
    if(a){ a.push(back); d.trash.splice(i,1); saveData(d); toast('Restored'); render(); refreshLists([type]); }
    else toast('Unknown item type — use TrashCore.diag()'); }
  function deleteAt(i){ var d=loadData(); if(!d||!d.trash||!d.trash[i]) return;
    d.trash.splice(i,1); saveData(d); toast('Deleted forever'); render(); }
  function restoreAll(){ var d=loadData(),n=(d.trash||[]).length;
    if(!n){ toast('Trash is empty'); return; } var ok=0, types={};
    for(var i=d.trash.length-1;i>=0;i--){ var back=innerItem(d.trash[i]),
      type=d.trash[i].type||guessType(back), a=type?arrFor(d,type):null;
      if(a){ a.push(back); d.trash.splice(i,1); ok++; types[type]=1; } }
    saveData(d); toast(ok+' of '+n+' restored'+(ok<n?' ('+(n-ok)+' unknown types left)':'')); render();
    refreshLists(Object.keys(types)); }
  function emptyAll(){ var d=loadData(),n=(d.trash||[]).length;
    if(!n){ toast('Trash is already empty'); return; }
    d.trash=[]; saveData(d); toast(n+' item(s) deleted forever'); render(); }

  /* ---------- UI ---------- */
  var CSS='#tc-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px;font-family:var(--font,system-ui,sans-serif)}'+
    '#tc-modal[hidden]{display:none!important}'+
    '.tc-scrim{position:absolute;inset:0;background:rgba(2,5,10,.6);opacity:0;transition:opacity .22s}'+
    '.tc-panel{position:relative;width:min(600px,100%);max-height:min(80vh,760px);display:flex;flex-direction:column;background:var(--surface-raised,rgba(13,22,37,.96));border:1px solid var(--line,rgba(148,163,184,.2));border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.5);opacity:0;transform:translateY(12px) scale(.98);transition:opacity .24s cubic-bezier(.16,1,.3,1),transform .24s cubic-bezier(.16,1,.3,1);overflow:hidden}'+
    '#tc-modal.tc-in .tc-scrim{opacity:1}#tc-modal.tc-in .tc-panel{opacity:1;transform:none}'+
    '.tc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 14px;border-bottom:1px solid var(--line,rgba(148,163,184,.15))}'+
    '.tc-eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent,#3fd2b0);font-weight:700;margin-bottom:4px}'+
    '.tc-title{font-family:var(--display,var(--font,sans-serif));font-weight:700;font-size:20px;color:var(--ink,#edf2f7)}'+
    '.tc-x{width:32px;height:32px;border-radius:50%;border:1px solid var(--line,#2a3648);background:transparent;color:var(--ink,#edf2f7);cursor:pointer;font-size:14px}'+
    '.tc-body{padding:16px 20px 22px;overflow-y:auto}'+
    '.tc-toolbar{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}'+
    '.tc-search{flex:1;min-width:170px;display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.3);border:1px solid var(--line,#2a3648);border-radius:999px;padding:0 14px;color:var(--muted,#8d9aa9)}'+
    '.tc-search input{flex:1;background:none;border:none;outline:none;color:var(--ink,#edf2f7);height:40px;font:inherit;font-size:14px;min-width:0}'+
    '.tc-count{font-size:12px;font-weight:700;color:var(--muted,#8d9aa9);white-space:nowrap}'+
    '.tc-actions{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}'+
    '.tc-btn{border:1px solid var(--line,#2a3648);background:transparent;color:var(--ink,#edf2f7);border-radius:8px;padding:6px 12px;font:600 12.5px var(--font,sans-serif);cursor:pointer;transition:border-color .15s,color .15s,background .15s}'+
    '.tc-btn:hover{border-color:var(--accent,#3fd2b0);color:var(--accent,#3fd2b0)}'+
    '.tc-btn.danger:hover{border-color:var(--danger,#f0938c);color:var(--danger,#f0938c);background:var(--danger-soft,rgba(240,147,140,.12))}'+
    '.tc-row{display:flex;align-items:center;gap:11px;padding:10px 2px;border-top:1px solid var(--line,rgba(148,163,184,.12))}'+
    '.tc-row:first-child{border-top:none}.tc-ic{font-size:17px;flex:none;width:26px;text-align:center}'+
    '.tc-main{min-width:0;flex:1}.tc-main b{display:block;font-size:13.5px;color:var(--ink,#edf2f7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tc-main i{font-style:normal;font-size:11px;color:var(--muted,#8d9aa9)}'+
    '.tc-acts{display:flex;gap:6px;flex:none}'+
    '.tc-empty{border:1px dashed rgba(63,210,176,.3);border-radius:12px;padding:28px 18px;text-align:center;color:var(--muted,#8d9aa9);font-size:13.5px;line-height:1.6}';
  function inject(){
    if(document.getElementById('tc-modal')) return;
    var st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
    document.body.insertAdjacentHTML('beforeend',
      '<div id="tc-modal" hidden><div class="tc-scrim" data-tc-close></div>'+
      '<div class="tc-panel" role="dialog" aria-modal="true" aria-label="Trash">'+
      '<div class="tc-head"><div><div class="tc-eyebrow">Recycle bin</div><div class="tc-title">Trash</div></div>'+
      '<button class="tc-x" data-tc-close aria-label="Close">✕</button></div>'+
      '<div class="tc-body"><div class="tc-toolbar">'+
      '<div class="tc-search">🔍<input id="tc-q" placeholder="Search trash…"></div>'+
      '<span class="tc-count" id="tc-count"></span></div>'+
      '<div class="tc-actions"><button class="tc-btn" id="tc-restoreall">♻ Restore all</button>'+
      '<button class="tc-btn danger" id="tc-emptyall">Empty trash</button></div>'+
      '<div class="tc-list" id="tc-list"></div></div></div></div>');
    document.getElementById('tc-q').addEventListener('input',function(e){ q=e.target.value; render(); });
  }
  var ICONS={ notes:'📝',note:'📝',notices:'📌',notice:'📌',habits:'🔁',habit:'🔁',
    files:'📎',file:'📎',assignments:'📚',assignment:'📚',goals:'🎯',goal:'🎯',
    readinglist:'🔖',reading:'🔖',lists:'🗒',list:'🗒',flashcards:'🃏',deck:'🃏' };
  function render(){
    var list=document.getElementById('tc-list'); if(!list) return;
    var d=loadData(),tr=d.trash||[];
    document.getElementById('tc-count').textContent=tr.length+(tr.length===1?' item':' items');
    var ea=document.getElementById('tc-emptyall');
    ea.textContent=armedEmpty?'Really empty all?':'Empty trash';
    ea.style.color=armedEmpty?'var(--danger,#f0938c)':'';
    var f=tr.map(function(w,i){return{w:w,i:i};}).filter(function(x){
      var t=(x.w.type||guessType(innerItem(x.w))||'');
      return !q||(labelOf(innerItem(x.w))+' '+t).toLowerCase().indexOf(q.toLowerCase())>-1; });
    list.innerHTML=tr.length===0
      ?'<div class="tc-empty">Trash is empty.<br>Deleted notes, files, habits, decks, lists and more will appear here.</div>'
      :(f.length?f.map(function(x){
        var back=innerItem(x.w), type=(x.w.type||guessType(back)||'item').toLowerCase();
        return '<div class="tc-row"><span class="tc-ic">'+(ICONS[type]||'🗑')+'</span>'+
          '<span class="tc-main"><b>'+esc(labelOf(back)||'Untitled item')+'</b><i>'+esc(type)+' · '+when(x.w)+'</i></span>'+
          (armed===x.i
            ?'<span class="tc-acts"><button class="tc-btn danger" data-tc-confirm="'+x.i+'">Sure?</button><button class="tc-btn" data-tc-cancel="1">Keep</button></span>'
            :'<span class="tc-acts"><button class="tc-btn" data-tc-restore="'+x.i+'">Restore</button><button class="tc-btn danger" data-tc-arm="'+x.i+'">Delete</button></span>')+'</div>';
      }).join(''):'<div class="tc-empty">Nothing matches “'+esc(q)+'”.</div>');
  }
  function open(){ inject(); armed=-1; armedEmpty=false; q=''; var qi=document.getElementById('tc-q'); if(qi) qi.value='';
    var m=document.getElementById('tc-modal'); m.hidden=false; render();
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ m.classList.add('tc-in'); }); }); }
  function close(){ var m=document.getElementById('tc-modal'); if(!m||m.hidden) return;
    m.classList.remove('tc-in'); setTimeout(function(){ m.hidden=true; },220); }

  /* ---------- EVENTS ---------- */
  document.addEventListener('click',function(e){
    var b=e.target; if(!b.closest) return;
    if(b.closest('#trashBtn')){ e.preventDefault(); e.stopImmediatePropagation(); open(); return; }
    var a=b.closest('[data-tc-restore],[data-tc-arm],[data-tc-confirm],[data-tc-cancel],#tc-restoreall,#tc-emptyall,[data-tc-close]');
    if(!a) return;
    if(a.hasAttribute('data-tc-close')){ close(); return; }
    if(a.id==='tc-restoreall'){ restoreAll(); return; }
    if(a.id==='tc-emptyall'){
      if(!armedEmpty){ armedEmpty=true; render(); clearTimeout(armedEmptyT);
        armedEmptyT=setTimeout(function(){ armedEmpty=false; render(); },3000); }
      else{ armedEmpty=false; emptyAll(); } return; }
    if(a.dataset.tcRestore!=null){ armed=-1; restoreAt(+a.dataset.tcRestore); return; }
    if(a.dataset.tcArm!=null){ armed=+a.dataset.tcArm; armedEmpty=false; render(); clearTimeout(armedT);
      armedT=setTimeout(function(){ armed=-1; render(); },3000); return; }
    if(a.dataset.tcConfirm!=null){ armed=-1; deleteAt(+a.dataset.tcConfirm); return; }
    if(a.dataset.tcCancel!=null){ armed=-1; render(); return; }
  },true);
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') close(); });

  /* ---------- BOOT + DIAGNOSTICS ---------- */
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',updateBadge);
  else updateBadge();
  setTimeout(updateBadge,800);
  console.log('[TrashCore v2.1] active —',count(),'item(s)');
  window.openTrashModal = open;   /* Ctrl+K palette + legacy callers → unified popup */
  window.TrashCore={
    open:open, close:close, count:count, restoreAll:restoreAll, empty:emptyAll,
    diag:function(){
      console.log('— WRAP CHAIN —');
      console.log('saveData.name =',saveData.name,'| wrapped:',!!saveData.__tcWrapped);
      console.log('old autotrash still loaded:',!!window.AutoTrash,'(if true → remove its <script> tag!)');
      console.log('old trash-ui still loaded:',!!document.getElementById('ehtr-modal'));
      console.log('— TRASH CONTENTS —');
      try{ console.table((loadData().trash||[]).map(function(t,i){
        var it=innerItem(t);
        return { i:i, type:t.type||guessType(it)||'?', label:t.name||labelOf(it),
                 entryKeys:Object.keys(t).join(','), itemKeys:(it&&typeof it==='object')?Object.keys(it).join(','):'-',
                 sample:JSON.stringify(it).slice(0,90) }; })); }catch(e){ console.log(e); }
    }
  };

    
})();


/* ================================================================
   GMAIL QUICK ACCESS — navbar pill beside "Sign out"
   Opens the browser's signed-in Google account inbox in a new tab.
   Styled with .focus-toggle so it matches Trash / Focus Off and
   follows the theme automatically. Runs on every page.
   ================================================================ */
(function () {
  'use strict';
  if (window.__GMAIL_BTN__) return;
  window.__GMAIL_BTN__ = true;

  var tries = 0;
  function inject() {
    if (document.getElementById('gmailBtn')) return true;   /* already injected */
    var nav = document.querySelector('.nav-right') || document.querySelector('.nav-container');
    if (!nav) return false;

    var a = document.createElement('a');
    a.id = 'gmailBtn';
    a.className = 'focus-toggle';
    a.href = 'https://mail.google.com/';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = 'Open your Gmail inbox';
    a.innerHTML = '<i class="ph ph-google-logo" aria-hidden="true"></i> Gmail';

    var after = null;
    var els = nav.querySelectorAll('button, a');
    for (var i = 0; i < els.length; i++) {
      var sig = ((els[i].id || '') + ' ' + (els[i].textContent || '')).toLowerCase();
      if (/sign\s*out|signout|logout/.test(sig)) { after = els[i]; break; }
    }
    if (after && after.parentNode === nav) nav.insertBefore(a, after.nextSibling);
    else nav.appendChild(a);
    return true;
  }
  (function boot() {
    if (inject() || ++tries > 10) return;
    setTimeout(boot, 300);
  })();
})();

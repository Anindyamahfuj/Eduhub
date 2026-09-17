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

// ================================================================
// TRANSLATION ENGINE (ALL 15 LANGUAGES – FULL)
// ================================================================

const translations = {
    en: {
        'dash_title': 'Dashboard',
        'dash_subtitle': 'Your study hub at a glance: today\'s progress & all-time history.',
        'stat_searches': 'Searches Today',
        'stat_files': 'Files Uploaded',
        'stat_tasks': 'Tasks Done Today',
        'stat_streak': 'Longest Streak',
        'stat_pomodoros': 'Pomodoros Today',
        'all_history': 'All History',
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
        'studyhub_ai': 'StudyHub AI',
        'recommend_title': 'Not sure which AI to use?',
        'recommend_text': 'Tell me what you\'re working on.',
        'recommend_button': 'Recommend',
        'recommend_placeholder': 'e.g. solve calculus, write code...',
        'summarizer_title': 'AI Summarizer',
        'summarizer_desc': 'Paste any text and get a concise summary (works offline).',
        'summarize_button': 'Summarize',
        'summarize_placeholder': 'Paste your text here...',
        'social_blocked': 'Social Media Blocked',
        'social_blocked_desc': 'To keep you focused, all social media platforms (except YouTube) are blocked while using StudyHub.',
        'files': 'Files',
        'files_subtitle': 'Upload, view, and manage your study files. All files are stored locally in your browser.',
        'upload_drop': 'Drag & drop files here, or click to browse',
        'delete_all_files': 'Delete All Files',
        'uploaded_files': 'Uploaded Files',
        'habits': 'Habits',
        'habits_subtitle': 'Build daily routines. Complete tasks and watch your streak grow!',
        'habit_placeholder': '✍️ New habit (e.g., Read 30 min)',
        'your_habits': 'Your Habits',
        'current_streak': 'Current Streak',
        'longest_streak': 'Longest Streak',
        'days': 'days',
        'notice': 'Notice',
        'notice_subtitle': 'Pin important announcements or reminders for your study group.',
        'notice_placeholder': '✍️ Write a notice...',
        'pinboard': 'Pinboard',
        'notices_count': 'notices',
        'notes': 'Notes',
        'notes_subtitle': 'Jot down quick ideas, lecture notes, or to‑dos.',
        'note_placeholder': '✍️ Write a note...',
        'your_notes': 'Your Notes',
        'assignments': 'Assignments',
        'assignments_subtitle': 'Manage deadlines, priorities, and tags.',
        'assign_title': 'Title',
        'assign_subject': 'Subject',
        'assign_tags': 'Tags (comma)',
        'priority_high': 'High',
        'priority_medium': 'Medium',
        'priority_low': 'Low',
        'add': 'Add',
        'all_assignments': 'All Assignments',
        'planner': 'Planner',
        'planner_subtitle': 'Click any cell to plan your subject for that day & time.',
        'flashcards': 'Flashcards',
        'flashcards_subtitle': 'Spaced repetition, review due cards regularly.',
        'new_deck': 'New Deck',
        'click_to_flip': 'Click card to flip.',
        'rate_difficulty': 'Rate difficulty:',
        'hard': 'Hard',
        'medium': 'Medium',
        'easy': 'Easy',
        'reading': 'Reading',
        'reading_subtitle': 'Save articles, tutorials, and resources.',
        'read_title': 'Title',
        'read_url': 'URL',
        'read_subject': 'Subject',
        'read_tags': 'Tags (comma)',
        'my_reading': 'My Reading',
        'switch_analog': 'Switch to Analog',
        'today': 'Today',
        'entries': 'entries',
        'entry': 'entry',
        'quick_search': 'Quick Search',
        'focus_off': 'Focus Off',
        'sign_out': 'Sign out',
        'open_history': 'Open history',
        'focus_on': 'Focus On',
        'allowed': 'Allowed',
        'math_tag': 'Math',
        'coding_tag': 'Coding',
        'writing_tag': 'Writing',
        'research_tag': 'Research',
        'data_tag': 'Data',
        'design_tag': 'Design',
        'language_tag': 'Language',
        'productivity_tag': 'Productivity',
        'stem_tag': 'STEM',
        'deepseek_desc': 'Advanced math solver.',
        'cursor_desc': 'AI-powered code editor.',
        'chatgpt_desc': 'Versatile writing assistant.',
        'perplexity_desc': 'AI-powered research.',
        'claude_desc': 'Data analysis & reasoning.',
        'midjourney_desc': 'AI image generation.',
        'duolingo_desc': 'AI-driven language learning.',
        'notion_desc': 'AI-powered productivity.',
        'wolfram_desc': 'Computational STEM engine.',
        'canva_desc': 'AI-powered design for presentations, posters, and social media.',
        'youtube_desc': 'Educational videos, tutorials, and lectures.',
    },
    es: {
        'dash_title': 'Panel de Control',
        'dash_subtitle': 'Tu centro de estudio de un vistazo: progreso de hoy e historial completo.',
        'stat_searches': 'Búsquedas Hoy',
        'stat_files': 'Archivos Subidos',
        'stat_tasks': 'Tareas Completadas Hoy',
        'stat_streak': 'Racha Más Larga',
        'stat_pomodoros': 'Pomodoros Hoy',
        'all_history': 'Todo el Historial',
        'delete_all': 'Eliminar Todo el Historial',
        'search_placeholder': '¿Qué estás buscando?',
        'search_button': 'Buscar',
        'search_tip': 'Todas las búsquedas se registran en tu historial.',
        'show_keyboard': 'Mostrar Teclado',
        'hide_keyboard': 'Ocultar Teclado',
        'task_timer': 'Temporizador de Tareas',
        'start': 'Iniciar',
        'stop': 'Detener',
        'reset': 'Reiniciar',
        'completed_today': 'Completado hoy',
        'daily_reflection': 'Reflexión Diaria',
        'journal_placeholder': '¿Cómo fue tu sesión de estudio? ¿Qué aprendiste?',
        'upcoming_assignments': 'Próximas Tareas',
        'no_assignments': 'No hay tareas pendientes.',
        'no_history': 'Aún no se ha registrado historial.',
        'no_files': 'Aún no se han subido archivos.',
        'no_notes': 'Aún no hay notas.',
        'no_notices': 'Aún no hay avisos fijados.',
        'no_habits': 'Aún no hay hábitos. ¡Añade uno arriba!',
        'no_items': 'No hay elementos.',
        'add_habit': 'Añadir Hábito',
        'add_note': 'Añadir Nota',
        'add_notice': 'Añadir Aviso',
        'delete_all': 'Eliminar Todo',
        'complete': 'Completar',
        'done': 'Hecho',
        'ai_tools': 'Herramientas IA',
        'ai_subtitle': 'Asistentes de IA seleccionados + resumidor de texto integrado.',
        'studyhub_ai': 'StudyHub IA',
        'recommend_title': '¿No estás seguro de qué IA usar?',
        'recommend_text': 'Dime en qué estás trabajando.',
        'recommend_button': 'Recomendar',
        'recommend_placeholder': 'ej. resolver cálculo, escribir código...',
        'summarizer_title': 'Resumidor IA',
        'summarizer_desc': 'Pega cualquier texto y obtén un resumen conciso (funciona sin conexión).',
        'summarize_button': 'Resumir',
        'summarize_placeholder': 'Pega tu texto aquí...',
        'social_blocked': 'Redes Sociales Bloqueadas',
        'social_blocked_desc': 'Para mantenerte enfocado, todas las redes sociales (excepto YouTube) están bloqueadas mientras usas StudyHub.',
        'files': 'Archivos',
        'files_subtitle': 'Sube, visualiza y gestiona tus archivos de estudio. Todos se almacenan localmente en tu navegador.',
        'upload_drop': 'Arrastra y suelta archivos aquí, o haz clic para buscar',
        'delete_all_files': 'Eliminar Todos los Archivos',
        'uploaded_files': 'Archivos Subidos',
        'habits': 'Hábitos',
        'habits_subtitle': 'Crea rutinas diarias. ¡Completa tareas y mira crecer tu racha!',
        'habit_placeholder': '✍️ Nuevo hábito (ej. Leer 30 min)',
        'your_habits': 'Tus Hábitos',
        'current_streak': 'Racha Actual',
        'longest_streak': 'Racha más larga',
        'days': 'días',
        'notice': 'Avisos',
        'notice_subtitle': 'Fija anuncios importantes o recordatorios para tu grupo de estudio.',
        'notice_placeholder': '✍️ Escribe un aviso...',
        'pinboard': 'Tablero de Avisos',
        'notices_count': 'avisos',
        'notes': 'Notas',
        'notes_subtitle': 'Apunta ideas rápidas, apuntes de clase o tareas pendientes.',
        'note_placeholder': '✍️ Escribe una nota...',
        'your_notes': 'Tus Notas',
        'assignments': 'Tareas',
        'assignments_subtitle': 'Gestiona plazos, prioridades y etiquetas.',
        'assign_title': 'Título',
        'assign_subject': 'Asignatura',
        'assign_tags': 'Etiquetas (coma)',
        'priority_high': 'Alta',
        'priority_medium': 'Media',
        'priority_low': 'Baja',
        'add': 'Añadir',
        'all_assignments': 'Todas las Tareas',
        'planner': 'Planificador',
        'planner_subtitle': 'Haz clic en cualquier celda para planificar tu asignatura para ese día y hora.',
        'flashcards': 'Tarjetas de Estudio',
        'flashcards_subtitle': 'Repetición espaciada: revisa las tarjetas pendientes regularmente.',
        'new_deck': 'Nuevo Mazo',
        'click_to_flip': 'Haz clic en la tarjeta para darle la vuelta.',
        'rate_difficulty': 'Califica la dificultad:',
        'hard': 'Difícil',
        'medium': 'Medio',
        'easy': 'Fácil',
        'reading': 'Lista de Lectura',
        'reading_subtitle': 'Guarda artículos, tutoriales y recursos.',
        'read_title': 'Título',
        'read_url': 'URL',
        'read_subject': 'Asignatura',
        'read_tags': 'Etiquetas (coma)',
        'my_reading': 'Mi Lectura',
        'switch_analog': 'Cambiar a Analógico',
        'today': 'Hoy',
        'entries': 'entradas',
        'entry': 'entrada',
        'quick_search': 'Búsqueda Rápida',
        'focus_off': 'Enfoque Desactivado',
        'sign_out': 'Cerrar sesión',
        'open_history': 'Abrir historial',
        'focus_on': 'Enfoque Activado',
        'allowed': 'Permitido',
        'math_tag': 'Matemáticas',
        'coding_tag': 'Programación',
        'writing_tag': 'Escritura',
        'research_tag': 'Investigación',
        'data_tag': 'Datos',
        'design_tag': 'Diseño',
        'language_tag': 'Idioma',
        'productivity_tag': 'Productividad',
        'stem_tag': 'STEM',
        'deepseek_desc': 'Solucionador de matemáticas avanzado.',
        'cursor_desc': 'Editor de código con IA.',
        'chatgpt_desc': 'Asistente de escritura versátil.',
        'perplexity_desc': 'Investigación con IA.',
        'claude_desc': 'Análisis de datos y razonamiento.',
        'midjourney_desc': 'Generación de imágenes con IA.',
        'duolingo_desc': 'Aprendizaje de idiomas con IA.',
        'notion_desc': 'Productividad con IA.',
        'wolfram_desc': 'Motor computacional STEM.',
        'canva_desc': 'Diseño con IA para presentaciones, carteles y redes sociales.',
        'youtube_desc': 'Vídeos educativos, tutoriales y conferencias.',
    },
    zh: {
        'dash_title': '仪表盘',
        'dash_subtitle': '一站式学习中心：今日进度与全部历史记录。',
        'stat_searches': '今日搜索',
        'stat_files': '已上传文件',
        'stat_tasks': '今日完成任务',
        'stat_streak': '最长连续天数',
        'stat_pomodoros': '今日番茄钟',
        'all_history': '全部历史',
        'delete_all': '删除全部历史',
        'search_placeholder': '你在找什么？',
        'search_button': '搜索',
        'search_tip': '所有搜索都会记录在你的历史中。',
        'show_keyboard': '显示键盘',
        'hide_keyboard': '隐藏键盘',
        'task_timer': '任务计时器',
        'start': '开始',
        'stop': '停止',
        'reset': '重置',
        'completed_today': '今日已完成',
        'daily_reflection': '每日反思',
        'journal_placeholder': '你的学习情况如何？学到了什么？',
        'upcoming_assignments': '即将到来的任务',
        'no_assignments': '暂无待办任务。',
        'no_history': '暂无历史记录。',
        'no_files': '尚未上传文件。',
        'no_notes': '暂无笔记。',
        'no_notices': '暂无公告。',
        'no_habits': '暂无习惯。请在上方添加！',
        'no_items': '暂无项目。',
        'add_habit': '添加习惯',
        'add_note': '添加笔记',
        'add_notice': '添加公告',
        'delete_all': '全部删除',
        'complete': '完成',
        'done': '已完成',
        'ai_tools': 'AI 工具',
        'ai_subtitle': '精选 AI 助手 + 内置文本摘要。',
        'studyhub_ai': 'StudyHub AI',
        'recommend_title': '不确定用哪个 AI？',
        'recommend_text': '告诉我你在做什么。',
        'recommend_button': '推荐',
        'recommend_placeholder': '例如：解微积分、写代码……',
        'summarizer_title': 'AI 摘要',
        'summarizer_desc': '粘贴任何文本，获取简洁摘要（离线可用）。',
        'summarize_button': '摘要',
        'summarize_placeholder': '在此粘贴文本……',
        'social_blocked': '社交媒体已屏蔽',
        'social_blocked_desc': '为了保持专注，使用 StudyHub 时屏蔽所有社交媒体（YouTube 除外）。',
        'files': '文件',
        'files_subtitle': '上传、查看和管理学习文件。所有文件都存储在本地浏览器中。',
        'upload_drop': '拖放文件到此处，或点击浏览',
        'delete_all_files': '删除所有文件',
        'uploaded_files': '已上传文件',
        'habits': '习惯',
        'habits_subtitle': '建立日常习惯。完成任务，见证你的连续记录！',
        'habit_placeholder': '✍️ 新习惯（例如：阅读 30 分钟）',
        'your_habits': '你的习惯',
        'current_streak': '当前连续天数',
        'longest_streak': '最长连续天数',
        'days': '天',
        'notice': '公告',
        'notice_subtitle': '为学习小组固定重要通知或提醒。',
        'notice_placeholder': '✍️ 写一条公告……',
        'pinboard': '公告板',
        'notices_count': '公告',
        'notes': '笔记',
        'notes_subtitle': '快速记录想法、课堂笔记或待办事项。',
        'note_placeholder': '✍️ 写一条笔记……',
        'your_notes': '你的笔记',
        'assignments': '作业',
        'assignments_subtitle': '管理截止日期、优先级和标签。',
        'assign_title': '标题',
        'assign_subject': '科目',
        'assign_tags': '标签（逗号分隔）',
        'priority_high': '高',
        'priority_medium': '中',
        'priority_low': '低',
        'add': '添加',
        'all_assignments': '全部作业',
        'planner': '计划表',
        'planner_subtitle': '点击任意格子，规划该日该时段的学习科目。',
        'flashcards': '闪卡',
        'flashcards_subtitle': '间隔重复, 定期复习到期卡片。',
        'new_deck': '新建牌组',
        'click_to_flip': '点击卡片翻转。',
        'rate_difficulty': '评价难度：',
        'hard': '困难',
        'medium': '中等',
        'easy': '容易',
        'reading': '阅读列表',
        'reading_subtitle': '保存文章、教程和资源。',
        'read_title': '标题',
        'read_url': '链接',
        'read_subject': '科目',
        'read_tags': '标签（逗号）',
        'my_reading': '我的阅读',
        'switch_analog': '切换到模拟时钟',
        'today': '今日',
        'entries': '条目',
        'entry': '条记录',
        'quick_search': '快速搜索',
        'focus_off': '专注关闭',
        'sign_out': '退出登录',
        'open_history': '打开历史记录',
        'focus_on': '专注开启',
        'allowed': '允许',
        'math_tag': '数学',
        'coding_tag': '编程',
        'writing_tag': '写作',
        'research_tag': '研究',
        'data_tag': '数据',
        'design_tag': '设计',
        'language_tag': '语言',
        'productivity_tag': '生产力',
        'stem_tag': 'STEM',
        'deepseek_desc': '高级数学求解器。',
        'cursor_desc': 'AI 代码编辑器。',
        'chatgpt_desc': '多功能写作助手。',
        'perplexity_desc': 'AI 驱动的研究工具。',
        'claude_desc': '数据分析与推理。',
        'midjourney_desc': 'AI 图像生成。',
        'duolingo_desc': 'AI 驱动语言学习。',
        'notion_desc': 'AI 驱动的生产力工具。',
        'wolfram_desc': 'STEM 计算引擎。',
        'canva_desc': 'AI 驱动的设计工具，用于演示文稿、海报和社交媒体。',
        'youtube_desc': '教育视频、教程和讲座。',
    },
    hi: {
        'dash_title': 'डैशबोर्ड',
        'dash_subtitle': 'आपका अध्ययन केंद्र: आज की प्रगति और पूरी इतिहास।',
        'stat_searches': 'आज की खोजें',
        'stat_files': 'अपलोड की गई फ़ाइलें',
        'stat_tasks': 'आज पूर्ण किए गए कार्य',
        'stat_streak': 'सबसे लंबी स्ट्रीक',
        'stat_pomodoros': 'आज के पोमोडोरो',
        'all_history': 'सभी इतिहास',
        'delete_all': 'सभी इतिहास हटाएं',
        'search_placeholder': 'आप क्या खोज रहे हैं?',
        'search_button': 'खोजें',
        'search_tip': 'सभी खोजें आपके इतिहास में सहेजी जाती हैं।',
        'show_keyboard': 'कीबोर्ड दिखाएँ',
        'hide_keyboard': 'कीबोर्ड छिपाएँ',
        'task_timer': 'कार्य टाइमर',
        'start': 'शुरू करें',
        'stop': 'रोकें',
        'reset': 'रीसेट करें',
        'completed_today': 'आज पूर्ण किए गए',
        'daily_reflection': 'दैनिक चिंतन',
        'journal_placeholder': 'आपका अध्ययन सत्र कैसा रहा? आपने क्या सीखा?',
        'upcoming_assignments': 'आगामी कार्य',
        'no_assignments': 'कोई लंबित कार्य नहीं।',
        'no_history': 'अभी तक कोई इतिहास दर्ज नहीं।',
        'no_files': 'अभी तक कोई फ़ाइल अपलोड नहीं।',
        'no_notes': 'अभी तक कोई नोट नहीं।',
        'no_notices': 'अभी तक कोई सूचना पिन नहीं।',
        'no_habits': 'अभी तक कोई आदत नहीं। ऊपर एक जोड़ें!',
        'no_items': 'कोई आइटम नहीं।',
        'add_habit': 'आदत जोड़ें',
        'add_note': 'नोट जोड़ें',
        'add_notice': 'सूचना जोड़ें',
        'delete_all': 'सभी हटाएं',
        'complete': 'पूरा करें',
        'done': 'हो गया',
        'ai_tools': 'AI उपकरण',
        'ai_subtitle': 'चयनित AI सहायक + अंतर्निहित टेक्स्ट सारांशकर्ता।',
        'studyhub_ai': 'StudyHub AI',
        'recommend_title': 'निश्चित नहीं कि कौन सा AI उपयोग करें?',
        'recommend_text': 'मुझे बताएं कि आप किस पर काम कर रहे हैं।',
        'recommend_button': 'सुझाव दें',
        'recommend_placeholder': 'जैसे: कैलकुलस हल करें, कोड लिखें...',
        'summarizer_title': 'AI सारांशकर्ता',
        'summarizer_desc': 'कोई भी टेक्स्ट पेस्ट करें और संक्षिप्त सारांश प्राप्त करें (ऑफ़लाइन काम करता है)।',
        'summarize_button': 'सारांशित करें',
        'summarize_placeholder': 'अपना टेक्स्ट यहाँ पेस्ट करें...',
        'social_blocked': 'सोशल मीडिया अवरुद्ध',
        'social_blocked_desc': 'केंद्रित रहने के लिए, StudyHub का उपयोग करते समय सभी सोशल मीडिया प्लेटफॉर्म (YouTube को छोड़कर) अवरुद्ध हैं।',
        'files': 'फ़ाइलें',
        'files_subtitle': 'अपनी अध्ययन फ़ाइलें अपलोड करें, देखें और प्रबंधित करें। सभी फ़ाइलें आपके ब्राउज़र में स्थानीय रूप से संग्रहीत होती हैं।',
        'upload_drop': 'फ़ाइलें यहाँ खींचें और छोड़ें, या ब्राउज़ करने के लिए क्लिक करें',
        'delete_all_files': 'सभी फ़ाइलें हटाएं',
        'uploaded_files': 'अपलोड की गई फ़ाइलें',
        'habits': 'आदतें',
        'habits_subtitle': 'दैनिक दिनचर्या बनाएं। कार्य पूर्ण करें और अपनी स्ट्रीक बढ़ते देखें!',
        'habit_placeholder': '✍️ नई आदत (जैसे: 30 मिनट पढ़ें)',
        'your_habits': 'आपकी आदतें',
        'current_streak': 'वर्तमान स्ट्रीक',
        'longest_streak': 'सबसे लंबी स्ट्रीक',
        'days': 'दिन',
        'notice': 'सूचना',
        'notice_subtitle': 'अपने अध्ययन समूह के लिए महत्वपूर्ण घोषणाएँ या अनुस्मारक पिन करें।',
        'notice_placeholder': '✍️ एक सूचना लिखें...',
        'pinboard': 'पिनबोर्ड',
        'notices_count': 'सूचनाएँ',
        'notes': 'नोट्स',
        'notes_subtitle': 'त्वरित विचार, व्याख्यान नोट्स या कार्य लिखें।',
        'note_placeholder': '✍️ एक नोट लिखें...',
        'your_notes': 'आपके नोट्स',
        'assignments': 'कार्य',
        'assignments_subtitle': 'समयसीमा, प्राथमिकताएँ और टैग प्रबंधित करें।',
        'assign_title': 'शीर्षक',
        'assign_subject': 'विषय',
        'assign_tags': 'टैग (अल्पविराम से)',
        'priority_high': 'उच्च',
        'priority_medium': 'मध्यम',
        'priority_low': 'निम्न',
        'add': 'जोड़ें',
        'all_assignments': 'सभी कार्य',
        'planner': 'योजनाकार',
        'planner_subtitle': 'किसी भी सेल पर क्लिक करें और उस दिन और समय के लिए अपना विषय योजना बनाएं।',
        'flashcards': 'फ्लैशकार्ड',
        'flashcards_subtitle': 'अंतराल पुनरावृत्ति, नियमित रूप से देय कार्ड की समीक्षा करें।',
        'new_deck': 'नया डेक',
        'click_to_flip': 'कार्ड को पलटने के लिए क्लिक करें।',
        'rate_difficulty': 'कठिनाई रेट करें:',
        'hard': 'कठिन',
        'medium': 'मध्यम',
        'easy': 'आसान',
        'reading': 'रीडिंग लिस्ट',
        'reading_subtitle': 'लेख, ट्यूटोरियल और संसाधन सहेजें।',
        'read_title': 'शीर्षक',
        'read_url': 'URL',
        'read_subject': 'विषय',
        'read_tags': 'टैग (अल्पविराम से)',
        'my_reading': 'मेरी रीडिंग',
        'switch_analog': 'एनालॉग पर स्विच करें',
        'today': 'आज',
        'entries': 'प्रविष्टियाँ',
        'entry': 'प्रविष्टि',
        'quick_search': 'त्वरित खोज',
        'focus_off': 'फोकस बंद',
        'sign_out': 'साइन आउट',
        'open_history': 'इतिहास खोलें',
        'focus_on': 'फोकस चालू',
        'allowed': 'अनुमत',
        'math_tag': 'गणित',
        'coding_tag': 'कोडिंग',
        'writing_tag': 'लेखन',
        'research_tag': 'अनुसंधान',
        'data_tag': 'डेटा',
        'design_tag': 'डिज़ाइन',
        'language_tag': 'भाषा',
        'productivity_tag': 'उत्पादकता',
        'stem_tag': 'STEM',
        'deepseek_desc': 'उन्नत गणित सॉल्वर।',
        'cursor_desc': 'AI-संचालित कोड संपादक।',
        'chatgpt_desc': 'बहुमुखी लेखन सहायक।',
        'perplexity_desc': 'AI-संचालित अनुसंधान।',
        'claude_desc': 'डेटा विश्लेषण और तर्क।',
        'midjourney_desc': 'AI छवि निर्माण।',
        'duolingo_desc': 'AI-संचालित भाषा सीखना।',
        'notion_desc': 'AI-संचालित उत्पादकता।',
        'wolfram_desc': 'कम्प्यूटेशनल STEM इंजन।',
        'canva_desc': 'प्रस्तुतियों, पोस्टरों और सोशल मीडिया के लिए AI-संचालित डिज़ाइन।',
        'youtube_desc': 'शैक्षिक वीडियो, ट्यूटोरियल और व्याख्यान।',
    },
    ar: {
        'dash_title': 'لوحة التحكم',
        'dash_subtitle': 'مركز دراستك بنظرة سريعة: تقدم اليوم والتاريخ الكامل.',
        'stat_searches': 'عمليات البحث اليوم',
        'stat_files': 'الملفات المرفوعة',
        'stat_tasks': 'المهام المكتملة اليوم',
        'stat_streak': 'أطول سلسلة متتالية',
        'stat_pomodoros': 'بومودورو اليوم',
        'all_history': 'كل التاريخ',
        'delete_all': 'حذف كل التاريخ',
        'search_placeholder': 'ما الذي تبحث عنه؟',
        'search_button': 'بحث',
        'search_tip': 'يتم تسجيل جميع عمليات البحث في تاريخك.',
        'show_keyboard': 'إظهار لوحة المفاتيح',
        'hide_keyboard': 'إخفاء لوحة المفاتيح',
        'task_timer': 'مؤقت المهام',
        'start': 'ابدأ',
        'stop': 'إيقاف',
        'reset': 'إعادة ضبط',
        'completed_today': 'مكتمل اليوم',
        'daily_reflection': 'تأمل يومي',
        'journal_placeholder': 'كيف كانت جلسة دراستك؟ ماذا تعلمت؟',
        'upcoming_assignments': 'الواجبات القادمة',
        'no_assignments': 'لا توجد واجبات معلقة.',
        'no_history': 'لم يتم تسجيل أي تاريخ حتى الآن.',
        'no_files': 'لم يتم رفع أي ملفات حتى الآن.',
        'no_notes': 'لا توجد ملاحظات حتى الآن.',
        'no_notices': 'لا توجد إشعارات مثبتة حتى الآن.',
        'no_habits': 'لا توجد عادات حتى الآن. أضف واحدة أعلاه!',
        'no_items': 'لا توجد عناصر.',
        'add_habit': 'إضافة عادة',
        'add_note': 'إضافة ملاحظة',
        'add_notice': 'إضافة إشعار',
        'delete_all': 'حذف الكل',
        'complete': 'إكمال',
        'done': 'تم',
        'ai_tools': 'أدوات الذكاء الاصطناعي',
        'ai_subtitle': 'مساعدون بالذكاء الاصطناعي + ملخص نصوص مدمج.',
        'studyhub_ai': 'ذكاء StudyHub',
        'recommend_title': 'لست متأكداً من أي أداة ذكاء اصطناعي تستخدم؟',
        'recommend_text': 'أخبرني ما الذي تعمل عليه.',
        'recommend_button': 'توصية',
        'recommend_placeholder': 'مثال: حل التفاضل والتكامل، كتابة كود...',
        'summarizer_title': 'ملخص الذكاء الاصطناعي',
        'summarizer_desc': 'الصق أي نص واحصل على ملخص موجز (يعمل دون اتصال).',
        'summarize_button': 'تلخيص',
        'summarize_placeholder': 'الصق نصك هنا...',
        'social_blocked': 'وسائل التواصل الاجتماعي محظورة',
        'social_blocked_desc': 'للحفاظ على تركيزك، جميع منصات التواصل الاجتماعي (باستثناء يوتيوب) محظورة أثناء استخدام StudyHub.',
        'files': 'الملفات',
        'files_subtitle': 'رفع وعرض وإدارة ملفات دراستك. يتم تخزين جميع الملفات محلياً في متصفحك.',
        'upload_drop': 'اسحب وأفلت الملفات هنا، أو انقر للتصفح',
        'delete_all_files': 'حذف جميع الملفات',
        'uploaded_files': 'الملفات المرفوعة',
        'habits': 'العادات',
        'habits_subtitle': 'ابنِ روتيناً يومياً. أكمل المهام وشاهد سلسلتك تنمو!',
        'habit_placeholder': '✍️ عادة جديدة (مثال: اقرأ 30 دقيقة)',
        'your_habits': 'عاداتك',
        'current_streak': 'السلسلة الحالية',
        'longest_streak': 'أطول سلسلة',
        'days': 'أيام',
        'notice': 'إشعارات',
        'notice_subtitle': 'ثبت إعلانات مهمة أو تذكيرات لمجموعة دراستك.',
        'notice_placeholder': '✍️ اكتب إشعاراً...',
        'pinboard': 'لوحة التثبيت',
        'notices_count': 'إشعارات',
        'notes': 'ملاحظات',
        'notes_subtitle': 'دوّن أفكاراً سريعة، ملاحظات محاضرة، أو مهام.',
        'note_placeholder': '✍️ اكتب ملاحظة...',
        'your_notes': 'ملاحظاتك',
        'assignments': 'الواجبات',
        'assignments_subtitle': 'إدارة المواعيد النهائية والأولويات والعلامات.',
        'assign_title': 'العنوان',
        'assign_subject': 'المادة',
        'assign_tags': 'العلامات (بفاصلة)',
        'priority_high': 'عالي',
        'priority_medium': 'متوسط',
        'priority_low': 'منخفض',
        'add': 'إضافة',
        'all_assignments': 'جميع الواجبات',
        'planner': 'المخطط',
        'planner_subtitle': 'انقر على أي خلية لتخطيط مادتك لذلك اليوم والوقت.',
        'flashcards': 'البطاقات التعليمية',
        'flashcards_subtitle': 'تكرار متباعد, راجع البطاقات المستحقة بانتظام.',
        'new_deck': 'مجموعة جديدة',
        'click_to_flip': 'انقر على البطاقة لقلبها.',
        'rate_difficulty': 'قيم الصعوبة:',
        'hard': 'صعب',
        'medium': 'متوسط',
        'easy': 'سهل',
        'reading': 'قائمة القراءة',
        'reading_subtitle': 'احفظ المقالات والدروس والموارد.',
        'read_title': 'العنوان',
        'read_url': 'الرابط',
        'read_subject': 'المادة',
        'read_tags': 'العلامات (بفاصلة)',
        'my_reading': 'قراءاتي',
        'switch_analog': 'التبديل إلى التناظري',
        'today': 'اليوم',
        'entries': 'إدخالات',
        'entry': 'إدخال',
        'quick_search': 'بحث سريع',
        'focus_off': 'إيقاف التركيز',
        'sign_out': 'تسجيل الخروج',
        'open_history': 'فتح السجل',
        'focus_on': 'تشغيل التركيز',
        'allowed': 'مسموح',
        'math_tag': 'رياضيات',
        'coding_tag': 'برمجة',
        'writing_tag': 'كتابة',
        'research_tag': 'بحث',
        'data_tag': 'بيانات',
        'design_tag': 'تصميم',
        'language_tag': 'لغة',
        'productivity_tag': 'إنتاجية',
        'stem_tag': 'STEM',
        'deepseek_desc': 'حلّال رياضيات متقدم.',
        'cursor_desc': 'محرر كود مدعوم بالذكاء الاصطناعي.',
        'chatgpt_desc': 'مساعد كتابة متعدد الاستخدامات.',
        'perplexity_desc': 'بحث مدعوم بالذكاء الاصطناعي.',
        'claude_desc': 'تحليل البيانات والاستدلال.',
        'midjourney_desc': 'توليد صور بالذكاء الاصطناعي.',
        'duolingo_desc': 'تعلم لغة مدعوم بالذكاء الاصطناعي.',
        'notion_desc': 'إنتاجية مدعومة بالذكاء الاصطناعي.',
        'wolfram_desc': 'محرك حسابي STEM.',
        'canva_desc': 'تصميم مدعوم بالذكاء الاصطناعي للعروض التقديمية والملصقات ووسائل التواصل الاجتماعي.',
        'youtube_desc': 'فيديوهات تعليمية ودروس ومحاضرات.',
    },
    fr: {
        'dash_title': 'Tableau de bord',
        'dash_subtitle': 'Votre centre d\'études en un coup d\'œil: progrès du jour et historique complet.',
        'stat_searches': 'Recherches aujourd\'hui',
        'stat_files': 'Fichiers téléchargés',
        'stat_tasks': 'Tâches terminées aujourd\'hui',
        'stat_streak': 'Plus longue série',
        'stat_pomodoros': 'Pomodoros aujourd\'hui',
        'all_history': 'Tout l\'historique',
        'delete_all': 'Supprimer tout l\'historique',
        'search_placeholder': 'Que cherchez-vous ?',
        'search_button': 'Rechercher',
        'search_tip': 'Toutes les recherches sont enregistrées dans votre historique.',
        'show_keyboard': 'Afficher le clavier',
        'hide_keyboard': 'Masquer le clavier',
        'task_timer': 'Minuteur de tâches',
        'start': 'Démarrer',
        'stop': 'Arrêter',
        'reset': 'Réinitialiser',
        'completed_today': 'Terminé aujourd\'hui',
        'daily_reflection': 'Réflexion quotidienne',
        'journal_placeholder': 'Comment s\'est passée votre séance d\'étude ? Qu\'avez-vous appris ?',
        'upcoming_assignments': 'Devoirs à venir',
        'no_assignments': 'Aucun devoir en attente.',
        'no_history': 'Aucun historique enregistré.',
        'no_files': 'Aucun fichier téléchargé.',
        'no_notes': 'Aucune note.',
        'no_notices': 'Aucune notification épinglée.',
        'no_habits': 'Aucune habitude. Ajoutez-en une ci-dessus !',
        'no_items': 'Aucun élément.',
        'add_habit': 'Ajouter une habitude',
        'add_note': 'Ajouter une note',
        'add_notice': 'Ajouter une notification',
        'delete_all': 'Tout supprimer',
        'complete': 'Terminer',
        'done': 'Fait',
        'ai_tools': 'Outils IA',
        'ai_subtitle': 'Assistants IA sélectionnés + résumeur de texte intégré.',
        'studyhub_ai': 'StudyHub IA',
        'recommend_title': 'Vous ne savez pas quelle IA utiliser ?',
        'recommend_text': 'Dites-moi sur quoi vous travaillez.',
        'recommend_button': 'Recommander',
        'recommend_placeholder': 'ex. résoudre un calcul, écrire du code...',
        'summarizer_title': 'Résumeur IA',
        'summarizer_desc': 'Collez n\'importe quel texte et obtenez un résumé concis (fonctionne hors ligne).',
        'summarize_button': 'Résumer',
        'summarize_placeholder': 'Collez votre texte ici...',
        'social_blocked': 'Réseaux sociaux bloqués',
        'social_blocked_desc': 'Pour rester concentré, toutes les plateformes de médias sociaux (sauf YouTube) sont bloquées lors de l\'utilisation de StudyHub.',
        'files': 'Fichiers',
        'files_subtitle': 'Téléchargez, visualisez et gérez vos fichiers d\'étude. Tous les fichiers sont stockés localement dans votre navigateur.',
        'upload_drop': 'Glissez-déposez des fichiers ici, ou cliquez pour parcourir',
        'delete_all_files': 'Supprimer tous les fichiers',
        'uploaded_files': 'Fichiers téléchargés',
        'habits': 'Habitudes',
        'habits_subtitle': 'Créez des routines quotidiennes. Accomplissez des tâches et regardez votre série s\'allonger !',
        'habit_placeholder': '✍️ Nouvelle habitude (ex. Lire 30 min)',
        'your_habits': 'Vos habitudes',
        'current_streak': 'Série actuelle',
        'longest_streak': 'Plus longue série',
        'days': 'jours',
        'notice': 'Notifications',
        'notice_subtitle': 'Épinglez des annonces importantes ou des rappels pour votre groupe d\'étude.',
        'notice_placeholder': '✍️ Écrivez une notification...',
        'pinboard': 'Tableau d\'épingles',
        'notices_count': 'notifications',
        'notes': 'Notes',
        'notes_subtitle': 'Notez des idées rapides, des notes de cours ou des tâches.',
        'note_placeholder': '✍️ Écrivez une note...',
        'your_notes': 'Vos notes',
        'assignments': 'Devoirs',
        'assignments_subtitle': 'Gérez les délais, les priorités et les étiquettes.',
        'assign_title': 'Titre',
        'assign_subject': 'Matière',
        'assign_tags': 'Étiquettes (séparées par des virgules)',
        'priority_high': 'Élevée',
        'priority_medium': 'Moyenne',
        'priority_low': 'Basse',
        'add': 'Ajouter',
        'all_assignments': 'Tous les devoirs',
        'planner': 'Planificateur',
        'planner_subtitle': 'Cliquez sur n\'importe quelle cellule pour planifier votre matière pour ce jour et cette heure.',
        'flashcards': 'Flashcards',
        'flashcards_subtitle': 'Répétition espacée, révisez régulièrement les cartes dues.',
        'new_deck': 'Nouveau paquet',
        'click_to_flip': 'Cliquez sur la carte pour la retourner.',
        'rate_difficulty': 'Évaluez la difficulté :',
        'hard': 'Difficile',
        'medium': 'Moyen',
        'easy': 'Facile',
        'reading': 'Liste de lecture',
        'reading_subtitle': 'Enregistrez des articles, des tutoriels et des ressources.',
        'read_title': 'Titre',
        'read_url': 'URL',
        'read_subject': 'Matière',
        'read_tags': 'Étiquettes (virgules)',
        'my_reading': 'Mes lectures',
        'switch_analog': 'Passer à l\'analogique',
        'today': 'Aujourd\'hui',
        'entries': 'entrées',
        'entry': 'entrée',
        'quick_search': 'Recherche rapide',
        'focus_off': 'Focus désactivé',
        'sign_out': 'Se déconnecter',
        'open_history': 'Ouvrir l\'historique',
        'focus_on': 'Focus activé',
        'allowed': 'Autorisé',
        'math_tag': 'Maths',
        'coding_tag': 'Programmation',
        'writing_tag': 'Écriture',
        'research_tag': 'Recherche',
        'data_tag': 'Données',
        'design_tag': 'Design',
        'language_tag': 'Langue',
        'productivity_tag': 'Productivité',
        'stem_tag': 'STEM',
        'deepseek_desc': 'Solveur mathématique avancé.',
        'cursor_desc': 'Éditeur de code alimenté par l\'IA.',
        'chatgpt_desc': 'Assistant d\'écriture polyvalent.',
        'perplexity_desc': 'Recherche alimentée par l\'IA.',
        'claude_desc': 'Analyse de données et raisonnement.',
        'midjourney_desc': 'Génération d\'images par IA.',
        'duolingo_desc': 'Apprentissage des langues par IA.',
        'notion_desc': 'Productivité alimentée par l\'IA.',
        'wolfram_desc': 'Moteur de calcul STEM.',
        'canva_desc': 'Conception alimentée par l\'IA pour les présentations, affiches et réseaux sociaux.',
        'youtube_desc': 'Vidéos éducatives, tutoriels et conférences.',
    },
    ru: {
        'dash_title': 'Панель управления',
        'dash_subtitle': 'Ваш учебный центр: прогресс за сегодня и вся история.',
        'stat_searches': 'Поисков сегодня',
        'stat_files': 'Загружено файлов',
        'stat_tasks': 'Задач выполнено сегодня',
        'stat_streak': 'Самая длинная серия',
        'stat_pomodoros': 'Помодоро сегодня',
        'all_history': 'Вся история',
        'delete_all': 'Удалить всю историю',
        'search_placeholder': 'Что вы ищете?',
        'search_button': 'Поиск',
        'search_tip': 'Все поиски сохраняются в вашей истории.',
        'show_keyboard': 'Показать клавиатуру',
        'hide_keyboard': 'Скрыть клавиатуру',
        'task_timer': 'Таймер задач',
        'start': 'Старт',
        'stop': 'Стоп',
        'reset': 'Сброс',
        'completed_today': 'Выполнено сегодня',
        'daily_reflection': 'Ежедневное размышление',
        'journal_placeholder': 'Как прошла ваша учебная сессия? Что вы узнали?',
        'upcoming_assignments': 'Предстоящие задания',
        'no_assignments': 'Нет ожидающих заданий.',
        'no_history': 'История пока пуста.',
        'no_files': 'Файлы пока не загружены.',
        'no_notes': 'Нет заметок.',
        'no_notices': 'Нет закреплённых уведомлений.',
        'no_habits': 'Нет привычек. Добавьте выше!',
        'no_items': 'Нет элементов.',
        'add_habit': 'Добавить привычку',
        'add_note': 'Добавить заметку',
        'add_notice': 'Добавить уведомление',
        'delete_all': 'Удалить всё',
        'complete': 'Завершить',
        'done': 'Готово',
        'ai_tools': 'Инструменты ИИ',
        'ai_subtitle': 'Курируемые ИИ-помощники + встроенный суммаризатор текста.',
        'studyhub_ai': 'StudyHub AI',
        'recommend_title': 'Не знаете, какой ИИ использовать?',
        'recommend_text': 'Скажите, над чем вы работаете.',
        'recommend_button': 'Рекомендовать',
        'recommend_placeholder': 'напр. решить задачу, написать код...',
        'summarizer_title': 'Суммаризатор ИИ',
        'summarizer_desc': 'Вставьте любой текст и получите краткую выжимку (работает офлайн).',
        'summarize_button': 'Суммаризировать',
        'summarize_placeholder': 'Вставьте текст сюда...',
        'social_blocked': 'Социальные сети заблокированы',
        'social_blocked_desc': 'Чтобы сохранять концентрацию, все соцсети (кроме YouTube) заблокированы при использовании StudyHub.',
        'files': 'Файлы',
        'files_subtitle': 'Загружайте, просматривайте и управляйте учебными файлами. Все файлы хранятся локально в вашем браузере.',
        'upload_drop': 'Перетащите файлы сюда или нажмите для выбора',
        'delete_all_files': 'Удалить все файлы',
        'uploaded_files': 'Загруженные файлы',
        'habits': 'Привычки',
        'habits_subtitle': 'Создавайте ежедневные рутины. Выполняйте задачи и следите за ростом серии!',
        'habit_placeholder': '✍️ Новая привычка (напр. Читать 30 мин)',
        'your_habits': 'Ваши привычки',
        'current_streak': 'Текущая серия',
        'longest_streak': 'Самая длинная серия',
        'days': 'дней',
        'notice': 'Уведомления',
        'notice_subtitle': 'Закрепите важные объявления или напоминания для учебной группы.',
        'notice_placeholder': '✍️ Напишите уведомление...',
        'pinboard': 'Доска объявлений',
        'notices_count': 'уведомлений',
        'notes': 'Заметки',
        'notes_subtitle': 'Записывайте быстрые идеи, конспекты или задачи.',
        'note_placeholder': '✍️ Напишите заметку...',
        'your_notes': 'Ваши заметки',
        'assignments': 'Задания',
        'assignments_subtitle': 'Управляйте сроками, приоритетами и тегами.',
        'assign_title': 'Название',
        'assign_subject': 'Предмет',
        'assign_tags': 'Теги (через запятую)',
        'priority_high': 'Высокий',
        'priority_medium': 'Средний',
        'priority_low': 'Низкий',
        'add': 'Добавить',
        'all_assignments': 'Все задания',
        'planner': 'Планировщик',
        'planner_subtitle': 'Нажмите на любую ячейку, чтобы спланировать предмет на этот день и время.',
        'flashcards': 'Карточки',
        'flashcards_subtitle': 'Интервальное повторение, регулярно просматривайте просроченные карточки.',
        'new_deck': 'Новая колода',
        'click_to_flip': 'Нажмите на карточку, чтобы перевернуть.',
        'rate_difficulty': 'Оцените сложность:',
        'hard': 'Сложно',
        'medium': 'Средне',
        'easy': 'Легко',
        'reading': 'Список для чтения',
        'reading_subtitle': 'Сохраняйте статьи, уроки и ресурсы.',
        'read_title': 'Название',
        'read_url': 'URL',
        'read_subject': 'Предмет',
        'read_tags': 'Теги (через запятую)',
        'my_reading': 'Моё чтение',
        'switch_analog': 'Переключить на аналоговые',
        'today': 'Сегодня',
        'entries': 'записей',
        'entry': 'запись',
        'quick_search': 'Быстрый поиск',
        'focus_off': 'Фокус выключен',
        'sign_out': 'Выйти',
        'open_history': 'Открыть историю',
        'focus_on': 'Фокус включён',
        'allowed': 'Разрешено',
        'math_tag': 'Математика',
        'coding_tag': 'Программирование',
        'writing_tag': 'Письмо',
        'research_tag': 'Исследования',
        'data_tag': 'Данные',
        'design_tag': 'Дизайн',
        'language_tag': 'Язык',
        'productivity_tag': 'Продуктивность',
        'stem_tag': 'STEM',
        'deepseek_desc': 'Продвинутый решатель математики.',
        'cursor_desc': 'Кодовый редактор на ИИ.',
        'chatgpt_desc': 'Универсальный помощник для письма.',
        'perplexity_desc': 'Исследования на основе ИИ.',
        'claude_desc': 'Анализ данных и рассуждения.',
        'midjourney_desc': 'Генерация изображений ИИ.',
        'duolingo_desc': 'Изучение языка на основе ИИ.',
        'notion_desc': 'Продуктивность на основе ИИ.',
        'wolfram_desc': 'Вычислительный движок STEM.',
        'canva_desc': 'Дизайн на основе ИИ для презентаций, плакатов и соцсетей.',
        'youtube_desc': 'Образовательные видео, уроки и лекции.',
    },
    pt: {
        'dash_title': 'Painel de Controle',
        'dash_subtitle': 'Seu centro de estudos num relance: progresso de hoje e histórico completo.',
        'stat_searches': 'Pesquisas Hoje',
        'stat_files': 'Arquivos Carregados',
        'stat_tasks': 'Tarefas Concluídas Hoje',
        'stat_streak': 'Maior Sequência',
        'stat_pomodoros': 'Pomodoros Hoje',
        'all_history': 'Todo o Histórico',
        'delete_all': 'Eliminar Todo o Histórico',
        'search_placeholder': 'O que você está procurando?',
        'search_button': 'Pesquisar',
        'search_tip': 'Todas as pesquisas são registadas no seu histórico.',
        'show_keyboard': 'Mostrar Teclado',
        'hide_keyboard': 'Ocultar Teclado',
        'task_timer': 'Temporizador de Tarefas',
        'start': 'Iniciar',
        'stop': 'Parar',
        'reset': 'Reiniciar',
        'completed_today': 'Concluído hoje',
        'daily_reflection': 'Reflexão Diária',
        'journal_placeholder': 'Como correu a sua sessão de estudo? O que aprendeu?',
        'upcoming_assignments': 'Trabalhos Futuros',
        'no_assignments': 'Nenhum trabalho pendente.',
        'no_history': 'Nenhum histórico registado ainda.',
        'no_files': 'Nenhum arquivo carregado ainda.',
        'no_notes': 'Nenhuma nota ainda.',
        'no_notices': 'Nenhum aviso fixado ainda.',
        'no_habits': 'Nenhum hábito ainda. Adicione um acima!',
        'no_items': 'Nenhum item.',
        'add_habit': 'Adicionar Hábito',
        'add_note': 'Adicionar Nota',
        'add_notice': 'Adicionar Aviso',
        'delete_all': 'Eliminar Tudo',
        'complete': 'Concluir',
        'done': 'Feito',
        'ai_tools': 'Ferramentas IA',
        'ai_subtitle': 'Assistentes de IA selecionados + resumidor de texto integrado.',
        'studyhub_ai': 'StudyHub IA',
        'recommend_title': 'Não sabe qual IA usar?',
        'recommend_text': 'Diga-me em que está a trabalhar.',
        'recommend_button': 'Recomendar',
        'recommend_placeholder': 'ex. resolver cálculo, escrever código...',
        'summarizer_title': 'Resumidor IA',
        'summarizer_desc': 'Cole qualquer texto e obtenha um resumo conciso (funciona offline).',
        'summarize_button': 'Resumir',
        'summarize_placeholder': 'Cole o seu texto aqui...',
        'social_blocked': 'Redes Sociais Bloqueadas',
        'social_blocked_desc': 'Para manter o foco, todas as plataformas de redes sociais (exceto YouTube) estão bloqueadas durante o uso do StudyHub.',
        'files': 'Arquivos',
        'files_subtitle': 'Carregue, visualize e gerencie seus arquivos de estudo. Todos os arquivos são armazenados localmente no seu navegador.',
        'upload_drop': 'Arraste e solte arquivos aqui, ou clique para procurar',
        'delete_all_files': 'Eliminar Todos os Arquivos',
        'uploaded_files': 'Arquivos Carregados',
        'habits': 'Hábitos',
        'habits_subtitle': 'Crie rotinas diárias. Conclua tarefas e veja sua sequência crescer!',
        'habit_placeholder': '✍️ Novo hábito (ex. Ler 30 min)',
        'your_habits': 'Seus Hábitos',
        'current_streak': 'Sequência Atual',
        'longest_streak': 'Sequência mais longa',
        'days': 'dias',
        'notice': 'Avisos',
        'notice_subtitle': 'Fixe anúncios importantes ou lembretes para o seu grupo de estudo.',
        'notice_placeholder': '✍️ Escreva um aviso...',
        'pinboard': 'Quadro de Avisos',
        'notices_count': 'avisos',
        'notes': 'Notas',
        'notes_subtitle': 'Anote ideias rápidas, notas de aula ou tarefas.',
        'note_placeholder': '✍️ Escreva uma nota...',
        'your_notes': 'Suas Notas',
        'assignments': 'Trabalhos',
        'assignments_subtitle': 'Gerencie prazos, prioridades e etiquetas.',
        'assign_title': 'Título',
        'assign_subject': 'Disciplina',
        'assign_tags': 'Etiquetas (vírgula)',
        'priority_high': 'Alta',
        'priority_medium': 'Média',
        'priority_low': 'Baixa',
        'add': 'Adicionar',
        'all_assignments': 'Todos os Trabalhos',
        'planner': 'Planejador',
        'planner_subtitle': 'Clique em qualquer célula para planejar sua disciplina para aquele dia e hora.',
        'flashcards': 'Flashcards',
        'flashcards_subtitle': 'Repetição espaçada, revise os cartões vencidos regularmente.',
        'new_deck': 'Novo Baralho',
        'click_to_flip': 'Clique no cartão para virar.',
        'rate_difficulty': 'Avalie a dificuldade:',
        'hard': 'Difícil',
        'medium': 'Médio',
        'easy': 'Fácil',
        'reading': 'Lista de Leitura',
        'reading_subtitle': 'Salve artigos, tutoriais e recursos.',
        'read_title': 'Título',
        'read_url': 'URL',
        'read_subject': 'Disciplina',
        'read_tags': 'Etiquetas (vírgula)',
        'my_reading': 'Minha Leitura',
        'switch_analog': 'Mudar para Analógico',
        'today': 'Hoje',
        'entries': 'entradas',
        'entry': 'entrada',
        'quick_search': 'Pesquisa Rápida',
        'focus_off': 'Foco Desligado',
        'sign_out': 'Sair',
        'open_history': 'Abrir histórico',
        'focus_on': 'Foco Ligado',
        'allowed': 'Permitido',
        'math_tag': 'Matemática',
        'coding_tag': 'Programação',
        'writing_tag': 'Escrita',
        'research_tag': 'Pesquisa',
        'data_tag': 'Dados',
        'design_tag': 'Design',
        'language_tag': 'Idioma',
        'productivity_tag': 'Produtividade',
        'stem_tag': 'STEM',
        'deepseek_desc': 'Solucionador matemático avançado.',
        'cursor_desc': 'Editor de código com IA.',
        'chatgpt_desc': 'Assistente de escrita versátil.',
        'perplexity_desc': 'Pesquisa com IA.',
        'claude_desc': 'Análise de dados e raciocínio.',
        'midjourney_desc': 'Geração de imagens com IA.',
        'duolingo_desc': 'Aprendizado de idiomas com IA.',
        'notion_desc': 'Produtividade com IA.',
        'wolfram_desc': 'Motor computacional STEM.',
        'canva_desc': 'Design com IA para apresentações, pôsteres e redes sociais.',
        'youtube_desc': 'Vídeos educativos, tutoriais e palestras.',
    },
    bn: {
        'dash_title': 'ড্যাশবোর্ড',
        'dash_subtitle': 'আপনার স্টাডি হাব: আজকের অগ্রগতি ও সম্পূর্ণ ইতিহাস।',
        'stat_searches': 'আজকের অনুসন্ধান',
        'stat_files': 'আপলোড করা ফাইল',
        'stat_tasks': 'আজকের সম্পন্ন কাজ',
        'stat_streak': 'দীর্ঘতম ধারা',
        'stat_pomodoros': 'আজকের পোমোডোরো',
        'all_history': 'সমস্ত ইতিহাস',
        'delete_all': 'সমস্ত ইতিহাস মুছুন',
        'search_placeholder': 'আপনি কী খুঁজছেন?',
        'search_button': 'অনুসন্ধান',
        'search_tip': 'সমস্ত অনুসন্ধান আপনার ইতিহাসে সংরক্ষিত হয়।',
        'show_keyboard': 'কীবোর্ড দেখান',
        'hide_keyboard': 'কীবোর্ড লুকান',
        'task_timer': 'টাস্ক টাইমার',
        'start': 'শুরু',
        'stop': 'বন্ধ',
        'reset': 'রিসেট',
        'completed_today': 'আজ সম্পন্ন',
        'daily_reflection': 'দৈনিক প্রতিফলন',
        'journal_placeholder': 'আপনার স্টাডি সেশন কেমন ছিল? আপনি কী শিখলেন?',
        'upcoming_assignments': 'আসন্ন অ্যাসাইনমেন্ট',
        'no_assignments': 'কোনো pending অ্যাসাইনমেন্ট নেই।',
        'no_history': 'এখনও কোনো ইতিহাস রেকর্ড করা হয়নি।',
        'no_files': 'এখনও কোনো ফাইল আপলোড করা হয়নি।',
        'no_notes': 'এখনও কোনো নোট নেই।',
        'no_notices': 'এখনও কোনো নোটিশ পিন করা হয়নি।',
        'no_habits': 'এখনও কোনো অভ্যাস নেই। উপরে একটি যোগ করুন!',
        'no_items': 'কোনো আইটেম নেই।',
        'add_habit': 'অভ্যাস যোগ করুন',
        'add_note': 'নোট যোগ করুন',
        'add_notice': 'নোটিশ যোগ করুন',
        'delete_all': 'সব মুছুন',
        'complete': 'সম্পন্ন',
        'done': 'শেষ',
        'ai_tools': 'AI টুলস',
        'ai_subtitle': 'কিউরেটেড AI সহায়ক + বিল্ট-ইন টেক্সট সারাংশকারী।',
        'studyhub_ai': 'স্টাডিহাব AI',
        'recommend_title': 'কোন AI ব্যবহার করবেন নিশ্চিত নন?',
        'recommend_text': 'আপনি কী নিয়ে কাজ করছেন তা বলুন।',
        'recommend_button': 'সুপারিশ',
        'recommend_placeholder': 'যেমন: ক্যালকুলাস সমাধান, কোড লেখা...',
        'summarizer_title': 'AI সারাংশকারী',
        'summarizer_desc': 'যেকোনো টেক্সট পেস্ট করুন এবং একটি সংক্ষিপ্ত সারাংশ পান (অফলাইনে কাজ করে)।',
        'summarize_button': 'সারাংশ',
        'summarize_placeholder': 'আপনার টেক্সট এখানে পেস্ট করুন...',
        'social_blocked': 'সোশ্যাল মিডিয়া ব্লক করা হয়েছে',
        'social_blocked_desc': 'ফোকাস রাখতে, স্টাডিহাব ব্যবহার করার সময় সমস্ত সোশ্যাল মিডিয়া প্ল্যাটফর্ম (YouTube বাদে) ব্লক করা হয়েছে।',
        'files': 'ফাইল',
        'files_subtitle': 'আপনার স্টাডি ফাইল আপলোড, দেখুন এবং পরিচালনা করুন। সমস্ত ফাইল আপনার ব্রাউজারে লোকালি সংরক্ষিত থাকে।',
        'upload_drop': 'ফাইল এখানে টেনে আনুন, বা ব্রাউজ করতে ক্লিক করুন',
        'delete_all_files': 'সব ফাইল মুছুন',
        'uploaded_files': 'আপলোড করা ফাইল',
        'habits': 'অভ্যাস',
        'habits_subtitle': 'দৈনিক রুটিন তৈরি করুন। কাজ সম্পন্ন করুন এবং আপনার ধারা বাড়তে দেখুন!',
        'habit_placeholder': '✍️ নতুন অভ্যাস (যেমন: ৩০ মিনিট পড়া)',
        'your_habits': 'আপনার অভ্যাস',
        'current_streak': 'বর্তমান ধারা',
        'longest_streak': 'দীর্ঘতম ধারা',
        'days': 'দিন',
        'notice': 'নোটিশ',
        'notice_subtitle': 'আপনার স্টাডি গ্রুপের জন্য গুরুত্বপূর্ণ ঘোষণা বা রিমাইন্ডার পিন করুন।',
        'notice_placeholder': '✍️ একটি নোটিশ লিখুন...',
        'pinboard': 'পিনবোর্ড',
        'notices_count': 'নোটিশ',
        'notes': 'নোট',
        'notes_subtitle': 'দ্রুত ধারণা, লেকচার নোট বা কাজ লিখুন।',
        'note_placeholder': '✍️ একটি নোট লিখুন...',
        'your_notes': 'আপনার নোট',
        'assignments': 'অ্যাসাইনমেন্ট',
        'assignments_subtitle': 'সময়সীমা, প্রাধান্য এবং ট্যাগ পরিচালনা করুন।',
        'assign_title': 'শিরোনাম',
        'assign_subject': 'বিষয়',
        'assign_tags': 'ট্যাগ (কমা দিয়ে)',
        'priority_high': 'উচ্চ',
        'priority_medium': 'মধ্যম',
        'priority_low': 'নিম্ন',
        'add': 'যোগ করুন',
        'all_assignments': 'সমস্ত অ্যাসাইনমেন্ট',
        'planner': 'পরিকল্পনাকারী',
        'planner_subtitle': 'যেকোনো সেলে ক্লিক করে সেই দিন ও সময়ের জন্য আপনার বিষয় পরিকল্পনা করুন।',
        'flashcards': 'ফ্ল্যাশকার্ড',
        'flashcards_subtitle': 'ব্যবধান পুনরাবৃত্তি, নিয়মিত বকেয়া কার্ড পর্যালোচনা করুন।',
        'new_deck': 'নতুন ডেক',
        'click_to_flip': 'কার্ড ফ্লিপ করতে ক্লিক করুন।',
        'rate_difficulty': 'কঠিনতা রেট দিন:',
        'hard': 'কঠিন',
        'medium': 'মাঝারি',
        'easy': 'সহজ',
        'reading': 'পাঠ তালিকা',
        'reading_subtitle': 'নিবন্ধ, টিউটোরিয়াল এবং সংস্থান সংরক্ষণ করুন।',
        'read_title': 'শিরোনাম',
        'read_url': 'URL',
        'read_subject': 'বিষয়',
        'read_tags': 'ট্যাগ (কমা)',
        'my_reading': 'আমার পড়া',
        'switch_analog': 'অ্যানালগে স্যুইচ করুন',
        'today': 'আজ',
        'entries': 'এন্ট্রি',
        'entry': 'এন্ট্রি',
        'quick_search': 'দ্রুত অনুসন্ধান',
        'focus_off': 'ফোকাস বন্ধ',
        'sign_out': 'সাইন আউট',
        'open_history': 'ইতিহাস খুলুন',
        'focus_on': 'ফোকাস চালু',
        'allowed': 'অনুমোদিত',
        'math_tag': 'গণিত',
        'coding_tag': 'কোডিং',
        'writing_tag': 'লেখা',
        'research_tag': 'গবেষণা',
        'data_tag': 'ডেটা',
        'design_tag': 'ডিজাইন',
        'language_tag': 'ভাষা',
        'productivity_tag': 'উৎপাদনশীলতা',
        'stem_tag': 'STEM',
        'deepseek_desc': 'উন্নত গণিত সমাধানকারী।',
        'cursor_desc': 'AI-চালিত কোড সম্পাদক।',
        'chatgpt_desc': 'বহুমুখী লেখার সহায়ক।',
        'perplexity_desc': 'AI-চালিত গবেষণা।',
        'claude_desc': 'ডেটা বিশ্লেষণ ও যুক্তি।',
        'midjourney_desc': 'AI ইমেজ জেনারেশন।',
        'duolingo_desc': 'AI-চালিত ভাষা শিক্ষা।',
        'notion_desc': 'AI-চালিত উৎপাদনশীলতা।',
        'wolfram_desc': 'STEM কম্পিউটেশনাল ইঞ্জিন।',
        'canva_desc': 'প্রেজেন্টেশন, পোস্টার এবং সোশ্যাল মিডিয়ার জন্য AI-চালিত ডিজাইন।',
        'youtube_desc': 'শিক্ষামূলক ভিডিও, টিউটোরিয়াল এবং বক্তৃতা।',
    },
    ur: {
        'dash_title': 'ڈیش بورڈ',
        'dash_subtitle': 'آپ کا اسٹڈی ہب: آج کی پیشرفت اور مکمل تاریخ۔',
        'stat_searches': 'آج کی تلاشیں',
        'stat_files': 'اپ لوڈ کردہ فائلیں',
        'stat_tasks': 'آج مکمل ہونے والے کام',
        'stat_streak': 'طویل ترین تسلسل',
        'stat_pomodoros': 'آج کے پوموڈورو',
        'all_history': 'پوری تاریخ',
        'delete_all': 'پوری تاریخ حذف کریں',
        'search_placeholder': 'آپ کیا تلاش کر رہے ہیں؟',
        'search_button': 'تلاش کریں',
        'search_tip': 'تمام تلاشیں آپ کی تاریخ میں محفوظ ہیں۔',
        'show_keyboard': 'کی بورڈ دکھائیں',
        'hide_keyboard': 'کی بورڈ چھپائیں',
        'task_timer': 'ٹاسک ٹائمر',
        'start': 'شروع کریں',
        'stop': 'روکیں',
        'reset': 'ری سیٹ کریں',
        'completed_today': 'آج مکمل ہوا',
        'daily_reflection': 'روزانہ عکاسی',
        'journal_placeholder': 'آپ کا مطالعاتی سیشن کیسا رہا؟ آپ نے کیا سیکھا؟',
        'upcoming_assignments': 'آنے والے اسائنمنٹس',
        'no_assignments': 'کوئی زیر التواء اسائنمنٹ نہیں۔',
        'no_history': 'ابھی تک کوئی تاریخ ریکارڈ نہیں ہوئی۔',
        'no_files': 'ابھی تک کوئی فائل اپ لوڈ نہیں ہوئی۔',
        'no_notes': 'ابھی تک کوئی نوٹ نہیں۔',
        'no_notices': 'ابھی تک کوئی نوٹس پن نہیں کیا گیا۔',
        'no_habits': 'ابھی تک کوئی عادت نہیں۔ اوپر ایک شامل کریں!',
        'no_items': 'کوئی آئٹم نہیں۔',
        'add_habit': 'عادت شامل کریں',
        'add_note': 'نوٹ شامل کریں',
        'add_notice': 'نوٹس شامل کریں',
        'delete_all': 'سب حذف کریں',
        'complete': 'مکمل کریں',
        'done': 'ہو گیا',
        'ai_tools': 'اے آئی ٹولز',
        'ai_subtitle': 'منتخب اے آئی معاونین + بلٹ ان ٹیکسٹ خلاصہ کار۔',
        'studyhub_ai': 'اسٹڈی ہب اے آئی',
        'recommend_title': 'یقین نہیں کہ کون سا اے آئی استعمال کریں؟',
        'recommend_text': 'مجھے بتائیں کہ آپ کس پر کام کر رہے ہیں۔',
        'recommend_button': 'تجویز کریں',
        'recommend_placeholder': 'مثال: کیلکولس حل کریں، کوڈ لکھیں...',
        'summarizer_title': 'اے آئی خلاصہ کار',
        'summarizer_desc': 'کوئی بھی متن چسپاں کریں اور ایک مختصر خلاصہ حاصل کریں (آف لائن کام کرتا ہے)۔',
        'summarize_button': 'خلاصہ کریں',
        'summarize_placeholder': 'اپنا متن یہاں چسپاں کریں...',
        'social_blocked': 'سوشل میڈیا بلاک کر دیا گیا',
        'social_blocked_desc': 'توجہ مرکوز رکھنے کے لیے، اسٹڈی ہب استعمال کرتے وقت تمام سوشل میڈیا پلیٹ فارمز (یوٹیوب کے علاوہ) بلاک ہیں۔',
        'files': 'فائلیں',
        'files_subtitle': 'اپنی مطالعاتی فائلیں اپ لوڈ، دیکھیں اور ان کا نظم کریں۔ تمام فائلیں آپ کے براؤزر میں مقامی طور پر محفوظ ہیں۔',
        'upload_drop': 'فائلیں یہاں گھسیٹیں اور چھوڑیں، یا براؤز کریں',
        'delete_all_files': 'تمام فائلیں حذف کریں',
        'uploaded_files': 'اپ لوڈ کردہ فائلیں',
        'habits': 'عادتیں',
        'habits_subtitle': 'روزانہ کا معمول بنائیں۔ کام مکمل کریں اور اپنا تسلسل بڑھتے دیکھیں!',
        'habit_placeholder': '✍️ نئی عادت (مثال: 30 منٹ پڑھیں)',
        'your_habits': 'آپ کی عادتیں',
        'current_streak': 'موجودہ تسلسل',
        'longest_streak': 'سب سے لمبا تسلسل',
        'days': 'دن',
        'notice': 'نوٹس',
        'notice_subtitle': 'اپنے مطالعاتی گروپ کے لیے اہم اعلانات یا یاد دہانیاں پن کریں۔',
        'notice_placeholder': '✍️ ایک نوٹس لکھیں...',
        'pinboard': 'پن بورڈ',
        'notices_count': 'نوٹس',
        'notes': 'نوٹس (مختصر)',
        'notes_subtitle': 'فوری خیالات، لیکچر نوٹس یا کام لکھیں۔',
        'note_placeholder': '✍️ ایک نوٹ لکھیں...',
        'your_notes': 'آپ کے نوٹس',
        'assignments': 'اسائنمنٹس',
        'assignments_subtitle': 'آخری تاریخ، ترجیحات اور ٹیگز کا نظم کریں۔',
        'assign_title': 'عنوان',
        'assign_subject': 'مضمون',
        'assign_tags': 'ٹیگز (کوما سے)',
        'priority_high': 'اعلی',
        'priority_medium': 'متوسط',
        'priority_low': 'کم',
        'add': 'شامل کریں',
        'all_assignments': 'تمام اسائنمنٹس',
        'planner': 'منصوبہ ساز',
        'planner_subtitle': 'کسی بھی سیل پر کلک کریں اور اس دن اور وقت کے لیے اپنا مضمون منصوبہ بنائیں۔',
        'flashcards': 'فلیش کارڈز',
        'flashcards_subtitle': 'فاصلہ تکرار, باقاعدگی سے واجب الادا کارڈز کا جائزہ لیں۔',
        'new_deck': 'نیا ڈیک',
        'click_to_flip': 'کارڈ پلٹنے کے لیے کلک کریں۔',
        'rate_difficulty': 'مشکل کی شرح:',
        'hard': 'مشکل',
        'medium': 'درمیانہ',
        'easy': 'آسان',
        'reading': 'پڑھنے کی فہرست',
        'reading_subtitle': 'مضامین، ٹیوٹوریلز اور وسائل محفوظ کریں۔',
        'read_title': 'عنوان',
        'read_url': 'URL',
        'read_subject': 'مضمون',
        'read_tags': 'ٹیگز (کوما)',
        'my_reading': 'میری پڑھائی',
        'switch_analog': 'اینالاگ پر سوئچ کریں',
        'today': 'آج',
        'entries': 'اندراجات',
        'entry': 'اندراج',
        'quick_search': 'فوری تلاش',
        'focus_off': 'توجہ بند',
        'sign_out': 'سائن آؤٹ',
        'open_history': 'تاریخ کھولیں',
        'focus_on': 'توجہ آن',
        'allowed': 'اجازت ہے',
        'math_tag': 'ریاضی',
        'coding_tag': 'کوڈنگ',
        'writing_tag': 'تحریر',
        'research_tag': 'تحقیق',
        'data_tag': 'ڈیٹا',
        'design_tag': 'ڈیزائن',
        'language_tag': 'زبان',
        'productivity_tag': 'پیداواریت',
        'stem_tag': 'STEM',
        'deepseek_desc': 'اعلی درجے کا ریاضی حل کرنے والا۔',
        'cursor_desc': 'اے آئی سے چلنے والا کوڈ ایڈیٹر۔',
        'chatgpt_desc': 'ورسٹائل تحریری معاون۔',
        'perplexity_desc': 'اے آئی سے چلنے والی تحقیق۔',
        'claude_desc': 'ڈیٹا تجزیہ اور استدلال۔',
        'midjourney_desc': 'اے آئی امیج جنریشن۔',
        'duolingo_desc': 'اے آئی سے چلنے والی زبان سیکھنا۔',
        'notion_desc': 'اے آئی سے چلنے والی پیداواریت۔',
        'wolfram_desc': 'STEM کمپیوٹیشنل انجن۔',
        'canva_desc': 'پریزنٹیشنز، پوسٹرز اور سوشل میڈیا کے لیے AI سے چلنے والا ڈیزائن۔',
        'youtube_desc': 'تعلیمی ویڈیوز، ٹیوٹوریلز اور لیکچرز۔',
    },
    id: {
        'dash_title': 'Dasbor',
        'dash_subtitle': 'Pusat studi Anda sekilas: kemajuan hari ini & riwayat semua waktu.',
        'stat_searches': 'Pencarian Hari Ini',
        'stat_files': 'File Diunggah',
        'stat_tasks': 'Tugas Selesai Hari Ini',
        'stat_streak': 'Streak Terpanjang',
        'stat_pomodoros': 'Pomodoros Hari Ini',
        'all_history': 'Semua Riwayat',
        'delete_all': 'Hapus Semua Riwayat',
        'search_placeholder': 'Apa yang Anda cari?',
        'search_button': 'Cari',
        'search_tip': 'Semua pencarian dicatat dalam riwayat Anda.',
        'show_keyboard': 'Tampilkan Keyboard',
        'hide_keyboard': 'Sembunyikan Keyboard',
        'task_timer': 'Pengatur Waktu Tugas',
        'start': 'Mulai',
        'stop': 'Berhenti',
        'reset': 'Atur Ulang',
        'completed_today': 'Selesai hari ini',
        'daily_reflection': 'Refleksi Harian',
        'journal_placeholder': 'Bagaimana sesi belajar Anda? Apa yang Anda pelajari?',
        'upcoming_assignments': 'Tugas Mendatang',
        'no_assignments': 'Tidak ada tugas tertunda.',
        'no_history': 'Belum ada riwayat tercatat.',
        'no_files': 'Belum ada file diunggah.',
        'no_notes': 'Belum ada catatan.',
        'no_notices': 'Belum ada pengumuman disematkan.',
        'no_habits': 'Belum ada kebiasaan. Tambahkan satu di atas!',
        'no_items': 'Tidak ada item.',
        'add_habit': 'Tambah Kebiasaan',
        'add_note': 'Tambah Catatan',
        'add_notice': 'Tambah Pengumuman',
        'delete_all': 'Hapus Semua',
        'complete': 'Selesaikan',
        'done': 'Selesai',
        'ai_tools': 'Alat AI',
        'ai_subtitle': 'Asisten AI kurasi + perangkum teks bawaan.',
        'studyhub_ai': 'StudyHub AI',
        'recommend_title': 'Tidak yakin AI mana yang digunakan?',
        'recommend_text': 'Beri tahu saya apa yang sedang Anda kerjakan.',
        'recommend_button': 'Rekomendasikan',
        'recommend_placeholder': 'misal: selesaikan kalkulus, tulis kode...',
        'summarizer_title': 'Perangkum AI',
        'summarizer_desc': 'Tempel teks apa pun dan dapatkan ringkasan singkat (bekerja offline).',
        'summarize_button': 'Ringkas',
        'summarize_placeholder': 'Tempel teks Anda di sini...',
        'social_blocked': 'Media Sosial Diblokir',
        'social_blocked_desc': 'Untuk tetap fokus, semua platform media sosial (kecuali YouTube) diblokir saat menggunakan StudyHub.',
        'files': 'File',
        'files_subtitle': 'Unggah, lihat, dan kelola file studi Anda. Semua file disimpan secara lokal di browser Anda.',
        'upload_drop': 'Seret dan lepas file di sini, atau klik untuk mencari',
        'delete_all_files': 'Hapus Semua File',
        'uploaded_files': 'File Diunggah',
        'habits': 'Kebiasaan',
        'habits_subtitle': 'Bangun rutinitas harian. Selesaikan tugas dan lihat streak Anda tumbuh!',
        'habit_placeholder': '✍️ Kebiasaan baru (misal: Baca 30 menit)',
        'your_habits': 'Kebiasaan Anda',
        'current_streak': 'Streak Saat Ini',
        'longest_streak': 'Streak Terpanjang',
        'days': 'hari',
        'notice': 'Pengumuman',
        'notice_subtitle': 'Sematkan pengumuman penting atau pengingat untuk grup studi Anda.',
        'notice_placeholder': '✍️ Tulis pengumuman...',
        'pinboard': 'Papan Pin',
        'notices_count': 'pengumuman',
        'notes': 'Catatan',
        'notes_subtitle': 'Tulis ide cepat, catatan kuliah, atau tugas.',
        'note_placeholder': '✍️ Tulis catatan...',
        'your_notes': 'Catatan Anda',
        'assignments': 'Tugas',
        'assignments_subtitle': 'Kelola tenggat waktu, prioritas, dan tag.',
        'assign_title': 'Judul',
        'assign_subject': 'Mata Pelajaran',
        'assign_tags': 'Tag (koma)',
        'priority_high': 'Tinggi',
        'priority_medium': 'Sedang',
        'priority_low': 'Rendah',
        'add': 'Tambah',
        'all_assignments': 'Semua Tugas',
        'planner': 'Perencana',
        'planner_subtitle': 'Klik sel mana pun untuk merencanakan mata pelajaran Anda untuk hari dan waktu itu.',
        'flashcards': 'Kartu Flash',
        'flashcards_subtitle': 'Pengulangan terjadwal, tinjau kartu yang jatuh tempo secara teratur.',
        'new_deck': 'Dek Baru',
        'click_to_flip': 'Klik kartu untuk membalik.',
        'rate_difficulty': 'Nilai kesulitan:',
        'hard': 'Sulit',
        'medium': 'Sedang',
        'easy': 'Mudah',
        'reading': 'Daftar Bacaan',
        'reading_subtitle': 'Simpan artikel, tutorial, dan sumber daya.',
        'read_title': 'Judul',
        'read_url': 'URL',
        'read_subject': 'Mata Pelajaran',
        'read_tags': 'Tag (koma)',
        'my_reading': 'Bacaan Saya',
        'switch_analog': 'Beralih ke Analog',
        'today': 'Hari Ini',
        'entries': 'entri',
        'entry': 'entri',
        'quick_search': 'Pencarian Cepat',
        'focus_off': 'Fokus Mati',
        'sign_out': 'Keluar',
        'open_history': 'Buka riwayat',
        'focus_on': 'Fokus Hidup',
        'allowed': 'Diizinkan',
        'math_tag': 'Matematika',
        'coding_tag': 'Pemrograman',
        'writing_tag': 'Menulis',
        'research_tag': 'Penelitian',
        'data_tag': 'Data',
        'design_tag': 'Desain',
        'language_tag': 'Bahasa',
        'productivity_tag': 'Produktivitas',
        'stem_tag': 'STEM',
        'deepseek_desc': 'Pemecah matematika tingkat lanjut.',
        'cursor_desc': 'Editor kode bertenaga AI.',
        'chatgpt_desc': 'Asisten penulisan serbaguna.',
        'perplexity_desc': 'Penelitian bertenaga AI.',
        'claude_desc': 'Analisis data & penalaran.',
        'midjourney_desc': 'Generasi gambar AI.',
        'duolingo_desc': 'Pembelajaran bahasa bertenaga AI.',
        'notion_desc': 'Produktivitas bertenaga AI.',
        'wolfram_desc': 'Mesin komputasi STEM.',
        'canva_desc': 'Desain bertenaga AI untuk presentasi, poster, dan media sosial.',
        'youtube_desc': 'Video edukasi, tutorial, dan ceramah.',
    },
    de: {
        'dash_title': 'Dashboard',
        'dash_subtitle': 'Ihr Studien-Hub auf einen Blick: heutiger Fortschritt & gesamte Historie.',
        'stat_searches': 'Suchanfragen heute',
        'stat_files': 'Hochgeladene Dateien',
        'stat_tasks': 'Heute erledigte Aufgaben',
        'stat_streak': 'Längste Serie',
        'stat_pomodoros': 'Pomodoros heute',
        'all_history': 'Gesamte Historie',
        'delete_all': 'Gesamte Historie löschen',
        'search_placeholder': 'Wonach suchen Sie?',
        'search_button': 'Suchen',
        'search_tip': 'Alle Suchanfragen werden in Ihrer Historie protokolliert.',
        'show_keyboard': 'Tastatur einblenden',
        'hide_keyboard': 'Tastatur ausblenden',
        'task_timer': 'Aufgaben-Timer',
        'start': 'Start',
        'stop': 'Stopp',
        'reset': 'Zurücksetzen',
        'completed_today': 'Heute erledigt',
        'daily_reflection': 'Tägliche Reflexion',
        'journal_placeholder': 'Wie war Ihre Lerneinheit? Was haben Sie gelernt?',
        'upcoming_assignments': 'Anstehende Aufgaben',
        'no_assignments': 'Keine ausstehenden Aufgaben.',
        'no_history': 'Es wurde noch keine Historie aufgezeichnet.',
        'no_files': 'Es wurden noch keine Dateien hochgeladen.',
        'no_notes': 'Noch keine Notizen.',
        'no_notices': 'Noch keine Notizen angeheftet.',
        'no_habits': 'Noch keine Gewohnheiten. Fügen Sie oben eine hinzu!',
        'no_items': 'Keine Einträge.',
        'add_habit': 'Gewohnheit hinzufügen',
        'add_note': 'Notiz hinzufügen',
        'add_notice': 'Notiz hinzufügen',
        'delete_all': 'Alle löschen',
        'complete': 'Abschließen',
        'done': 'Erledigt',
        'ai_tools': 'KI-Tools',
        'ai_subtitle': 'Kuratierte KI-Assistenten + integrierter Textzusammenfasser.',
        'studyhub_ai': 'StudyHub KI',
        'recommend_title': 'Nicht sicher, welche KI Sie verwenden sollen?',
        'recommend_text': 'Sagen Sie mir, woran Sie arbeiten.',
        'recommend_button': 'Empfehlen',
        'recommend_placeholder': 'z.B. Analysis lösen, Code schreiben...',
        'summarizer_title': 'KI-Zusammenfasser',
        'summarizer_desc': 'Fügen Sie beliebigen Text ein und erhalten Sie eine kurze Zusammenfassung (funktioniert offline).',
        'summarize_button': 'Zusammenfassen',
        'summarize_placeholder': 'Fügen Sie Ihren Text hier ein...',
        'social_blocked': 'Soziale Medien gesperrt',
        'social_blocked_desc': 'Um konzentriert zu bleiben, sind bei der Nutzung von StudyHub alle Social-Media-Plattformen (außer YouTube) gesperrt.',
        'files': 'Dateien',
        'files_subtitle': 'Laden Sie Ihre Lerndateien hoch, zeigen Sie sie an und verwalten Sie sie. Alle Dateien werden lokal in Ihrem Browser gespeichert.',
        'upload_drop': 'Dateien hierher ziehen und ablegen oder zum Durchsuchen klicken',
        'delete_all_files': 'Alle Dateien löschen',
        'uploaded_files': 'Hochgeladene Dateien',
        'habits': 'Gewohnheiten',
        'habits_subtitle': 'Erstellen Sie tägliche Routinen. Erledigen Sie Aufgaben und sehen Sie Ihre Serie wachsen!',
        'habit_placeholder': '✍️ Neue Gewohnheit (z.B. 30 min lesen)',
        'your_habits': 'Ihre Gewohnheiten',
        'current_streak': 'Aktuelle Serie',
        'longest_streak': 'Längste Serie',
        'days': 'Tage',
        'notice': 'Notizen',
        'notice_subtitle': 'Pinnen Sie wichtige Ankündigungen oder Erinnerungen für Ihre Lerngruppe.',
        'notice_placeholder': '✍️ Schreiben Sie eine Notiz...',
        'pinboard': 'Pinnwand',
        'notices_count': 'Notizen',
        'notes': 'Notizen',
        'notes_subtitle': 'Notieren Sie schnelle Ideen, Vorlesungsnotizen oder Aufgaben.',
        'note_placeholder': '✍️ Schreiben Sie eine Notiz...',
        'your_notes': 'Ihre Notizen',
        'assignments': 'Aufgaben',
        'assignments_subtitle': 'Verwalten Sie Fristen, Prioritäten und Tags.',
        'assign_title': 'Titel',
        'assign_subject': 'Fach',
        'assign_tags': 'Tags (Komma getrennt)',
        'priority_high': 'Hoch',
        'priority_medium': 'Mittel',
        'priority_low': 'Niedrig',
        'add': 'Hinzufügen',
        'all_assignments': 'Alle Aufgaben',
        'planner': 'Planer',
        'planner_subtitle': 'Klicken Sie auf eine beliebige Zelle, um Ihr Fach für diesen Tag und diese Uhrzeit zu planen.',
        'flashcards': 'Karteikarten',
        'flashcards_subtitle': 'Wiederholung in Abständen, überprüfen Sie regelmäßig fällige Karten.',
        'new_deck': 'Neues Deck',
        'click_to_flip': 'Klicken Sie auf die Karte, um sie umzudrehen.',
        'rate_difficulty': 'Bewerten Sie die Schwierigkeit:',
        'hard': 'Schwer',
        'medium': 'Mittel',
        'easy': 'Leicht',
        'reading': 'Leseliste',
        'reading_subtitle': 'Speichern Sie Artikel, Tutorials und Ressourcen.',
        'read_title': 'Titel',
        'read_url': 'URL',
        'read_subject': 'Fach',
        'read_tags': 'Tags (Komma)',
        'my_reading': 'Meine Leseliste',
        'switch_analog': 'Zu Analog wechseln',
        'today': 'Heute',
        'entries': 'Einträge',
        'entry': 'Eintrag',
        'quick_search': 'Schnellsuche',
        'focus_off': 'Fokus aus',
        'sign_out': 'Abmelden',
        'open_history': 'Verlauf öffnen',
        'focus_on': 'Fokus an',
        'allowed': 'Erlaubt',
        'math_tag': 'Mathe',
        'coding_tag': 'Programmieren',
        'writing_tag': 'Schreiben',
        'research_tag': 'Forschung',
        'data_tag': 'Daten',
        'design_tag': 'Design',
        'language_tag': 'Sprache',
        'productivity_tag': 'Produktivität',
        'stem_tag': 'STEM',
        'deepseek_desc': 'Fortgeschrittener Mathe-Löser.',
        'cursor_desc': 'KI-gestützter Code-Editor.',
        'chatgpt_desc': 'Vielseitiger Schreibassistent.',
        'perplexity_desc': 'KI-gestützte Recherche.',
        'claude_desc': 'Datenanalyse & Argumentation.',
        'midjourney_desc': 'KI-Bilderzeugung.',
        'duolingo_desc': 'KI-gestütztes Sprachenlernen.',
        'notion_desc': 'KI-gestützte Produktivität.',
        'wolfram_desc': 'Computational STEM-Engine.',
        'canva_desc': 'KI-gestütztes Design für Präsentationen, Poster und soziale Medien.',
        'youtube_desc': 'Bildungsvideos, Tutorials und Vorträge.',
    },
    ja: {
        'dash_title': 'ダッシュボード',
        'dash_subtitle': 'あなたの学習ハブ: 今日の進捗と全履歴。',
        'stat_searches': '今日の検索',
        'stat_files': 'アップロードされたファイル',
        'stat_tasks': '今日完了したタスク',
        'stat_streak': '最長連続記録',
        'stat_pomodoros': '今日のポモドーロ',
        'all_history': '全履歴',
        'delete_all': '全履歴を削除',
        'search_placeholder': '何をお探しですか？',
        'search_button': '検索',
        'search_tip': 'すべての検索は履歴に記録されます。',
        'show_keyboard': 'キーボードを表示',
        'hide_keyboard': 'キーボードを非表示',
        'task_timer': 'タスクタイマー',
        'start': '開始',
        'stop': '停止',
        'reset': 'リセット',
        'completed_today': '今日完了',
        'daily_reflection': '毎日の振り返り',
        'journal_placeholder': '学習セッションはどうでしたか？何を学びましたか？',
        'upcoming_assignments': '今後の課題',
        'no_assignments': '保留中の課題はありません。',
        'no_history': 'まだ履歴が記録されていません。',
        'no_files': 'まだファイルがアップロードされていません。',
        'no_notes': 'まだノートがありません。',
        'no_notices': 'まだ通知がピン留めされていません。',
        'no_habits': 'まだ習慣がありません。上から追加してください！',
        'no_items': 'アイテムがありません。',
        'add_habit': '習慣を追加',
        'add_note': 'ノートを追加',
        'add_notice': '通知を追加',
        'delete_all': 'すべて削除',
        'complete': '完了',
        'done': '完了',
        'ai_tools': 'AIツール',
        'ai_subtitle': '厳選されたAIアシスタント + 内蔵テキスト要約機能。',
        'studyhub_ai': 'StudyHub AI',
        'recommend_title': 'どのAIを使うか迷っていますか？',
        'recommend_text': '何に取り組んでいるか教えてください。',
        'recommend_button': 'おすすめ',
        'recommend_placeholder': '例：微積分を解く、コードを書く...',
        'summarizer_title': 'AI要約',
        'summarizer_desc': 'テキストを貼り付けると簡潔な要約が得られます（オフラインで動作）。',
        'summarize_button': '要約',
        'summarize_placeholder': 'テキストをここに貼り付け...',
        'social_blocked': 'ソーシャルメディアはブロックされています',
        'social_blocked_desc': '集中力を保つため、StudyHub使用中はYouTubeを除くすべてのSNSがブロックされます。',
        'files': 'ファイル',
        'files_subtitle': '学習ファイルをアップロード、表示、管理します。すべてのファイルはブラウザにローカル保存されます。',
        'upload_drop': 'ファイルをここにドラッグ＆ドロップ、またはクリックして参照',
        'delete_all_files': 'すべてのファイルを削除',
        'uploaded_files': 'アップロードされたファイル',
        'habits': '習慣',
        'habits_subtitle': '毎日のルーチンを作成します。タスクを完了して連続記録を伸ばしましょう！',
        'habit_placeholder': '✍️ 新しい習慣（例：30分読書）',
        'your_habits': 'あなたの習慣',
        'current_streak': '現在の連続記録',
        'longest_streak': '最長連続記録',
        'days': '日',
        'notice': 'お知らせ',
        'notice_subtitle': '学習グループ向けの重要な告知やリマインダーをピン留めします。',
        'notice_placeholder': '✍️ お知らせを書く...',
        'pinboard': 'ピンボード',
        'notices_count': 'お知らせ',
        'notes': 'ノート',
        'notes_subtitle': 'アイデア、講義ノート、ToDoを書き留めます。',
        'note_placeholder': '✍️ ノートを書く...',
        'your_notes': 'あなたのノート',
        'assignments': '課題',
        'assignments_subtitle': '締切、優先度、タグを管理します。',
        'assign_title': 'タイトル',
        'assign_subject': '科目',
        'assign_tags': 'タグ（カンマ区切り）',
        'priority_high': '高',
        'priority_medium': '中',
        'priority_low': '低',
        'add': '追加',
        'all_assignments': 'すべての課題',
        'planner': 'プランナー',
        'planner_subtitle': '任意のセルをクリックして、その日と時間の科目を計画します。',
        'flashcards': 'フラッシュカード',
        'flashcards_subtitle': '間隔反復, 定期的に期限切れカードを復習します。',
        'new_deck': '新しいデッキ',
        'click_to_flip': 'カードをクリックして裏返す',
        'rate_difficulty': '難易度を評価：',
        'hard': '難しい',
        'medium': '普通',
        'easy': '簡単',
        'reading': '読書リスト',
        'reading_subtitle': '記事、チュートリアル、リソースを保存します。',
        'read_title': 'タイトル',
        'read_url': 'URL',
        'read_subject': '科目',
        'read_tags': 'タグ（カンマ）',
        'my_reading': '私の読書リスト',
        'switch_analog': 'アナログに切り替え',
        'today': '今日',
        'entries': 'エントリ',
        'entry': '件',
        'quick_search': 'クイック検索',
        'focus_off': 'フォーカスオフ',
        'sign_out': 'サインアウト',
        'open_history': '履歴を開く',
        'focus_on': 'フォーカスオン',
        'allowed': '許可',
        'math_tag': '数学',
        'coding_tag': 'コーディング',
        'writing_tag': 'ライティング',
        'research_tag': 'リサーチ',
        'data_tag': 'データ',
        'design_tag': 'デザイン',
        'language_tag': '言語',
        'productivity_tag': '生産性',
        'stem_tag': 'STEM',
        'deepseek_desc': '高度な数学ソルバー。',
        'cursor_desc': 'AI搭載コードエディタ。',
        'chatgpt_desc': '多用途なライティングアシスタント。',
        'perplexity_desc': 'AI搭載リサーチ。',
        'claude_desc': 'データ分析と推論。',
        'midjourney_desc': 'AI画像生成。',
        'duolingo_desc': 'AI駆動の言語学習。',
        'notion_desc': 'AI駆動の生産性ツール。',
        'wolfram_desc': 'STEM計算エンジン。',
        'canva_desc': 'プレゼンテーション、ポスター、ソーシャルメディア向けのAI駆動デザイン。',
        'youtube_desc': '教育ビデオ、チュートリアル、講義。',
    },
    sw: {
        'dash_title': 'Dashibodi',
        'dash_subtitle': 'Kituo chako cha kujifunza kwa mtazamo mmoja: maendeleo ya leo na historia yote.',
        'stat_searches': 'Utafutaji Leo',
        'stat_files': 'Faili Zilizopakiwa',
        'stat_tasks': 'Kazi Zilizokamilishwa Leo',
        'stat_streak': 'Mfululizo Mrefu Zaidi',
        'stat_pomodoros': 'Pomodoros Leo',
        'all_history': 'Historia Yote',
        'delete_all': 'Futa Historia Yote',
        'search_placeholder': 'Unatafuta nini?',
        'search_button': 'Tafuta',
        'search_tip': 'Utafutaji wote umehifadhiwa kwenye historia yako.',
        'show_keyboard': 'Onyesha Kibodi',
        'hide_keyboard': 'Ficha Kibodi',
        'task_timer': 'Kipima Muda cha Kazi',
        'start': 'Anza',
        'stop': 'Simama',
        'reset': 'Weka Upya',
        'completed_today': 'Imekamilika leo',
        'daily_reflection': 'Tafakari ya Kila Siku',
        'journal_placeholder': 'Kikao chako cha kujifunza kilikuwaje? Ulijifunza nini?',
        'upcoming_assignments': 'Kazi Zinazokuja',
        'no_assignments': 'Hakuna kazi zinazosubiri.',
        'no_history': 'Hakuna historia iliyorekodiwa bado.',
        'no_files': 'Hakuna faili zilizopakiwa bado.',
        'no_notes': 'Hakuna maelezo bado.',
        'no_notices': 'Hakuna matangazo yaliyobandikwa bado.',
        'no_habits': 'Hakuna mazoea bado. Ongeza moja hapo juu!',
        'no_items': 'Hakuna vitu.',
        'add_habit': 'Ongeza Zoezi',
        'add_note': 'Ongeza Maelezo',
        'add_notice': 'Ongeza Tangazo',
        'delete_all': 'Futa Yote',
        'complete': 'Kamilisha',
        'done': 'Imefanywa',
        'ai_tools': 'Zana za AI',
        'ai_subtitle': 'Wasaidizi wa AI waliochaguliwa + muhtasari wa maandishi uliojengwa ndani.',
        'studyhub_ai': 'StudyHub AI',
        'recommend_title': 'Hujui ni AI gani ya kutumia?',
        'recommend_text': 'Niambie unachofanya kazi.',
        'recommend_button': 'Pendekeza',
        'recommend_placeholder': 'mfano: suluhisha hesabu, andika code...',
        'summarizer_title': 'Muhtasari wa AI',
        'summarizer_desc': 'Bandika maandishi yoyote na upate muhtasari mfupi (inafanya kazi nje ya mtandao).',
        'summarize_button': 'Fupisha',
        'summarize_placeholder': 'Bandika maandishi yako hapa...',
        'social_blocked': 'Mitandao ya Kijamii Imefungwa',
        'social_blocked_desc': 'Ili kudumisha umakini, majukwaa yote ya mitandao ya kijamii (isipokuwa YouTube) yamefungwa wakati wa kutumia StudyHub.',
        'files': 'Faili',
        'files_subtitle': 'Pakia, tazama, na simamia faili zako za kujifunza. Faili zote zimehifadhiwa kwenye kivinjari chako.',
        'upload_drop': 'Buruta na uache faili hapa, au bofya kutafuta',
        'delete_all_files': 'Futa Faili Zote',
        'uploaded_files': 'Faili Zilizopakiwa',
        'habits': 'Mazoea',
        'habits_subtitle': 'Jenga taratibu za kila siku. Kamilisha kazi na uone mfululizo wako ukikua!',
        'habit_placeholder': '✍️ Zoezi jipya (mfano: Soma dakika 30)',
        'your_habits': 'Mazoea Yako',
        'current_streak': 'Mfululizo wa Sasa',
        'longest_streak': 'Mfululizo mrefu zaidi',
        'days': 'siku',
        'notice': 'Matangazo',
        'notice_subtitle': 'Bandika matangazo muhimu au vikumbusho kwa kikundi chako cha kujifunza.',
        'notice_placeholder': '✍️ Andika tangazo...',
        'pinboard': 'Ubao wa Mabango',
        'notices_count': 'matangazo',
        'notes': 'Maelezo',
        'notes_subtitle': 'Andika mawazo ya haraka, maelezo ya mihadhara, au kazi.',
        'note_placeholder': '✍️ Andika maelezo...',
        'your_notes': 'Maelezo Yako',
        'assignments': 'Kazi',
        'assignments_subtitle': 'Simamia makataa, vipaumbele, na vitambulisho.',
        'assign_title': 'Kichwa',
        'assign_subject': 'Somo',
        'assign_tags': 'Vitambulisho (koma)',
        'priority_high': 'Juu',
        'priority_medium': 'Kati',
        'priority_low': 'Chini',
        'add': 'Ongeza',
        'all_assignments': 'Kazi Zote',
        'planner': 'Mpangaji',
        'planner_subtitle': 'Bofya seli yoyote kupanga somo lako kwa siku na wakati huo.',
        'flashcards': 'Kadi za Kujifunza',
        'flashcards_subtitle': 'Kurudia kwa vipindi, kagua kadi zilizochelewa mara kwa mara.',
        'new_deck': 'Staha Mpya',
        'click_to_flip': 'Bofya kadi kuigeuza.',
        'rate_difficulty': 'Kadiria ugumu:',
        'hard': 'Ngumu',
        'medium': 'Wastani',
        'easy': 'Rahisi',
        'reading': 'Orodha ya Kusoma',
        'reading_subtitle': 'Hifadhi makala, mafunzo, na rasilimali.',
        'read_title': 'Kichwa',
        'read_url': 'URL',
        'read_subject': 'Somo',
        'read_tags': 'Vitambulisho (koma)',
        'my_reading': 'Masomo Yangu',
        'switch_analog': 'Badilisha hadi Analog',
        'today': 'Leo',
        'entries': 'maingizo',
        'entry': 'kumbukumbu',
        'quick_search': 'Utafutaji wa Haraka',
        'focus_off': 'Umakini Zima',
        'sign_out': 'Toka',
        'open_history': 'Fungua historia',
        'focus_on': 'Umakini Washa',
        'allowed': 'Inaruhusiwa',
        'math_tag': 'Hisabati',
        'coding_tag': 'Kupanga Programu',
        'writing_tag': 'Uandishi',
        'research_tag': 'Utafiti',
        'data_tag': 'Data',
        'design_tag': 'Ubunifu',
        'language_tag': 'Lugha',
        'productivity_tag': 'Uzalishaji',
        'stem_tag': 'STEM',
        'deepseek_desc': 'Kitatuzi cha hisabati cha hali ya juu.',
        'cursor_desc': 'Kihariri cha msimbo kinachoendeshwa na AI.',
        'chatgpt_desc': 'Msaidizi wa uandishi hodari.',
        'perplexity_desc': 'Utafiti unaoendeshwa na AI.',
        'claude_desc': 'Uchambuzi wa data na hoja.',
        'midjourney_desc': 'Uzalishaji wa picha za AI.',
        'duolingo_desc': 'Kujifunza lugha kwa AI.',
        'notion_desc': 'Uzalishaji unaoendeshwa na AI.',
        'wolfram_desc': 'Injini ya kukokotoa STEM.',
        'canva_desc': 'Ubunifu unaoendeshwa na AI kwa mawasilisho, mabango, na mitandao ya kijamii.',
        'youtube_desc': 'Video za elimu, mafunzo, na mihadhara.',
    },
    tr: {
        'dash_title': 'Kontrol Paneli',
        'dash_subtitle': 'Çalışma merkeziniz: bugünün ilerlemesi ve tüm zamanların geçmişi.',
        'stat_searches': 'Bugünkü Aramalar',
        'stat_files': 'Yüklenen Dosyalar',
        'stat_tasks': 'Bugün Tamamlanan Görevler',
        'stat_streak': 'En Uzun Seri',
        'stat_pomodoros': 'Bugünkü Pomodorolar',
        'all_history': 'Tüm Geçmiş',
        'delete_all': 'Tüm Geçmişi Sil',
        'search_placeholder': 'Ne arıyorsunuz?',
        'search_button': 'Ara',
        'search_tip': 'Tüm aramalar geçmişinize kaydedilir.',
        'show_keyboard': 'Klavyeyi Göster',
        'hide_keyboard': 'Klavyeyi Gizle',
        'task_timer': 'Görev Zamanlayıcısı',
        'start': 'Başlat',
        'stop': 'Durdur',
        'reset': 'Sıfırla',
        'completed_today': 'Bugün tamamlandı',
        'daily_reflection': 'Günlük Yansıma',
        'journal_placeholder': 'Çalışma seansınız nasıldı? Ne öğrendiniz?',
        'upcoming_assignments': 'Yaklaşan Ödevler',
        'no_assignments': 'Bekleyen ödev yok.',
        'no_history': 'Henüz geçmiş kaydedilmedi.',
        'no_files': 'Henüz dosya yüklenmedi.',
        'no_notes': 'Henüz not yok.',
        'no_notices': 'Henüz duyuru sabitlenmedi.',
        'no_habits': 'Henüz alışkanlık yok. Yukarıya bir tane ekleyin!',
        'no_items': 'Öğe yok.',
        'add_habit': 'Alışkanlık Ekle',
        'add_note': 'Not Ekle',
        'add_notice': 'Duyuru Ekle',
        'delete_all': 'Tümünü Sil',
        'complete': 'Tamamla',
        'done': 'Bitti',
        'ai_tools': 'AI Araçları',
        'ai_subtitle': 'Özenle seçilmiş AI asistanları + yerleşik metin özetleyici.',
        'studyhub_ai': 'StudyHub AI',
        'recommend_title': 'Hangi AI\'yi kullanacağınızdan emin değil misiniz?',
        'recommend_text': 'Ne üzerinde çalıştığınızı söyleyin.',
        'recommend_button': 'Öner',
        'recommend_placeholder': 'örnek: kalkülüs çöz, kod yaz...',
        'summarizer_title': 'AI Özetleyici',
        'summarizer_desc': 'Herhangi bir metni yapıştırın ve kısa bir özet alın (çevrimdışı çalışır).',
        'summarize_button': 'Özetle',
        'summarize_placeholder': 'Metninizi buraya yapıştırın...',
        'social_blocked': 'Sosyal Medya Engellendi',
        'social_blocked_desc': 'Odaklanmak için StudyHub kullanırken YouTube haricindeki tüm sosyal medya platformları engellenmiştir.',
        'files': 'Dosyalar',
        'files_subtitle': 'Çalışma dosyalarınızı yükleyin, görüntüleyin ve yönetin. Tüm dosyalar tarayıcınızda yerel olarak saklanır.',
        'upload_drop': 'Dosyaları buraya sürükleyip bırakın veya göz atmak için tıklayın',
        'delete_all_files': 'Tüm Dosyaları Sil',
        'uploaded_files': 'Yüklenen Dosyalar',
        'habits': 'Alışkanlıklar',
        'habits_subtitle': 'Günlük rutinler oluşturun. Görevleri tamamlayın ve serinizin büyümesini izleyin!',
        'habit_placeholder': '✍️ Yeni alışkanlık (örnek: 30 dk oku)',
        'your_habits': 'Alışkanlıklarınız',
        'current_streak': 'Mevcut Seri',
        'longest_streak': 'En uzun seri',
        'days': 'gün',
        'notice': 'Duyurular',
        'notice_subtitle': 'Çalışma grubunuz için önemli duyuruları veya hatırlatıcıları sabitleyin.',
        'notice_placeholder': '✍️ Bir duyuru yazın...',
        'pinboard': 'Pano',
        'notices_count': 'duyuru',
        'notes': 'Notlar',
        'notes_subtitle': 'Hızlı fikirler, ders notları veya yapılacaklar yazın.',
        'note_placeholder': '✍️ Bir not yazın...',
        'your_notes': 'Notlarınız',
        'assignments': 'Ödevler',
        'assignments_subtitle': 'Son tarihleri, öncelikleri ve etiketleri yönetin.',
        'assign_title': 'Başlık',
        'assign_subject': 'Ders',
        'assign_tags': 'Etiketler (virgülle)',
        'priority_high': 'Yüksek',
        'priority_medium': 'Orta',
        'priority_low': 'Düşük',
        'add': 'Ekle',
        'all_assignments': 'Tüm Ödevler',
        'planner': 'Planlayıcı',
        'planner_subtitle': 'Herhangi bir hücreye tıklayarak o gün ve saat için dersinizi planlayın.',
        'flashcards': 'Bilgi Kartları',
        'flashcards_subtitle': 'Aralıklı tekrar, vadesi gelen kartları düzenli olarak gözden geçirin.',
        'new_deck': 'Yeni Deste',
        'click_to_flip': 'Kartı çevirmek için tıklayın.',
        'rate_difficulty': 'Zorluk derecesini puanlayın:',
        'hard': 'Zor',
        'medium': 'Orta',
        'easy': 'Kolay',
        'reading': 'Okuma Listesi',
        'reading_subtitle': 'Makaleleri, eğitimleri ve kaynakları kaydedin.',
        'read_title': 'Başlık',
        'read_url': 'URL',
        'read_subject': 'Ders',
        'read_tags': 'Etiketler (virgül)',
        'my_reading': 'Okuma Listem',
        'switch_analog': 'Analog\'a Geç',
        'today': 'Bugün',
        'entries': 'giriş',
        'entry': 'kayıt',
        'quick_search': 'Hızlı Arama',
        'focus_off': 'Odak Kapalı',
        'sign_out': 'Çıkış yap',
        'open_history': 'Geçmişi aç',
        'focus_on': 'Odak Açık',
        'allowed': 'İzin Verildi',
        'math_tag': 'Matematik',
        'coding_tag': 'Kodlama',
        'writing_tag': 'Yazma',
        'research_tag': 'Araştırma',
        'data_tag': 'Veri',
        'design_tag': 'Tasarım',
        'language_tag': 'Dil',
        'productivity_tag': 'Verimlilik',
        'stem_tag': 'STEM',
        'deepseek_desc': 'Gelişmiş matematik çözücü.',
        'cursor_desc': 'AI destekli kod düzenleyici.',
        'chatgpt_desc': 'Çok yönlü yazma asistanı.',
        'perplexity_desc': 'AI destekli araştırma.',
        'claude_desc': 'Veri analizi ve muhakeme.',
        'midjourney_desc': 'AI görüntü oluşturma.',
        'duolingo_desc': 'AI destekli dil öğrenimi.',
        'notion_desc': 'AI destekli üretkenlik.',
        'wolfram_desc': 'Hesaplamalı STEM motoru.',
        'canva_desc': 'Sunumlar, posterler ve sosyal medya için AI destekli tasarım.',
        'youtube_desc': 'Eğitim videoları, eğitimler ve dersler.',
        },
  };



        

// ================================================================
// EXTENDED TRANSLATIONS (for new features)
// ================================================================
var extraTranslations = {
    en: {
        'blocker_on': 'Blocker On', 'blocker_off': 'Blocker Off',
        'blocked_alert_title': 'Blocked!',
        'blocked_alert_msg': 'is on your distraction list. Turn the Blocker off to visit it.',
        'trash_label': 'Trash', 'trash_empty_msg': 'Trash is empty.',
        'restore_btn': 'Restore', 'delete_btn': 'Delete', 'empty_trash_btn': 'Empty Trash', 'close_btn': 'Close',
        'switch_digital': 'Switch to Digital',
        'ai_planner_title': 'StudyHub AI Planner',
        'ai_planner_desc': 'Describe what you want: the AI will plan it for you. Try "make a routine by yourself", "easy weekend plan", "intense exam week", "math morning, physics evening", "3 hours today", or "focus on chemistry this week".',
        'ai_planner_placeholder': 'Type your request here...',
        'generate_plan_btn': 'Generate Plan',
        'chip_auto': 'Auto routine', 'chip_easy': 'Easy', 'chip_exam': 'Exam week', 'chip_weekend': 'Weekend',
        'chip_math_physics': 'Math + Physics', 'chip_surprise': 'Surprise', 'chip_3h': '3h today',
        'understood': 'Understood', 'mode_easy': 'Easy / light', 'mode_balanced': 'Balanced', 'mode_intense': 'Intense',
        'scope_full_week': 'Full week', 'scope_weekend_only': 'Weekend only', 'scope_weekdays_only': 'Weekdays only',
        'scope_today_only': 'Today only', 'scope_tomorrow_only': 'Tomorrow only',
        'time_any': 'any time of day', 'time_mornings': 'mornings', 'time_afternoons': 'afternoons', 'time_evenings': 'evenings',
        'subjects_label': 'Subjects', 'total_sessions_label': 'Total sessions', 'across_label': 'across', 'days_label': 'day(s)',
        'apply_merge_btn': 'Apply to Planner (merge)', 'replace_planner_btn': 'Replace Planner',
        'retry_variation_btn': 'Retry (new variation)', 'reset_planner_btn': 'Reset Planner',
        'reset_confirm': 'Reset the planner? This will clear every cell: this cannot be undone.',
        'please_type_plan': 'Please type what you want to plan, or click one of the chips above.',
        'today_minutes': 'Today', 'total_minutes': 'Total',
        'pause_btn': 'Pause', 'sound_none': 'No Sound', 'sound_rain': 'Rain', 'sound_white': 'White Noise', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'Quiz Generator', 'generate_quiz_btn': 'Generate Quiz from Notes', 'clear_quiz_btn': 'Clear Quiz',
        'quiz_next': 'Next',
        'quiz_results': 'Results',
        'quiz_score': 'Score',
        'quiz_review': 'Review',
        'quiz_source': 'From your note',
        'quiz_fill_blank': 'Fill in the blank',
        'quiz_cards_saved': 'Wrong answers saved to your flashcards.',
        'quiz_retry_missed': 'Retry missed',
        'auto_flashcards_btn': 'Auto-Generate from Notes',

        // ===== v3 additions =====
        'ai_summary_empty': 'Paste some text above to see a summary.',
        'ai_summary_log': 'Generated an AI summary',
        'ai_empty_query': 'Type what you\'re working on first.',
        'ai_fallback': 'Could you be more specific? Try mentioning a subject, task, or keyword (e.g. "solve calculus", "write an essay", "analyze data").',
        'ai_offline_note': 'Offline summary (connect a provider key in Admin > AI for full AI summaries).',
        'ai_error_note': 'AI request failed: offline summary shown instead.',
        'ai_quiz_empty': 'Add at least 3 notes to generate a quiz.',
        'ai_quiz_offline': 'Offline quiz from your notes (connect a provider key in Admin > AI for full AI quizzes).',
        'ai_quiz_error': 'AI request failed: offline quiz shown instead.',
        'ai_fc_offline': 'Offline cards from your notes (connect a provider key in Admin > AI for full AI cards).',
        'ai_fc_error': 'AI request failed: offline cards shown instead.',
        'ai_fc_none': 'No notes available. Add some notes first!',
        'act_ai_recommend': 'Asked AI for a recommendation: "{q}"',
        // Calendar
        'calendar': 'Calendar',
        'cal_open': 'Open calendar',
        'cal_close': 'Close calendar',
        'cal_prev_month': 'Previous month',
        'cal_next_month': 'Next month',
        'cal_prev_year': 'Previous year',
        'cal_next_year': 'Next year',
        'cal_today': 'Today',
        // Calculator
        'calculator': 'Calculator',
        'calc_clear': 'Clear',
        'calc_backspace': 'Backspace',
        'calc_equals': 'Equals',
        // Priority matrix
        'priority_matrix': 'Priority Matrix',
        'priority_add': 'Add Task',
        'priority_placeholder': 'Add a task...',
        'pq_urgent_important': 'Urgent & Important',
        'pq_not_urgent_important': 'Not Urgent & Important',
        'pq_urgent_not_important': 'Urgent & Not Important',
        'pq_not_urgent_not_important': 'Not Urgent & Not Important',
        'pq_empty': 'Empty',
        // Deep work
        'deep_work': 'Deep Work',
        'deep_work_desc': 'Track uninterrupted focus time. Stop to save your session.',
        'dw_today': 'Today',
        'dw_total': 'Total',
        'dw_minutes': 'minutes',
        // Priority / filters
        'filter_all': 'All',
        'filter_pending': 'Pending',
        'filter_done': 'Done',
        'sort_by': 'Sort by',
        'sort_due': 'Due date',
        'sort_priority': 'Priority',
        'sort_created': 'Created',
        // Confirmation dialogs
        'confirm_delete': 'Delete this item?',
        'confirm_delete_all': 'Delete all items? This cannot be undone.',
        'confirm_reset': 'Reset? This cannot be undone.',
        'confirm_yes': 'Yes, continue',
        'confirm_no': 'Cancel',
        // Common actions
        'edit': 'Edit',
        'save': 'Save',
        'cancel': 'Cancel',
        'close': 'Close',
        'confirm': 'Confirm',
        'apply': 'Apply',
        'clear': 'Clear',
        'refresh': 'Refresh',
        'back': 'Back',
        'next': 'Next',
        'previous': 'Previous',
        'search': 'Search',
        'filter': 'Filter',
        'copy': 'Copy',
        'copied': 'Copied!',
        'download': 'Download',
        'upload': 'Upload',
        'loading': 'Loading...',
        'error': 'Error',
        'success': 'Success',
        'warning': 'Warning',
        'info': 'Info',
        'unknown': 'Unknown',
        'none': 'None',
        'all': 'All',
        'yes': 'Yes',
        'no': 'No',
        'ok': 'OK',
        // Time-related
        'minutes': 'minutes',
        'seconds': 'seconds',
        'hours': 'hours',
        'today_word': 'today',
        'tomorrow': 'Tomorrow',
        'yesterday': 'Yesterday',
        'this_week': 'This Week',
        'this_month': 'This Month',
        'this_year': 'This Year',
        // Greetings
        'good_morning': 'Good morning',
        'good_afternoon': 'Good afternoon',
        'good_evening': 'Good evening',
        // File
        'file_open': 'Open',
        'file_rename': 'Rename',
        'file_notes': 'Notes',
        'file_size': 'Size',
        'file_uploaded': 'Uploaded',
        // Pomodoro extra
        'pomodoro': 'Pomodoro',
        'pomodoro_short_break': 'Short Break',
        'pomodoro_long_break': 'Long Break',
        'pomodoro_session': 'Session',
        'pomodoro_work': 'Focus',
        'pomodoro_complete': 'Pomodoro complete!',
        // Command palette
        'cmd_palette': 'Command Palette',
        'cmd_placeholder': 'Type a command...',
        'cmd_no_results': 'No commands found',
        // Trash
        'trash_open': 'Open Trash',
        'trash_close': 'Close Trash',
        'trash_restore': 'Restore',
        'trash_empty': 'Empty Trash',
        'trash_item_deleted': 'Moved to trash',
        'trash_item_restored': 'Restored from trash',
        // Blocker
        'blocker_settings': 'Blocker Settings',
        'blocker_log': 'Blocked attempts',
        'blocker_no_log': 'No blocked attempts yet. Keep it up!',
        'blocker_category': 'Categories',
        'blocker_custom': 'Custom blocklist',
        'blocker_allowed': 'Always allowed',
        'blocker_add_domain': 'Add domain',
        'blocker_stats': 'Statistics',
        'blocker_total': 'total blocked',
        'blocker_events': 'recent events',
        // Shortcuts
        'shortcut_add': 'Add',
        'shortcut_edit': 'Edit shortcut',
        'shortcut_remove': 'Remove shortcut',
        'shortcut_url': 'Website URL',
        'shortcut_name': 'Display name',
        'shortcut_save': 'Save shortcut',
        'shortcut_cancel': 'Cancel',
        // Session results
        'session_complete': 'Session Complete',
        'session_duration': 'Duration',
        'session_goal': 'Goal',
        'session_distractions': 'Distractions',
        'session_score': 'Score',
        'session_goal_met': 'Goal met',
        'session_goal_not_met': 'Goal not met',
        'session_streak': 'day streak',
        'session_today': 'min today',
        // Themes
        'theme_customize': 'Customize',
        'theme_color': 'Color Theme',
        'theme_background': 'Background',
        'theme_reset': 'Reset to default',
        'theme_done': 'Done',
        'theme_gradients': 'Gradients',
        'theme_photos': 'Photos'
    
    },
    es: {
        'blocker_on': 'Bloqueador Activado', 'blocker_off': 'Bloqueador Desactivado',
        'blocked_alert_title': '¡Bloqueado!',
        'blocked_alert_msg': 'está en tu lista de distracciones. Desactiva el Bloqueador para visitarlo.',
        'trash_label': 'Papelera', 'trash_empty_msg': 'La papelera está vacía.',
        'restore_btn': 'Restaurar', 'delete_btn': 'Eliminar', 'empty_trash_btn': 'Vaciar Papelera', 'close_btn': 'Cerrar',
        'switch_digital': 'Cambiar a Digital',
        'ai_planner_title': 'Planificador IA de StudyHub',
        'ai_planner_desc': 'Describe lo que quieres: la IA lo planificará. Prueba "haz una rutina tú mismo", "plan de fin de semana fácil", "semana de exámenes intensa", "matemáticas por la mañana, física por la tarde", "3 horas hoy" o "enfócate en química esta semana".',
        'ai_planner_placeholder': 'Escribe tu solicitud aquí...',
        'generate_plan_btn': 'Generar Plan',
        'chip_auto': 'Rutina automática', 'chip_easy': 'Fácil', 'chip_exam': 'Semana de exámenes', 'chip_weekend': 'Fin de semana',
        'chip_math_physics': 'Mate + Física', 'chip_surprise': 'Sorpréndeme', 'chip_3h': '3h hoy',
        'understood': 'Entendido', 'mode_easy': 'Fácil / ligero', 'mode_balanced': 'Equilibrado', 'mode_intense': 'Intenso',
        'scope_full_week': 'Semana completa', 'scope_weekend_only': 'Solo fin de semana', 'scope_weekdays_only': 'Solo días laborables',
        'scope_today_only': 'Solo hoy', 'scope_tomorrow_only': 'Solo mañana',
        'time_any': 'cualquier hora', 'time_mornings': 'mañanas', 'time_afternoons': 'tardes', 'time_evenings': 'noches',
        'subjects_label': 'Asignaturas', 'total_sessions_label': 'Sesiones totales', 'across_label': 'en', 'days_label': 'día(s)',
        'apply_merge_btn': 'Aplicar al Planificador (fusionar)', 'replace_planner_btn': 'Reemplazar Planificador',
        'retry_variation_btn': 'Reintentar (nueva variación)', 'reset_planner_btn': 'Restablecer Planificador',
        'reset_confirm': '¿Restablecer el planificador? Se borrarán todas las celdas: no se puede deshacer.',
        'please_type_plan': 'Escribe lo que quieres planificar, o haz clic en un chip.',
        'today_minutes': 'Hoy', 'total_minutes': 'Total',
        'pause_btn': 'Pausar', 'sound_none': 'Sin Sonido', 'sound_rain': 'Lluvia', 'sound_white': 'Ruido Blanco', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'Generador de Cuestionarios', 'generate_quiz_btn': 'Generar Cuestionario desde Notas', 'clear_quiz_btn': 'Borrar Cuestionario',
        'quiz_next': 'Siguiente',
        'quiz_results': 'Resultados',
        'quiz_score': 'Puntuación',
        'quiz_review': 'Repaso',
        'quiz_source': 'De tu apunte',
        'quiz_fill_blank': 'Completa el espacio',
        'quiz_cards_saved': 'Respuestas incorrectas guardadas en tus tarjetas.',
        'quiz_retry_missed': 'Reintentar falladas',
        'auto_flashcards_btn': 'Auto-Generar desde Notas'
    },
    zh: {
        'blocker_on': '拦截器已开启', 'blocker_off': '拦截器已关闭',
        'blocked_alert_title': '已拦截！',
        'blocked_alert_msg': '在您的分心列表中。关闭拦截器以访问。',
        'trash_label': '回收站', 'trash_empty_msg': '回收站为空。',
        'restore_btn': '恢复', 'delete_btn': '删除', 'empty_trash_btn': '清空回收站', 'close_btn': '关闭',
        'switch_digital': '切换到数字时钟',
        'ai_planner_title': 'StudyHub AI 计划器',
        'ai_planner_desc': '描述您的需求: AI 会为您规划。试试"自己安排一个惯例"、"轻松的周末计划"、"紧张的考试周"、"早上数学，晚上物理"、"今天学习 3 小时"或"本周专注化学"。',
        'ai_planner_placeholder': '在此输入您的请求...',
        'generate_plan_btn': '生成计划',
        'chip_auto': '自动惯例', 'chip_easy': '轻松', 'chip_exam': '考试周', 'chip_weekend': '周末',
        'chip_math_physics': '数学 + 物理', 'chip_surprise': '随机', 'chip_3h': '今天 3 小时',
        'understood': '已理解', 'mode_easy': '轻松', 'mode_balanced': '均衡', 'mode_intense': '紧张',
        'scope_full_week': '整周', 'scope_weekend_only': '仅周末', 'scope_weekdays_only': '仅工作日',
        'scope_today_only': '仅今天', 'scope_tomorrow_only': '仅明天',
        'time_any': '任意时段', 'time_mornings': '上午', 'time_afternoons': '下午', 'time_evenings': '晚上',
        'subjects_label': '科目', 'total_sessions_label': '总会话数', 'across_label': '共', 'days_label': '天',
        'apply_merge_btn': '应用到计划器（合并）', 'replace_planner_btn': '替换计划器',
        'retry_variation_btn': '重试（新变体）', 'reset_planner_btn': '重置计划器',
        'reset_confirm': '重置计划器？将清空所有单元格: 无法撤销。',
        'please_type_plan': '请输入您想规划的内容, 或点击上方标签。',
        'today_minutes': '今天', 'total_minutes': '总计',
        'pause_btn': '暂停', 'sound_none': '无声', 'sound_rain': '雨声', 'sound_white': '白噪音', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': '测验生成器', 'generate_quiz_btn': '从笔记生成测验', 'clear_quiz_btn': '清除测验',
        'quiz_next': '下一个',
        'quiz_results': '结果',
        'quiz_score': '得分',
        'quiz_review': '复习',
        'quiz_source': '来自你的笔记',
        'quiz_fill_blank': '填空',
        'quiz_cards_saved': '错题已保存到抽认卡。',
        'quiz_retry_missed': '重做错题',
        'auto_flashcards_btn': '从笔记自动生成'
    },
    hi: {
        'blocker_on': 'ब्लॉकर चालू', 'blocker_off': 'ब्लॉकर बंद',
        'blocked_alert_title': 'ब्लॉक किया गया!',
        'blocked_alert_msg': 'आपकी व्याकुलता सूची में है। इसे खोलने के लिए ब्लॉकर बंद करें।',
        'trash_label': 'ट्रैश', 'trash_empty_msg': 'ट्रैश खाली है।',
        'restore_btn': 'पुनर्स्थापित', 'delete_btn': 'हटाएं', 'empty_trash_btn': 'ट्रैश खाली करें', 'close_btn': 'बंद करें',
        'switch_digital': 'डिजिटल पर स्विच करें',
        'ai_planner_title': 'StudyHub AI प्लानर',
        'ai_planner_desc': 'बताएं कि आप क्या चाहते हैं: AI आपके लिए योजना बनाएगा। आज़माएं "खुद एक दिनचर्या बनाओ", "आसान सप्ताहांत योजना", "गहन परीक्षा सप्ताह", "सुबह गणित, शाम भौतिकी", "आज 3 घंटे" या "इस सप्ताह रसायन पर ध्यान दें"।',
        'ai_planner_placeholder': 'यहाँ अपनी request लिखें...',
        'generate_plan_btn': 'योजना बनाएं',
        'chip_auto': 'स्वतः दिनचर्या', 'chip_easy': 'आसान', 'chip_exam': 'परीक्षा सप्ताह', 'chip_weekend': 'सप्ताहांत',
        'chip_math_physics': 'गणित + भौतिकी', 'chip_surprise': 'आश्चर्य', 'chip_3h': 'आज 3 घंटे',
        'understood': 'समझ गया', 'mode_easy': 'आसान', 'mode_balanced': 'संतुलित', 'mode_intense': 'गहन',
        'scope_full_week': 'पूरा सप्ताह', 'scope_weekend_only': 'केवल सप्ताहांत', 'scope_weekdays_only': 'केवल कार्यदिवस',
        'scope_today_only': 'केवल आज', 'scope_tomorrow_only': 'केवल कल',
        'time_any': 'किसी भी समय', 'time_mornings': 'सुबह', 'time_afternoons': 'दोपहर', 'time_evenings': 'शाम',
        'subjects_label': 'विषय', 'total_sessions_label': 'कुल सत्र', 'across_label': 'में', 'days_label': 'दिन',
        'apply_merge_btn': 'प्लानर में लागू करें (मर्ज)', 'replace_planner_btn': 'प्लानर बदलें',
        'retry_variation_btn': 'पुनः प्रयास (नया)', 'reset_planner_btn': 'प्लानर रीसेट करें',
        'reset_confirm': 'प्लानर रीसेट करें? सभी सेल साफ हो जाएंगे: इसे पूर्ववत नहीं किया जा सकता।',
        'please_type_plan': 'जो योजना बनानी है वह लिखें, या ऊपर कोई चिप क्लिक करें।',
        'today_minutes': 'आज', 'total_minutes': 'कुल',
        'pause_btn': 'रोकें', 'sound_none': 'कोई ध्वनि नहीं', 'sound_rain': 'बारिश', 'sound_white': 'सफेद शोर', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'क्विज़ जनरेटर', 'generate_quiz_btn': 'नोट्स से क्विज़ बनाएं', 'clear_quiz_btn': 'क्विज़ साफ करें',
        'quiz_next': 'अगला',
        'quiz_results': 'परिणाम',
        'quiz_score': 'स्कोर',
        'quiz_review': 'समीक्षा',
        'quiz_source': 'आपके नोट से',
        'quiz_fill_blank': 'रिक्त स्थान भरें',
        'quiz_cards_saved': 'गलत उत्तर फ्लैशकार्ड में सहेजे गए।',
        'quiz_retry_missed': 'छूटे हुए दोबारा',
        'auto_flashcards_btn': 'नोट्स से स्वतः बनाएं'
    },
    ar: {
        'blocker_on': 'الحاجب مُفعّل', 'blocker_off': 'الحاجب مُعطّل',
        'blocked_alert_title': 'محجوب!',
        'blocked_alert_msg': 'في قائمة المشتتات. أوقف الحاجب للوصول إليه.',
        'trash_label': 'المهملات', 'trash_empty_msg': 'المهملات فارغة.',
        'restore_btn': 'استعادة', 'delete_btn': 'حذف', 'empty_trash_btn': 'إفراغ المهملات', 'close_btn': 'إغلاق',
        'switch_digital': 'التبديل إلى الرقمي',
        'ai_planner_title': 'مخطط StudyHub AI',
        'ai_planner_desc': 'صف ما تريده: سيقوم الذكاء الاصطناعي بالتخطيط. جرّب "اصنع روتينًا بنفسك"، "خطة عطلة نهاية أسبوع سهلة"، "أسبوع امتحانات مكثف"، "رياضيات صباحًا، فيزياء مساءً"، "3 ساعات اليوم" أو "التركيز على الكيمياء هذا الأسبوع".',
        'ai_planner_placeholder': 'اكتب طلبك هنا...',
        'generate_plan_btn': 'توليد خطة',
        'chip_auto': 'روتين تلقائي', 'chip_easy': 'سهل', 'chip_exam': 'أسبوع الامتحانات', 'chip_weekend': 'عطلة نهاية الأسبوع',
        'chip_math_physics': 'رياضيات + فيزياء', 'chip_surprise': 'مفاجئني', 'chip_3h': '3 ساعات اليوم',
        'understood': 'تم الفهم', 'mode_easy': 'سهل', 'mode_balanced': 'متوازن', 'mode_intense': 'مكثف',
        'scope_full_week': 'الأسبوع كامل', 'scope_weekend_only': 'عطلة نهاية الأسبوع فقط', 'scope_weekdays_only': 'أيام الأسبوع فقط',
        'scope_today_only': 'اليوم فقط', 'scope_tomorrow_only': 'غدًا فقط',
        'time_any': 'أي وقت', 'time_mornings': 'صباحًا', 'time_afternoons': 'بعد الظهر', 'time_evenings': 'مساءً',
        'subjects_label': 'المواد', 'total_sessions_label': 'إجمالي الجلسات', 'across_label': 'خلال', 'days_label': 'يوم',
        'apply_merge_btn': 'تطبيق على المخطط (دمج)', 'replace_planner_btn': 'استبدال المخطط',
        'retry_variation_btn': 'إعادة المحاولة (تنويع جديد)', 'reset_planner_btn': 'إعادة تعيين المخطط',
        'reset_confirm': 'إعادة تعيين المخطط؟ سيتم مسح كل الخلايا: لا يمكن التراجع.',
        'please_type_plan': 'اكتب ما تريد تخطيطه, أو انقر على أحد الأزرار أعلاه.',
        'today_minutes': 'اليوم', 'total_minutes': 'الإجمالي',
        'pause_btn': 'إيقاف مؤقت', 'sound_none': 'بدون صوت', 'sound_rain': 'مطر', 'sound_white': 'ضجيج أبيض', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'منشئ الاختبارات', 'generate_quiz_btn': 'توليد اختبار من الملاحظات', 'clear_quiz_btn': 'مسح الاختبار',
        'quiz_next': 'التالي',
        'quiz_results': 'النتائج',
        'quiz_score': 'النتيجة',
        'quiz_review': 'المراجعة',
        'quiz_source': 'من ملاحظتك',
        'quiz_fill_blank': 'أكمل الفراغ',
        'quiz_cards_saved': 'تم حفظ الإجابات الخاطئة في بطاقاتك.',
        'quiz_retry_missed': 'أعد المحاولة',
        'auto_flashcards_btn': 'توليد تلقائي من الملاحظات'
    },
    fr: {
        'blocker_on': 'Bloqueur Activé', 'blocker_off': 'Bloqueur Désactivé',
        'blocked_alert_title': 'Bloqué !',
        'blocked_alert_msg': 'est dans votre liste de distractions. Désactivez le Bloqueur pour y accéder.',
        'trash_label': 'Corbeille', 'trash_empty_msg': 'La corbeille est vide.',
        'restore_btn': 'Restaurer', 'delete_btn': 'Supprimer', 'empty_trash_btn': 'Vider la corbeille', 'close_btn': 'Fermer',
        'switch_digital': 'Passer au numérique',
        'ai_planner_title': 'Planificateur IA StudyHub',
        'ai_planner_desc': 'Décrivez ce que vous voulez: l\'IA le planifiera. Essayez "fais une routine toi-même", "plan week-end facile", "semaine d\'examens intense", "maths le matin, physique le soir", "3 heures aujourd\'hui" ou "concentre-toi sur la chimie cette semaine".',
        'ai_planner_placeholder': 'Tapez votre demande ici...',
        'generate_plan_btn': 'Générer le plan',
        'chip_auto': 'Routine auto', 'chip_easy': 'Facile', 'chip_exam': 'Semaine d\'examens', 'chip_weekend': 'Week-end',
        'chip_math_physics': 'Maths + Physique', 'chip_surprise': 'Surprends-moi', 'chip_3h': '3h aujourd\'hui',
        'understood': 'Compris', 'mode_easy': 'Facile / léger', 'mode_balanced': 'Équilibré', 'mode_intense': 'Intense',
        'scope_full_week': 'Semaine complète', 'scope_weekend_only': 'Week-end uniquement', 'scope_weekdays_only': 'Jours de semaine uniquement',
        'scope_today_only': 'Aujourd\'hui seulement', 'scope_tomorrow_only': 'Demain seulement',
        'time_any': 'n\'importe quand', 'time_mornings': 'matins', 'time_afternoons': 'après-midis', 'time_evenings': 'soirées',
        'subjects_label': 'Matières', 'total_sessions_label': 'Sessions totales', 'across_label': 'sur', 'days_label': 'jour(s)',
        'apply_merge_btn': 'Appliquer au planificateur (fusionner)', 'replace_planner_btn': 'Remplacer le planificateur',
        'retry_variation_btn': 'Réessayer (nouvelle variation)', 'reset_planner_btn': 'Réinitialiser le planificateur',
        'reset_confirm': 'Réinitialiser le planificateur ? Toutes les cellules seront effacées: action irréversible.',
        'please_type_plan': 'Tapez ce que vous voulez planifier, ou cliquez sur un bouton ci-dessus.',
        'today_minutes': 'Aujourd\'hui', 'total_minutes': 'Total',
        'pause_btn': 'Pause', 'sound_none': 'Aucun son', 'sound_rain': 'Pluie', 'sound_white': 'Bruit blanc', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'Générateur de Quiz', 'generate_quiz_btn': 'Générer un Quiz depuis les Notes', 'clear_quiz_btn': 'Effacer le Quiz',
        'quiz_next': 'Suivant',
        'quiz_results': 'Résultats',
        'quiz_score': 'Score',
        'quiz_review': 'Révision',
        'quiz_source': 'De ta note',
        'quiz_fill_blank': 'Complète le blanc',
        'quiz_cards_saved': 'Réponses fausses ajoutées à tes cartes.',
        'quiz_retry_missed': 'Refaire les ratées',
        'auto_flashcards_btn': 'Auto-générer depuis les Notes'
    },
    ru: {
        'blocker_on': 'Блокировщик Вкл.', 'blocker_off': 'Блокировщик Выкл.',
        'blocked_alert_title': 'Заблокировано!',
        'blocked_alert_msg': 'находится в вашем списке отвлечений. Отключите блокировщик, чтобы открыть его.',
        'trash_label': 'Корзина', 'trash_empty_msg': 'Корзина пуста.',
        'restore_btn': 'Восстановить', 'delete_btn': 'Удалить', 'empty_trash_btn': 'Очистить корзину', 'close_btn': 'Закрыть',
        'switch_digital': 'Переключиться на цифровые',
        'ai_planner_title': 'ИИ-планировщик StudyHub',
        'ai_planner_desc': 'Опишите, что вы хотите: ИИ спланирует это. Попробуйте "составь рутину сам", "лёгкий план на выходные", "интенсивная неделя экзаменов", "математика утром, физика вечером", "3 часа сегодня" или "фокус на химии на этой неделе".',
        'ai_planner_placeholder': 'Введите ваш запрос...',
        'generate_plan_btn': 'Создать план',
        'chip_auto': 'Авто-рутина', 'chip_easy': 'Легко', 'chip_exam': 'Неделя экзаменов', 'chip_weekend': 'Выходные',
        'chip_math_physics': 'Матем. + Физика', 'chip_surprise': 'Удиви меня', 'chip_3h': '3 ч сегодня',
        'understood': 'Понято', 'mode_easy': 'Легко', 'mode_balanced': 'Сбалансированно', 'mode_intense': 'Интенсивно',
        'scope_full_week': 'Вся неделя', 'scope_weekend_only': 'Только выходные', 'scope_weekdays_only': 'Только будни',
        'scope_today_only': 'Только сегодня', 'scope_tomorrow_only': 'Только завтра',
        'time_any': 'в любое время', 'time_mornings': 'утро', 'time_afternoons': 'день', 'time_evenings': 'вечер',
        'subjects_label': 'Предметы', 'total_sessions_label': 'Всего сессий', 'across_label': 'в течение', 'days_label': 'дн.',
        'apply_merge_btn': 'Применить к планировщику (слить)', 'replace_planner_btn': 'Заменить планировщик',
        'retry_variation_btn': 'Повторить (новый вариант)', 'reset_planner_btn': 'Сбросить планировщик',
        'reset_confirm': 'Сбросить планировщик? Все ячейки будут очищены: действие необратимо.',
        'please_type_plan': 'Напишите, что хотите запланировать, или нажмите кнопку выше.',
        'today_minutes': 'Сегодня', 'total_minutes': 'Всего',
        'pause_btn': 'Пауза', 'sound_none': 'Без звука', 'sound_rain': 'Дождь', 'sound_white': 'Белый шум', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'Генератор тестов', 'generate_quiz_btn': 'Создать тест из заметок', 'clear_quiz_btn': 'Очистить тест',
        'quiz_next': 'Далее',
        'quiz_results': 'Результаты',
        'quiz_score': 'Счёт',
        'quiz_review': 'Повторение',
        'quiz_source': 'Из заметки',
        'quiz_fill_blank': 'Заполните пропуск',
        'quiz_cards_saved': 'Неверные ответы сохранены в карточки.',
        'quiz_retry_missed': 'Повторить ошибки',
        'auto_flashcards_btn': 'Автогенерация из заметок'
    },
    pt: {
        'blocker_on': 'Bloqueador Ligado', 'blocker_off': 'Bloqueador Desligado',
        'blocked_alert_title': 'Bloqueado!',
        'blocked_alert_msg': 'está na sua lista de distrações. Desligue o Bloqueador para visitá-lo.',
        'trash_label': 'Lixeira', 'trash_empty_msg': 'A lixeira está vazia.',
        'restore_btn': 'Restaurar', 'delete_btn': 'Excluir', 'empty_trash_btn': 'Esvaziar Lixeira', 'close_btn': 'Fechar',
        'switch_digital': 'Mudar para Digital',
        'ai_planner_title': 'Planejador IA StudyHub',
        'ai_planner_desc': 'Descreva o que você quer: a IA vai planejar. Tente "faça uma rotina você mesmo", "plano de fim de semana fácil", "semana de provas intensa", "matemática de manhã, física à noite", "3 horas hoje" ou "foco em química esta semana".',
        'ai_planner_placeholder': 'Digite seu pedido aqui...',
        'generate_plan_btn': 'Gerar Plano',
        'chip_auto': 'Rotina auto', 'chip_easy': 'Fácil', 'chip_exam': 'Semana de provas', 'chip_weekend': 'Fim de semana',
        'chip_math_physics': 'Mat + Física', 'chip_surprise': 'Surpreenda-me', 'chip_3h': '3h hoje',
        'understood': 'Entendido', 'mode_easy': 'Fácil / leve', 'mode_balanced': 'Equilibrado', 'mode_intense': 'Intenso',
        'scope_full_week': 'Semana completa', 'scope_weekend_only': 'Apenas fim de semana', 'scope_weekdays_only': 'Apenas dias úteis',
        'scope_today_only': 'Apenas hoje', 'scope_tomorrow_only': 'Apenas amanhã',
        'time_any': 'qualquer hora', 'time_mornings': 'manhãs', 'time_afternoons': 'tardes', 'time_evenings': 'noites',
        'subjects_label': 'Disciplinas', 'total_sessions_label': 'Total de sessões', 'across_label': 'em', 'days_label': 'dia(s)',
        'apply_merge_btn': 'Aplicar ao Planejador (mesclar)', 'replace_planner_btn': 'Substituir Planejador',
        'retry_variation_btn': 'Tentar novamente (nova variação)', 'reset_planner_btn': 'Redefinir Planejador',
        'reset_confirm': 'Redefinir o planejador? Todas as células serão apagadas: irreversível.',
        'please_type_plan': 'Digite o que deseja planejar, ou clique em um chip acima.',
        'today_minutes': 'Hoje', 'total_minutes': 'Total',
        'pause_btn': 'Pausar', 'sound_none': 'Sem som', 'sound_rain': 'Chuva', 'sound_white': 'Ruído branco', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'Gerador de Quiz', 'generate_quiz_btn': 'Gerar Quiz das Notas', 'clear_quiz_btn': 'Limpar Quiz',
        'quiz_next': 'Seguinte',
        'quiz_results': 'Resultados',
        'quiz_score': 'Pontuação',
        'quiz_review': 'Revisão',
        'quiz_source': 'Da tua nota',
        'quiz_fill_blank': 'Completa a lacuna',
        'quiz_cards_saved': 'Respostas erradas guardadas nos teus cartões.',
        'quiz_retry_missed': 'Repetir erradas',
        'auto_flashcards_btn': 'Auto-gerar das Notas'
    },
    bn: {
        'blocker_on': 'ব্লকার চালু', 'blocker_off': 'ব্লকার বন্ধ',
        'blocked_alert_title': 'ব্লক করা হয়েছে!',
        'blocked_alert_msg': 'আপনার বিভ্রান্তির তালিকায় আছে। এটি দেখতে ব্লকার বন্ধ করুন।',
        'trash_label': 'ট্র্যাশ', 'trash_empty_msg': 'ট্র্যাশ খালি।',
        'restore_btn': 'পুনরুদ্ধার', 'delete_btn': 'মুছুন', 'empty_trash_btn': 'ট্র্যাশ খালি করুন', 'close_btn': 'বন্ধ করুন',
        'switch_digital': 'ডিজিটালে স্যুইচ করুন',
        'ai_planner_title': 'StudyHub AI প্ল্যানার',
        'ai_planner_desc': 'আপনি কী চান তা বর্ণনা করুন: AI আপনার জন্য পরিকল্পনা করবে। চেষ্টা করুন "নিজেই একটি রুটিন বানাও", "সহজ সাপ্তাহিক ছুটির পরিকল্পনা", "তীব্র পরীক্ষার সপ্তাহ", "সকালে গণিত, সন্ধ্যায় পদার্থবিদ্যা", "আজ 3 ঘন্টা" বা "এই সপ্তাহে রসায়নে মনোযোগ দিন"।',
        'ai_planner_placeholder': 'এখানে আপনার অনুরোধ লিখুন...',
        'generate_plan_btn': 'পরিকল্পনা তৈরি করুন',
        'chip_auto': 'স্বয়ংক্রিয় রুটিন', 'chip_easy': 'সহজ', 'chip_exam': 'পরীক্ষার সপ্তাহ', 'chip_weekend': 'সাপ্তাহিক ছুটি',
        'chip_math_physics': 'গণিত + পদার্থবিদ্যা', 'chip_surprise': 'আশ্চর্য করুন', 'chip_3h': 'আজ 3 ঘন্টা',
        'understood': 'বুঝেছি', 'mode_easy': 'সহজ', 'mode_balanced': 'ভারসাম্যপূর্ণ', 'mode_intense': 'তীব্র',
        'scope_full_week': 'পুরো সপ্তাহ', 'scope_weekend_only': 'শুধু সাপ্তাহিক ছুটি', 'scope_weekdays_only': 'শুধু কর্মদিবস',
        'scope_today_only': 'শুধু আজ', 'scope_tomorrow_only': 'শুধু কাল',
        'time_any': 'যেকোনো সময়', 'time_mornings': 'সকাল', 'time_afternoons': 'বিকেল', 'time_evenings': 'সন্ধ্যা',
        'subjects_label': 'বিষয়', 'total_sessions_label': 'মোট সেশন', 'across_label': 'জুড়ে', 'days_label': 'দিন',
        'apply_merge_btn': 'প্ল্যানারে প্রয়োগ করুন (মার্জ)', 'replace_planner_btn': 'প্ল্যানার প্রতিস্থাপন করুন',
        'retry_variation_btn': 'আবার চেষ্টা করুন (নতুন)', 'reset_planner_btn': 'প্ল্যানার রিসেট করুন',
        'reset_confirm': 'প্ল্যানার রিসেট করবেন? সব ঘর মুছে যাবে: এটি পূর্বাবস্থায় ফেরানো যাবে না।',
        'please_type_plan': 'যা পরিকল্পনা করতে চান লিখুন, বা উপরের চিপে ক্লিক করুন।',
        'today_minutes': 'আজ', 'total_minutes': 'মোট',
        'pause_btn': 'বিরতি', 'sound_none': 'কোনো শব্দ নেই', 'sound_rain': 'বৃষ্টি', 'sound_white': 'সাদা শব্দ', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'কুইজ জেনারেটর', 'generate_quiz_btn': 'নোট থেকে কুইজ তৈরি করুন', 'clear_quiz_btn': 'কুইজ মুছুন',
        'quiz_next': 'পরবর্তী',
        'quiz_results': 'ফলাফল',
        'quiz_score': 'স্কোর',
        'quiz_review': 'পুনরালোচনা',
        'quiz_source': 'তোমার নোট থেকে',
        'quiz_fill_blank': 'শূন্যস্থান পূরণ করো',
        'quiz_cards_saved': 'ভুল উত্তর ফ্ল্যাশকার্ডে সংরক্ষিত হয়েছে।',
        'quiz_retry_missed': 'ভুলগুলো আবার করো',
        'auto_flashcards_btn': 'নোট থেকে স্বয়ংক্রিয়'
    },
    ur: {
        'blocker_on': 'بلاکر آن', 'blocker_off': 'بلاکر آف',
        'blocked_alert_title': 'بلاک کر دیا گیا!',
        'blocked_alert_msg': 'آپ کی خلل کی فہرست میں ہے۔ اسے کھولنے کے لیے بلاکر آف کریں۔',
        'trash_label': 'ردی', 'trash_empty_msg': 'ردی خالی ہے۔',
        'restore_btn': 'بحال کریں', 'delete_btn': 'حذف کریں', 'empty_trash_btn': 'ردی خالی کریں', 'close_btn': 'بند کریں',
        'switch_digital': 'ڈیجیٹل پر سوئچ کریں',
        'ai_planner_title': 'StudyHub AI پلانر',
        'ai_planner_desc': 'بتائیں آپ کیا چاہتے ہیں: AI آپ کے لیے منصوبہ بنائے گا۔ آزمائیں "خود ایک معمول بنائیں"، "آسان ویک اینڈ پلان"، "شدید امتحان ہفتہ"، "صبح ریاضی، شام فزکس"، "آج 3 گھنٹے" یا "اس ہفتے کیمسٹری پر توجہ دیں"۔',
        'ai_planner_placeholder': 'یہاں اپنی درخواست لکھیں...',
        'generate_plan_btn': 'منصوبہ بنائیں',
        'chip_auto': 'خودکار معمول', 'chip_easy': 'آسان', 'chip_exam': 'امتحان ہفتہ', 'chip_weekend': 'ویک اینڈ',
        'chip_math_physics': 'ریاضی + فزکس', 'chip_surprise': 'حیران کریں', 'chip_3h': 'آج 3 گھنٹے',
        'understood': 'سمجھ گیا', 'mode_easy': 'آسان', 'mode_balanced': 'متوازن', 'mode_intense': 'شدید',
        'scope_full_week': 'پورا ہفتہ', 'scope_weekend_only': 'صرف ویک اینڈ', 'scope_weekdays_only': 'صرف کاروباری دن',
        'scope_today_only': 'صرف آج', 'scope_tomorrow_only': 'صرف کل',
        'time_any': 'کسی بھی وقت', 'time_mornings': 'صبح', 'time_afternoons': 'دوپہر', 'time_evenings': 'شام',
        'subjects_label': 'مضامین', 'total_sessions_label': 'کل سیشن', 'across_label': 'میں', 'days_label': 'دن',
        'apply_merge_btn': 'پلانر پر لاگو کریں (ضم)', 'replace_planner_btn': 'پلانر تبدیل کریں',
        'retry_variation_btn': 'دوبارہ کوشش کریں (نیا)', 'reset_planner_btn': 'پلانر ری سیٹ کریں',
        'reset_confirm': 'پلانر ری سیٹ کریں؟ تمام خلیے صاف ہو جائیں گے: اسے واپس نہیں کیا جا سکتا۔',
        'please_type_plan': 'جو منصوبہ بنانا ہے لکھیں, یا اوپر کوئی چپ کلک کریں۔',
        'today_minutes': 'آج', 'total_minutes': 'کل',
        'pause_btn': 'وقفہ', 'sound_none': 'کوئی آواز نہیں', 'sound_rain': 'بارش', 'sound_white': 'سفید شور', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'کوئز جنریٹر', 'generate_quiz_btn': 'نوٹس سے کوئز بنائیں', 'clear_quiz_btn': 'کوئز صاف کریں',
        'quiz_next': 'اگلا',
        'quiz_results': 'نتائج',
        'quiz_score': 'اسکور',
        'quiz_review': 'جائزہ',
        'quiz_source': 'آپ کے نوٹ سے',
        'quiz_fill_blank': 'خالی جگہ بھریں',
        'quiz_cards_saved': 'غلط جوابات فلیش کارڈز میں محفوظ ہو گئے۔',
        'quiz_retry_missed': 'غلط دوبارہ حل کریں',
        'auto_flashcards_btn': 'نوٹس سے خودکار'
    },
    id: {
        'blocker_on': 'Blocker Aktif', 'blocker_off': 'Blocker Nonaktif',
        'blocked_alert_title': 'Diblokir!',
        'blocked_alert_msg': 'ada dalam daftar gangguan Anda. Matikan Blocker untuk mengunjunginya.',
        'trash_label': 'Sampah', 'trash_empty_msg': 'Sampah kosong.',
        'restore_btn': 'Pulihkan', 'delete_btn': 'Hapus', 'empty_trash_btn': 'Kosongkan Sampah', 'close_btn': 'Tutup',
        'switch_digital': 'Beralih ke Digital',
        'ai_planner_title': 'Perencana AI StudyHub',
        'ai_planner_desc': 'Jelaskan apa yang Anda inginkan: AI akan merencanakannya. Coba "buat rutinitas sendiri", "rencana akhir pekan santai", "minggu ujian intens", "matematika pagi, fisika malam", "3 jam hari ini" atau "fokus kimia minggu ini".',
        'ai_planner_placeholder': 'Ketik permintaan Anda di sini...',
        'generate_plan_btn': 'Buat Rencana',
        'chip_auto': 'Rutinitas otomatis', 'chip_easy': 'Santai', 'chip_exam': 'Minggu ujian', 'chip_weekend': 'Akhir pekan',
        'chip_math_physics': 'Mat + Fisika', 'chip_surprise': 'Kejutkan saya', 'chip_3h': '3 jam hari ini',
        'understood': 'Dipahami', 'mode_easy': 'Santai', 'mode_balanced': 'Seimbang', 'mode_intense': 'Intens',
        'scope_full_week': 'Seminggu penuh', 'scope_weekend_only': 'Hanya akhir pekan', 'scope_weekdays_only': 'Hanya hari kerja',
        'scope_today_only': 'Hanya hari ini', 'scope_tomorrow_only': 'Hanya besok',
        'time_any': 'kapan saja', 'time_mornings': 'pagi', 'time_afternoons': 'siang', 'time_evenings': 'malam',
        'subjects_label': 'Mata Pelajaran', 'total_sessions_label': 'Total sesi', 'across_label': 'dalam', 'days_label': 'hari',
        'apply_merge_btn': 'Terapkan ke Perencana (gabung)', 'replace_planner_btn': 'Ganti Perencana',
        'retry_variation_btn': 'Coba lagi (variasi baru)', 'reset_planner_btn': 'Atur Ulang Perencana',
        'reset_confirm': 'Atur ulang perencana? Semua sel akan dihapus: tidak dapat dibatalkan.',
        'please_type_plan': 'Ketik apa yang ingin Anda rencanakan, atau klik chip di atas.',
        'today_minutes': 'Hari ini', 'total_minutes': 'Total',
        'pause_btn': 'Jeda', 'sound_none': 'Tanpa Suara', 'sound_rain': 'Hujan', 'sound_white': 'White Noise', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'Pembuat Kuis', 'generate_quiz_btn': 'Buat Kuis dari Catatan', 'clear_quiz_btn': 'Hapus Kuis',
        'quiz_next': 'Berikutnya',
        'quiz_results': 'Hasil',
        'quiz_score': 'Skor',
        'quiz_review': 'Ulasan',
        'quiz_source': 'Dari catatanmu',
        'quiz_fill_blank': 'Isi bagian kosong',
        'quiz_cards_saved': 'Jawaban salah disimpan ke kartu belajar.',
        'quiz_retry_missed': 'Ulangi yang salah',
        'auto_flashcards_btn': 'Otomatis dari Catatan'
    },
    de: {
        'blocker_on': 'Blocker An', 'blocker_off': 'Blocker Aus',
        'blocked_alert_title': 'Blockiert!',
        'blocked_alert_msg': 'steht auf Ihrer Ablenkungsliste. Schalten Sie den Blocker aus, um es zu besuchen.',
        'trash_label': 'Papierkorb', 'trash_empty_msg': 'Papierkorb ist leer.',
        'restore_btn': 'Wiederherstellen', 'delete_btn': 'Löschen', 'empty_trash_btn': 'Papierkorb leeren', 'close_btn': 'Schließen',
        'switch_digital': 'Auf Digital umschalten',
        'ai_planner_title': 'StudyHub KI-Planer',
        'ai_planner_desc': 'Beschreiben Sie, was Sie möchten: die KI plant es für Sie. Probieren Sie "mach selbst eine Routine", "einfacher Wochenendplan", "intensive Prüfungswoche", "Mathe morgens, Physik abends", "3 Stunden heute" oder "Fokus auf Chemie diese Woche".',
        'ai_planner_placeholder': 'Geben Sie hier Ihre Anfrage ein...',
        'generate_plan_btn': 'Plan erstellen',
        'chip_auto': 'Auto-Routine', 'chip_easy': 'Einfach', 'chip_exam': 'Prüfungswoche', 'chip_weekend': 'Wochenende',
        'chip_math_physics': 'Mathe + Physik', 'chip_surprise': 'Überrasch mich', 'chip_3h': '3 Std heute',
        'understood': 'Verstanden', 'mode_easy': 'Einfach', 'mode_balanced': 'Ausgewogen', 'mode_intense': 'Intensiv',
        'scope_full_week': 'Ganze Woche', 'scope_weekend_only': 'Nur Wochenende', 'scope_weekdays_only': 'Nur Werktage',
        'scope_today_only': 'Nur heute', 'scope_tomorrow_only': 'Nur morgen',
        'time_any': 'jederzeit', 'time_mornings': 'morgens', 'time_afternoons': 'nachmittags', 'time_evenings': 'abends',
        'subjects_label': 'Fächer', 'total_sessions_label': 'Sitzungen gesamt', 'across_label': 'über', 'days_label': 'Tag(e)',
        'apply_merge_btn': 'Auf Planer anwenden (zusammenführen)', 'replace_planner_btn': 'Planer ersetzen',
        'retry_variation_btn': 'Erneut versuchen (neue Variante)', 'reset_planner_btn': 'Planer zurücksetzen',
        'reset_confirm': 'Planer zurücksetzen? Alle Zellen werden gelöscht: nicht rückgängig zu machen.',
        'please_type_plan': 'Geben Sie ein, was Sie planen möchten, oder klicken Sie oben auf einen Chip.',
        'today_minutes': 'Heute', 'total_minutes': 'Gesamt',
        'pause_btn': 'Pause', 'sound_none': 'Kein Ton', 'sound_rain': 'Regen', 'sound_white': 'Weißes Rauschen', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'Quiz-Generator', 'generate_quiz_btn': 'Quiz aus Notizen erstellen', 'clear_quiz_btn': 'Quiz löschen',
        'quiz_next': 'Weiter',
        'quiz_results': 'Ergebnisse',
        'quiz_score': 'Punktzahl',
        'quiz_review': 'Wiederholung',
        'quiz_source': 'Aus deiner Notiz',
        'quiz_fill_blank': 'Lücke füllen',
        'quiz_cards_saved': 'Falsche Antworten in den Karten gespeichert.',
        'quiz_retry_missed': 'Falsche wiederholen',
        'auto_flashcards_btn': 'Automatisch aus Notizen'
    },
    ja: {
        'blocker_on': 'ブロッカー オン', 'blocker_off': 'ブロッカー オフ',
        'blocked_alert_title': 'ブロックされました！',
        'blocked_alert_msg': 'はあなたの気晴らしリストにあります。ブロッカーをオフにしてアクセスしてください。',
        'trash_label': 'ゴミ箱', 'trash_empty_msg': 'ゴミ箱は空です。',
        'restore_btn': '復元', 'delete_btn': '削除', 'empty_trash_btn': 'ゴミ箱を空にする', 'close_btn': '閉じる',
        'switch_digital': 'デジタルに切り替え',
        'ai_planner_title': 'StudyHub AIプランナー',
        'ai_planner_desc': '何をしたいか説明してください: AIが計画します。「自分でルーチンを作って」「簡単な週末プラン」「集中的な試験週間」「朝は数学、夜は物理」「今日3時間」「今週は化学に集中」などを試してみてください。',
        'ai_planner_placeholder': 'ここにリクエストを入力...',
        'generate_plan_btn': 'プランを生成',
        'chip_auto': '自動ルーチン', 'chip_easy': '簡単', 'chip_exam': '試験週間', 'chip_weekend': '週末',
        'chip_math_physics': '数学 + 物理', 'chip_surprise': 'おまかせ', 'chip_3h': '今日3時間',
        'understood': '理解しました', 'mode_easy': '簡単', 'mode_balanced': 'バランス', 'mode_intense': '集中的',
        'scope_full_week': '一週間', 'scope_weekend_only': '週末のみ', 'scope_weekdays_only': '平日のみ',
        'scope_today_only': '今日のみ', 'scope_tomorrow_only': '明日のみ',
        'time_any': 'いつでも', 'time_mornings': '朝', 'time_afternoons': '午後', 'time_evenings': '夜',
        'subjects_label': '科目', 'total_sessions_label': '合計セッション', 'across_label': '全体', 'days_label': '日',
        'apply_merge_btn': 'プランナーに適用（マージ）', 'replace_planner_btn': 'プランナーを置換',
        'retry_variation_btn': '再試行（新しいバリエーション）', 'reset_planner_btn': 'プランナーをリセット',
        'reset_confirm': 'プランナーをリセットしますか？すべてのセルが消去されます: 元に戻せません。',
        'please_type_plan': '計画したいことを入力するか、上のチップをクリックしてください。',
        'today_minutes': '今日', 'total_minutes': '合計',
        'pause_btn': '一時停止', 'sound_none': '無音', 'sound_rain': '雨', 'sound_white': 'ホワイトノイズ', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'クイズジェネレーター', 'generate_quiz_btn': 'ノートからクイズを生成', 'clear_quiz_btn': 'クイズをクリア',
        'quiz_next': '次へ',
        'quiz_results': '結果',
        'quiz_score': 'スコア',
        'quiz_review': '復習',
        'quiz_source': 'ノートから',
        'quiz_fill_blank': '空欄を埋める',
        'quiz_cards_saved': '間違えた回答をカードに保存しました。',
        'quiz_retry_missed': '間違いをやり直す',
        'auto_flashcards_btn': 'ノートから自動生成'
    },
    sw: {
        'blocker_on': 'Kizuizi Kimewashwa', 'blocker_off': 'Kizuizi Kimezimwa',
        'blocked_alert_title': 'Imezuiwa!',
        'blocked_alert_msg': 'iko kwenye orodha yako ya vurugu. Zima kizuizi ili kuitembelea.',
        'trash_label': 'Takataka', 'trash_empty_msg': 'Takataka ni tupu.',
        'restore_btn': 'Rejesha', 'delete_btn': 'Futa', 'empty_trash_btn': 'Ondoa Takataka Zote', 'close_btn': 'Funga',
        'switch_digital': 'Badilisha hadi Dijitali',
        'ai_planner_title': 'Mpangaji AI wa StudyHub',
        'ai_planner_desc': 'Eleza unachotaka: AI itapanga. Jaribu "tengeneza ratiba mwenyewe", "mpango rahisi wa wikendi", "wiki ngumu ya mitihani", "hisabati asubuhi, fizikia jioni", "saa 3 leo" au "zingatia kemia wiki hii".',
        'ai_planner_placeholder': 'Andika ombi lako hapa...',
        'generate_plan_btn': 'Tengeneza Mpango',
        'chip_auto': 'Ratiba otomatiki', 'chip_easy': 'Rahisi', 'chip_exam': 'Wiki ya mitihani', 'chip_weekend': 'Wikendi',
        'chip_math_physics': 'Hisabati + Fizikia', 'chip_surprise': 'Nishangae', 'chip_3h': 'Saa 3 leo',
        'understood': 'Nimeelewa', 'mode_easy': 'Rahisi', 'mode_balanced': 'Wastani', 'mode_intense': 'Ngumu',
        'scope_full_week': 'Wiki kamili', 'scope_weekend_only': 'Wikendi pekee', 'scope_weekdays_only': 'Siku za kazi pekee',
        'scope_today_only': 'Leo pekee', 'scope_tomorrow_only': 'Kesho pekee',
        'time_any': 'wakati wowote', 'time_mornings': 'asubuhi', 'time_afternoons': 'mchana', 'time_evenings': 'jioni',
        'subjects_label': 'Masomo', 'total_sessions_label': 'Vipindi jumla', 'across_label': 'katika', 'days_label': 'siku',
        'apply_merge_btn': 'Tumia kwa Mpangaji (unganisha)', 'replace_planner_btn': 'Badilisha Mpangaji',
        'retry_variation_btn': 'Jaribu tena (tofauti mpya)', 'reset_planner_btn': 'Weka upya Mpangaji',
        'reset_confirm': 'Weka upya mpangaji? Seli zote zitafutwa: haiwezi kutenduliwa.',
        'please_type_plan': 'Andika unachotaka kupanga, au bofya chip hapo juu.',
        'today_minutes': 'Leo', 'total_minutes': 'Jumla',
        'pause_btn': 'Sitisha', 'sound_none': 'Hakuna Sauti', 'sound_rain': 'Mvua', 'sound_white': 'Kelele Nyeupe', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'Kitengeneza Maswali', 'generate_quiz_btn': 'Tengeneza Maswali kutoka Vidokezo', 'clear_quiz_btn': 'Futa Maswali',
        'quiz_next': 'Ifuatayo',
        'quiz_results': 'Matokeo',
        'quiz_score': 'Alama',
        'quiz_review': 'Marudio',
        'quiz_source': 'Kutoka kwa noti yako',
        'quiz_fill_blank': 'Jaza pengo',
        'quiz_cards_saved': 'Majibu yasiyo sahihi yamehifadhiwa kwenye kadi.',
        'quiz_retry_missed': 'Jaribu zilizokosekana',
        'auto_flashcards_btn': 'Otomatiki kutoka Vidokezo'
    },
    tr: {
        'blocker_on': 'Engelleyici Açık', 'blocker_off': 'Engelleyici Kapalı',
        'blocked_alert_title': 'Engellendi!',
        'blocked_alert_msg': 'dikkat dağıtıcı listenizde. Ziyaret etmek için Engelleyiciyi kapatın.',
        'trash_label': 'Çöp Kutusu', 'trash_empty_msg': 'Çöp kutusu boş.',
        'restore_btn': 'Geri Yükle', 'delete_btn': 'Sil', 'empty_trash_btn': 'Çöpü Boşalt', 'close_btn': 'Kapat',
        'switch_digital': 'Dijitale Geç',
        'ai_planner_title': 'StudyHub AI Planlayıcı',
        'ai_planner_desc': 'Ne istediğinizi açıklayın: AI sizin için planlasın. "Kendin bir rutin yap", "kolay hafta sonu planı", "yoğun sınav haftası", "sabah matematik, akşam fizik", "bugün 3 saat" veya "bu hafta kimyaya odaklan" gibi şeyler deneyin.',
        'ai_planner_placeholder': 'İsteğinizi buraya yazın...',
        'generate_plan_btn': 'Plan Oluştur',
        'chip_auto': 'Otomatik rutin', 'chip_easy': 'Kolay', 'chip_exam': 'Sınav haftası', 'chip_weekend': 'Hafta sonu',
        'chip_math_physics': 'Mat + Fizik', 'chip_surprise': 'Beni şaşırt', 'chip_3h': 'Bugün 3s',
        'understood': 'Anlaşıldı', 'mode_easy': 'Kolay', 'mode_balanced': 'Dengeli', 'mode_intense': 'Yoğun',
        'scope_full_week': 'Tam hafta', 'scope_weekend_only': 'Sadece hafta sonu', 'scope_weekdays_only': 'Sadece hafta içi',
        'scope_today_only': 'Sadece bugün', 'scope_tomorrow_only': 'Sadece yarın',
        'time_any': 'herhangi bir zaman', 'time_mornings': 'sabahları', 'time_afternoons': 'öğleden sonraları', 'time_evenings': 'akşamları',
        'subjects_label': 'Dersler', 'total_sessions_label': 'Toplam oturum', 'across_label': 'boyunca', 'days_label': 'gün',
        'apply_merge_btn': 'Planlayıcıya Uygula (birleştir)', 'replace_planner_btn': 'Planlayıcıyı Değiştir',
        'retry_variation_btn': 'Tekrar dene (yeni varyasyon)', 'reset_planner_btn': 'Planlayıcıyı Sıfırla',
        'reset_confirm': 'Planlayıcı sıfırlansın mı? Tüm hücreler silinecek: geri alınamaz.',
        'please_type_plan': 'Ne planlamak istediğinizi yazın, veya yukarıdaki bir çipe tıklayın.',
        'today_minutes': 'Bugün', 'total_minutes': 'Toplam',
        'pause_btn': 'Duraklat', 'sound_none': 'Ses Yok', 'sound_rain': 'Yağmur', 'sound_white': 'Beyaz Gürültü', 'sound_lofi': 'Lo-Fi',
        'quiz_generator': 'Test Oluşturucu', 'generate_quiz_btn': 'Notlardan Test Oluştur', 'clear_quiz_btn': 'Testi Temizle',
        'quiz_next': 'Sonraki',
        'quiz_results': 'Sonuçlar',
        'quiz_score': 'Puan',
        'quiz_review': 'Tekrar',
        'quiz_source': 'Notundan',
        'quiz_fill_blank': 'Boşluğu doldur',
        'quiz_cards_saved': 'Yanlış cevaplar kartlarına kaydedildi.',
        'quiz_retry_missed': 'Yanlışları tekrar et',
        'auto_flashcards_btn': 'Notlardan Otomatik Oluştur'
    }
};

// Merge extra translations into the main translations object
Object.keys(extraTranslations).forEach(function (lang) {
    if (translations[lang]) {
        Object.assign(translations[lang], extraTranslations[lang]);
    } else {
        translations[lang] = extraTranslations[lang];
    }
});

// ================================================================
// AUTO-FILL: every language inherits any key it's missing from English
// This guarantees no untranslated key ever shows as raw text.
// ================================================================
Object.keys(translations).forEach(function (lang) {
    if (lang === 'en') return;
    Object.keys(translations.en).forEach(function (key) {
        if (typeof translations[lang][key] === 'undefined') {
            translations[lang][key] = translations.en[key];
        }
    });
});

let currentLang = 'en';

function getTranslation(key) {
    if (translations[currentLang] && translations[currentLang][key]) {
        return translations[currentLang][key];
    }
    return translations['en'][key] || key;
}

function applyTranslations(lang) {
    currentLang = lang;
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(function(el) {
        const key = el.dataset.i18n;
        const text = getTranslation(key);
        if (text) el.textContent = text;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
        const key = el.dataset.i18nPlaceholder;
        const text = getTranslation(key);
        if (text) el.placeholder = text;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
        const key = el.dataset.i18nTitle;
        const text = getTranslation(key);
        if (text) el.title = text;
    });
    const selector = document.getElementById('langSelector');
    if (selector) selector.value = lang;
    localStorage.setItem('studyHubLang', lang);
}

function initTranslations() {
    const saved = localStorage.getItem('studyHubLang');
    if (saved && translations[saved]) {
        currentLang = saved;
    }
    applyTranslations(currentLang);

    const selector = document.getElementById('langSelector');
    if (selector) {
        selector.addEventListener('change', function() {
            applyTranslations(this.value);
        });
    }
}

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
// AI SUMMARIZER — PREMIUM EDITION (offline, no API)
// ================================================================
function setupSummarizer() {
    var btn = document.getElementById('summarizeBtn');
    if (!btn) return;
    var input = document.getElementById('summarizeInput');
    var output = document.getElementById('summarizeOutput');

    // ---------- injected premium styles (once) ----------
    if (!document.getElementById('summarizerProStyles')) {
        var st = document.createElement('style');
        st.id = 'summarizerProStyles';
        st.textContent = [
            '.sum-pro{display:flex;flex-direction:column;gap:.85rem;animation:sumFade .4s ease}',
            '@keyframes sumFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
            '.sum-block{background:rgba(94,234,212,.06);border:1px solid rgba(94,234,212,.18);border-left:3px solid #5eead4;border-radius:12px;padding:.85rem 1rem}',
            '.sum-block.sum-tldr{background:linear-gradient(135deg,rgba(94,234,212,.12),rgba(167,139,250,.1));box-shadow:0 8px 30px rgba(94,234,212,.08)}',
            '.sum-label{display:flex;align-items:center;gap:.45rem;font-size:.68rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#5eead4;margin-bottom:.5rem}',
            '.sum-label .dot{width:6px;height:6px;border-radius:50%;background:#5eead4;box-shadow:0 0 12px #5eead4;flex-shrink:0}',
            '.sum-body{color:#eef4fb;font-size:.95rem;line-height:1.65}',
            '.sum-body mark{background:rgba(94,234,212,.22);color:#5eead4;padding:0 .28rem;border-radius:4px;font-weight:600}',
            '.sum-points{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:.45rem}',
            '.sum-points li{position:relative;padding-left:1.15rem;color:#eef4fb;font-size:.9rem;line-height:1.55}',
            '.sum-points li::before{content:"▸";position:absolute;left:0;color:#5eead4;font-weight:800}',
            '.sum-points li mark{background:rgba(94,234,212,.18);color:#5eead4;padding:0 .2rem;border-radius:3px}',
            '.sum-keywords{display:flex;flex-wrap:wrap;gap:.4rem}',
            '.sum-kw{background:rgba(167,139,250,.14);border:1px solid rgba(167,139,250,.32);color:#c4b5fd;padding:.2rem .65rem;border-radius:999px;font-size:.74rem;font-weight:600;letter-spacing:.02em}',
            '.sum-stats{display:flex;flex-wrap:wrap;gap:1.2rem;font-size:.74rem;color:#8ea0b5;padding-top:.5rem;border-top:1px dashed rgba(255,255,255,.08);letter-spacing:.02em}',
            '.sum-stats b{color:#5eead4;font-weight:700}',
            '.sum-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.15rem}',
            '.sum-copy{background:rgba(94,234,212,.1);border:1px solid rgba(94,234,212,.3);color:#5eead4;padding:.3rem .85rem;border-radius:999px;font-size:.72rem;font-weight:600;cursor:pointer;font-family:inherit;transition:all .2s}',
            '.sum-copy:hover{background:rgba(94,234,212,.22)}'
        ].join('');
        document.head.appendChild(st);
    }

    // ============================================================
    // NLP ENGINE
    // ============================================================
    var STOP = {};
    ('a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my my self no nor not of off on once only or other ought our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also may might must shall upon among within without across along etc via per said says say get got go goes went come came make made take taken give given see seen know known think thought want wanted use used one two three four five six seven eight nine ten many much lot lots really quite rather somewhat fairly pretty enough almost nearly however therefore moreover furthermore nevertheless nonetheless thus hence accordingly consequently meanwhile similarly likewise additionally overall').split(/\s+/).forEach(function(w){STOP[w]=1;});

    var CUE_BOOST = /\b(in conclusion|in summary|to sum up|the main|the key|important(ly)?|significan(t|ce)|therefore|thus|hence|as a result|consequently|overall|essential(ly)?|crucial(ly)?|notably|primarily|chiefly|mainly|the point is|the goal|the purpose|we (found|conclude|argue|propose|show)|this (shows|means|suggests|demonstrates|proves|indicates))\b/i;
    var FILLER_START = /^(and|but|so|then|also|now|well|okay|ok|um|uh|like|you know|anyway|basically|actually|honestly|literally|simply|just|first|firstly|second|secondly|third|thirdly|finally|lastly)\b[,\s]+/i;
    var FILLER_MID = /\b(basically|actually|literally|honestly|really|very|quite|rather|somewhat|fairly|kind of|sort of|you know|i mean|just|simply|definitely|certainly|absolutely|totally|obviously|clearly|essentially|virtually|practically|arguably|presumably|supposedly)\s+/gi;
    var LEADING_HEDGE = /^(as (we|you|one) (can |could )?see,?\s*(that)?\s*|it (is|'s) (important|worth|clear|obvious) (to note|noting|to mention|to say)?\s*(that)?\s*|needless to say,?\s*|in other words,?\s*|that is to say,?\s*|it (should|must) be (noted|mentioned|said) that\s*|please note that\s*|note that\s*)/i;

    function cleanText(t) {
        return String(t || '')
            .replace(/\r\n?/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function splitSentences(text) {
        var lines = text.split(/\n+/).map(function (l) {
            return l.replace(/^\s*[\-\*\u2022\u25cf\u25aa\u25b8]+\s*/, '')
                    .replace(/^\s*\d+[.)]\s+/, '')
                    .trim();
        }).filter(function (l) { return l.length > 0; });

        var out = [];
        lines.forEach(function (line) {
            var p = line
                .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|U\.S|U\.K|a\.m|p\.m|No|Fig|al|Inc|Ltd|Co|Corp)\./gi, '$1\u0001')
                .replace(/(\d)\.(\d)/g, '$1\u0002$2');
            var parts = p.split(/[.!?…]+\s+/);
            parts.forEach(function (part) {
                var s = part.replace(/\u0001/g, '.').replace(/\u0002/g, '.').trim();
                if (s.length > 1) out.push(s);
            });
        });
        return out.length ? out : [text.trim()];
    }

    function words(s) { return (String(s).toLowerCase().match(/[a-z][a-z'\-]*/g) || []); }
    function contentWords(s) { return words(s).filter(function (w) { return w.length > 2 && !STOP[w]; }); }
    function stem(w) {
        return w.replace(/(ations?|itions?)$/, 'ate')
                .replace(/ingly$/, '')
                .replace(/edly$/, '')
                .replace(/ies$/, 'y')
                .replace(/(ing|ed|ly|es|s)$/, '');
    }

    function scoreSentences(sentences) {
        var freq = {};
        sentences.forEach(function (s) {
            contentWords(s).forEach(function (w) {
                var k = stem(w);
                freq[k] = (freq[k] || 0) + 1;
            });
        });
        var maxF = 1;
        Object.keys(freq).forEach(function (k) { if (freq[k] > maxF) maxF = freq[k]; });

        var N = sentences.length;
        return sentences.map(function (s, i) {
            var toks = contentWords(s).map(stem);
            var wc = toks.length || 1;
            var score = 0;
            toks.forEach(function (w) { score += (freq[w] || 0) / maxF; });
            score = score / Math.sqrt(wc);

            if (i === 0) score *= 1.35;
            else if (i === 1) score *= 1.12;
            else if (i === N - 1) score *= 1.22;
            else if (i < 3) score *= 1.06;

            if (CUE_BOOST.test(s)) score *= 1.28;

            var caps = (s.match(/\b[A-Z][a-z]{2,}\b/g) || []).length;
            var nums = (s.match(/\b\d+(\.\d+)?(%|kg|km|m|s|hrs?|min|USD|\$)?\b/g) || []).length;
            score *= 1 + Math.min(0.3, caps * 0.045 + nums * 0.05);

            if (wc < 6) score *= 0.7;
            else if (wc > 40) score *= 0.85;

            return { s: s, score: score, i: i, wc: wc };
        });
    }

    function compressSentence(s) {
        var out = String(s).trim();
        out = out.replace(LEADING_HEDGE, '');
        out = out.replace(FILLER_START, '');
        out = out.replace(FILLER_MID, '');
        out = out.replace(/\s*\([^)]{0,90}\)\s*/g, ' ');
        out = out.replace(/\s{2,}/g, ' ').trim();
        out = out.replace(/^[,;:\-\s]+/, '');
        if (!out) return '';
        if (!/[.!?…]$/.test(out)) out += '.';
        out = out.charAt(0).toUpperCase() + out.slice(1);
        return out;
    }

    function distillShort(text) {
        var clauses = String(text)
            .split(/(?:[,;—–]|\s-\s|\bbut\b|\bhowever\b|\balthough\b|\bwhile\b|\bbecause\b|\bsince\b|\bwhereas\b)/i)
            .map(function (c) { return c.trim(); })
            .filter(function (c) { return c.length > 2; });
        if (clauses.length <= 1) return compressSentence(text);

        var scored = clauses.map(function (c, i) {
            var wc = contentWords(c).length;
            var sc = wc + (i === 0 ? 2 : 0) + (i === clauses.length - 1 ? 1 : 0);
            if (/\b(is|are|was|were|means|shows|proves|demonstrates|causes|leads|results|requires|involves)\b/i.test(c)) sc += 1.2;
            return { c: c, score: sc, idx: i };
        });
        scored.sort(function (a, b) { return b.score - a.score; });
        var keep = scored.slice(0, Math.max(1, Math.ceil(clauses.length * 0.55)));
        keep.sort(function (a, b) { return a.idx - b.idx; });
        var joined = keep.map(function (k) { return k.c; }).join(', ').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim();
        if (!joined) return compressSentence(text);
        if (!/[.!?…]$/.test(joined)) joined += '.';
        return joined.charAt(0).toUpperCase() + joined.slice(1);
    }

    function hardCompress(text) {
        var t = String(text).replace(/\s{2,}/g, ' ').trim();
        t = t.replace(LEADING_HEDGE, '').replace(FILLER_START, '').replace(FILLER_MID, '');
        var parts = t.split(/(?:,\s*|\s+(?:and|but|so|because|although|while|since|whereas|which|that)\s+)/i)
            .map(function (p) { return p.trim(); })
            .filter(function (p) { return p.length > 2; });
        if (parts.length <= 1) {
            var w = t.split(/\s+/);
            if (w.length > 20) return w.slice(0, 18).join(' ') + '…';
            if (!/[.!?…]$/.test(t)) t += '.';
            return t.charAt(0).toUpperCase() + t.slice(1);
        }
        var sorted = parts.slice().sort(function (a, b) {
            return contentWords(b).length - contentWords(a).length;
        });
        var keep = [parts[0]];
        if (sorted[0] && sorted[0] !== parts[0]) keep.push(sorted[0]);
        var out = keep.join('; ').replace(/\s{2,}/g, ' ').replace(/^[,;:\-\s]+/, '').trim();
        if (!/[.!?…]$/.test(out)) out += '.';
        return out.charAt(0).toUpperCase() + out.slice(1);
    }

    function extractKeywords(text, n) {
        n = n || 6;
        var toks = (String(text).toLowerCase().match(/[a-z][a-z'\-]*/g) || [])
            .filter(function (w) { return w.length > 2 && !STOP[w]; });
        if (toks.length === 0) return [];

        var stemMap = {};
        toks.forEach(function (w) {
            var s = stem(w);
            if (!stemMap[s]) stemMap[s] = { count: 0, forms: {} };
            stemMap[s].count++;
            stemMap[s].forms[w] = (stemMap[s].forms[w] || 0) + 1;
        });

        var bigrams = {};
        for (var i = 0; i < toks.length - 1; i++) {
            var a = toks[i], b = toks[i + 1];
            if (a.length < 3 || b.length < 3) continue;
            var bg = a + ' ' + b;
            bigrams[bg] = (bigrams[bg] || 0) + 1;
        }

        var candidates = [];
        Object.keys(stemMap).forEach(function (s) {
            var info = stemMap[s];
            var bestForm = Object.keys(info.forms).sort(function (a, b) { return info.forms[b] - info.forms[a]; })[0];
            candidates.push({ w: bestForm, score: info.count * (1 + Math.min(1.5, bestForm.length / 8)) });
        });
        Object.keys(bigrams).forEach(function (bg) {
            if (bigrams[bg] >= 2) candidates.push({ w: bg, score: bigrams[bg] * 2.4 });
        });

        candidates.sort(function (a, b) { return b.score - a.score; });

        var picked = [], pickedLower = [];
        candidates.forEach(function (c) {
            if (picked.length >= n) return;
            var low = c.w.toLowerCase();
            for (var j = 0; j < pickedLower.length; j++) {
                if (pickedLower[j].indexOf(low) !== -1 || low.indexOf(pickedLower[j]) !== -1) return;
            }
            picked.push(c.w);
            pickedLower.push(low);
        });
        return picked;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function highlight(text, keywords) {
        var esc = escapeHtml(text);
        if (!keywords || !keywords.length) return esc;
        var kws = keywords.slice().sort(function (a, b) { return b.length - a.length; });
        kws.forEach(function (kw) {
            if (typeof kw !== 'string' || kw.length < 4) return;
            try {
                var re = new RegExp('\\b(' + escapeHtml(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'gi');
                esc = esc.replace(re, '<mark>$1</mark>');
            } catch (e) {}
        });
        return esc;
    }

    function summarize(text) {
        var cleaned = cleanText(text);
        var sentences = splitSentences(cleaned);
        if (sentences.length === 0) return { error: true };

        var wordCount = (cleaned.match(/[A-Za-z0-9'\-]+/g) || []).length;
        var sentCount = sentences.length;
        var kws = extractKeywords(cleaned, 6);

        // ---------- SHORT PATH: 1–2 sentences ----------
        if (sentCount <= 2) {
            var scored = scoreSentences(sentences);
            scored.sort(function (a, b) { return b.score - a.score; });

            var tldr;
            if (sentCount === 1) {
                tldr = hardCompress(sentences[0]);
            } else {
                tldr = compressSentence(distillShort(scored[0].s));
            }

            var points = [];
            if (sentCount === 2) {
                // Build a fresh clause-join gist across BOTH sentences
                var essences = [];
                sentences.forEach(function (s) {
                    var cl = s.split(/[,;—–]/).map(function (c) { return c.trim(); })
                             .filter(function (c) { return contentWords(c).length >= 2; });
                    if (cl.length > 1) {
                        cl.sort(function (a, b) { return contentWords(b).length - contentWords(a).length; });
                        essences.push(cl[0]);
                    } else {
                        essences.push(s.replace(/[.!?…]+$/, '').trim());
                    }
                });
                var gist = essences.join('; ').trim();
                if (gist.length > 8 && gist.length < tldr.length * 1.6) {
                    tldr = compressSentence(gist);
                }
                sentences.forEach(function (s) {
                    var c = compressSentence(s);
                    if (c && c.toLowerCase() !== tldr.toLowerCase()) points.push(c);
                });
                if (points.length === 0) {
                    sentences.forEach(function (s) {
                        var d = distillShort(s);
                        if (d && d.toLowerCase() !== tldr.toLowerCase()) points.push(d);
                    });
                }
            } else {
                var parts = sentences[0].split(/[,;—–]/).map(function (p) { return p.trim(); })
                              .filter(function (p) { return contentWords(p).length >= 2; });
                if (parts.length >= 2) {
                    parts.slice(0, 4).forEach(function (p) {
                        var c = compressSentence(p);
                        if (c && c.toLowerCase() !== tldr.toLowerCase()) points.push(c);
                    });
                }
            }

            return { short: true, tldr: tldr, points: points, keywords: kws, sentences: sentCount, words: wordCount };
        }

        // ---------- NORMAL PATH: 3+ sentences ----------
        var scores = scoreSentences(sentences);
        var targetCount = Math.max(2, Math.min(5, Math.round(sentences.length * 0.32)));
        targetCount = Math.min(targetCount, sentences.length);

        var top = scores.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, targetCount);
        top.sort(function (a, b) { return a.i - b.i; });

        var compressed = top.map(function (t) { return compressSentence(t.s); }).filter(Boolean);
        var tldr = compressed[0] || compressSentence(sentences[0]);
        var points = compressed.slice(1, 5);
        if (points.length === 0 && sentences.length > 1) points.push(compressSentence(sentences[1]));

        return { short: false, tldr: tldr, points: points, keywords: kws, sentences: sentCount, words: wordCount };
    }

    function renderResult(r) {
        if (!r || r.error) {
            output.innerHTML = '<div class="sum-pro"><div class="sum-block"><div class="sum-body">' + getTranslation('ai_summary_empty') + '</div></div></div>';
            return;
        }
        var origWords = r.words || 0;
        var sumText = (r.tldr + ' ' + (r.points || []).join(' ')).trim();
        var sumWords = (sumText.match(/[A-Za-z0-9'\-]+/g) || []).length;
        var reduction = origWords > 0 ? Math.max(0, Math.round((1 - sumWords / origWords) * 100)) : 0;
        var readSec = Math.max(1, Math.round(sumWords / 3.3));

        var html = '<div class="sum-pro">';
        if (r.engine) {
            html += '<div class="sum-engine-note">' + escapeHtml(r.engine) + '</div>';
        }
        html += '<div class="sum-block sum-tldr">';
        html += '<div class="sum-label"><span class="dot"></span>TL;DR</div>';
        html += '<div class="sum-body">' + highlight(r.tldr, r.keywords) + '</div>';
        html += '</div>';

        if (r.points && r.points.length > 0) {
            html += '<div class="sum-block">';
            html += '<div class="sum-label"><span class="dot"></span>Key Points</div>';
            html += '<ul class="sum-points">';
            r.points.forEach(function (p) { html += '<li>' + highlight(p, r.keywords) + '</li>'; });
            html += '</ul></div>';
        }

        if (r.keywords && r.keywords.length > 0) {
            html += '<div class="sum-block">';
            html += '<div class="sum-label"><span class="dot"></span>Key Topics</div>';
            html += '<div class="sum-keywords">';
            r.keywords.forEach(function (k) { html += '<span class="sum-kw">#' + escapeHtml(k) + '</span>'; });
            html += '</div></div>';
        }

        html += '<div class="sum-stats">';
        html += '<span>📄 <b>' + r.sentences + '</b> sentence' + (r.sentences === 1 ? '' : 's') + '</span>';
        html += '<span>✂️ <b>' + reduction + '%</b> shorter</span>';
        html += '<span>⏱️ <b>~' + readSec + 's</b> read</span>';
        html += '<span>🔑 <b>' + (r.keywords ? r.keywords.length : 0) + '</b> topics</span>';
        html += '</div>';

        html += '<div class="sum-actions"><button class="sum-copy" id="sumCopyBtn">📋 Copy Summary</button></div>';
        html += '</div>';
        output.innerHTML = html;

        var copyBtn = document.getElementById('sumCopyBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                var plain = 'TL;DR: ' + r.tldr + '\n\nKey Points:\n' +
                    (r.points || []).map(function (p) { return '• ' + p; }).join('\n') +
                    '\n\nKey Topics: ' + (r.keywords || []).map(function (k) { return '#' + k; }).join(' ');
                function done(ok) {
                    copyBtn.innerHTML = ok ? '<i class="ph ph-check-circle" aria-hidden="true"></i>Copied!' : '<i class="ph ph-warning" aria-hidden="true"></i>Failed';
                    setTimeout(function () { copyBtn.innerHTML = '<i class="ph ph-clipboard-text" aria-hidden="true"></i>Copy Summary'; }, 1600);
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(plain).then(function () { done(true); }, function () { done(false); });
                } else {
                    var ta = document.createElement('textarea');
                    ta.value = plain; ta.style.position = 'fixed'; ta.style.left = '-9999px';
                    document.body.appendChild(ta); ta.select();
                    var ok = false;
                    try { ok = document.execCommand('copy'); } catch (e) {}
                    document.body.removeChild(ta);
                    done(ok);
                }
            });
        }
    }

    btn.addEventListener('click', function () {
        var text = input.value.trim();
        if (!text) {
            output.innerHTML = '<div class="sum-pro"><div class="sum-block"><div class="sum-body">' + getTranslation('ai_summary_empty') + '</div></div></div>';
            return;
        }
        btn.disabled = true;
        function finish(r) {
            btn.disabled = false;
            renderResult(r);
            try {
                var data = loadData();
                addActivity(data, 'ai_summary', getTranslation('ai_summary_log'));
                saveData(data);
            } catch (e) {}
        }
        function offline(reason) {
            var result;
            try { result = summarize(text); }
            catch (e) { result = { error: true }; }
            if (!result.error && reason) result.engine = getTranslation(reason);
            finish(result);
        }
        // Provider first (when configured); offline engine answers instantly otherwise.
        StudyHubAI.status().then(function (st) {
            if (!st.configured) return offline('ai_offline_note');
            return StudyHubAI.chat([
                { role: 'system', content: 'You summarize study material. Reply with ONLY a JSON object: {"tldr": one or two sentences, "points": [2 to 5 short key-point strings], "keywords": [3 to 8 lowercase topic words]}. No markdown, no prose outside the JSON.' },
                { role: 'user', content: text.slice(0, 12000) }
            ], { jsonMode: true, maxTokens: 700, temperature: 0.3 }).then(function (res) {
                var j = StudyHubAI.parseJsonReply(res.text);
                if (!j || !j.tldr) throw new Error('unparseable reply');
                finish({
                    tldr: String(j.tldr),
                    points: Array.isArray(j.points) ? j.points.map(String).slice(0, 5) : [],
                    keywords: Array.isArray(j.keywords) ? j.keywords.map(String).slice(0, 8) : [],
                    sentences: (String(text).match(/[.!?]+/g) || []).length || 1,
                    words: (String(text).match(/[A-Za-z0-9'-]+/g) || []).length
                });
            }).catch(function () { offline('ai_error_note'); });
        });
    });
}

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
    var INTERVAL = 50 * 60 * 1000;   // 50 minutes
    var breakTick = null;

    function fireReminder() {
        try { notifyBreak(); } catch (e) {}
        try { localStorage.setItem(breakKey, Date.now()); } catch (e) {}
        // Optional: also show a small in-page toast so it's impossible to miss
        if (typeof window.showToast === 'function') {
            try { window.showToast('☕ Time for a break! You have been studying for 50 minutes.', 'ok'); } catch (e) {}
        }
    }

    function startTimer() {
        if (breakTick) clearInterval(breakTick);
        // Fire every 50 minutes regardless of the last stored time
        breakTick = setInterval(fireReminder, INTERVAL);
    }

    // If the stored timestamp is already older than 50 min,
    // fire once on load and then continue on the repeating schedule.
    var last = parseInt(localStorage.getItem(breakKey) || '0', 10);
    var now = Date.now();

    if (last && (now - last) >= INTERVAL) {
        fireReminder();
    } else if (!last) {
        try { localStorage.setItem(breakKey, now); } catch (e) {}
    }

    startTimer();

    // Pause the reminder when the tab is hidden so it doesn't drift
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            if (breakTick) { clearInterval(breakTick); breakTick = null; }
        } else {
            startTimer();
        }
    });

    // Expose a manual trigger for the console / other scripts
    window.studyHubBreakReminder = {
        reset: function () {
            try { localStorage.setItem(breakKey, Date.now()); } catch (e) {}
        },
        fire: fireReminder,
        stop: function () { if (breakTick) { clearInterval(breakTick); breakTick = null; } }
    };
}

function notifyBreak() {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification('☕ Time for a break!', { body: 'You have been studying for 50 minutes. Stand up, stretch, and rest your eyes.' });
    }
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.15, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 1.2);
    } catch(e){}
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
// AI PLANNER v3 — natural-language → smart schedule
// 68× upgrade:
//  • Much richer NL parsing (session length, breaks, meals, day-specific)
//  • Energy-aware ordering (hard subjects early, review late)
//  • Auto meal protection (12–13, 19–20)
//  • 3-variant picker (Balanced / Intense / Relaxed)
//  • Live analytics: total hours, balance, warnings
//  • Color-coded preview + subject legend
//  • Last-3 undo of planner state
// ================================================================
(function () {
    'use strict';

    function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

    ready(function () {
        var inputEl = document.getElementById('plannerAiInput');
        var btn     = document.getElementById('plannerAiBtn');
        var output  = document.getElementById('plannerAiOutput');
        if (!inputEl || !btn || !output) return;

        // ---------- CONSTANTS ----------
        var ALL_DAYS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        var ALL_HOURS = ['7:00','8:00','9:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];
        var MEAL_HOURS = { '12:00': 'Lunch', '13:00': 'Lunch', '19:00': 'Dinner', '20:00': 'Dinner' };
        var DAY_NAMES = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun',
                          monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu',
                          friday:'Fri', saturday:'Sat', sunday:'Sun' };

        // Subject canonicalization — wider net
        var SUBJECT_MAP = {
            math:'Math', maths:'Math', mathematics:'Math', algebra:'Math', calculus:'Math',
            geometry:'Math', trig:'Math', trigonometry:'Math', arithmetic:'Math', arith:'Math',
            stats:'Statistics', statistics:'Statistics', probability:'Statistics', prob:'Statistics',
            physics:'Physics', phy:'Physics',
            chemistry:'Chemistry', chem:'Chemistry',
            biology:'Biology', bio:'Biology',
            science:'Science', sci:'Science',
            coding:'Coding', code:'Coding', program:'Coding', programming:'Coding',
            cs:'Computer Science', 'computer science':'Computer Science',
            'data structures':'Data Structures', dsa:'Data Structures',
            algorithms:'Algorithms', algo:'Algorithms',
            'machine learning':'Machine Learning', ml:'Machine Learning',
            'deep learning':'Deep Learning', dl:'Deep Learning',
            ai:'AI', 'artificial intelligence':'AI',
            web:'Web Dev', 'web dev':'Web Dev', html:'Web Dev', css:'Web Dev', js:'Web Dev',
            python:'Python', java:'Java', cpp:'C++', 'c++':'C++',
            english:'English', eng:'English',
            bangla:'Bangla', bengali:'Bangla',
            spanish:'Spanish', french:'French', german:'German',
            arabic:'Arabic', hindi:'Hindi', chinese:'Chinese',
            japanese:'Japanese', korean:'Korean',
            history:'History', hist:'History',
            geography:'Geography', geo:'Geography',
            economics:'Economics', econ:'Economics',
            literature:'Literature', lit:'Literature',
            philosophy:'Philosophy', phil:'Philosophy',
            psychology:'Psychology', psych:'Psychology',
            art:'Art', drawing:'Art', painting:'Art',
            music:'Music',
            writing:'Writing', essay:'Writing',
            presentation:'Presentation',
            revision:'Revision', revise:'Revision', review:'Revision',
            homework:'Homework', hw:'Homework',
            assignment:'Homework',
            reading:'Reading', read:'Reading',
            notes:'Note Review', 'note review':'Note Review',
            practice:'Practice', problems:'Practice', exercise:'Practice',
            project:'Project', projects:'Project',
        };

        var CATEGORY_OF = {
            'Math':'quant','Statistics':'quant','Physics':'quant','Chemistry':'quant',
            'Biology':'sci','Science':'sci',
            'Computer Science':'tech','Coding':'tech','Data Structures':'tech',
            'Algorithms':'tech','Machine Learning':'tech','Deep Learning':'tech',
            'AI':'tech','Web Dev':'tech','Python':'tech','Java':'tech','C++':'tech',
            'English':'lang','Bangla':'lang','Spanish':'lang','French':'lang',
            'German':'lang','Arabic':'lang','Hindi':'lang','Chinese':'lang',
            'Japanese':'lang','Korean':'lang',
            'History':'hum','Geography':'hum','Economics':'hum',
            'Literature':'hum','Philosophy':'hum','Psychology':'hum',
            'Art':'creative','Music':'creative','Writing':'creative','Presentation':'creative',
            'Revision':'meta','Homework':'meta','Reading':'meta',
            'Note Review':'meta','Practice':'meta','Project':'meta'
        };

        var DIFFICULTY = {
            'Math':3,'Physics':3,'Chemistry':3,'Computer Science':3,'Algorithms':3,
            'Data Structures':3,'Machine Learning':3,'Deep Learning':3,
            'Statistics':2,'Biology':2,'Coding':3,'Python':2,'Java':3,'C++':3,'Web Dev':2,
            'English':2,'Bangla':1,'Spanish':2,'French':2,'German':3,
            'Arabic':3,'Hindi':2,'Chinese':3,'Japanese':3,'Korean':3,
            'History':2,'Geography':2,'Economics':3,'Literature':2,
            'Philosophy':3,'Psychology':2,
            'Art':1,'Music':1,'Writing':2,'Presentation':1,
            'Revision':1,'Homework':2,'Reading':1,'Note Review':1,
            'Practice':2,'Project':2
        };

        // ---------- PARSER ----------
        function parseRequest(text) {
            var t = ' ' + text.toLowerCase().replace(/\s+/g, ' ') + ' ';
            var req = {
                mode: 'balanced',
                scope: 'all',
                bias: 'all',
                hours: 0,
                sessionMin: 60,
                breakMin: 0,
                subjects: [],
                pairs: [],
                focus: null,
                avoidMeals: true,
                noBreaks: false,
                specificDay: null,
                raw: text
            };

            if (/\b(easy|light|chill|relaxed|casual|minimal|soft|few|small|simple|gentle)\b/.test(t)) req.mode = 'easy';
            else if (/\b(intense|intensive|heavy|hard|exam|sprint|crunch|maximum|max|jam|packed|serious|burn|marathon)\b/.test(t)) req.mode = 'intense';
            else if (/\b(balanced|normal|moderate|regular|standard|medium|steady)\b/.test(t)) req.mode = 'balanced';

            if (/\b(weekend|sat(urday)?|sun(day)?|week-end)\b/.test(t)) req.scope = 'weekend';
            else if (/\b(weekday|weekdays|work\s?week|school\s?week|mon(day)?\s*(to|through|-)\s*fri(day)?)\b/.test(t)) req.scope = 'weekday';
            else if (/\b(today|tonight|now|this\s+(evening|afternoon|morning))\b/.test(t)) req.scope = 'today';
            else if (/\b(tomorrow)\b/.test(t)) req.scope = 'tomorrow';

            var dayMatch = t.match(/\b(?:on|for|this)\s+(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b/);
            if (dayMatch) {
                var short = dayMatch[1].slice(0,3).toLowerCase();
                if (DAY_NAMES[short]) {
                    req.scope = 'specific-day';
                    req.specificDay = DAY_NAMES[short];
                }
            }

            if (/\b(morning|am|early|dawn)\b/.test(t)) req.bias = 'morning';
            else if (/\b(afternoon|noon|midday|pm)\b/.test(t) && !/evening|night/.test(t)) req.bias = 'afternoon';
            else if (/\b(evening|night|tonight|late|after\s*dinner)\b/.test(t)) req.bias = 'evening';

            var mHrs = t.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
            var mMins = t.match(/(\d+)\s*(?:minutes?|mins?|m)\b/);
            if (mHrs) req.hours = parseFloat(mHrs[1]);
            else if (mMins) req.hours = parseFloat(mMins[1]) / 60;

            var sessMatch = t.match(/(\d+)\s*(?:min(?:ute)?s?)?\s*(?:sessions?|blocks?|each|per\s*session)/);
            if (sessMatch) req.sessionMin = parseInt(sessMatch[1], 10);
            var blockMatch = t.match(/(\d+)\s*(?:min(?:ute)?s?)\s*(?:blocks?|sessions?|each|per)/);
            if (blockMatch) req.sessionMin = parseInt(blockMatch[1], 10);
            if (req.sessionMin < 20) req.sessionMin = 20;
            if (req.sessionMin > 180) req.sessionMin = 180;

            if (/\b(no\s*breaks?|without\s*breaks?|back[\s-]*to[\s-]*back)\b/.test(t)) {
                req.noBreaks = true;
                req.breakMin = 0;
            } else {
                var bm = t.match(/(\d+)\s*(?:min(?:ute)?s?)?\s*breaks?\b/);
                if (bm) req.breakMin = parseInt(bm[1], 10);
                else if (/\bwith\s*breaks?\b/.test(t)) req.breakMin = 10;
            }

            if (/\b(skip\s*lunch|no\s*lunch|through\s*lunch|over\s*lunch|during\s*lunch)\b/.test(t)) req.avoidMeals = false;

            Object.keys(SUBJECT_MAP).forEach(function (key) {
                var re = new RegExp('(?:^|\\s|[^a-z])' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|\\s|[^a-z])');
                if (re.test(t)) {
                    var s = SUBJECT_MAP[key];
                    if (req.subjects.indexOf(s) === -1) req.subjects.push(s);
                }
            });

            var pairRe = /([a-z ]+?)\s+(?:in the|at|during)\s+(morning|afternoon|evening|night)/g;
            var pm;
            while ((pm = pairRe.exec(t)) !== null) {
                var subj = pm[1].trim();
                var timeOf = pm[2];
                var cleanSubj = null;
                Object.keys(SUBJECT_MAP).forEach(function (k) {
                    if (subj.indexOf(k) !== -1 && !cleanSubj) cleanSubj = SUBJECT_MAP[k];
                });
                if (cleanSubj) req.pairs.push({ subject: cleanSubj, time: timeOf });
            }

            var focusMatch = t.match(/(?:focus on|concentrate on|mainly|mostly|emphasis on|prioritize|priority on|most important is)\s+([a-z ]+)/);
            if (focusMatch) {
                var fw = focusMatch[1];
                Object.keys(SUBJECT_MAP).forEach(function (k) {
                    if (!req.focus && fw.indexOf(k) !== -1) req.focus = SUBJECT_MAP[k];
                });
            }

            return req;
        }

        // ---------- HELPERS ----------
        function shuffle(arr, seed) {
            var a = arr.slice();
            var s = seed || 1;
            for (var i = a.length - 1; i > 0; i--) {
                s = (s * 9301 + 49297) % 233280;
                var j = Math.floor((s / 233280) * (i + 1));
                var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
            }
            return a;
        }

        function energyOrder(pool, bias) {
            var sorted = pool.slice().sort(function (a, b) {
                var da = DIFFICULTY[a] || 2;
                var db = DIFFICULTY[b] || 2;
                return db - da;
            });
            if (bias === 'evening') return sorted.slice().reverse();
            return sorted;
        }

        function interleave(pool) {
            if (pool.length <= 1) return pool.slice();
            var byCat = {};
            pool.forEach(function (s) {
                var c = CATEGORY_OF[s] || 'other';
                if (!byCat[c]) byCat[c] = [];
                byCat[c].push(s);
            });
            var cats = Object.keys(byCat);
            var result = [];
            var safety = 0;
            while (result.length < pool.length && safety < 500) {
                safety++;
                var cat = cats[Math.floor(Math.random() * cats.length)];
                if (byCat[cat] && byCat[cat].length > 0) {
                    var subj = byCat[cat].shift();
                    if (result.length >= 1 && result[result.length - 1] === subj && byCat[cat].length > 0) {
                        byCat[cat].push(subj);
                        continue;
                    }
                    result.push(subj);
                }
            }
            pool.forEach(function (s) { if (result.indexOf(s) === -1) result.push(s); });
            return result;
        }

        function shortDay(idx) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][idx]; }

        function pickDays(req) {
            if (req.scope === 'weekend') return ['Sat','Sun'];
            if (req.scope === 'weekday') return ['Mon','Tue','Wed','Thu','Fri'];
            if (req.scope === 'today')   return [shortDay(new Date().getDay())];
            if (req.scope === 'tomorrow')return [shortDay((new Date().getDay()+1)%7)];
            if (req.scope === 'specific-day') return [req.specificDay];
            return ALL_DAYS.slice();
        }

        function pickHours(req) {
            var pool = ALL_HOURS.slice();
            if (req.bias === 'morning') pool = ['7:00','8:00','9:00','10:00','11:00'];
            else if (req.bias === 'afternoon') pool = ['12:00','13:00','14:00','15:00','16:00','17:00'];
            else if (req.bias === 'evening') pool = ['17:00','18:00','19:00','20:00','21:00'];
            if (req.avoidMeals) pool = pool.filter(function (h) { return !MEAL_HOURS[h]; });
            return pool;
        }

        // ---------- BUILD PLAN ----------
        function buildPlan(req, variant) {
            variant = variant || { name: 'Balanced', intensity: 'balanced', hoursPerDay: 0, seedMult: 1 };
            var seed = variant.seedMult * 7919 + (req.raw || '').length;

            var days = pickDays(req);
            var hourPool = pickHours(req);

            var targetPerDay;
            if (req.hours > 0) targetPerDay = Math.max(1, Math.ceil(req.hours));
            else if (req.mode === 'easy' || variant.intensity === 'relaxed') targetPerDay = Math.max(1, Math.floor(hourPool.length / 3));
            else if (req.mode === 'intense' || variant.intensity === 'intense') targetPerDay = hourPool.length;
            else targetPerDay = Math.max(2, Math.floor(hourPool.length * 0.6));
            if (variant.hoursPerDay > 0) targetPerDay = variant.hoursPerDay;
            targetPerDay = Math.min(targetPerDay, hourPool.length);

            var pool = req.subjects.slice();
            if (req.focus && pool.indexOf(req.focus) === -1) pool.unshift(req.focus);
            if (pool.length === 0) {
                if (req.mode === 'intense') pool = ['Math','Physics','Revision','Practice','Reading'];
                else if (req.mode === 'easy') pool = ['Reading','Revision','Note Review','Practice'];
                else pool = ['Math','Science','English','Reading','Revision','Practice'];
            }
            var shuffled = shuffle(pool, seed + 13);
            var ordered = interleave(energyOrder(shuffled, req.bias));

            var plan = {};
            var dayOf = {};
            days.forEach(function (day, dayIdx) {
                var dayHours = shuffle(hourPool, seed + dayIdx * 37)
                                .slice(0, targetPerDay)
                                .sort();
                var subjectIdx = 0;
                dayOf[day] = { hours: dayHours, subjects: [] };

                dayHours.forEach(function (hour, hourIdx) {
                    var forced = null;
                    req.pairs.forEach(function (p) {
                        if (p.time === req.bias && ordered.indexOf(p.subject) !== -1 && !forced) forced = p.subject;
                    });
                    var subj;
                    if (forced && hourIdx % 2 === 0) subj = forced;
                    else if (req.focus && (dayIdx + hourIdx) % 4 === 0) subj = req.focus;
                    else {
                        subj = ordered[subjectIdx % ordered.length];
                        subjectIdx++;
                    }
                    plan[day + '_' + hour] = subj;
                    dayOf[day].subjects.push(subj);
                });
            });

            return {
                plan: plan,
                days: days,
                dayOf: dayOf,
                pool: ordered,
                variant: variant,
                sessionMin: req.sessionMin,
                breakMin: req.breakMin
            };
        }

        // ---------- ANALYTICS ----------
        function analyze(result) {
            var totalSessions = Object.keys(result.plan).length;
            var perSubject = {};
            Object.keys(result.plan).forEach(function (k) {
                var s = result.plan[k];
                perSubject[s] = (perSubject[s] || 0) + 1;
            });
            var perDay = {};
            result.days.forEach(function (d) {
                perDay[d] = (result.dayOf[d] ? result.dayOf[d].hours.length : 0);
            });

            var warnings = [];
            var maxPerDay = Math.max.apply(null, Object.values(perDay).concat([0]));
            var minPerDay = Math.min.apply(null, Object.values(perDay).concat([Infinity]));
            if (maxPerDay >= 6) warnings.push('⚠️ ' + maxPerDay + ' sessions on your busiest day. That\'s a marathon.');
            if (minPerDay < 1 && result.days.length > 1) warnings.push('ℹ️ Some days are empty (rest days).');
            Object.keys(result.dayOf).forEach(function (d) {
                var cnt = {};
                result.dayOf[d].subjects.forEach(function (s) { cnt[s] = (cnt[s] || 0) + 1; });
                Object.keys(cnt).forEach(function (s) {
                    if (cnt[s] >= 3) warnings.push('⚠️ ' + cnt[s] + '× ' + s + ' on ' + d + '. Mix it up?');
                });
            });

            return {
                totalSessions: totalSessions,
                totalHours: (totalSessions * result.sessionMin / 60).toFixed(1),
                perSubject: perSubject,
                perDay: perDay,
                warnings: warnings
            };
        }

        var SUBJ_COLORS = ['#5eead4','#7dd3fc','#c4b5fd','#f472b6','#fdba74','#6ee7b7','#f9a8d4','#a78bfa','#22d3ee','#fbbf24'];
        function colorFor(subject, pool) {
            var idx = pool.indexOf(subject);
            if (idx < 0) idx = subject.charCodeAt(0) % SUBJ_COLORS.length;
            return SUBJ_COLORS[idx % SUBJ_COLORS.length];
        }

        // ---------- RENDER ----------
        var lastResult = null;
        var lastRequest = null;
        var lastThree = [];

        function renderAnalytics(analysis) {
            var html = '<div class="planner-analytics">';
            html += '<div class="pa-stat"><span class="pa-label">Sessions</span><span class="pa-val">' + analysis.totalSessions + '</span></div>';
            html += '<div class="pa-stat"><span class="pa-label">Hours</span><span class="pa-val">' + analysis.totalHours + 'h</span></div>';
            html += '<div class="pa-stat"><span class="pa-label">Subjects</span><span class="pa-val">' + Object.keys(analysis.perSubject).length + '</span></div>';
            html += '<div class="pa-stat"><span class="pa-label">Days</span><span class="pa-val">' + Object.keys(analysis.perDay).length + '</span></div>';
            html += '</div>';

            if (analysis.warnings.length) {
                html += '<div class="planner-warnings">';
                analysis.warnings.forEach(function (w) { html += '<div class="pw-item">' + w + '</div>'; });
                html += '</div>';
            }
            return html;
        }

        function renderPreview(result) {
            var days = result.days;
            var used = {};
            Object.keys(result.plan).forEach(function (k) {
                var h = k.split('_')[1];
                used[h] = true;
            });
            var usedHours = ALL_HOURS.filter(function (h) { return used[h]; });
            var minIdx = ALL_HOURS.indexOf(usedHours[0]);
            var maxIdx = ALL_HOURS.indexOf(usedHours[usedHours.length - 1]);
            var showHours = ALL_HOURS.slice(Math.max(0, minIdx - 1), Math.min(ALL_HOURS.length, maxIdx + 2));

            var gridStyle = 'grid-template-columns: 60px repeat(' + days.length + ', minmax(80px, 1fr));';
            var html = '<div class="planner-ai-preview" style="' + gridStyle + '">';
            html += '<div class="ai-label"></div>';
            days.forEach(function (d) { html += '<div class="ai-label">' + d + '</div>'; });

            showHours.forEach(function (h) {
                var isMeal = !!MEAL_HOURS[h];
                html += '<div class="ai-label' + (isMeal ? ' ai-meal' : '') + '">' + h + (isMeal ? ' 🍽️' : '') + '</div>';
                days.forEach(function (d) {
                    var v = result.plan[d + '_' + h] || '';
                    var color = v ? colorFor(v, result.pool) : '';
                    var style = v ? 'background:' + color + '20;border-color:' + color + '60;color:' + color + ';' : '';
                    html += '<div class="ai-cell' + (v ? '' : ' empty') + (isMeal && !v ? ' ai-meal-cell' : '') + '" style="' + style + '">' + v + '</div>';
                });
            });
            html += '</div>';
            return html;
        }

        function renderDescription(req, result) {
            var modeLabel = { easy: 'Easy / light', balanced: 'Balanced', intense: 'Intense' }[req.mode];
            var scopeLabel = {
                all: 'Full week', weekend: 'Weekend only', weekday: 'Weekdays only',
                today: 'Today only', tomorrow: 'Tomorrow only',
                'specific-day': (req.specificDay || 'One day')
            }[req.scope];
            var biasLabel = {
                all: 'any time of day', morning: 'mornings',
                afternoon: 'afternoons', evening: 'evenings'
            }[req.bias];

            var subjectText = result.pool.slice(0, 8).join(', ');
            if (result.pool.length > 8) subjectText += '…';

            var html = '<div class="planner-ai-summary">';
            html += '<strong>🧠 Here\'s your plan:</strong> ';
            html += '<span class="tag">' + modeLabel + '</span> · ';
            html += '<span class="tag">' + scopeLabel + '</span> · ';
            html += '<span class="tag">' + biasLabel + '</span>';
            if (req.hours > 0) html += ' · <span class="tag">' + req.hours + 'h total</span>';
            if (req.sessionMin !== 60) html += ' · <span class="tag">' + req.sessionMin + '-min sessions</span>';
            if (req.breakMin > 0) html += ' · <span class="tag">' + req.breakMin + '-min breaks</span>';
            html += '<br><strong>📚 Subjects:</strong> ' + subjectText + '.';
            if (req.focus) html += ' <em>Focus on ' + req.focus + '.</em>';
            html += '</div>';
            return html;
        }

        function renderLegend(result, analysis) {
            var html = '<div class="planner-legend">';
            Object.keys(analysis.perSubject).forEach(function (s) {
                var c = colorFor(s, result.pool);
                var count = analysis.perSubject[s];
                html += '<span class="legend-pill" style="background:' + c + '20;border-color:' + c + '60;color:' + c + '">' +
                        s + ' × ' + count + '</span>';
            });
            html += '</div>';
            return html;
        }

        function renderOutput(req, result, analysis) {
            var html = renderDescription(req, result);
            html += renderAnalytics(analysis);
            html += renderPreview(result);
            html += renderLegend(result, analysis);

            html += '<div class="planner-variants">';
            html += '<div class="pv-label">Try another style:</div>';
            html += '<button class="pv-btn" data-variant="balanced">⚖️ Balanced</button>';
            html += '<button class="pv-btn" data-variant="intense">🔥 Intense</button>';
            html += '<button class="pv-btn" data-variant="relaxed">🌿 Relaxed</button>';
            html += '</div>';

            html += '<div class="planner-ai-actions">';
            html += '<button id="aiApplyBtn" class="btn-primary">✅ Apply to Planner</button>';
            html += '<button id="aiReplaceBtn" class="btn-primary" style="background:rgba(252,165,165,0.15);color:#fca5a5;border-color:rgba(252,165,165,0.3);">🔁 Replace Planner</button>';
            html += '<button id="aiUndoBtn" class="btn-danger" ' + (lastThree.length > 1 ? '' : 'disabled style="opacity:.4;cursor:not-allowed;"') + '>↩ Undo</button>';
            html += '</div>';

            output.innerHTML = html;

            document.getElementById('aiApplyBtn').addEventListener('click', function () { applyPlan(false); });
            document.getElementById('aiReplaceBtn').addEventListener('click', function () { applyPlan(true); });
            var undo = document.getElementById('aiUndoBtn');
            if (undo && lastThree.length > 1) undo.addEventListener('click', undoLast);
            output.querySelectorAll('.pv-btn').forEach(function (b) {
                b.addEventListener('click', function () {
                    var which = this.dataset.variant;
                    var freshReq = parseRequest(lastRequest);
                    var newResult = buildPlan(freshReq, variantPreset(which, freshReq));
                    lastResult = newResult;
                    lastThree.push(newResult);
                    if (lastThree.length > 3) lastThree.shift();
                    renderOutput(freshReq, newResult, analyze(newResult));
                });
            });
        }

        function variantPreset(name, req) {
            if (name === 'intense') return { name: 'Intense', intensity: 'intense', hoursPerDay: 0, seedMult: 3 };
            if (name === 'relaxed') return { name: 'Relaxed', intensity: 'relaxed', hoursPerDay: 3, seedMult: 5 };
            return { name: 'Balanced', intensity: 'balanced', hoursPerDay: 0, seedMult: 1 };
        }

        /** Normalize + strictly validate a model-produced plan against the grid. */
        function sanitizeAiPlan(raw) {
            try {
                var src = raw && raw.plan ? raw.plan : null;
                if (!src || typeof src !== 'object') return null;
                var plan = {}, daySet = {}, hourSet = {};
                ALL_DAYS.forEach(function (d) { daySet[d] = 1; });
                ALL_HOURS.forEach(function (h) { hourSet[h] = 1; });
                var usedSubjects = {};
                var cells = 0;
                Object.keys(src).forEach(function (k) {
                    var m = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)_(\d{1,2}:00)$/.exec(String(k));
                    if (!m) return;
                    var day = m[1], hour = m[2];
                    if (!daySet[day] || !hourSet[hour]) return;
                    if (MEAL_HOURS[hour]) return;
                    var subj = String(src[k] || '').trim().slice(0, 40);
                    if (!subj) return;
                    plan[day + '_' + hour] = subj;
                    usedSubjects[subj] = 1;
                    cells++;
                });
                if (cells < 3) return null;
                var dayOf = {};
                var pool = Object.keys(usedSubjects);
                daysOrder().forEach(function (day) {
                    var hours = [];
                    ALL_HOURS.forEach(function (h) { if (plan[day + '_' + h]) hours.push(h); });
                    if (hours.length) dayOf[day] = { hours: hours, subjects: hours.map(function (h) { return plan[day + '_' + h]; }) };
                });
                if (!Object.keys(dayOf).length) return null;
                return { plan: plan, days: daysOrder().filter(function (d) { return dayOf[d]; }), dayOf: dayOf, pool: pool, variant: { name: 'AI', intensity: 'balanced', hoursPerDay: 0, seedMult: 1 }, sessionMin: 50, breakMin: 10, fromAi: true };
            } catch (e) { return null; }
        }

        function daysOrder() {
            return ALL_DAYS.slice();
        }

        function generate() {
            var text = inputEl.value.trim();
            if (!text) {
                output.innerHTML = '<div class="planner-ai-summary"><i class="ph ph-note-pencil" aria-hidden="true"></i>Type what you want to plan, or click one of the chips above.</div>';
                return;
            }
            lastRequest = text;
            function local() {
                var req = parseRequest(text);
                var result = buildPlan(req, variantPreset('balanced', req));
                lastResult = result;
                lastThree = [result];
                renderOutput(req, result, analyze(result));
            }
            StudyHubAI.status().then(function (st) {
                if (!st.configured) { local(); return undefined; }
                btn.disabled = true;
                return StudyHubAI.chat([
                    { role: 'system', content: 'You build weekly study timetables. Reply with ONLY a JSON object {"plan": {"Mon_9:00": "Math", ...}} using exactly these day keys Mon Tue Wed Thu Fri Sat Sun and hour keys like 9:00 or 14:00 (whole hours 7:00 to 21:00 only, no 12:00/13:00/19:00/20:00 lunch slots). Subject values must be short names (1 to 3 words). Only include cells worth studying; leave the rest out. No markdown, no prose.' },
                    { role: 'user', content: text.slice(0, 600) }
                ], { jsonMode: true, maxTokens: 900, temperature: 0.4, timeoutMs: 30000 }).then(function (res) {
                    btn.disabled = false;
                    var result = sanitizeAiPlan(StudyHubAI.parseJsonReply(res.text));
                    if (!result) { local(); return undefined; }
                    var req = parseRequest(text);
                    lastResult = result;
                    lastThree = [result];
                    renderOutput(req, result, analyze(result));
                }).catch(function () {
                    btn.disabled = false;
                    local();
                });
            }).catch(function () { local(); });
        }

        function undoLast() {
            if (lastThree.length <= 1) return;
            lastThree.pop();
            var prev = lastThree[lastThree.length - 1];
            if (!prev) return;
            var req = parseRequest(lastRequest);
            lastResult = prev;
            renderOutput(req, prev, analyze(prev));
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
                addActivity(data, 'planner_ai', replace ? 'Replaced planner with AI plan' : 'Merged AI plan into planner');
                saveData(data);
            }
            if (typeof setupPlanner === 'function') {
                setupPlanner();
            } else {
                location.reload();
            }

            var toast = document.createElement('div');
            toast.className = 'fbt-toast show';
            toast.innerHTML = replace ? '<i class="ph ph-check-circle" aria-hidden="true"></i>Planner replaced' : '<i class="ph ph-check-circle" aria-hidden="true"></i>Plan merged into planner';
            toast.style.borderColor = '#6ee7b7';
            document.body.appendChild(toast);
            setTimeout(function () { toast.classList.remove('show'); setTimeout(function () { toast.remove(); }, 400); }, 2200);
        }

        // ---------- WIRING ----------
        btn.addEventListener('click', generate);

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

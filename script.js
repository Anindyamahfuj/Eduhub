// ================================================================
// STUDYHUB – COMPLETE SCRIPT (ALL FEATURES + ALL 15 LANGUAGES)
// ================================================================

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
        'flashcards_subtitle': 'Spaced repetition – review due cards regularly.',
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
        'quick_search': 'Quick Search',
        'focus_off': 'Focus Off',
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
        'today_activity': 'Actividad de Hoy',
        'all_history': 'Todo el Historial',
        'delete_today': 'Eliminar Actividad de Hoy',
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
        'no_activity': 'Aún no se ha registrado actividad hoy.',
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
        'quick_search': 'Búsqueda Rápida',
        'focus_off': 'Enfoque Desactivado',
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
        'dash_subtitle': '一站式学习中心 — 今日进度与全部历史记录。',
        'stat_searches': '今日搜索',
        'stat_files': '已上传文件',
        'stat_tasks': '今日完成任务',
        'stat_streak': '最长连续天数',
        'stat_pomodoros': '今日番茄钟',
        'today_activity': '今日活动',
        'all_history': '全部历史',
        'delete_today': '删除今日活动',
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
        'no_activity': '今日尚未记录活动。',
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
        'flashcards_subtitle': '间隔重复 – 定期复习到期卡片。',
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
        'quick_search': '快速搜索',
        'focus_off': '专注关闭',
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
        'dash_subtitle': 'आपका अध्ययन केंद्र — आज की प्रगति और पूरी इतिहास।',
        'stat_searches': 'आज की खोजें',
        'stat_files': 'अपलोड की गई फ़ाइलें',
        'stat_tasks': 'आज पूर्ण किए गए कार्य',
        'stat_streak': 'सबसे लंबी स्ट्रीक',
        'stat_pomodoros': 'आज के पोमोडोरो',
        'today_activity': 'आज की गतिविधि',
        'all_history': 'सभी इतिहास',
        'delete_today': 'आज की गतिविधि हटाएं',
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
        'no_activity': 'आज अभी तक कोई गतिविधि दर्ज नहीं।',
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
        'flashcards_subtitle': 'अंतराल पुनरावृत्ति – नियमित रूप से देय कार्ड की समीक्षा करें।',
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
        'quick_search': 'त्वरित खोज',
        'focus_off': 'फोकस बंद',
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
        'dash_subtitle': 'مركز دراستك بنظرة سريعة — تقدم اليوم والتاريخ الكامل.',
        'stat_searches': 'عمليات البحث اليوم',
        'stat_files': 'الملفات المرفوعة',
        'stat_tasks': 'المهام المكتملة اليوم',
        'stat_streak': 'أطول سلسلة متتالية',
        'stat_pomodoros': 'بومودورو اليوم',
        'today_activity': 'نشاط اليوم',
        'all_history': 'كل التاريخ',
        'delete_today': 'حذف نشاط اليوم',
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
        'no_activity': 'لم يتم تسجيل أي نشاط اليوم حتى الآن.',
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
        'flashcards_subtitle': 'تكرار متباعد – راجع البطاقات المستحقة بانتظام.',
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
        'quick_search': 'بحث سريع',
        'focus_off': 'إيقاف التركيز',
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
        'dash_subtitle': 'Votre centre d\'études en un coup d\'œil — progrès du jour et historique complet.',
        'stat_searches': 'Recherches aujourd\'hui',
        'stat_files': 'Fichiers téléchargés',
        'stat_tasks': 'Tâches terminées aujourd\'hui',
        'stat_streak': 'Plus longue série',
        'stat_pomodoros': 'Pomodoros aujourd\'hui',
        'today_activity': 'Activité d\'aujourd\'hui',
        'all_history': 'Tout l\'historique',
        'delete_today': 'Supprimer l\'activité d\'aujourd\'hui',
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
        'no_activity': 'Aucune activité enregistrée aujourd\'hui.',
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
        'flashcards_subtitle': 'Répétition espacée – révisez régulièrement les cartes dues.',
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
        'quick_search': 'Recherche rapide',
        'focus_off': 'Focus désactivé',
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
        'dash_subtitle': 'Ваш учебный центр — прогресс за сегодня и вся история.',
        'stat_searches': 'Поисков сегодня',
        'stat_files': 'Загружено файлов',
        'stat_tasks': 'Задач выполнено сегодня',
        'stat_streak': 'Самая длинная серия',
        'stat_pomodoros': 'Помодоро сегодня',
        'today_activity': 'Активность сегодня',
        'all_history': 'Вся история',
        'delete_today': 'Удалить активность за сегодня',
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
        'no_activity': 'Сегодня пока нет активности.',
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
        'flashcards_subtitle': 'Интервальное повторение – регулярно просматривайте просроченные карточки.',
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
        'quick_search': 'Быстрый поиск',
        'focus_off': 'Фокус выключен',
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
        'dash_subtitle': 'Seu centro de estudos num relance — progresso de hoje e histórico completo.',
        'stat_searches': 'Pesquisas Hoje',
        'stat_files': 'Arquivos Carregados',
        'stat_tasks': 'Tarefas Concluídas Hoje',
        'stat_streak': 'Maior Sequência',
        'stat_pomodoros': 'Pomodoros Hoje',
        'today_activity': 'Atividade de Hoje',
        'all_history': 'Todo o Histórico',
        'delete_today': 'Eliminar Atividade de Hoje',
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
        'no_activity': 'Nenhuma atividade registada hoje ainda.',
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
        'flashcards_subtitle': 'Repetição espaçada – revise os cartões vencidos regularmente.',
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
        'quick_search': 'Pesquisa Rápida',
        'focus_off': 'Foco Desligado',
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
        'dash_subtitle': 'আপনার স্টাডি হাব — আজকের অগ্রগতি ও সম্পূর্ণ ইতিহাস।',
        'stat_searches': 'আজকের অনুসন্ধান',
        'stat_files': 'আপলোড করা ফাইল',
        'stat_tasks': 'আজকের সম্পন্ন কাজ',
        'stat_streak': 'দীর্ঘতম ধারা',
        'stat_pomodoros': 'আজকের পোমোডোরো',
        'today_activity': 'আজকের কার্যকলাপ',
        'all_history': 'সমস্ত ইতিহাস',
        'delete_today': 'আজকের কার্যকলাপ মুছুন',
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
        'no_activity': 'আজ এখনও কোনো কার্যকলাপ রেকর্ড করা হয়নি।',
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
        'flashcards_subtitle': 'ব্যবধান পুনরাবৃত্তি – নিয়মিত বকেয়া কার্ড পর্যালোচনা করুন।',
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
        'quick_search': 'দ্রুত অনুসন্ধান',
        'focus_off': 'ফোকাস বন্ধ',
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
        'dash_subtitle': 'آپ کا اسٹڈی ہب — آج کی پیشرفت اور مکمل تاریخ۔',
        'stat_searches': 'آج کی تلاشیں',
        'stat_files': 'اپ لوڈ کردہ فائلیں',
        'stat_tasks': 'آج مکمل ہونے والے کام',
        'stat_streak': 'طویل ترین تسلسل',
        'stat_pomodoros': 'آج کے پوموڈورو',
        'today_activity': 'آج کی سرگرمی',
        'all_history': 'پوری تاریخ',
        'delete_today': 'آج کی سرگرمی حذف کریں',
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
        'no_activity': 'آج ابھی تک کوئی سرگرمی ریکارڈ نہیں ہوئی۔',
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
        'flashcards_subtitle': 'فاصلہ تکرار – باقاعدگی سے واجب الادا کارڈز کا جائزہ لیں۔',
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
        'quick_search': 'فوری تلاش',
        'focus_off': 'توجہ بند',
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
        'dash_subtitle': 'Pusat studi Anda sekilas — kemajuan hari ini & riwayat semua waktu.',
        'stat_searches': 'Pencarian Hari Ini',
        'stat_files': 'File Diunggah',
        'stat_tasks': 'Tugas Selesai Hari Ini',
        'stat_streak': 'Streak Terpanjang',
        'stat_pomodoros': 'Pomodoros Hari Ini',
        'today_activity': 'Aktivitas Hari Ini',
        'all_history': 'Semua Riwayat',
        'delete_today': 'Hapus Aktivitas Hari Ini',
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
        'no_activity': 'Belum ada aktivitas tercatat hari ini.',
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
        'flashcards_subtitle': 'Pengulangan terjadwal – tinjau kartu yang jatuh tempo secara teratur.',
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
        'quick_search': 'Pencarian Cepat',
        'focus_off': 'Fokus Mati',
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
        'dash_subtitle': 'Ihr Studien-Hub auf einen Blick — heutiger Fortschritt & gesamte Historie.',
        'stat_searches': 'Suchanfragen heute',
        'stat_files': 'Hochgeladene Dateien',
        'stat_tasks': 'Heute erledigte Aufgaben',
        'stat_streak': 'Längste Serie',
        'stat_pomodoros': 'Pomodoros heute',
        'today_activity': 'Aktivität heute',
        'all_history': 'Gesamte Historie',
        'delete_today': 'Aktivität von heute löschen',
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
        'no_activity': 'Heute wurde noch keine Aktivität aufgezeichnet.',
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
        'flashcards_subtitle': 'Wiederholung in Abständen – überprüfen Sie regelmäßig fällige Karten.',
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
        'quick_search': 'Schnellsuche',
        'focus_off': 'Fokus aus',
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
        'dash_subtitle': 'あなたの学習ハブ — 今日の進捗と全履歴。',
        'stat_searches': '今日の検索',
        'stat_files': 'アップロードされたファイル',
        'stat_tasks': '今日完了したタスク',
        'stat_streak': '最長連続記録',
        'stat_pomodoros': '今日のポモドーロ',
        'today_activity': '今日のアクティビティ',
        'all_history': '全履歴',
        'delete_today': '今日のアクティビティを削除',
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
        'no_activity': '今日はまだアクティビティが記録されていません。',
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
        'flashcards_subtitle': '間隔反復 – 定期的に期限切れカードを復習します。',
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
        'quick_search': 'クイック検索',
        'focus_off': 'フォーカスオフ',
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
        'dash_subtitle': 'Kituo chako cha kujifunza kwa mtazamo mmoja — maendeleo ya leo na historia yote.',
        'stat_searches': 'Utafutaji Leo',
        'stat_files': 'Faili Zilizopakiwa',
        'stat_tasks': 'Kazi Zilizokamilishwa Leo',
        'stat_streak': 'Mfululizo Mrefu Zaidi',
        'stat_pomodoros': 'Pomodoros Leo',
        'today_activity': 'Shughuli za Leo',
        'all_history': 'Historia Yote',
        'delete_today': 'Futa Shughuli za Leo',
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
        'no_activity': 'Hakuna shughuli iliyorekodiwa leo bado.',
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
        'flashcards_subtitle': 'Kurudia kwa vipindi – kagua kadi zilizochelewa mara kwa mara.',
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
        'quick_search': 'Utafutaji wa Haraka',
        'focus_off': 'Umakini Zima',
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
        'dash_subtitle': 'Çalışma merkeziniz — bugünün ilerlemesi ve tüm zamanların geçmişi.',
        'stat_searches': 'Bugünkü Aramalar',
        'stat_files': 'Yüklenen Dosyalar',
        'stat_tasks': 'Bugün Tamamlanan Görevler',
        'stat_streak': 'En Uzun Seri',
        'stat_pomodoros': 'Bugünkü Pomodorolar',
        'today_activity': 'Bugünün Etkinliği',
        'all_history': 'Tüm Geçmiş',
        'delete_today': 'Bugünün Etkinliğini Sil',
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
        'no_activity': 'Bugün henüz etkinlik kaydedilmedi.',
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
        'flashcards_subtitle': 'Aralıklı tekrar – vadesi gelen kartları düzenli olarak gözden geçirin.',
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
        'quick_search': 'Hızlı Arama',
        'focus_off': 'Odak Kapalı',
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
// DASHBOARD RENDER
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
        tc.innerHTML = '<p class="empty-state">' + getTranslation('no_activity') + '</p>';
    } else {
        tc.innerHTML = todayActs.slice().reverse().map(function(h) {
            return '<div class="activity-item"><span>' + h.description + '</span><span class="time">' + new Date(h.timestamp).toLocaleTimeString() + ' <button class="delete-item-btn" data-timestamp="' + h.timestamp + '">✕</button></span></div>';
        }).join('');
    }
    document.getElementById('todayCount').textContent = todayActs.length + ' ' + getTranslation('entries');

    // All History
    var allHist = data.history;
    var hc = document.getElementById('historyActivity');
    if (allHist.length === 0) {
        hc.innerHTML = '<p class="empty-state">' + getTranslation('no_history') + '</p>';
    } else {
        hc.innerHTML = allHist.slice().reverse().map(function(h) {
            return '<div class="activity-item"><span>' + h.description + '</span><span class="time">' + h.date + ' <button class="delete-item-btn" data-timestamp="' + h.timestamp + '">✕</button></span></div>';
        }).join('');
    }
    document.getElementById('historyCount').textContent = allHist.length + ' ' + getTranslation('entries');

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
        container.innerHTML = '<p class="empty-state">' + getTranslation('no_files') + '</p>';
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
            list.innerHTML = '<p class="empty-state">' + getTranslation('no_habits') + '</p>';
        } else {
            var today = new Date().toISOString().slice(0, 10);
            list.innerHTML = data.habits.map(function(h) {
                var done = h.completedDates.includes(today);
                return '<div class="habit-item"><span class="habit-text">' + h.text + (done ? ' ✅' : '') + '</span><div class="habit-actions"><button class="complete-btn ' + (done ? 'done' : '') + '" data-id="' + h.id + '">' + (done ? getTranslation('done') : getTranslation('complete')) + '</button></div></div>';
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
// NOTICE
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
            list.innerHTML = '<p class="empty-state">' + getTranslation('no_notices') + '</p>';
        } else {
            list.innerHTML = data.notices.map(function(n) {
                return '<div class="notice-item"><span>' + n.text + '</span><span class="time">' + new Date(n.date).toLocaleDateString() + ' <button class="delete-item-btn" data-id="' + n.id + '">✕</button></span></div>';
            }).join('');
        }
        if (countEl) countEl.textContent = data.notices.length + ' ' + getTranslation('notices_count');

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
// NOTES
// ================================================================
function setupNotes() {
    var input = document.getElementById('noteInput');
    var addBtn = document.getElementById('addNoteBtn');
    var list = document.getElementById('noteList');
    var delBtn = document.getElementById('deleteAllNotesBtn');

    function renderNotes() {
        var data = loadData();
        if (data.notes.length === 0) {
            list.innerHTML = '<p class="empty-state">' + getTranslation('no_notes') + '</p>';
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
            list.innerHTML = '<p class="empty-state">' + getTranslation('no_assignments') + '</p>';
            return;
        }

        list.innerHTML = data.assignments.sort(function(a, b) {
            return new Date(a.due) - new Date(b.due);
        }).map(function(a) {
            return '<div class="assignment-item priority-' + a.priority + '"><div><span>' + a.title + '</span> <span class="tags">#' + a.subject + (a.tags ? a.tags.map(function(t) { return ' #' + t; }).join('') : '') + '</span> ' + (a.completed ? '✅' : '') + '</div><div>' + a.due + ' <button class="btn-danger-sm" data-id="' + a.id + '">' + getTranslation('delete_all') + '</button> <button class="btn-primary-sm" data-id="' + a.id + '" data-action="toggle">' + (a.completed ? 'Undo' : getTranslation('done')) + '</button></div></div>';
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
            return '<div class="assignment-item"><span>' + r.title + (r.read ? ' ✅' : ' 📖') + ' <span class="tags">#' + r.subject + (r.tags ? r.tags.map(function(t) { return ' #' + t; }).join('') : '') + '</span></span><span><a href="' + r.url + '" target="_blank" style="color:#c084fc;">Link</a> <button class="btn-danger-sm" data-id="' + r.id + '">' + getTranslation('delete_all') + '</button> <button class="btn-primary-sm" data-id="' + r.id + '" data-action="toggle">' + (r.read ? 'Unread' : getTranslation('read')) + '</button></span></div>';
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
        this.textContent = document.body.classList.contains('focus-mode') ? '🔒 ' + getTranslation('focus_on') : '🔓 ' + getTranslation('focus_off');
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
        design: 'Midjourney or Canva',
        language: 'Duolingo',
        presentation: 'Gamma or Canva',
        poster: 'Canva',
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

    // ===== TRANSLATIONS =====
    initTranslations();

    // ===== 30-MINUTE MELODY TIMER =====
    initMelodyTimer();

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

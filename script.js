const STORAGE_KEY = 'studyHubData';
function getDefaultData() {
    return {
        files: [], habits: [], notices: [], notes: [], history: [], searches: [], lastReset: null,
        assignments: [], goals: [], flashcards: { decks: [] }, readingList: [], sessions: [],
        pomodoroLogs: [], planner: {}, journal: {}, subjects: ['General', 'Math', 'Science', 'Language']
    };
}
function loadData() { try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { const data = JSON.parse(raw); const def = getDefaultData(); for (let key in def) if (!(key in data)) data[key] = def[key]; return data; } } catch (e) { } return getDefaultData(); }
function saveData(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function resetDailyIfNeeded(data) { const today = new Date().toISOString().slice(0,10); if (data.lastReset !== today) { data.lastReset = today; saveData(data); } }
function addActivity(data, type, description) { const now = new Date(); data.history.push({ type, description, date: now.toISOString().slice(0,10), timestamp: now.getTime() }); if (data.history.length > 500) data.history.splice(0, data.history.length - 500); saveData(data); return data; }

// ─── Clock ──────────────────────────────────────────────────────────
let clockMode = 'digital', clockInterval = null;
function initClock() {
    const digital = document.getElementById('digitalClock'), analog = document.getElementById('analogClock'), toggle = document.getElementById('clockToggleBtn'), dateEl = document.getElementById('clockDate');
    if (!digital || !analog || !toggle) return;
    digital.classList.add('active'); analog.classList.remove('active'); toggle.textContent = '⏰ Switch to Analog';
    function updateClock() {
        const now = new Date(); digital.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
        const canvas = document.getElementById('analogCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d'), w = canvas.width, hc = canvas.height;
            ctx.clearRect(0,0,w,hc); ctx.beginPath(); ctx.arc(w/2,hc/2,w/2-4,0,2*Math.PI); ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fill(); ctx.strokeStyle='#c084fc'; ctx.lineWidth=2; ctx.stroke();
            for (let i=0;i<12;i++) { const a=(i*30-90)*Math.PI/180, l=w/2-14; ctx.beginPath(); ctx.moveTo(w/2+l*Math.cos(a), hc/2+l*Math.sin(a)); ctx.lineTo(w/2+(w/2-6)*Math.cos(a), hc/2+(w/2-6)*Math.sin(a)); ctx.strokeStyle='#94a3b8'; ctx.lineWidth=i%3===0?3:1.5; ctx.stroke(); }
            const s=(now.getSeconds()*6-90)*Math.PI/180, m=((now.getMinutes()+now.getSeconds()/60)*6-90)*Math.PI/180, h=((now.getHours()%12+now.getMinutes()/60)*30-90)*Math.PI/180;
            function drawHand(a,l,c,w){ ctx.beginPath(); ctx.moveTo(w/2,hc/2); ctx.lineTo(w/2+l*Math.cos(a), hc/2+l*Math.sin(a)); ctx.strokeStyle=c; ctx.lineWidth=w; ctx.stroke(); }
            drawHand(h,w/2*0.5,'#f472b6',5); drawHand(m,w/2*0.7,'#6ee7b7',3); drawHand(s,w/2*0.8,'#fca5a5',1.5);
            ctx.beginPath(); ctx.arc(w/2,hc/2,4,0,2*Math.PI); ctx.fillStyle='#c084fc'; ctx.fill();
        }
        dateEl.textContent = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    }
    updateClock(); if (clockInterval) clearInterval(clockInterval); clockInterval = setInterval(updateClock,1000);
    toggle.addEventListener('click', function() {
        if (clockMode === 'digital') { clockMode = 'analog'; digital.classList.remove('active'); analog.classList.add('active'); this.textContent = '⏰ Switch to Digital'; }
        else { clockMode = 'digital'; digital.classList.add('active'); analog.classList.remove('active'); this.textContent = '⏰ Switch to Analog'; }
        updateClock();
    });
}

// ─── Dashboard Render ──────────────────────────────────────────────
function renderDashboard() {
    const data = loadData(); resetDailyIfNeeded(data); const today = new Date().toISOString().slice(0,10);
    document.getElementById('todayDate').textContent = today;
    const todaySearches = data.searches.filter(s => s.date.startsWith(today)).length;
    const todayFiles = data.files.filter(f => f.date && f.date.startsWith(today)).length;
    const todayTasks = data.history.filter(h => h.date === today && h.type === 'habit_complete').length;
    let streak = 0; if (data.habits.length > 0) { const allDates = new Set(); data.habits.forEach(h => h.completedDates.forEach(d => allDates.add(d))); const sorted = Array.from(allDates).sort(); if (sorted.length > 0) { let c=1,m=1; for (let i=1;i<sorted.length;i++) { const diff=(new Date(sorted[i])-new Date(sorted[i-1]))/(1000*60*60*24); if (diff===1) { c++; m=Math.max(m,c); } else c=1; } streak=m; } }
    document.getElementById('statSearches').textContent = todaySearches;
    document.getElementById('statFiles').textContent = data.files.length;
    document.getElementById('statTasks').textContent = todayTasks;
    document.getElementById('statStreak').textContent = streak;

    // Today Activity
    const todayActs = data.history.filter(h => h.date === today);
    const tc = document.getElementById('todayActivity');
    if (todayActs.length === 0) tc.innerHTML = '<p class="empty-state">No activity recorded <span class="hl-purple">today</span> yet.</p>';
    else tc.innerHTML = todayActs.slice().reverse().map(h => `<div class="activity-item"><span>${h.description}</span><span class="time">${new Date(h.timestamp).toLocaleTimeString()}</span></div>`).join('');
    document.getElementById('todayCount').textContent = todayActs.length;

    const allHist = data.history;
    const hc = document.getElementById('historyActivity');
    if (allHist.length === 0) hc.innerHTML = '<p class="empty-state">No history <span class="hl-purple">recorded</span> yet.</p>';
    else hc.innerHTML = allHist.slice().reverse().map(h => `<div class="activity-item"><span>${h.description}</span><span class="time">${h.date}</span></div>`).join('');
    document.getElementById('historyCount').textContent = allHist.length;

    // Upcoming Assignments
    const assignEl = document.getElementById('upcomingAssignments');
    if (assignEl) {
        const upcoming = data.assignments.filter(a => !a.completed).sort((a,b) => new Date(a.due) - new Date(b.due)).slice(0,5);
        if (upcoming.length === 0) assignEl.innerHTML = '<p class="empty-state">No pending assignments.</p>';
        else assignEl.innerHTML = upcoming.map(a => `<div class="assignment-item priority-${a.priority}"><span>${a.title} <span class="tags">${a.tags ? '#'+a.tags.join(' #') : ''}</span></span><span>${a.due}</span></div>`).join('');
    }

    // Journal today
    const journalEl = document.getElementById('journalText');
    if (journalEl) {
        journalEl.value = data.journal[today] || '';
        const pastEl = document.getElementById('journalPast');
        if (pastEl) {
            const entries = Object.entries(data.journal).filter(([d,_]) => d !== today).sort().reverse().slice(0,5);
            pastEl.innerHTML = entries.map(([d,t]) => `<div><span class="hl-cyan">${d}:</span> ${t.substring(0,60)}${t.length>60?'...':''}</div>`).join('');
        }
    }
    // Pomodoro stats
    const pomoCount = document.getElementById('pomoCount');
    if (pomoCount) pomoCount.textContent = data.pomodoroLogs.filter(l => l.date === today).length;

    // Check reminders
    checkReminders(data);
}
function deleteTodayHistory() { if (!confirm('Delete all activity for today?')) return; const data=loadData(); const today=new Date().toISOString().slice(0,10); data.history=data.history.filter(h=>h.date!==today); saveData(data); renderDashboard(); }
function deleteAllHistory() { if (!confirm('Delete ALL history?')) return; const data=loadData(); data.history=[]; saveData(data); renderDashboard(); }

// ─── Reminders ──────────────────────────────────────────────────────
function checkReminders(data) {
    if (!("Notification" in window) || Notification.permission === "denied") return;
    if (Notification.permission === "default") Notification.requestPermission();
    const today = new Date().toISOString().slice(0,10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10);
    data.assignments.filter(a => !a.completed && a.due === tomorrow).forEach(a => {
        if (a._notified) return; a._notified = true; saveData(data);
        new Notification(`⏰ Assignment Due Tomorrow`, { body: `${a.title} (${a.subject})` });
    });
    data.flashcards.decks.forEach(deck => {
        deck.cards.filter(c => c.dueDate && c.dueDate <= today && !c._notified).forEach(c => {
            c._notified = true; saveData(data);
            new Notification(`📝 Flashcard Review Due`, { body: `Deck: ${deck.name} - "${c.front}"` });
        });
    });
}

// ─── Pomodoro ──────────────────────────────────────────────────────
let pomoTimer = null, pomoSeconds = 1500, pomoRunning = false, pomoTask = '';
function initPomodoro() {
    const display = document.getElementById('pomoDisplay'); if (!display) return;
    const startBtn = document.getElementById('pomoStart'), stopBtn = document.getElementById('pomoStop'), resetBtn = document.getElementById('pomoReset');
    const taskSelect = document.getElementById('pomoTaskSelect');
    function updateDisplay() { const m=Math.floor(pomoSeconds/60), s=pomoSeconds%60; display.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
    if (startBtn) startBtn.addEventListener('click', function() {
        if (pomoRunning) return;
        pomoTask = taskSelect ? taskSelect.value : 'Study';
        pomoRunning = true;
        pomoTimer = setInterval(() => {
            pomoSeconds--;
            updateDisplay();
            if (pomoSeconds <= 0) {
                clearInterval(pomoTimer); pomoRunning = false;
                const data = loadData();
                data.pomodoroLogs.push({ date: new Date().toISOString().slice(0,10), task: pomoTask, duration: 25 });
                addActivity(data, 'pomodoro', `Completed Pomodoro: ${pomoTask}`);
                saveData(data);
                renderDashboard();
                new Notification('🍅 Pomodoro Complete!', { body: `Great focus on ${pomoTask}!` });
                pomoSeconds = 1500; updateDisplay();
            }
        }, 1000);
    });
    if (stopBtn) stopBtn.addEventListener('click', function() { clearInterval(pomoTimer); pomoRunning = false; });
    if (resetBtn) resetBtn.addEventListener('click', function() { clearInterval(pomoTimer); pomoRunning = false; pomoSeconds=1500; updateDisplay(); });
    updateDisplay();
    // populate tasks
    if (taskSelect) {
        const data = loadData();
        taskSelect.innerHTML = '<option value="Study">Study</option>' + data.habits.map(h => `<option value="${h.text}">${h.text}</option>`).join('');
    }
}

// ─── AI Summarizer ──────────────────────────────────────────────────
function setupSummarizer() {
    const btn = document.getElementById('summarizeBtn'); if (!btn) return;
    const input = document.getElementById('summarizeInput'), output = document.getElementById('summarizeOutput');
    btn.addEventListener('click', function() {
        const text = input.value.trim(); if (!text) { output.textContent = 'Please paste some text to summarize.'; return; }
        // Extractive summarization: score sentences by word frequency
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        if (sentences.length <= 2) { output.textContent = text; return; }
        const words = text.toLowerCase().match(/\b\w+\b/g) || [];
        const freq = {}; words.forEach(w => { if (w.length > 3) freq[w] = (freq[w]||0) + 1; });
        const scores = sentences.map(s => {
            const sw = s.toLowerCase().match(/\b\w+\b/g) || [];
            let score = 0; sw.forEach(w => { if (freq[w]) score += freq[w]; });
            return { sentence: s.trim(), score: score / (sw.length || 1) };
        });
        scores.sort((a,b) => b.score - a.score);
        const top = scores.slice(0, Math.max(3, Math.ceil(sentences.length * 0.3))).sort((a,b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence));
        output.textContent = top.map(s => s.sentence).join(' ');
        const data = loadData(); addActivity(data, 'ai_summary', 'Generated AI summary'); saveData(data);
    });
}

// ─── File Upload ──────────────────────────────────────────────────
function setupFileUpload() { const uploadArea=document.getElementById('uploadArea'); if(!uploadArea) return; const fileInput=document.getElementById('fileInput'); uploadArea.addEventListener('click',()=>fileInput.click()); uploadArea.addEventListener('dragover',(e)=>{e.preventDefault(); uploadArea.style.borderColor='#c084fc';}); uploadArea.addEventListener('dragleave',()=>{uploadArea.style.borderColor='rgba(192,132,252,0.2)';}); uploadArea.addEventListener('drop',(e)=>{e.preventDefault(); uploadArea.style.borderColor='rgba(192,132,252,0.2)'; handleFiles(e.dataTransfer.files);}); fileInput.addEventListener('change',()=>{handleFiles(fileInput.files); fileInput.value='';});
    async function handleFiles(files) { let data=loadData(); for(let file of files) { try { const reader=new FileReader(); const r = await new Promise((res,rej)=>{ reader.onload=(e)=>res(e.target.result); reader.onerror=rej; reader.readAsDataURL(file); }); data.files.push({ name: file.name, size: file.size, data: r, date: new Date().toISOString() }); addActivity(data,'file',`Uploaded "${file.name}"`); saveData(data); } catch(e){} } renderFileList(); if(document.getElementById('statFiles')) renderDashboard(); }
    const delBtn=document.getElementById('deleteAllFilesBtn'); if(delBtn) delBtn.addEventListener('click',()=>{ if(confirm('Delete all files?')){ let data=loadData(); data.files=[]; addActivity(data,'delete','Deleted all files'); saveData(data); renderFileList(); if(document.getElementById('statFiles')) renderDashboard(); } });
}
function renderFileList() { const container=document.getElementById('fileList'); if(!container) return; const data=loadData(); if(data.files.length===0){ container.innerHTML='<p class="empty-state">No files uploaded.</p>'; return; } container.innerHTML=data.files.map(f=>`<div class="file-item"><a href="${f.data}" target="_blank" class="file-name">📄 ${f.name}</a><span class="file-size">${(f.size/1024).toFixed(1)} KB</span></div>`).join(''); }

// ─── Habits ──────────────────────────────────────────────────────
function setupHabits() {
    const input=document.getElementById('habitInput'), addBtn=document.getElementById('addHabitBtn'), list=document.getElementById('habitList'), delBtn=document.getElementById('deleteAllHabitsBtn'), streakDisplay=document.getElementById('streakDisplay');
    function renderHabits() { const data=loadData(); if(data.habits.length===0){ list.innerHTML='<p class="empty-state">No habits yet.</p>'; } else { const today=new Date().toISOString().slice(0,10); list.innerHTML=data.habits.map(h=>{ const done=h.completedDates.includes(today); return `<div class="habit-item"><span class="habit-text">${h.text} ${done?'✅':''}</span><div class="habit-actions"><button class="complete-btn ${done?'done':''}" data-id="${h.id}">${done?'Done':'Complete'}</button></div></div>`; }).join(''); list.querySelectorAll('.complete-btn').forEach(btn=>{ btn.addEventListener('click',function(){ const id=this.dataset.id; let data=loadData(); const habit=data.habits.find(h=>h.id===id); if(habit){ const today=new Date().toISOString().slice(0,10); if(!habit.completedDates.includes(today)){ habit.completedDates.push(today); addActivity(data,'habit_complete',`Completed habit: "${habit.text}"`); saveData(data); renderHabits(); updateStreak(); if(document.getElementById('statTasks')) renderDashboard(); } } }); }); } updateStreak(); }
    function updateStreak(){ const data=loadData(); let streak=0; if(data.habits.length>0){ const allDates=new Set(); data.habits.forEach(h=>h.completedDates.forEach(d=>allDates.add(d))); const sorted=Array.from(allDates).sort(); if(sorted.length>0){ let c=1,m=1; for(let i=1;i<sorted.length;i++){ const diff=(new Date(sorted[i])-new Date(sorted[i-1]))/(1000*60*60*24); if(diff===1){ c++; m=Math.max(m,c); } else c=1; } streak=m; } } if(streakDisplay) streakDisplay.textContent=streak; }
    addBtn.addEventListener('click',function(){ const text=input.value.trim(); if(!text) return; let data=loadData(); data.habits.push({ id: Date.now().toString(36)+Math.random().toString(36).substr(2,5), text:text, completedDates:[] }); addActivity(data,'habit_add',`Created habit: "${text}"`); saveData(data); input.value=''; renderHabits(); if(document.getElementById('statTasks')) renderDashboard(); });
    input.addEventListener('keypress',(e)=>{ if(e.key==='Enter') addBtn.click(); });
    delBtn.addEventListener('click',function(){ if(confirm('Delete all habits?')){ let data=loadData(); data.habits=[]; addActivity(data,'delete','Deleted all habits'); saveData(data); renderHabits(); if(document.getElementById('statTasks')) renderDashboard(); } });
    renderHabits();
}

// ─── Notice ──────────────────────────────────────────────────────
function setupNotice() { const input=document.getElementById('noticeInput'), addBtn=document.getElementById('addNoticeBtn'), list=document.getElementById('noticeList'), delBtn=document.getElementById('deleteAllNoticesBtn'), countEl=document.getElementById('noticeCount');
    function renderNotices(){ const data=loadData(); if(data.notices.length===0){ list.innerHTML='<p class="empty-state">No notices pinned.</p>'; } else { list.innerHTML=data.notices.map(n=>`<div class="notice-item"><span>${n.text}</span><span class="time">${new Date(n.date).toLocaleDateString()}</span></div>`).join(''); } if(countEl) countEl.textContent=data.notices.length+' notices'; }
    addBtn.addEventListener('click',function(){ const text=input.value.trim(); if(!text) return; let data=loadData(); data.notices.push({ id: Date.now().toString(36)+Math.random().toString(36).substr(2,5), text:text, date:new Date().toISOString() }); addActivity(data,'notice_add',`Added notice: "${text}"`); saveData(data); input.value=''; renderNotices(); });
    input.addEventListener('keypress',(e)=>{ if(e.key==='Enter') addBtn.click(); });
    delBtn.addEventListener('click',function(){ if(confirm('Delete all notices?')){ let data=loadData(); data.notices=[]; addActivity(data,'delete','Deleted all notices'); saveData(data); renderNotices(); } });
    renderNotices();
}
// ─── Notes ──────────────────────────────────────────────────────
function setupNotes() { const input=document.getElementById('noteInput'), addBtn=document.getElementById('addNoteBtn'), list=document.getElementById('noteList'), delBtn=document.getElementById('deleteAllNotesBtn');
    function renderNotes(){ const data=loadData(); if(data.notes.length===0){ list.innerHTML='<p class="empty-state">No notes yet.</p>'; } else { list.innerHTML=data.notes.map(n=>`<div class="note-item"><span>${n.text}</span><span class="time">${new Date(n.date).toLocaleDateString()}</span></div>`).join(''); } }
    addBtn.addEventListener('click',function(){ const text=input.value.trim(); if(!text) return; let data=loadData(); data.notes.push({ id: Date.now().toString(36)+Math.random().toString(36).substr(2,5), text:text, date:new Date().toISOString() }); addActivity(data,'note_add',`Added note: "${text}"`); saveData(data); input.value=''; renderNotes(); });
    input.addEventListener('keypress',(e)=>{ if(e.key==='Enter') addBtn.click(); });
    delBtn.addEventListener('click',function(){ if(confirm('Delete all notes?')){ let data=loadData(); data.notes=[]; addActivity(data,'delete','Deleted all notes'); saveData(data); renderNotes(); } });
    renderNotes();
}
// ─── Search ──────────────────────────────────────────────────────
function setupSearch() {
    const input=document.getElementById('searchInput'), btn=document.getElementById('searchBtn'), sl=document.getElementById('suggestionsList'), kt=document.getElementById('keyboardToggle'), kc=document.getElementById('keyboardContainer');
    if(!input) return;
    function updateSuggestions(q){ const data=loadData(); const matches=data.searches.map(s=>s.query).filter((v,i,a)=>a.indexOf(v)===i).filter(s=>s.toLowerCase().includes(q.toLowerCase())).slice(0,8); if(q.length===0||matches.length===0){ sl.classList.remove('active'); return; } sl.innerHTML=matches.map(m=>`<div class="suggestion-item" data-query="${m}">${m}</div>`).join(''); sl.classList.add('active'); sl.querySelectorAll('.suggestion-item').forEach(el=>{ el.addEventListener('click',function(){ const val=this.dataset.query; input.value=val; sl.classList.remove('active'); performSearch(val); }); }); }
    input.addEventListener('input',function(){ updateSuggestions(this.value); }); input.addEventListener('blur',function(){ setTimeout(()=>sl.classList.remove('active'),200); });
    function performSearch(q){ if(!q) return; let data=loadData(); data.searches.push({ query:q, date:new Date().toISOString() }); addActivity(data,'search',`Searched: "${q}"`); saveData(data); window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`,'_blank'); input.value=''; sl.classList.remove('active'); if(document.getElementById('statSearches')) renderDashboard(); }
    btn.addEventListener('click',function(){ performSearch(input.value.trim()); }); input.addEventListener('keypress',(e)=>{ if(e.key==='Enter') performSearch(input.value.trim()); });
    if(kt && kc){ kt.addEventListener('click',function(){ kc.classList.toggle('active'); this.textContent=kc.classList.contains('active')?'⌨️ Hide Keyboard':'⌨️ Show Keyboard'; }); const rows=[['1','2','3','4','5','6','7','8','9','0','Backspace'],['q','w','e','r','t','y','u','i','o','p'],['a','s','d','f','g','h','j','k','l'],['z','x','c','v','b','n','m',',','.','?'],['Space']]; rows.forEach(rowKeys=>{ const rowDiv=document.createElement('div'); rowDiv.className='keyboard-row'; rowKeys.forEach(key=>{ const btn=document.createElement('button'); btn.className='key-btn'; if(key==='Backspace'||key==='Space') btn.classList.add('special'); if(key==='Space') btn.classList.add('space'); btn.textContent=key==='Space'?'␣':key; btn.dataset.key=key; rowDiv.appendChild(btn); }); kc.appendChild(rowDiv); }); kc.addEventListener('click',function(e){ const target=e.target.closest('.key-btn'); if(!target) return; const key=target.dataset.key; const inp=document.getElementById('searchInput'); if(!inp) return; if(key==='Backspace') inp.value=inp.value.slice(0,-1); else if(key==='Space') inp.value+=' '; else inp.value+=key; inp.dispatchEvent(new Event('input')); inp.focus(); }); }
}
// ─── Assignments ──────────────────────────────────────────────────
function setupAssignments() {
    const form = document.getElementById('assignmentForm'); if(!form) return;
    const list = document.getElementById('assignmentList');
    function renderAssignments() {
        const data=loadData(); if(data.assignments.length===0){ list.innerHTML='<p class="empty-state">No assignments.</p>'; return; }
        list.innerHTML = data.assignments.sort((a,b)=>new Date(a.due)-new Date(b.due)).map(a => `
            <div class="assignment-item priority-${a.priority}">
                <div><span>${a.title}</span> <span class="tags">#${a.subject} ${a.tags? a.tags.map(t=>'#'+t).join(' '):''}</span> ${a.completed?'✅':''}</div>
                <div>${a.due} <button class="btn-danger-sm" data-id="${a.id}">Delete</button> <button class="btn-primary-sm" data-id="${a.id}" data-action="toggle">${a.completed?'Undo':'Done'}</button></div>
            </div>
        `).join('');
        list.querySelectorAll('[data-id]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id; const action = this.dataset.action;
                let data=loadData(); const idx=data.assignments.findIndex(a=>a.id===id); if(idx===-1) return;
                if(action==='toggle') data.assignments[idx].completed = !data.assignments[idx].completed;
                else data.assignments.splice(idx,1);
                addActivity(data, 'assignment', `Updated assignment`);
                saveData(data); renderAssignments(); if(document.getElementById('upcomingAssignments')) renderDashboard();
            });
        });
    }
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const title = document.getElementById('assignTitle').value.trim();
        const subject = document.getElementById('assignSubject').value;
        const due = document.getElementById('assignDue').value;
        const priority = document.getElementById('assignPriority').value;
        const tags = document.getElementById('assignTags').value.split(',').map(s=>s.trim()).filter(Boolean);
        if(!title || !due) return;
        let data=loadData(); data.assignments.push({ id: Date.now().toString(36)+Math.random().toString(36).substr(2,5), title, subject, due, priority, tags, completed: false });
        addActivity(data, 'assignment_add', `Added assignment: "${title}"`);
        saveData(data); renderAssignments(); form.reset(); if(document.getElementById('upcomingAssignments')) renderDashboard();
    });
    renderAssignments();
}
// ─── Planner ──────────────────────────────────────────────────────
function setupPlanner() {
    const grid = document.getElementById('plannerGrid'); if(!grid) return;
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const hours = ['8:00','9:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
    function renderPlanner() {
        const data=loadData(); grid.innerHTML='';
        // header
        grid.innerHTML += `<div class="time-label"></div>`;
        days.forEach(d => grid.innerHTML += `<div class="time-label" style="font-weight:700;">${d}</div>`);
        hours.forEach(h => {
            grid.innerHTML += `<div class="time-label">${h}</div>`;
            days.forEach(d => {
                const key = `${d}_${h}`;
                const val = data.planner[key] || '';
                const cell = document.createElement('div');
                cell.className = `planner-cell ${val ? 'filled' : ''}`;
                cell.textContent = val;
                cell.addEventListener('click', function() {
                    const newVal = prompt(`Plan for ${d} ${h}:`, val || '');
                    if (newVal === null) return;
                    let data=loadData();
                    if (newVal.trim() === '') delete data.planner[key];
                    else data.planner[key] = newVal.trim();
                    saveData(data); renderPlanner();
                });
                grid.appendChild(cell);
            });
        });
    }
    renderPlanner();
}
// ─── Flashcards ──────────────────────────────────────────────────
function setupFlashcards() {
    const form = document.getElementById('flashcardForm'); if(!form) return;
    const list = document.getElementById('flashcardList');
    function renderFlashcards() {
        const data=loadData(); list.innerHTML='';
        data.flashcards.decks.forEach(deck => {
            const div = document.createElement('div'); div.className='glass-card'; div.style.padding='1rem';
            const dueCount = deck.cards.filter(c => c.dueDate && c.dueDate <= new Date().toISOString().slice(0,10)).length;
            div.innerHTML = `<h3>${deck.name} <span class="hl-cyan">(${deck.cards.length} cards, ${dueCount} due)</span></h3>
                <button class="btn-primary-sm" data-deck="${deck.id}" data-action="review">Review</button>
                <button class="btn-danger-sm" data-deck="${deck.id}" data-action="delete">Delete Deck</button>
                <div style="margin-top:0.5rem;"><input class="input-dark" placeholder="Front" id="front_${deck.id}"> <input class="input-dark" placeholder="Back" id="back_${deck.id}"> <button class="btn-primary-sm" data-deck="${deck.id}" data-action="addcard">Add Card</button></div>
            `;
            list.appendChild(div);
        });
        // event listeners
        list.querySelectorAll('[data-deck]').forEach(btn => {
            btn.addEventListener('click', function() {
                const deckId = this.dataset.deck; const action = this.dataset.action;
                let data=loadData(); const deck = data.flashcards.decks.find(d=>d.id===deckId);
                if(!deck) return;
                if(action === 'delete') {
                    if(confirm('Delete deck?')) { data.flashcards.decks = data.flashcards.decks.filter(d=>d.id!==deckId); saveData(data); renderFlashcards(); }
                } else if(action === 'addcard') {
                    const front = document.getElementById(`front_${deckId}`).value.trim();
                    const back = document.getElementById(`back_${deckId}`).value.trim();
                    if(!front || !back) return;
                    deck.cards.push({ id: Date.now().toString(36)+Math.random().toString(36).substr(2,5), front, back, dueDate: new Date().toISOString().slice(0,10), level: 0 });
                    saveData(data); renderFlashcards();
                } else if(action === 'review') {
                    startReview(deckId);
                }
            });
        });
    }
    function startReview(deckId) {
        const data=loadData(); const deck=data.flashcards.decks.find(d=>d.id===deckId); if(!deck) return;
        const dueCards = deck.cards.filter(c => c.dueDate && c.dueDate <= new Date().toISOString().slice(0,10));
        if(dueCards.length === 0) { alert('No cards due for review!'); return; }
        let idx=0; const reviewContainer = document.getElementById('flashcardReview');
        reviewContainer.style.display = 'block';
        const frontEl = document.getElementById('reviewFront'); const backEl = document.getElementById('reviewBack');
        const diffBtns = document.querySelectorAll('.flashcard-difficulty button');
        function showCard() {
            if(idx >= dueCards.length) { reviewContainer.style.display = 'none'; alert('Review complete!'); renderFlashcards(); return; }
            const card = dueCards[idx];
            frontEl.textContent = card.front; backEl.textContent = card.back;
            document.querySelector('.flashcard-review').classList.remove('show-back');
        }
        showCard();
        document.querySelector('.flashcard-review').addEventListener('click', function(e) {
            if(e.target.tagName !== 'BUTTON') {
                this.classList.toggle('show-back');
            }
        });
        diffBtns.forEach(btn => {
            btn.onclick = function() {
                const diff = parseInt(this.dataset.diff);
                const card = dueCards[idx];
                let data=loadData(); const deck2 = data.flashcards.decks.find(d=>d.id===deckId);
                const c = deck2.cards.find(c=>c.id===card.id);
                if(c) {
                    // Simple spaced repetition: level up/down
                    let level = c.level || 0;
                    if(diff === 1) level = Math.max(0, level - 1);
                    else if(diff === 3) level = Math.min(5, level + 1);
                    else if(diff === 2) level = Math.min(5, level + 0.5);
                    c.level = level;
                    const days = [1, 2, 4, 8, 16, 32];
                    const next = new Date();
                    next.setDate(next.getDate() + days[Math.min(5, Math.round(level))]);
                    c.dueDate = next.toISOString().slice(0,10);
                    saveData(data);
                }
                idx++;
                showCard();
                if(idx === dueCards.length) { setTimeout(() => { reviewContainer.style.display = 'none'; renderFlashcards(); }, 500); }
            };
        });
    }
    // Add Deck
    document.getElementById('addDeckBtn').addEventListener('click', function() {
        const name = prompt('Deck name:');
        if(!name) return;
        let data=loadData(); data.flashcards.decks.push({ id: Date.now().toString(36)+Math.random().toString(36).substr(2,5), name, cards: [] });
        saveData(data); renderFlashcards();
    });
    renderFlashcards();
}
// ─── Reading List ──────────────────────────────────────────────────
function setupReading() {
    const form = document.getElementById('readingForm'); if(!form) return;
    const list = document.getElementById('readingList');
    function renderReading() {
        const data=loadData(); if(data.readingList.length===0){ list.innerHTML='<p class="empty-state">No items.</p>'; return; }
        list.innerHTML = data.readingList.map(r => `
            <div class="assignment-item"><span>${r.title} ${r.read ? '✅' : '📖'} <span class="tags">#${r.subject} ${r.tags?r.tags.map(t=>'#'+t).join(' '):''}</span></span>
            <span><a href="${r.url}" target="_blank" style="color:#c084fc;">Link</a> <button class="btn-danger-sm" data-id="${r.id}">Delete</button> <button class="btn-primary-sm" data-id="${r.id}" data-action="toggle">${r.read?'Unread':'Read'}</button></span></div>
        `).join('');
        list.querySelectorAll('[data-id]').forEach(btn => {
            btn.addEventListener('click', function() {
                const id=this.dataset.id; const action=this.dataset.action;
                let data=loadData(); const item=data.readingList.find(r=>r.id===id);
                if(!item) return;
                if(action==='toggle') item.read = !item.read;
                else data.readingList = data.readingList.filter(r=>r.id!==id);
                saveData(data); renderReading();
            });
        });
    }
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const title = document.getElementById('readTitle').value.trim();
        const url = document.getElementById('readUrl').value.trim();
        const subject = document.getElementById('readSubject').value;
        const tags = document.getElementById('readTags').value.split(',').map(s=>s.trim()).filter(Boolean);
        if(!title || !url) return;
        let data=loadData(); data.readingList.push({ id: Date.now().toString(36)+Math.random().toString(36).substr(2,5), title, url, subject, tags, read: false });
        saveData(data); renderReading(); form.reset();
    });
    renderReading();
}
// ─── Focus Mode ──────────────────────────────────────────────────
function setupFocusMode() {
    const btn = document.getElementById('focusToggle');
    if(!btn) return;
    btn.addEventListener('click', function() {
        document.body.classList.toggle('focus-mode');
        this.classList.toggle('active');
        this.textContent = document.body.classList.contains('focus-mode') ? '🔒 Focus On' : '🔓 Focus Off';
    });
}
// ─── Nav Date & Scroll Gradient ──────────────────────────────────
function updateNavDate() { const el=document.getElementById('navDate'); if(el) el.textContent = new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }); }
function updateScrollGradient() {
    const scrollTop = window.scrollY, docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const p = docHeight > 0 ? scrollTop / docHeight : 0;
    const blue=[30,58,138], green=[6,95,70], purple=[88,28,135]; let r,g,b;
    if(p<0.5){ const t=p/0.5; r=blue[0]+(green[0]-blue[0])*t; g=blue[1]+(green[1]-blue[1])*t; b=blue[2]+(green[2]-blue[2])*t; }
    else { const t=(p-0.5)/0.5; r=green[0]+(purple[0]-green[0])*t; g=green[1]+(purple[1]-green[1])*t; b=green[2]+(purple[2]-green[2])*t; }
    document.body.style.background = `radial-gradient(ellipse at top left, rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)}), #0d0618)`;
}
// ─── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    updateNavDate(); initClock(); updateScrollGradient(); window.addEventListener('scroll', updateScrollGradient); window.addEventListener('resize', updateScrollGradient);
    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    const path = window.location.pathname.split('/').pop() || 'index.html';
    if (path === 'index.html' || path === '') {
        renderDashboard(); initPomodoro();
        const dToday=document.getElementById('deleteTodayBtn'); if(dToday) dToday.addEventListener('click', deleteTodayHistory);
        const dAll=document.getElementById('deleteAllBtn'); if(dAll) dAll.addEventListener('click', deleteAllHistory);
        const journal = document.getElementById('journalText');
        if(journal) journal.addEventListener('input', function() {
            let data=loadData(); const today=new Date().toISOString().slice(0,10);
            data.journal[today] = this.value; saveData(data);
        });
        setupFocusMode();
    } else if (path === 'files.html') { setupFileUpload(); renderFileList(); }
    else if (path === 'habits.html') setupHabits();
    else if (path === 'notice.html') setupNotice();
    else if (path === 'notes.html') setupNotes();
    else if (path === 'search.html') setupSearch();
    else if (path === 'ai-tools.html') { setupAIRecommendation(); setupSummarizer(); }
    else if (path === 'assignments.html') setupAssignments();
    else if (path === 'planner.html') setupPlanner();
    else if (path === 'flashcards.html') setupFlashcards();
    else if (path === 'reading.html') setupReading();
    const data=loadData(); resetDailyIfNeeded(data); if(path==='index.html'||path==='') renderDashboard();
});
function setupAIRecommendation() {
    const btn=document.getElementById('aiRecommendBtn'); if(!btn) return; const input=document.getElementById('aiQueryInput'), result=document.getElementById('aiRecommendResult');
    const recMap={ math:'DeepSeek or Wolfram Alpha', calculus:'DeepSeek or Wolfram Alpha', code:'Cursor', programming:'Cursor', write:'ChatGPT or Claude', research:'Perplexity or Claude', data:'Claude', design:'Midjourney', language:'Duolingo', presentation:'Gamma', physics:'Wolfram Alpha' };
    btn.addEventListener('click', function() {
        const q=input.value.trim().toLowerCase(); if(!q){ result.textContent='Please describe what you need.'; return; }
        let rec='I recommend '; let found=false; for(let k in recMap){ if(q.includes(k)){ rec+=recMap[k]; found=true; break; } } if(!found) rec+='ChatGPT';
        result.textContent=rec; const data=loadData(); addActivity(data,'ai_recommend',`AI recommendation for: "${q}"`); saveData(data);
    });
}

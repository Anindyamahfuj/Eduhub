/* ============================================================
   StudyHub AI Module - eduhub-summarizer.js
   Contains:
   1. Unified Trash System (works on every page)
   2. Real Summarizer (sentence-scoring extractive algorithm)
   3. Planner AI (preset prompts + free-text)
   4. Auto-Flashcard Generator (from notes)
   ============================================================ */

/* ============================================================
   1. UNIFIED TRASH SYSTEM
   ============================================================ */

const TRASH_KEY = 'studyhub_trash';

function getTrash() {
  try { return JSON.parse(localStorage.getItem(TRASH_KEY)) || []; }
  catch (e) { return []; }
}

function saveTrash(trash) {
  localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
  updateTrashCount();
}

function addToTrash(type, item) {
  const trash = getTrash();
  trash.push({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    type: type,           // 'note' | 'planner' | 'flashcard' | 'deck' | 'assignment' | 'reading' | 'notice'
    data: item,
    deletedAt: new Date().toISOString()
  });
  saveTrash(trash);
}

function restoreFromTrash(trashId) {
  const trash = getTrash();
  const item = trash.find(t => t.id === trashId);
  if (!item) return;
  // Restore to its original storage
  const storageMap = {
    'note':       'studyhub_notes',
    'planner':    'studyhub_planner',
    'flashcard':  'studyhub_flashcards',
    'deck':       'studyhub_decks',
    'assignment': 'studyhub_assignments',
    'reading':    'studyhub_reading',
    'notice':     'studyhub_notices'
  };
  const key = storageMap[item.type];
  if (key) {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { arr = []; }
    arr.push(item.data);
    localStorage.setItem(key, JSON.stringify(arr));
  }
  // Remove from trash
  const newTrash = trash.filter(t => t.id !== trashId);
  saveTrash(newTrash);
  renderTrash();
  refreshCurrentPage();
}

function deletePermanent(trashId) {
  if (!confirm('Permanently delete this item? This cannot be undone.')) return;
  const trash = getTrash().filter(t => t.id !== trashId);
  saveTrash(trash);
  renderTrash();
}

function emptyTrash() {
  if (!confirm('Permanently delete ALL items in trash? This cannot be undone.')) return;
  localStorage.removeItem(TRASH_KEY);
  updateTrashCount();
  renderTrash();
}

function updateTrashCount() {
  const count = getTrash().length;
  const el = document.getElementById('trashCount');
  if (el) el.textContent = count;
}

function openTrash() {
  const modal = document.getElementById('trashModal');
  if (!modal) {
    alert('Trash modal not found on this page. Make sure your HTML has #trashModal.');
    return;
  }
  modal.style.display = 'flex';
  renderTrash();
}

function closeTrash() {
  const modal = document.getElementById('trashModal');
  if (modal) modal.style.display = 'none';
}

function renderTrash() {
  const list = document.getElementById('trashList');
  if (!list) return;
  const trash = getTrash();
  if (trash.length === 0) {
    list.innerHTML = '<p class="empty-state">Trash is empty.</p>';
    return;
  }
  list.innerHTML = trash.map(t => {
    const label = trashItemLabel(t);
    return `
      <div class="trash-item">
        <div class="trash-item-info">
          <span class="trash-type">${trashTypeIcon(t.type)} ${t.type}</span>
          <span class="trash-label">${label}</span>
          <span class="trash-date">${new Date(t.deletedAt).toLocaleString()}</span>
        </div>
        <div class="trash-item-actions">
          <button class="btn small primary" onclick="restoreFromTrash('${t.id}')">↩️ Restore</button>
          <button class="btn small danger" onclick="deletePermanent('${t.id}')">🗑️ Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function trashTypeIcon(type) {
  const icons = {
    'note': '📝', 'planner': '📅', 'flashcard': '🃏', 'deck': '📂',
    'assignment': '📋', 'reading': '📖', 'notice': '📌'
  };
  return icons[type] || '📄';
}

function trashItemLabel(t) {
  const d = t.data || {};
  if (t.type === 'note') return d.title || d.content?.slice(0, 40) || 'Untitled note';
  if (t.type === 'planner') return d.title || d.activity || 'Untitled slot';
  if (t.type === 'flashcard') return (d.front || '').slice(0, 50) || 'Untitled card';
  if (t.type === 'deck') return d.name || 'Untitled deck';
  if (t.type === 'assignment') return d.title || 'Untitled assignment';
  if (t.type === 'reading') return d.title || 'Untitled reading';
  if (t.type === 'notice') return d.title || d.text?.slice(0, 40) || 'Untitled notice';
  return 'Item';
}

function refreshCurrentPage() {
  const fns = ['renderNotes','renderPlanner','renderDecks','renderAssignments','renderReadingList','renderNotices'];
  fns.forEach(fn => { if (typeof window[fn] === 'function') { try { window[fn](); } catch(e){} } });
}

function softDelete(storageKey, item, type) {
  addToTrash(type, item);
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(storageKey)) || []; } catch(e) { arr = []; }
  arr = arr.filter(x => (x.id || JSON.stringify(x)) !== (item.id || JSON.stringify(item)));
  localStorage.setItem(storageKey, JSON.stringify(arr));
  refreshCurrentPage();
  updateTrashCount();
}

/* ============================================================
   2. REAL SUMMARIZER (sentence-scoring extractive)
   ============================================================ */

function splitSentences(text) {
  if (!text) return [];
  text = text.replace(/\s+/g, ' ').trim();
  const matches = text.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (!matches) return text ? [text] : [];
  return matches.map(s => s.trim()).filter(s => s.length > 0);
}

function tokenize(text) {
  return (text.toLowerCase().match(/\b[a-z0-9]{2,}\b/g) || []);
}

function computeWordFreq(sentences) {
  const freq = {};
  const stopWords = new Set([
    'the','a','an','and','or','but','if','then','else','for','of','to','in','on','at','by','with','from','as','is','are','was','were','be','been','being','this','that','these','those','it','its','they','them','their','there','here','we','you','your','our','my','me','i','he','she','his','her','him','so','not','no','yes','do','does','did','done','have','has','had','will','would','can','could','should','may','might','must','shall','about','into','through','during','before','after','above','below','up','down','out','off','over','under','again','further','once','because','while','where','when','which','who','whom','what','why','how','all','any','both','each','few','more','most','other','some','such','only','own','same','than','too','very','just','also'
  ]);
  sentences.forEach(s => {
    tokenize(s).forEach(w => {
      if (!stopWords.has(w)) {
        freq[w] = (freq[w] || 0) + 1;
      }
    });
  });
  return freq;
}

function scoreSentences(sentences, freq) {
  if (sentences.length === 0) return [];
  const maxFreq = Math.max(...Object.values(freq), 1);
  return sentences.map((s, i) => {
    const words = tokenize(s);
    if (words.length === 0) return { sentence: s, score: 0, index: i };
    let score = 0;
    words.forEach(w => {
      if (freq[w]) {
        score += (freq[w] / maxFreq);
      }
    });
    score = score / Math.sqrt(words.length);
    if (i === 0) score *= 1.25;
    if (i === 1) score *= 1.10;
    if (i === sentences.length - 1) score *= 1.05;
    if (words.length < 4) score *= 0.7;
    if (/\b(important|key|main|because|therefore|thus|conclusion|result|finally|most|first|however)\b/i.test(s)) {
      score *= 1.15;
    }
    if (/^\d+$/.test(s)) score *= 0.3;
    return { sentence: s, score: score, index: i };
  });
}

function summarizeText(text, ratio) {
  ratio = ratio || 0.3;
  if (!text || text.trim().length < 20) return text || '';
  const sentences = splitSentences(text);
  if (sentences.length <= 2) return sentences.join(' ');
  const freq = computeWordFreq(sentences);
  const scored = scoreSentences(sentences, freq);
  const numToKeep = Math.max(1, Math.min(sentences.length, Math.round(sentences.length * ratio)));
  const top = scored.slice().sort((a,b) => b.score - a.score).slice(0, numToKeep);
  top.sort((a,b) => a.index - b.index);
  return top.map(t => t.sentence).join(' ');
}

function extractKeyPoints(text, maxPoints) {
  maxPoints = maxPoints || 5;
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];
  const freq = computeWordFreq(sentences);
  const sortedWords = Object.entries(freq).sort((a,b) => b[1] - a[1]);
  const topKeywords = sortedWords.slice(0, 8).map(w => w[0]);
  const scored = scoreSentences(sentences, freq).sort((a,b) => b.score - a.score);
  const points = scored.slice(0, maxPoints).map(t => {
    let kw = null;
    for (const w of topKeywords) {
      if (t.sentence.toLowerCase().includes(w)) { kw = w; break; }
    }
    return { keyword: kw, sentence: t.sentence };
  });
  points.sort((a,b) => {
    const ai = sentences.indexOf(a.sentence);
    const bi = sentences.indexOf(b.sentence);
    return ai - bi;
  });
  return points;
}

function runSummarizer() {
  const input = document.getElementById('summarizerInput');
  const output = document.getElementById('summarizerOutput');
  if (!input || !output) return;
  const text = input.value;
  if (!text || text.trim().length < 20) {
    output.style.display = 'block';
    output.innerHTML = '<p class="hint">Please paste at least a few sentences of text to summarize.</p>';
    return;
  }
  const ratio = 0.3;
  const summary = summarizeText(text, ratio);
  const keyPoints = extractKeyPoints(text, 5);
  const wordCount = text.trim().split(/\s+/).length;
  const summaryWordCount = summary.trim().split(/\s+/).length;
  const reduction = wordCount > 0 ? Math.round((1 - summaryWordCount/wordCount) * 100) : 0;

  output.style.display = 'block';
  output.innerHTML = `
    <div class="summary-stats">
      <span>📊 ${wordCount} words → ${summaryWordCount} words (${reduction}% shorter)</span>
    </div>
    <h3>📝 Summary</h3>
    <p class="summary-text">${escapeHtml(summary)}</p>
    <h3>🔑 Key Points</h3>
    <ul class="key-points">
      ${keyPoints.map(p => `<li><strong>${p.keyword ? escapeHtml(p.keyword) + ':' : '•'}</strong> ${escapeHtml(p.sentence)}</li>`).join('')}
    </ul>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ============================================================
   3. PLANNER AI (preset prompts + free-text)
   ============================================================ */

const PLANNER_KEY = 'studyhub_planner';

function getPlanner() {
  try { return JSON.parse(localStorage.getItem(PLANNER_KEY)) || []; }
  catch(e) { return []; }
}

function savePlanner(arr) {
  localStorage.setItem(PLANNER_KEY, JSON.stringify(arr));
  if (typeof renderPlanner === 'function') renderPlanner();
}

function setPlannerPrompt(preset) {
  const input = document.getElementById('plannerAiInput');
  if (!input) return;
  const prompts = {
    'auto': 'Generate an auto-balanced study schedule for the week with all subjects covered.',
    'simple': 'Give me a simple, light study day with just 2-3 short sessions.',
    'exam': 'Build an exam-week study plan: intense, focused, multiple short sessions per day, prioritizing revision.',
    'weekend': 'Plan a relaxing but productive weekend: morning study, afternoon break, light evening review.',
    'math-morning-physics-evening': 'Schedule Math in the morning and Physics in the evening every day this week.',
    'random': 'Create a randomized mixed-subject study plan to keep things fresh.',
    '3hours': 'Plan exactly 3 hours of study for today, split into focused Pomodoro-style blocks.'
  };
  input.value = prompts[preset] || '';
  runPlannerAI();
}

function runPlannerAI() {
  const input = document.getElementById('plannerAiInput');
  const output = document.getElementById('plannerAiOutput');
  if (!input || !output) return;
  const q = (input.value || '').toLowerCase().trim();
  if (!q) {
    output.style.display = 'block';
    output.innerHTML = '<p class="hint">Please type a request or click a preset above.</p>';
    return;
  }
  let plan = [];
  if (q.includes('auto') || q.includes('balanced') || q.includes('all subjects')) {
    plan = generateAutoSchedule();
  } else if (q.includes('simple') || q.includes('light')) {
    plan = generateSimpleDay();
  } else if (q.includes('exam')) {
    plan = generateExamWeek();
  } else if (q.includes('weekend')) {
    plan = generateWeekendPlan();
  } else if (q.includes('math') && q.includes('physics')) {
    plan = generateMathMorningPhysicsEvening();
  } else if (q.includes('random')) {
    plan = generateRandomMix();
  } else if (q.includes('3 hour') || q.includes('three hour') || q.includes('today')) {
    plan = generateThreeHourToday();
  } else {
    plan = generateFromFreeText(q);
  }
  output.style.display = 'block';
  output.innerHTML = `
    <h3>✨ AI-Generated Plan</h3>
    <div class="plan-preview">
      ${plan.map(s => `
        <div class="plan-slot">
          <span class="plan-day">${s.day}</span>
          <span class="plan-time">${s.start} - ${s.end}</span>
          <span class="plan-subject">${s.subject}</span>
          <span class="plan-title">${escapeHtml(s.title)}</span>
          <span class="plan-priority priority-${s.priority}">${priorityIcon(s.priority)}</span>
        </div>
      `).join('')}
    </div>
    <button class="btn primary" onclick="applyGeneratedPlan()">✅ Apply This Plan</button>
    <button class="btn" onclick="discardGeneratedPlan()">❌ Discard</button>
  `;
  window._pendingPlan = plan;
}

function priorityIcon(p) {
  return { low: '🟢', medium: '🟡', high: '🔴' }[p] || '🟡';
}

function applyGeneratedPlan() {
  if (!window._pendingPlan) return;
  const existing = getPlanner();
  const newPlan = window._pendingPlan.map(s => ({ ...s, id: Date.now() + '-' + Math.random().toString(36).slice(2,8) }));
  savePlanner(existing.concat(newPlan));
  const output = document.getElementById('plannerAiOutput');
  if (output) {
    output.innerHTML = '<p class="success">✅ Plan added to your weekly schedule!</p>';
    setTimeout(() => { output.style.display = 'none'; }, 2000);
  }
  window._pendingPlan = null;
}

function discardGeneratedPlan() {
  window._pendingPlan = null;
  const output = document.getElementById('plannerAiOutput');
  if (output) output.style.display = 'none';
}

function generateAutoSchedule() {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  const subjects = [
    { subject: 'Math', title: 'Practice problems & new chapter' },
    { subject: 'Physics', title: 'Concept review + numerical practice' },
    { subject: 'Chemistry', title: 'Reaction mechanisms & notes' },
    { subject: 'Biology', title: 'Diagram practice + memorization' },
    { subject: 'English', title: 'Essay writing & grammar drills' }
  ];
  const plan = [];
  days.forEach((day, i) => {
    const s = subjects[i % subjects.length];
    plan.push({ day, start: '09:00', end: '10:30', subject: s.subject, title: s.title, priority: 'high' });
    plan.push({ day, start: '11:00', end: '12:00', subject: subjects[(i+1) % subjects.length].subject, title: subjects[(i+1) % subjects.length].title, priority: 'medium' });
    plan.push({ day, start: '16:00', end: '17:00', subject: 'Revision', title: 'Review the day\'s material', priority: 'medium' });
  });
  return plan;
}

function generateSimpleDay() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  return [
    { day: today, start: '10:00', end: '10:45', subject: 'Math', title: 'Light practice (15 problems)', priority: 'low' },
    { day: today, start: '15:00', end: '15:30', subject: 'Reading', title: 'Read 1 chapter of your choice', priority: 'low' },
    { day: today, start: '20:00', end: '20:30', subject: 'Revision', title: 'Quick review of notes', priority: 'low' }
  ];
}

function generateExamWeek() {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  const subjects = ['Math','Physics','Chemistry','Biology','English'];
  const plan = [];
  days.forEach((day, i) => {
    const subj = subjects[i];
    plan.push({ day, start: '08:00', end: '09:00', subject: subj, title: 'Skim textbook chapter', priority: 'high' });
    plan.push({ day, start: '09:30', end: '11:00', subject: subj, title: 'Past paper practice (set 1)', priority: 'high' });
    plan.push({ day, start: '14:00', end: '15:30', subject: subj, title: 'Weak-topic deep review', priority: 'high' });
    plan.push({ day, start: '19:00', end: '20:00', subject: 'Revision', title: 'Flashcards + summary notes', priority: 'medium' });
  });
  return plan;
}

function generateWeekendPlan() {
  return [
    { day: 'Saturday', start: '09:00', end: '11:00', subject: 'Math', title: 'Focused problem set', priority: 'high' },
    { day: 'Saturday', start: '14:00', end: '15:00', subject: 'Reading', title: 'Leisure reading', priority: 'low' },
    { day: 'Saturday', start: '20:00', end: '20:45', subject: 'Revision', title: 'Light evening review', priority: 'low' },
    { day: 'Sunday', start: '10:00', end: '11:30', subject: 'Physics', title: 'Lab concepts review', priority: 'medium' },
    { day: 'Sunday', start: '16:00', end: '17:00', subject: 'Revision', title: 'Plan next week & organize notes', priority: 'medium' }
  ];
}

function generateMathMorningPhysicsEvening() {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  const plan = [];
  days.forEach(day => {
    plan.push({ day, start: '09:00', end: '10:30', subject: 'Math', title: 'Morning Math: new topic + practice', priority: 'high' });
    plan.push({ day, start: '19:00', end: '20:30', subject: 'Physics', title: 'Evening Physics: theory + numericals', priority: 'high' });
  });
  return plan;
}

function generateRandomMix() {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const subjects = ['Math','Physics','Chemistry','Biology','English','History','Computer Science','Revision'];
  const titles = {
    'Math': 'Mixed problem set',
    'Physics': 'Concept + numerical drill',
    'Chemistry': 'Reactions & equations',
    'Biology': 'Diagram + memorization',
    'English': 'Essay & vocabulary',
    'History': 'Timeline & key events',
    'Computer Science': 'Coding practice',
    'Revision': 'Quick review session'
  };
  const plan = [];
  days.forEach(day => {
    const morningSubj = subjects[Math.floor(Math.random() * subjects.length)];
    const eveningSubj = subjects[Math.floor(Math.random() * subjects.length)];
    const mStart = 8 + Math.floor(Math.random() * 3);
    const eStart = 18 + Math.floor(Math.random() * 3);
    plan.push({
      day,
      start: `${String(mStart).padStart(2,'0')}:00`,
      end: `${String(mStart + 1).padStart(2,'0')}:30`,
      subject: morningSubj,
      title: titles[morningSubj],
      priority: ['high','medium','low'][Math.floor(Math.random()*3)]
    });
    plan.push({
      day,
      start: `${String(eStart).padStart(2,'0')}:00`,
      end: `${String(eStart + 1).padStart(2,'0')}:00`,
      subject: eveningSubj,
      title: titles[eveningSubj],
      priority: ['high','medium','low'][Math.floor(Math.random()*3)]
    });
  });
  return plan;
}

function generateThreeHourToday() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  return [
    { day: today, start: '09:00', end: '10:00', subject: 'Math', title: 'Pomodoro 1: Deep practice', priority: 'high' },
    { day: today, start: '10:15', end: '11:15', subject: 'Physics', title: 'Pomodoro 2: Concept + problems', priority: 'high' },
    { day: today, start: '11:30', end: '12:15', subject: 'Revision', title: 'Pomodoro 3: Review + flashcards', priority: 'medium' }
  ];
}

function generateFromFreeText(q) {
  const knownSubjects = ['math','physics','chemistry','biology','english','history','computer science','coding','science'];
  const found = knownSubjects.filter(s => q.includes(s));
  const subjects = found.length > 0 ? found.map(s => s.charAt(0).toUpperCase() + s.slice(1)) : ['Math','Physics','Chemistry'];
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  const plan = [];
  days.forEach((day, i) => {
    const subj = subjects[i % subjects.length];
    plan.push({
      day,
      start: '09:00',
      end: '10:30',
      subject: subj,
      title: `${subj} study session`,
      priority: q.includes('exam') ? 'high' : 'medium'
    });
  });
  return plan;
}

/* ============================================================
   4. AUTO-FLASHCARD GENERATOR (from notes)
   ============================================================ */

const DECKS_KEY = 'studyhub_decks';
const CARDS_KEY = 'studyhub_flashcards';

function getDecks() {
  try { return JSON.parse(localStorage.getItem(DECKS_KEY)) || []; }
  catch(e) { return []; }
}

function getCards() {
  try { return JSON.parse(localStorage.getItem(CARDS_KEY)) || []; }
  catch(e) { return []; }
}

function saveCards(arr) {
  localStorage.setItem(CARDS_KEY, JSON.stringify(arr));
  if (typeof renderDecks === 'function') renderDecks();
}

function autoGenerateFlashcards() {
  const textarea = document.getElementById('notesInput');
  const deckSelect = document.getElementById('targetDeck');
  if (!textarea || !deckSelect) return;
  const text = textarea.value;
  if (!text || text.trim().length < 20) {
    alert('Please paste at least a few sentences of notes first.');
    return;
  }
  const deckId = deckSelect.value;
  if (!deckId) {
    alert('Please select a target deck first.');
    return;
  }
  const cards = generateCardsFromText(text, deckId);
  if (cards.length === 0) {
    alert('Could not generate cards from this text. Try adding clearer notes (e.g., "Photosynthesis is the process by which plants make food.").');
    return;
  }
  const existing = getCards();
  const newCards = cards.map(c => ({ ...c, id: Date.now() + '-' + Math.random().toString(36).slice(2,8) }));
  saveCards(existing.concat(newCards));
  textarea.value = '';
  alert(`✅ Generated ${newCards.length} flashcards and added to the deck!`);
}

function generateCardsFromText(text, deckId) {
  const sentences = splitSentences(text);
  const cards = [];
  const used = new Set();
  // Pattern 1: "X is/are/was/were/means/refers to Y"
  sentences.forEach(s => {
    const m = s.match(/^(.{2,60}?)\s+(?:is|are|was|were|means|refers to|is defined as)\s+(.+)$/i);
    if (m) {
      const front = 'What ' + (m[1].trim()) + '?';
      const back = m[2].trim();
      if (back.length > 3 && !used.has(front.toLowerCase())) {
        cards.push({ deckId, front, back, difficulty: 0, reviews: 0, lastReview: null, nextReview: null });
        used.add(front.toLowerCase());
      }
    }
  });
  // Pattern 2: "X: Y" (definition-style with colon)
  sentences.forEach(s => {
    if (cards.length >= 20) return;
    const m = s.match(/^([^:]{2,40}):\s+(.+)$/);
    if (m) {
      const front = 'Define: ' + m[1].trim();
      const back = m[2].trim();
      if (back.length > 3 && !used.has(front.toLowerCase())) {
        cards.push({ deckId, front, back, difficulty: 0, reviews: 0, lastReview: null, nextReview: null });
        used.add(front.toLowerCase());
      }
    }
  });
  // Pattern 3: Fill-in-the-blank from top keywords
  if (cards.length < 5) {
    const freq = computeWordFreq(sentences);
    const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 5);
    sorted.forEach(([word, count]) => {
      if (cards.length >= 10) return;
      const sentence = sentences.find(s => s.toLowerCase().includes(word));
      if (sentence) {
        const blanked = sentence.replace(new RegExp('\\b' + word + '\\b', 'i'), '_____');
        const front = 'Fill in the blank: ' + blanked;
        const back = word;
        if (!used.has(front.toLowerCase())) {
          cards.push({ deckId, front, back, difficulty: 0, reviews: 0, lastReview: null, nextReview: null });
          used.add(front.toLowerCase());
        }
      }
    });
  }
  return cards;
}

/* ============================================================
   AUTO-INIT ON PAGE LOAD
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
  updateTrashCount();

  const summarizeBtn = document.getElementById('summarizerBtn');
  if (summarizeBtn) {
    summarizeBtn.addEventListener('click', runSummarizer);
  }
  const plannerBtn = document.getElementById('plannerAiBtn');
  if (plannerBtn) {
    plannerBtn.addEventListener('click', runPlannerAI);
  }
  const trashModal = document.getElementById('trashModal');
  if (trashModal) {
    trashModal.addEventListener('click', function(e) {
      if (e.target === trashModal) closeTrash();
    });
  }
});

/* Expose to global scope for inline onclick handlers */
window.openTrash = openTrash;
window.closeTrash = closeTrash;
window.emptyTrash = emptyTrash;
window.restoreFromTrash = restoreFromTrash;
window.deletePermanent = deletePermanent;
window.runPlannerAI = runPlannerAI;
window.setPlannerPrompt = setPlannerPrompt;
window.applyGeneratedPlan = applyGeneratedPlan;
window.discardGeneratedPlan = discardGeneratedPlan;
window.autoGenerateFlashcards = autoGenerateFlashcards;
window.runSummarizer = runSummarizer;

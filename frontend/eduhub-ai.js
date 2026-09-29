/* =====================================================================
   EDUHUB · Mark Analyzer + Study Vault · v1.1 (theme-aware)
   ---------------------------------------------------------------------
   Drop-in module. Zero dependencies · zero servers · zero API keys.
   Everything runs on the student's device.
   Optional flags (set BEFORE this script):
     window.EDUHUB_NO_FABS = true;        // don't auto-create the 2 round buttons
   Open programmatically:  EduHub.open('analyzer')  /  EduHub.open('vault')
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- 1 · helpers ---------------- */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtPct = p => String(Math.round(p * 10) / 10).replace(/\.0$/, '');
  /* THEME EDIT 1 of 3 — reads a live CSS variable from the site theme,
     with a fallback if the token doesn't exist */
  const cssVar = (n, f) => ((getComputedStyle(document.body).getPropertyValue(n)) || '').trim() || f;

  const store = (() => {
    const mem = {}; let ok = true;
    try { localStorage.setItem('__eh', '1'); localStorage.removeItem('__eh'); } catch (e) { ok = false; }
    return {
      get(k, d) { try { const v = ok ? localStorage.getItem(k) : mem[k]; return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
      set(k, v) { try { if (ok) localStorage.setItem(k, JSON.stringify(v)); else mem[k] = JSON.stringify(v); } catch (e) {} }
    };
  })();

  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
  function pickN(arr, n, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, n);
  }
  const fill = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : ''));

  const ytSearch = q => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);

  /* ---------------- 2 · icons (inline SVG, one visual system) ---------------- */
  const P = {
    clip: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    sparkle: '<path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>'
  };
  const ic = (n, s) => '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + '</svg>';

  /* ---------------- 3 · boards & indicative grade boundaries ---------------- */
  const STAGE_LABEL = { ls: 'Lower Secondary', igcse: 'IGCSE', as: 'AS Level', a2: 'A Level' };

    const BOARDS = {
    caie: {
      short: 'Cambridge',
      stages: {
        'Lower Secondary (Grades 6–8)': { key: 'ls', years: [6, 7, 8], grades: [['A',85],['B',72],['C',60],['D',48],['E',36]] },
        'IGCSE / O Level':         { key: 'igcse', years: [9, 10],  grades: [['A*',90],['A',80],['B',70],['C',60],['D',50],['E',40],['F',30],['G',20]] },
        'AS Level':                { key: 'as',    years: [11],     grades: [['a',80],['b',70],['c',60],['d',50],['e',40]] },
        'A2 Level (full A Level)': { key: 'a2',    years: [12, 13], grades: [['A*',90],['A',80],['B',70],['C',60],['D',50],['E',40]] }
      }
    },
    edexcel: {
      short: 'Edexcel',
      stages: {
        'iLowerSecondary (Grades 6–8)': { key: 'ls', years: [6, 7, 8], grades: [['A',85],['B',72],['C',60],['D',48],['E',36]] },
        'International GCSE': { key: 'igcse', years: [9, 10],  grades: [['9',90],['8',80],['7',70],['6',60],['5',50],['4',40],['3',30],['2',20],['1',10]] },
        'AS Level (IAS)':     { key: 'as',    years: [11],     grades: [['a',80],['b',70],['c',60],['d',50],['e',40]] },
        'A2 Level (IAL)':     { key: 'a2',    years: [12, 13], grades: [['A*',90],['A',80],['B',70],['C',60],['D',50],['E',40]] }
      }
    }
  };
  function stageForYear(board, year) {
    const st = BOARDS[board].stages;
    for (const name in st) if (st[name].years.indexOf(year) > -1) return name;
    return Object.keys(st)[0];
  }

  function gradeFor(prof, pct) {
    const g = BOARDS[prof.board].stages[prof.stage].grades;
    for (let i = 0; i < g.length; i++) {
      if (pct >= g[i][1]) return { grade: g[i][0], next: i > 0 ? { grade: g[i - 1][0], thr: g[i - 1][1] } : null };
    }
    const last = g[g.length - 1];
    return { grade: 'U', next: { grade: last[0], thr: last[1] } };
  }

  const TIERC = {
    gold:  ['#7a5c10', '#f6ecd2'],
    green: ['#0c6a43', '#e0f1e8'],
    teal:  ['#0d5f70', '#def0f3'],
    amber: ['#8a5a12', '#f8eedb'],
    rust:  ['#9c3a2a', '#f8e5e0']
  };
  function tierByGrade(g) {
    const s = String(g).toUpperCase();
    const order = { 'A*':0,'A':1,'B':2,'C':3,'D':4,'E':5,'F':6,'G':7,'9':0,'8':1,'7':2,'6':3,'5':4,'4':5,'3':6,'2':7,'1':8 };
    const i = (s in order) ? order[s] : 9;
    return ['gold','green','green','teal','amber','amber','rust','rust','rust','rust'][i];
  }
  function gradeChip(g, cls) {
    const t = TIERC[tierByGrade(g)];
    return '<span class="eh-grade ' + (cls || '') + '" style="background:' + t[1] + ';color:' + t[0] + '">' + esc(g) + '</span>';
  }

  /* ---------------- 4 · subject knowledge maps + curated resources ---------------- */
  const T = (n, t) => ({ n: n, t: t });
  function R(title, url, type, source, stages, boards, desc) {
    return { title: title, url: url, type: type, source: source, stages: stages, boards: boards, desc: desc };
  }
  const B = ['both'];

  const SUBJECTS = [
    {
      id: 'maths', name: 'Mathematics', mono: 'MA', family: 'quant',
      topics: [
        T('Indices, surds & standard form',1), T('Algebraic manipulation',1), T('Linear & simultaneous equations',1),
        T('Quadratics & functions',2), T('Trigonometry',2), T('Geometry & mensuration',2),
        T('Logarithms & exponentials',2), T('Sequences & series',2), T('Probability & statistics',2),
        T('Differentiation & calculus',3), T('Integration',3), T('Vectors',3)
      ],
      resources: [
        R('Dr Frost Mathematics','https://www.drfrostmaths.com/','practice','Dr Frost',['igcse','as','a2'],B,'Build-your-own topic drills and full past papers from IGCSE right through A Level. The best free question bank for maths.'),
        R('ExamSolutions','https://www.examsolutions.net/','video','ExamSolutions',['as','a2'],B,'A-Level maths tutorials organised by module and topic, every question worked in exam style.'),
        R('Corbettmaths','https://corbettmaths.com/','video','Corbettmaths',['igcse'],B,'A short video and textbook exercise for every IGCSE maths topic, plus 5-a-day practice.'),
        R('Revision notes & worked solutions','https://www.physicsandmathstutor.com/maths-revision/','notes','Physics & Maths Tutor',['igcse','as','a2'],B,'Topic notes, worked solutions and papers arranged by module.'),
        R('Topic questions — IGCSE','https://www.savemyexams.com/igcse/maths/','practice','Save My Exams',['igcse'],B,'Exam-style topic questions sorted by difficulty, with model answers.'),
        R('Topic questions — A Level','https://www.savemyexams.com/a-level/maths/','practice','Save My Exams',['as','a2'],B,'Topic-by-topic questions and concise revision notes for the A-Level spec.'),
        R('Khan Academy — Math','https://www.khanacademy.org/math','video','Khan Academy',['igcse','as','a2'],B,'Relearn any gap from absolute scratch, with practice built into every lesson.')
      ]
    },
    {
      id: 'physics', name: 'Physics', mono: 'PH', family: 'quant',
      topics: [
        T('Forces & motion',1), T('Energy, work & power',1), T('Pressure & density',1),
        T('Waves & the EM spectrum',2), T('Electricity & circuits',2), T('Thermal physics',2),
        T('Magnetism & EM induction',2), T('Radioactivity & particles',3), T('Momentum & circular motion',3),
        T('Electric & gravitational fields',3), T('Astrophysics & cosmology',3)
      ],
      resources: [
        R('Isaac Physics','https://isaacphysics.org/','practice','Isaac Physics (Cambridge)',['igcse','as','a2'],B,'Problem-solving questions from developing to challenge level — built by the University of Cambridge.'),
        R('A Level Physics Online','https://www.alevelphysicsonline.com/','video','ALEPO',['as','a2'],B,'Every A-Level physics topic as a short tutorial, including all core practicals.'),
        R('Cognito','https://www.youtube.com/@Cognitoedu','video','YouTube',['igcse','as'],B,'Clean animated explainers for IGCSE and A-Level science and maths.'),
        R('Physics Online','https://www.youtube.com/@PhysicsOnline','video','YouTube',['as','a2'],B,'Short, sharp videos covering the full A-Level physics course.'),
        R('Revision notes & past papers','https://www.physicsandmathstutor.com/physics-revision/','notes','Physics & Maths Tutor',['igcse','as','a2'],B,'Notes, flashcards and past papers arranged by topic and paper.'),
        R('Topic questions — IGCSE','https://www.savemyexams.com/igcse/physics/','practice','Save My Exams',['igcse'],B,'Exam-style topic questions with model answers, sorted by difficulty.'),
        R('Topic questions — A Level','https://www.savemyexams.com/a-level/physics/','practice','Save My Exams',['as','a2'],B,'Topic questions and revision notes matched to the A-Level spec.'),
        R('PhET Simulations','https://phet.colorado.edu/','practice','University of Colorado',['igcse','as','a2'],B,'Interactive simulations — perfect for building real intuition in circuits, waves and gas laws.')
      ]
    },
    {
      id: 'chemistry', name: 'Chemistry', mono: 'CH', family: 'quant',
      topics: [
        T('Atomic structure & bonding',1), T('Moles & stoichiometry',1),
        T('Periodic table & groups',2), T('Acids, bases & salts',2), T('Energetics & enthalpy',2),
        T('Rates of reaction',2), T('Analysis & ion tests',2),
        T('Equilibria',3), T('Redox & electrochemistry',3), T('Organic chemistry & mechanisms',3), T('Entropy & electrode potentials',3)
      ],
      resources: [
        R('Chemguide','https://www.chemguide.co.uk/','notes','Chemguide',['as','a2'],B,'The classic A-Level chemistry reference — written for understanding, not memorising.'),
        R('Chemrevise revision guides','https://chemrevise.org/','notes','Chemrevise',['as','a2'],B,'Tight, spec-matched revision guides for the harder A-Level topics.'),
        R('Cognito','https://www.youtube.com/@Cognitoedu','video','YouTube',['igcse','as'],B,'Animated explainers that make bonding, moles and organic mechanisms click.'),
        R('Revision notes & past papers','https://www.physicsandmathstutor.com/chemistry-revision/','notes','Physics & Maths Tutor',['igcse','as','a2'],B,'Notes, flashcards and past papers arranged by topic and paper.'),
        R('Topic questions — IGCSE','https://www.savemyexams.com/igcse/chemistry/','practice','Save My Exams',['igcse'],B,'Exam-style topic questions with model answers.'),
        R('Topic questions — A Level','https://www.savemyexams.com/a-level/chemistry/','practice','Save My Exams',['as','a2'],B,'Topic questions and revision notes matched to the A-Level spec.'),
        R('PhET Simulations','https://phet.colorado.edu/','practice','University of Colorado',['igcse','as','a2'],B,'Interactive simulations for gases, salts, reactions and solutions.')
      ]
    },
    {
      id: 'biology', name: 'Biology', mono: 'BI', family: 'memory',
      topics: [
        T('Cell structure & microscopy',1), T('Biological molecules',1), T('Enzymes',1),
        T('Transport in plants',2), T('Circulation & gas exchange',2), T('Respiration & photosynthesis',2),
        T('Coordination & homeostasis',2), T('Reproduction & cell division',2), T('Ecology & nutrient cycles',2),
        T('Inheritance & genetics',3), T('Selection & evolution',3), T('Biotechnology & genetic engineering',3)
      ],
      resources: [
        R('Crash Course Biology','https://www.youtube.com/playlist?list=PL3EED4C1D684D3ADF','video','YouTube · Crash Course',['igcse','as'],B,'Fast, memorable overviews of every major system — best watched after reading notes to lock it in.'),
        R('Amoeba Sisters','https://www.youtube.com/@AmoebaSisters','video','YouTube',['igcse'],B,'Friendly, visual explanations that make processes like osmosis and protein synthesis stick.'),
        R('Revision notes & past papers','https://www.physicsandmathstutor.com/biology-revision/','notes','Physics & Maths Tutor',['igcse','as','a2'],B,'Notes, flashcards and past papers arranged by topic and paper.'),
        R('Topic questions — IGCSE','https://www.savemyexams.com/igcse/biology/','practice','Save My Exams',['igcse'],B,'Exam-style topic questions with model answers.'),
        R('Topic questions — A Level','https://www.savemyexams.com/a-level/biology/','practice','Save My Exams',['as','a2'],B,'Topic questions and revision notes matched to the A-Level spec.'),
        R('ZNotes — CAIE syllabus notes','https://znotes.org/caie/','notes','ZNotes',['igcse','as','a2'],['caie'],'Community-built revision notes matched to the Cambridge syllabus, unit by unit.'),
        R('Seneca — free board-mapped courses','https://senecalearning.com/','practice','Seneca',['igcse','as','a2'],B,'Interactive courses with spaced-repetition quizzes, mapped to your exact specification.')
      ]
    },
    {
      id: 'english', name: 'English (Language & Literature)', mono: 'EN', family: 'essay',
      topics: [
        T('Grammar, punctuation & accuracy',1), T('Reading comprehension & inference',1),
        T('Summary writing',2), T('Directed & transactional writing',2), T('Descriptive & narrative writing',2),
        T('Quotation & evidence precision',2), T('Timing across papers',2),
        T('Essay structure & argument',3), T('Prose & drama analysis',3), T('Poetry & unseen texts',3)
      ],
      resources: [
        R('Mr Bruff','https://www.youtube.com/@mrbruff','video','YouTube',['igcse','as','a2'],B,'The go-to channel for English Language papers and Literature texts, with grade-9 model answers.'),
        R('Khan Academy — Grammar','https://www.khanacademy.org/humanities/grammar','practice','Khan Academy',['igcse','as','a2'],B,'Secure the technical-accuracy marks: punctuation, clauses, agreement, style.'),
        R('BBC Bitesize — English','https://www.bbc.co.uk/bitesize','notes','BBC',['igcse'],B,'Compact guides to reading and writing skills with quick quizzes.')
      ]
    },
    {
      id: 'economics', name: 'Economics', mono: 'EC', family: 'essay',
      topics: [
        T('The basic economic problem & PPF',1), T('Demand & supply',1),
        T('Elasticity',2), T('Market failure & externalities',2), T('Inflation, unemployment & growth',2),
        T('Diagram accuracy & evaluation',2),
        T('Costs, revenues & market structures',3), T('Fiscal & monetary policy',3),
        T('Trade & exchange rates',3), T('Development economics',3)
      ],
      resources: [
        R('EconplusDal','https://www.youtube.com/@EconplusDal','video','YouTube',['as','a2'],B,'The definitive A-Level economics channel — theory, diagrams and evaluation, exam-board aligned.'),
        R('tutor2u Economics','https://www.tutor2u.net/economics','notes','tutor2u',['igcse','as','a2'],B,'Study notes, example essays and exam-technique walkthroughs.'),
        R('Economics Help','https://www.economicshelp.org/','notes','EconomicsHelp',['as','a2'],B,'Clear explanations of the trickier macro and micro concepts.'),
        R('Revision & past papers','https://www.physicsandmathstutor.com/economics-revision/','notes','Physics & Maths Tutor',['as','a2'],B,'Notes, essay plans and past papers with mark schemes.')
      ]
    },
    {
      id: 'business', name: 'Business Studies', mono: 'BU', family: 'essay',
      topics: [
        T('Business activity & objectives',1), T('Types of organisation',1),
        T('Marketing & the marketing mix',2), T('Motivation & HR',2), T('Operations & production',2),
        T('Finance sources & cash flow',2), T('Break-even & accounts',2), T('External influences & stakeholders',2),
        T('Ratios & investment appraisal',3), T('Business strategy & growth',3)
      ],
      resources: [
        R('tutor2u Business','https://www.tutor2u.net/business','notes','tutor2u',['igcse','as','a2'],B,'Study notes, case studies and exam technique for every unit.'),
        R('Two Teachers','https://www.youtube.com/@TwoTeachers','video','YouTube',['igcse','as','a2'],B,'Real-business case studies — exactly the application marks examiners reward.'),
        R('Revision & past papers','https://www.physicsandmathstutor.com/business-revision/','notes','Physics & Maths Tutor',['igcse','as','a2'],B,'Notes and past papers sorted by topic.'),
        R('Seneca — free board-mapped courses','https://senecalearning.com/','practice','Seneca',['igcse','as','a2'],B,'Interactive courses with spaced-repetition quizzes for your exact spec.')
      ]
    },
    {
      id: 'cs', name: 'Computer Science', mono: 'CS', family: 'quant',
      topics: [
        T('Binary, hex & data representation',1), T('Programming fundamentals',1),
        T('Algorithms & pseudocode',2), T('Logic gates & boolean algebra',2), T('Computer architecture',2),
        T('Data structures',2), T('Ethics & emerging tech',2),
        T('Networks & the internet',3), T('Databases & SQL',3), T('Operating systems',3)
      ],
      resources: [
        R('Craig’n’Dave','https://www.craigndave.org/','video','Craig’n’Dave',['igcse','as','a2'],B,'Specification-ordered videos for GCSE and A-Level Computer Science.'),
        R('Isaac Computer Science','https://isaaccomputerscience.org/','practice','Isaac CS',['as','a2'],B,'Booster questions by topic with instant feedback (free account).'),
        R('Khan Academy — Computing','https://www.khanacademy.org/computing','practice','Khan Academy',['igcse'],B,'Programming and computing fundamentals with interactive practice.'),
        R('ZNotes — CAIE syllabus notes','https://znotes.org/caie/','notes','ZNotes',['igcse','as','a2'],['caie'],'Community-built revision notes matched to the Cambridge syllabus.')
      ]
    },
    {
      id: 'geography', name: 'Geography', mono: 'GG', family: 'memory',
      topics: [
        T('Map skills & interpretation',1),
        T('Rivers & flooding',2), T('Coasts',2), T('Tectonics & hazards',2), T('Weather & climate',2),
        T('Population & migration',2), T('Urban environments',2), T('Fieldwork & skills',2),
        T('Development & economic activity',3), T('Ecosystems & resources',3)
      ],
      resources: [
        R('Internet Geography','https://www.internetgeography.net/','notes','Internet Geography',['igcse'],B,'Case-study sheets and topic notes written straight to the spec.'),
        R('Cool Geography','https://www.coolgeography.co.uk/','notes','Cool Geography',['igcse','as'],B,'Notes, animations and revision tools across physical and human units.'),
        R('Revision & past papers','https://www.physicsandmathstutor.com/geography-revision/','notes','Physics & Maths Tutor',['igcse','as','a2'],B,'Notes and past papers sorted by topic and paper.'),
        R('RGS teaching resources','https://www.rgs.org/schools/teaching-resources/','notes','Royal Geographical Society',['igcse','as','a2'],B,'Deep, reliable explanations from the UK’s geographical society.')
      ]
    },
    {
      id: 'history', name: 'History', mono: 'HI', family: 'essay',
      topics: [
        T('Chronology & key events',1), T('Contextual detail & dates',1),
        T('Causation & consequence essays',2), T('Source evaluation & reliability',2),
        T('Narrative account questions',2), T('Timed essay planning',2),
        T('Comparing interpretations',3), T('Judgement & significance',3)
      ],
      resources: [
        R('School History','https://schoolhistory.co.uk/','notes','School History',['igcse'],B,'Topic summaries and source-skills worksheets for the common options.'),
        R('BBC Bitesize — History','https://www.bbc.co.uk/bitesize','notes','BBC',['igcse'],B,'Compact period summaries with quick-recall quizzes.'),
        R('Revision & past papers','https://www.physicsandmathstutor.com/history-revision/','notes','Physics & Maths Tutor',['igcse','as','a2'],B,'Notes and past papers for the popular depth studies.')
      ]
    }
  ];

  const TYPE_META = {
    video:    { l: 'Video',       i: 'play'   },
    notes:    { l: 'Notes',       i: 'file'   },
    papers:   { l: 'Past papers', i: 'clip'   },
    practice: { l: 'Practice',    i: 'pencil' }
  };

  /* ---------------- 5 · the analysis engine ---------------- */
  function flagTopics(subj, pct, rnd) {
    const Tp = subj.topics;
    let hi = [], ck = [], mode;
    if (pct < 40)      { mode = 'rebuild';   hi = pickN(Tp.filter(t => t.t <= 2), 4, rnd); ck = pickN(Tp.filter(t => t.t >= 2 && hi.indexOf(t) < 0), 3, rnd); }
    else if (pct < 55) { mode = 'gapfill';   hi = pickN(Tp.filter(t => t.t <= 2), 3, rnd); ck = pickN(Tp.filter(t => t.t >= 2 && hi.indexOf(t) < 0), 3, rnd); }
    else if (pct < 70) { mode = 'apply';     hi = pickN(Tp.filter(t => t.t >= 2), 3, rnd); ck = pickN(Tp.filter(t => t.t >= 2 && hi.indexOf(t) < 0), 2, rnd); }
    else if (pct < 85) { mode = 'technique'; const pool = Tp.filter(t => t.t >= 3); hi = pickN(pool.length >= 2 ? pool : Tp, 2, rnd); ck = pickN(Tp.filter(t => t.t >= 2 && hi.indexOf(t) < 0), 2, rnd); }
    else               { mode = 'polish';    hi = pickN(Tp.filter(t => t.t >= 2), 2, rnd); }
    const rest = Tp.filter(t => hi.indexOf(t) < 0 && ck.indexOf(t) < 0);
    return { mode: mode, hi: hi, ck: ck, rest: rest };
  }

  const OPENERS = [
    '{mark}/{total} in {subject} — that is {pct}, an indicative {grade} on the {board} {stage} scale.',
    'Let’s be exact about where you stand: {pct} in {subject} grades as {grade} under {board} {stage} boundaries.',
    'A {pct} in {subject}. On the {board} {stage} scale that is an indicative {grade} — and the number alone hides the useful part.'
  ];
  const GAP_NEXT = 'You are {pctNeeded} percentage points from {next} — on a {total}-mark paper, {rawNeeded} raw marks.';
  const GAP_TOP  = 'You are sitting on the top boundary. The only target from here is reproducing this on demand, in the real exam hall.';

  const DIAG = {
    rebuild:   'This score tells me the problem is foundations, not exam craft. When the base layer is shaky, everything above it feels harder than it really is — and {t1} and {t2} are almost certainly part of that base.',
    gapfill:   'You are past the danger zone, but still losing marks to understanding gaps rather than carelessness. That pattern is almost always topic-specific: {t1} and {t2} are where your marks are bleeding.',
    apply:     'At this level the gap to a strong grade is application, not knowledge. You know the content — under exam pressure, questions that twist it, {t1} in particular, are where marks slip away.',
    technique: 'You have the content. What separates {grade} from {next} now is precision: mark-scheme wording, command words, and questions like {t1}, where partial credit quietly disappears.',
    polish:    'This is elite territory. From here every lost mark is a footnote — usually definition phrasing, a skipped final step, or one unusual question like {t1}. The work now is ruthless consistency.'
  };
  const FAMILY = {
    quant:  'In {subject}, marks are won by doing, not reading: every topic you study must end with you solving questions on paper, pen in hand, no notes open.',
    essay:  'In {subject}, examiners pay for structure and evidence: plan before you write, quote and cite precisely, and answer the question that was asked — not the one you revised.',
    memory: 'In {subject}, precise vocabulary is currency — examiners award marks for exact terms, and vague paraphrases cost you even when the idea is right.'
  };
  const METHOD = {
    rebuild:   'Your protocol for the next two weeks: stop doing past papers. Rebuild {t1} and {t2} from a clean tutorial, compress each into a one-page summary in your own words, then answer ten easy questions on each. A focused 25 minutes a day on this beats three hours of passive re-reading.',
    gapfill:   'Work topic by topic instead of paper by paper: tutorial, condensed notes, then twenty exam-style questions on that topic alone. Do not move on until you can clear 80% of a set cold.',
    apply:     'Shift from revising to drilling: topic-specific past-paper questions, marked strictly against the scheme. Keep an error log — one line per lost mark: the question, why you lost it, what the scheme wanted — and read it before every session.',
    technique: 'Switch to full timed papers, marked as an examiner would mark them. Then read the official examiner report for your board’s last session — it states exactly where candidates at your level lost marks. Eliminate those errors first.',
    polish:    'Two disciplines from here: full papers under strict exam timing with no notes, and model answers for anything you drop. Compare your wording to the mark scheme line by line — at this level, an A* is a language, and you should speak it natively.'
  };
  const TRAJ = {
    first:  ['This is your first logged {subject} score, so the baseline is now set — every future result is measured against it.', 'Baseline recorded. From your next upload, I can track drift and momentum in this subject.'],
    up:     ['That is +{delta} points on your last {subject} attempt — the method is working, so raise the difficulty rather than the hours.'],
    down:   ['That is {delta} points below your previous {subject} score, so something in the current approach is slipping. Change one variable this week — method, timing or topic order — and re-measure.'],
    steady: ['You are holding near {avg} across {n} {subject} attempts. Stable is good; stable is not the destination. Push the flagged topics hard for two weeks and re-test.']
  };
  const CLOSERS = [
    'Grades are lagging indicators of method. Fix the method and the number follows.',
    'Nobody is “bad at {subject}” — only early in it. This plan is the shortcut through.',
    'One topic, one week, measured honestly. That is how boundaries move.'
  ];
  const TOPIC_NOTE = {
    rebuild:   'Foundation gap — rebuild this from scratch.',
    gapfill:   'Likely mark leak — re-teach this first.',
    apply:     'Weak under exam conditions — drill real questions.',
    technique: 'Costs you partial credit — tighten wording.',
    polish:    'Polish to full-mark standard.'
  };
  const CK_NOTE = 'Worth a review pass this week.';

  function buildPlan(subj, band, flags, prof) {
    const bl = BOARDS[prof.board].short, sl = STAGE_LABEL[prof.stageKey];
    const steps = [];
    if (flags.hi[0]) steps.push({ tag: 'Topic', txt: 'Rebuild “' + flags.hi[0].n + '”: one full tutorial, then a one-page summary written from memory the next morning.' });
    if (flags.hi[1]) steps.push({ tag: 'Topic', txt: 'Drill “' + flags.hi[1].n + '”: 15 exam-style questions, marked strictly against the scheme, to 80% accuracy.' });
    const mid = {
      rebuild:   ['No past papers yet. Re-watch each flagged topic’s tutorial at 1.25× speed and rewrite the summary from memory.', 'One 25-minute focused block per day on this subject for 14 straight days. Consistency before intensity.'],
      gapfill:   ['One full topic-question set per day from the flagged list; do not advance until a set is cleared at 80%.', 'Start an error log: per lost mark — question, cause, what the mark scheme wanted. Review before every session.'],
      apply:     ['Convert one past paper into topic questions: attempt only the flagged-topic questions under time.', 'Read the examiner report for your board’s most recent session; fix the two most common errors it names.'],
      technique: ['Two full timed papers this week. Mark as an examiner: award nothing for “nearly right”.', 'Classify every lost mark into knowledge / application / timing, then attack the biggest bucket first.'],
      polish:    ['One full paper per week under strict exam conditions — no notes, no pauses, no retakes.', 'For each dropped mark, rewrite the answer to full-mark standard from the scheme, then compare wording.']
    }[band];
    mid.forEach(t => steps.push({ tag: 'Method', txt: t }));
    steps.push({ tag: 'Resource', txt: 'Watch a full ' + bl + ' ' + sl + ' ' + subj.name + ' revision video, then teach one weak topic back to yourself from memory.', url: ytSearch(bl + ' ' + sl + ' ' + subj.name + ' revision') });
    return steps;
  }

  function analyze(entry, prof, prev) {
    const pct = entry.mark / entry.total * 100;
    const g = gradeFor(prof, pct);
    const band = pct < 40 ? 'rebuild' : pct < 55 ? 'gapfill' : pct < 70 ? 'apply' : pct < 85 ? 'technique' : 'polish';
    const subj = SUBJECTS.find(s => s.id === entry.subject);
    const rnd = mulberry32(hashStr(subj.id + '|' + Math.round(pct) + '|' + Date.now()));
    const flags = flagTopics(subj, pct, rnd);

    const vals = prev.map(e => e.pct).concat([pct]);
    const lastPrev = prev.length ? prev[prev.length - 1] : null;
    const delta = lastPrev ? pct - lastPrev.pct : null;
    const trend = {
      n: vals.length,
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      delta: delta,
      dir: !lastPrev ? 'first' : delta >= 3 ? 'up' : delta <= -3 ? 'down' : 'steady',
      spark: vals.slice(-6)
    };

    const next = g.next;
    const ctx = {
      name: prof.name || 'you',
      subject: subj.name,
      pct: fmtPct(pct) + '%',
      mark: entry.mark, total: entry.total,
      board: BOARDS[prof.board].short, stage: prof.stage,
      grade: g.grade,
      next: next ? next.grade : '',
      pctNeeded: next ? Math.max(1, Math.ceil(next.thr - pct)) : 0,
      rawNeeded: next ? Math.max(1, Math.ceil(next.thr / 100 * entry.total - entry.mark)) : 0,
      avg: fmtPct(trend.avg) + '%',
      n: trend.n,
      delta: delta != null ? fmtPct(Math.abs(delta)) : '',
      t1: flags.hi[0] ? flags.hi[0].n : '',
      t2: flags.hi[1] ? flags.hi[1].n : (flags.ck[0] ? flags.ck[0].n : '')
    };

    const p1 = fill(pick(OPENERS, rnd), ctx) + ' ' + fill(next ? GAP_NEXT : GAP_TOP, ctx);
    const p2 = fill(DIAG[band], ctx) + (FAMILY[subj.family] ? ' ' + fill(FAMILY[subj.family], ctx) : '');
    const p3 = fill(METHOD[band], ctx) + ' ' + fill(pick(TRAJ[trend.dir], rnd), ctx) + ' ' + fill(pick(CLOSERS, rnd), ctx);

    return { entry: entry, prof: prof, subj: subj, pct: pct, g: g, band: band, flags: flags, trend: trend, ctx: ctx, paragraphs: [p1, p2, p3], plan: buildPlan(subj, band, flags, prof) };
  }

  /* ---------------- 6 · generated board-specific resources ---------------- */
  function genResources(subj, prof) {
    const bl = BOARDS[prof.board].short, sl = STAGE_LABEL[prof.stageKey];
    const out = [];
    out.push(R(bl + ' ' + sl + ' ' + subj.name + ' — revision videos (live)',
      ytSearch(bl + ' ' + sl + ' ' + subj.name + ' revision'),
      'video', 'YouTube · live search', [prof.stageKey], [prof.board],
      'Always-current video results for exactly this subject, board and level — never the wrong subject.'));
    out.push(R('Past papers & mark schemes — ' + subj.name,
      'https://www.physicsandmathstutor.com/past-papers/',
      'papers', 'Physics & Maths Tutor', ['igcse', 'as', 'a2'], B,
      'Every session’s paper, mark scheme and grade threshold, sorted by year.'));
    if (prof.board === 'caie') {
      out.push(R('ZNotes — ' + subj.name + ' syllabus notes', 'https://znotes.org/caie/', 'notes', 'ZNotes', [prof.stageKey], ['caie'], 'Community-built revision notes matched to the Cambridge syllabus.'));
    }
    return out;
  }
  function allResources(subj, prof) {
    const base = subj.resources.filter(r => r.boards.indexOf('both') > -1 || r.boards.indexOf(prof.board) > -1);
    return base.concat(genResources(subj, prof)).sort((a, b) =>
      ((a.stages.indexOf(prof.stageKey) > -1 ? 0 : 1) + (a.stages.length === 3 ? 0.2 : 0)) -
      ((b.stages.indexOf(prof.stageKey) > -1 ? 0 : 1) + (b.stages.length === 3 ? 0.2 : 0)));
  }

  /* ---------------- 7 · shell: FABs, modal, toast, state ---------------- */
  const LS = { PROF: 'eduhub.profile.v1', MARKS: 'eduhub.marks.v1', PLAN: 'eduhub.plan.v1' };
  const state = { view: null, returnTo: null, v: null };
  let lastFocus = null, toastT = null;

  function toast(msg) {
    const t = $('#eh-toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 240); }, 2200);
  }

  function setHead(eyebrow, title) {
    $('#eh-eyebrow').textContent = eyebrow;
    $('#eh-title').textContent = title;
    $('#eh-body').scrollTop = 0;
  }

  function openModal() {
    const m = $('#eh-modal');
    lastFocus = document.activeElement;
    m.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('eh-in')));
    const x = $('.eh-x', m); if (x) x.focus();
  }
  function closeModal() {
    const m = $('#eh-modal');
    if (!m || m.hidden) return;
    m.classList.remove('eh-in');
    setTimeout(() => { m.hidden = true; }, 240);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function openFlow(view) {
    const prof = store.get(LS.PROF, null);
    state.view = view;
    if (!prof) { state.returnTo = view; renderOnboarding(); }
    else if (view === 'analyzer') renderAnalyzer();
    else renderVault();
    openModal();
  }

  function onDocClick(e) {
    const opener = e.target.closest('[data-eduhub-open]');
    if (opener) { openFlow(opener.getAttribute('data-eduhub-open')); return; }
    if (e.target.closest('[data-eh-close]')) { closeModal(); return; }
    if (e.target.closest('[data-eh-edit]')) { state.returnTo = state.view || 'analyzer'; renderOnboarding(); }
  }

  function init() {
    if ($('#eh-fabs')) return;
    if (!window.EDUHUB_NO_FABS) {
      const wrap = document.createElement('div');
      wrap.id = 'eh-fabs';
      wrap.innerHTML =
        '<button class="eh-fab" data-eduhub-open="analyzer" aria-label="Open Mark Analyzer">' + ic('clip', 22) + '<span class="eh-fab-tip">Mark Analyzer</span></button>' +
        '<button class="eh-fab" data-eduhub-open="vault" aria-label="Open Study Vault">' + ic('book', 22) + '<span class="eh-fab-tip">Study Vault</span></button>';
      document.body.appendChild(wrap);
    }
    document.body.insertAdjacentHTML('beforeend',
      '<div id="eh-modal" hidden>' +
        '<div class="eh-scrim" data-eh-close></div>' +
        '<div class="eh-panel" role="dialog" aria-modal="true" aria-label="EduHub study tools">' +
          '<header class="eh-head">' +
            '<div><div class="eh-eyebrow" id="eh-eyebrow"></div><h2 class="eh-title" id="eh-title"></h2></div>' +
            '<button class="eh-x" data-eh-close aria-label="Close">' + ic('x', 17) + '</button>' +
          '</header>' +
          '<div class="eh-body" id="eh-body"></div>' +
        '</div>' +
      '</div>' +
      '<div id="eh-toast" hidden></div>');
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }

  /* ---------------- 8 · onboarding (board + year → stage) ---------------- */
  function profileStripHTML(prof) {
    return '<div class="eh-pstrip"><span>' + esc(BOARDS[prof.board].short) + ' · Year ' + prof.year + ' · ' + esc(prof.stage) + '</span>' +
      '<button class="eh-link" data-eh-edit>Edit profile</button></div>';
  }
  function boardCard(id, name, quals, on) {
    return '<button class="eh-bcard' + (on ? ' on' : '') + '" data-board="' + id + '">' +
      '<span class="eh-bname">' + name + '</span><span class="eh-bquals">' + quals + '</span></button>';
  }

  function renderOnboarding() {
    setHead('Setup', 'Your exam profile');
    const prof = store.get(LS.PROF, null);
    const b0 = prof ? prof.board : null;
    const y0 = prof ? prof.year : null;
    $('#eh-body').innerHTML =
      '<div class="eh-ob">' +
        '<p class="eh-lede">Two quick answers so every grade boundary, resource and piece of feedback matches your real syllabus.</p>' +
        '<div class="eh-flabel">1 · Exam board</div>' +
        '<div class="eh-boards">' +
          boardCard('caie', 'Cambridge (CAIE)', 'IGCSE · O Level · AS & A Level', b0 === 'caie') +
          boardCard('edexcel', 'Pearson Edexcel', 'International GCSE · IAS · IAL', b0 === 'edexcel') +
        '</div>' +
        '<div class="eh-flabel">2 · Year group</div>' +
       '<div class="eh-years">' + [6, 7, 8, 9, 10, 11, 12, 13].map(v =>
          '<button class="eh-ychip' + (y0 === v ? ' on' : '') + '" data-year="' + v + '">Year ' + v + '</button>').join('') + '</div>' +
        '<div class="eh-stageline" id="eh-stageline"></div>' +
        '<div class="eh-flabel">3 · What should we call you? <span class="eh-opt">optional</span></div>' +
        '<input id="eh-name" class="eh-input" maxlength="24" placeholder="e.g. Anindya" value="' + esc(prof ? prof.name || '' : '') + '">' +
        '<div class="eh-err" id="eh-oberr" hidden></div>' +
        '<div class="eh-obfoot">' +
          '<button class="eh-btn" id="eh-obgo">Save profile ' + ic('arrow', 16) + '</button>' +
          (prof ? '<button class="eh-btn-ghost" id="eh-obcancel">Cancel</button>' : '') +
        '</div>' +
      '</div>';

    const body = $('#eh-body');
    function updateStage() {
      const bc = $('.eh-bcard.on', body), yc = $('.eh-ychip.on', body), line = $('#eh-stageline', body);
      if (!bc || !yc) { line.innerHTML = ''; return; }
      const stage = stageForYear(bc.dataset.board, +yc.dataset.year);
      line.innerHTML = BOARDS[bc.dataset.board].short + ' · Year ' + yc.dataset.year + ' → <strong>' + esc(stage) + '</strong>';
    }
    $$('.eh-bcard', body).forEach(c => c.addEventListener('click', () => {
      $$('.eh-bcard', body).forEach(x => x.classList.remove('on'));
      c.classList.add('on'); updateStage();
    }));
    $$('.eh-ychip', body).forEach(c => c.addEventListener('click', () => {
      $$('.eh-ychip', body).forEach(x => x.classList.remove('on'));
      c.classList.add('on'); updateStage();
    }));
    updateStage();

    $('#eh-obgo').addEventListener('click', () => {
      const bc = $('.eh-bcard.on', body), yc = $('.eh-ychip.on', body), err = $('#eh-oberr', body);
      if (!bc || !yc) { err.textContent = 'Pick your board and year group first.'; err.hidden = false; return; }
      const board = bc.dataset.board, year = +yc.dataset.year, stage = stageForYear(board, year);
      const p = { board: board, year: year, stage: stage, stageKey: BOARDS[board].stages[stage].key, name: $('#eh-name', body).value.trim() };
      store.set(LS.PROF, p);
      toast('Profile saved — ' + BOARDS[board].short + ', Year ' + year);
      if (state.returnTo === 'vault') renderVault(); else renderAnalyzer();
    });
    const cancel = $('#eh-obcancel');
    if (cancel) cancel.addEventListener('click', () => {
      if (state.returnTo === 'vault') renderVault(); else renderAnalyzer();
    });
  }

  /* ---------------- 9 · Mark Analyzer ---------------- */
  function subjectOptions() {
    const fams = {};
    SUBJECTS.forEach(s => { (fams[s.family] = fams[s.family] || []).push('<option value="' + s.id + '">' + esc(s.name) + '</option>'); });
    const labels = { quant: 'Maths, Sciences & CS', essay: 'English, Business & Humanities', memory: 'Biology & Geography' };
    return '<option value="" disabled selected>Choose a subject…</option>' +
      Object.keys(fams).map(f => '<optgroup label="' + (labels[f] || f) + '">' + fams[f].join('') + '</optgroup>').join('');
  }

  function renderAnalyzer() {
    setHead('Mark Intelligence', 'Mark Analyzer');
    const prof = store.get(LS.PROF, null);
    $('#eh-body').innerHTML = profileStripHTML(prof) +
      '<div class="eh-card" id="eh-formcard">' +
        '<div class="eh-formrow">' +
          '<div class="eh-field grow"><label>Subject</label><select id="eh-subj" class="eh-select">' + subjectOptions() + '</select></div>' +
          '<div class="eh-field"><label>Component <span class="eh-opt">optional</span></label><select id="eh-comp" class="eh-select">' +
            ['Full exam / mock','Paper 1','Paper 2','Paper 3','Paper 4','Paper 6 (practical)','Class test','Past paper practice']
              .map(c => '<option>' + c + '</option>').join('') + '</select></div>' +
        '</div>' +
        '<div class="eh-formrow">' +
          '<div class="eh-field"><label>Your mark</label><div class="eh-marks">' +
            '<input id="eh-mark" class="eh-input" type="number" min="0" placeholder="87"><span class="eh-slash">/</span>' +
            '<input id="eh-total" class="eh-input" type="number" min="1" value="100"></div></div>' +
          '<div class="eh-field"><label>Out of</label><div class="eh-tchips">' +
            [100, 90, 80, 75, 60, 50].map(t => '<button class="eh-chip' + (t === 100 ? ' on' : '') + '" data-total="' + t + '">' + t + '</button>').join('') +
          '</div></div>' +
        '</div>' +
        '<div class="eh-err" id="eh-ferr" hidden></div>' +
        '<div class="eh-formrow end"><button class="eh-btn big" id="eh-analyze">' + ic('sparkle', 17) + ' Analyze with AI ' + ic('arrow', 16) + '</button></div>' +
        '<div class="eh-note">Scores are stored on this device only. Every future result sharpens your trend analysis — the engine gets smarter the more you log.</div>' +
      '</div>' +
      '<div id="eh-out" aria-live="polite"></div>' +
      '<div id="eh-record"></div>';

    const body = $('#eh-body');
    $$('.eh-tchips .eh-chip', body).forEach(ch => ch.addEventListener('click', () => {
      $('#eh-total', body).value = ch.dataset.total;
      $$('.eh-tchips .eh-chip', body).forEach(x => x.classList.toggle('on', x === ch));
    }));
    $('#eh-total', body).addEventListener('input', () => {
      const tv = $('#eh-total', body).value;
      $$('.eh-tchips .eh-chip', body).forEach(x => x.classList.toggle('on', x.dataset.total === tv));
    });
    $('#eh-analyze', body).addEventListener('click', doAnalyze);
    ['eh-mark', 'eh-total'].forEach(id => $('#' + id, body).addEventListener('keydown', e => { if (e.key === 'Enter') doAnalyze(); }));
    renderRecord();
  }

  function showErr(node, msg) { node.textContent = msg; node.hidden = false; }

  function doAnalyze() {
    const prof = store.get(LS.PROF, null);
    if (!prof) return;
    const subjId = $('#eh-subj').value;
    const mark = parseFloat($('#eh-mark').value), total = parseFloat($('#eh-total').value);
    const err = $('#eh-ferr');
    if (!subjId) { showErr(err, 'Choose a subject first.'); return; }
    if (isNaN(mark) || isNaN(total) || total <= 0) { showErr(err, 'Enter your mark and the total (e.g. 87 / 100).'); return; }
    if (mark < 0 || mark > total) { showErr(err, 'Your mark must be between 0 and ' + total + '.'); return; }
    err.hidden = true;

    const entry = {
      id: 'm' + Date.now() + Math.floor(Math.random() * 99),
      subject: subjId, component: $('#eh-comp').value,
      mark: mark, total: total, pct: mark / total * 100,
      board: prof.board, stage: prof.stage,
      ts: Date.now(),
      date: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    };
    const history = store.get(LS.MARKS, []);
    const prev = history.filter(m => m.subject === subjId).sort((a, b) => a.ts - b.ts);
    const report = analyze(entry, prof, prev);
    entry.grade = report.g.grade;
    history.push(entry);
    store.set(LS.MARKS, history.slice(-200));
    runProcessing(report);
  }

  function runProcessing(report) {
    const prof = report.prof;
    const steps = [
      'Normalising ' + report.entry.mark + '/' + report.entry.total + ' → ' + fmtPct(report.pct) + '% against ' + BOARDS[prof.board].short + ' ' + prof.stage + ' boundaries',
      'Estimating grade band and gap to the next boundary',
      'Mapping topic-level mastery for ' + report.subj.name,
      'Composing feedback and a repair protocol'
    ];
    $('#eh-out').innerHTML = '<div class="eh-card eh-processing">' +
      steps.map(s => '<div class="eh-pstep"><span class="eh-pdot">' + ic('check', 12) + '</span><span>' + s + '</span></div>').join('') + '</div>';
    const nodes = $$('#eh-out .eh-pstep');
    nodes.forEach((n, i) => setTimeout(() => n.classList.add('done'), 320 + i * 320));
    setTimeout(() => { renderResults(report); renderRecord(); }, 320 + steps.length * 320 + 260);
    const out = $('#eh-out'); if (out) out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function sparkSVG(vals, color) {
    const w = 110, h = 34, p = 4;
    if (!vals || vals.length < 2) return '';
    const pts = vals.map((v, i) => [
      (p + i * (w - 2 * p) / (vals.length - 1)).toFixed(1),
      (h - p - (v / 100) * (h - 2 * p)).toFixed(1)
    ]);
    const last = pts[pts.length - 1];
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="' +
      pts.map(pt => pt.join(',')).join(' ') + '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" fill="' + color + '"/></svg>';
  }

  function topicRow(t, status, note, subj, prof) {
    const q = ytSearch(BOARDS[prof.board].short + ' ' + STAGE_LABEL[prof.stageKey] + ' ' + subj.name + ' ' + t.n + ' revision');
    return '<div class="eh-trow"><span class="eh-dot ' + status + '"></span>' +
      '<div class="eh-tmain"><div class="eh-tname">' + esc(t.n) + '</div><div class="eh-tnote">' + note + '</div></div>' +
      '<a class="eh-tlink" target="_blank" rel="noopener" href="' + q + '">' + ic('play', 12) + ' video</a></div>';
  }

  function planKey(r) { return r.subj.id + '|' + new Date(r.entry.ts).toISOString().slice(0, 10); }

  function updatePlanProg(r) {
    const box = $('#eh-planprog'); if (!box || !r) return;
    const arr = store.get(LS.PLAN, {})[planKey(r)] || [];
    const done = arr.filter(Boolean).length;
    box.textContent = done + '/' + r.plan.length + ' done';
    const fillEl = $('#eh-planbarfill'); if (fillEl) fillEl.style.width = (done / r.plan.length * 100) + '%';
  }

  function buildReportText(r) {
    const e = r.entry, prof = r.prof, L = [];
    L.push('EDUHUB — ' + r.subj.name + ' mark analysis');
    L.push(BOARDS[prof.board].short + ' ' + prof.stage + ' · ' + e.date);
    L.push('Score: ' + e.mark + '/' + e.total + ' (' + fmtPct(r.pct) + '%) → indicative grade ' + r.g.grade);
    if (r.g.next) L.push('Gap: ' + r.ctx.pctNeeded + ' points (' + r.ctx.rawNeeded + ' raw marks) from ' + r.g.next.grade);
    L.push('');
    r.paragraphs.forEach(p => { L.push(p); L.push(''); });
    L.push('Priority topics:');
    r.flags.hi.forEach(t => L.push(' • ' + t.n));
    r.flags.ck.forEach(t => L.push(' • ' + t.n + ' (review)'));
    L.push('');
    L.push('Protocol:');
    r.plan.forEach((s, i) => L.push(' ' + (i + 1) + '. ' + s.txt));
    return L.join('\n');
  }

  function copyText(t) {
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Report copied to clipboard'); }
      catch (e) { toast('Copy failed — select the text manually'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(() => toast('Report copied to clipboard'), fallback);
    } else fallback();
  }

  function renderResults(r) {
    const e = r.entry, prof = r.prof;
    const bline = BOARDS[prof.board].stages[prof.stage].grades.map(g => g[0] + ' ≥' + g[1]).join(' · ');
    /* THEME EDIT 2 of 3 — sparkline follows the theme's danger/accent tokens */
    const sparkColor = r.trend.dir === 'down' ? cssVar('--danger', '#9c3a2a') : cssVar('--accent', '#0c6a43');
    const trendBits =
      r.trend.dir === 'first' ? 'First entry logged — baseline set' :
      r.trend.dir === 'up'    ? '<b class="up">+' + fmtPct(Math.abs(r.trend.delta)) + '</b> vs your last ' + esc(r.subj.name) + ' score' :
      r.trend.dir === 'down'  ? '<b class="down">−' + fmtPct(Math.abs(r.trend.delta)) + '</b> vs your last ' + esc(r.subj.name) + ' score' :
                                'Steady vs your last ' + esc(r.subj.name) + ' score';
    const avgBits = r.trend.n > 1 ? ' · ' + esc(r.subj.name) + ' average <b>' + r.ctx.avg + '</b> across ' + r.trend.n + ' entries' : '';

    const hiRows = r.flags.hi.map(t => topicRow(t, 'hi', TOPIC_NOTE[r.flags.mode], r.subj, prof)).join('');
    const ckRows = r.flags.ck.map(t => topicRow(t, 'ck', CK_NOTE, r.subj, prof)).join('');
    const pills  = r.flags.rest.map(t => '<span>' + esc(t.n) + '</span>').join('');

    const key = planKey(r);
    const saved = store.get(LS.PLAN, {})[key] || [];
    const stepsHtml = r.plan.map((s, i) => {
      const done = !!saved[i];
      return '<label class="eh-step' + (done ? ' done' : '') + '">' +
        '<input type="checkbox" data-step="' + i + '"' + (done ? ' checked' : '') + '>' +
        '<span class="eh-box">' + ic('check', 11) + '</span>' +
        '<span class="eh-stag t-' + s.tag.toLowerCase() + '">' + s.tag + '</span>' +
        '<span class="eh-stxt">' + esc(s.txt) + '</span>' +
        (s.url ? '<a class="eh-stlink" href="' + s.url + '" target="_blank" rel="noopener" title="Open video">' + ic('play', 13) + '</a>' : '') +
        '</label>';
    }).join('');

    $('#eh-out').innerHTML =
      '<section class="eh-results">' +
        '<div class="eh-verdict eh-reveal">' +
          '<div class="eh-score"><span class="n">' + fmtPct(r.pct) + '</span><span class="pc">%</span>' +
            '<div class="sub">' + e.mark + '/' + e.total + ' · ' + esc(e.component) + '</div></div>' +
          '<div class="eh-vmid">' +
            gradeChip(r.g.grade) +
            '<div class="eh-vg">' + BOARDS[prof.board].short + ' ' + esc(prof.stage) + ' · indicative</div>' +
            '<div class="eh-vt">' + trendBits + avgBits + '</div>' +
            '<div class="eh-bline">' + bline + '</div>' +
          '</div>' +
          '<div class="eh-vspark">' + sparkSVG(r.trend.spark, sparkColor) + '</div>' +
        '</div>' +
        '<div class="eh-card eh-reveal d1"><h3 class="eh-h3">Assessment</h3>' +
          r.paragraphs.map(p => '<p class="eh-para">' + p + '</p>').join('') +
          '<div class="eh-note">Indicative boundaries — official grade thresholds shift by a few marks each exam session.</div>' +
        '</div>' +
        '<div class="eh-card eh-reveal d2"><h3 class="eh-h3">Topic radar <span class="eh-hint">inferred from your band · “video” opens a targeted lesson search</span></h3>' +
          hiRows + ckRows +
          '<div class="eh-secure"><div class="eh-secure-label">Likely secure at this level</div><div class="eh-pills">' + pills + '</div></div>' +
        '</div>' +
        '<div class="eh-card eh-reveal d3"><h3 class="eh-h3">Your repair protocol</h3>' +
          '<div class="eh-planprog"><span id="eh-planprog"></span><div class="eh-planbar"><i id="eh-planbarfill"></i></div></div>' +
          '<div class="eh-plan">' + stepsHtml + '</div>' +
        '</div>' +
        '<div class="eh-actions eh-reveal d4">' +
          '<button class="eh-btn-ghost" id="eh-copy">' + ic('copy', 14) + ' Copy report</button>' +
          '<button class="eh-btn-ghost" id="eh-again">' + ic('plus', 14) + ' Log another mark</button>' +
          '<button class="eh-btn" id="eh-tovault">Open ' + esc(r.subj.name) + ' Vault ' + ic('arrow', 15) + '</button>' +
        '</div>' +
      '</section>';

    $$('#eh-out .eh-step input').forEach(cb => cb.addEventListener('change', () => {
      const all = store.get(LS.PLAN, {});
      const arr = all[key] || new Array(r.plan.length).fill(false);
      arr[+cb.dataset.step] = cb.checked;
      all[key] = arr;
      store.set(LS.PLAN, all);
      cb.closest('.eh-step').classList.toggle('done', cb.checked);
      updatePlanProg(r);
    }));
    updatePlanProg(r);

    $('#eh-copy').addEventListener('click', () => copyText(buildReportText(r)));
    $('#eh-again').addEventListener('click', () => {
      $('#eh-out').innerHTML = '';
      $('#eh-mark').value = '';
      $('#eh-mark').focus();
    });
    $('#eh-tovault').addEventListener('click', () => renderVault(r.subj.id));
  }

  function renderRecord() {
    const host = $('#eh-record'); if (!host) return;
    const hist = store.get(LS.MARKS, []);
    if (!hist.length) {
      host.innerHTML = '<div class="eh-empty">No scores logged yet. Your history, per-subject averages and trend lines will build here after your first upload.</div>';
      return;
    }
    const bySub = {};
    hist.forEach(m => { (bySub[m.subject] = bySub[m.subject] || []).push(m); });
    const aggs = Object.keys(bySub).map(id => {
      const s = SUBJECTS.find(x => x.id === id) || { name: id, mono: '?' };
      const es = bySub[id];
      return { id: id, name: s.name, mono: s.mono, avg: es.reduce((a, b) => a + b.pct, 0) / es.length, n: es.length };
    }).sort((a, b) => a.avg - b.avg);
    const worst = aggs.length > 1 ? aggs[0] : null;

    host.innerHTML = '<div class="eh-card"><h3 class="eh-h3">Your record <span class="eh-hint">' +
      hist.length + (hist.length === 1 ? ' entry' : ' entries') + ' on this device</span></h3>' +
      '<div class="eh-agg">' + aggs.map(a => {
        /* THEME EDIT 3 of 3 — record bars follow the theme's ok/warn/danger tokens */
        const col = a.avg >= 70 ? cssVar('--ok', '#0c6a43') : a.avg >= 40 ? cssVar('--warn', '#c98a1b') : cssVar('--danger', '#9c3a2a');
        return '<div class="eh-aggrow"><span class="eh-mono">' + esc(a.mono) + '</span>' +
          '<span class="eh-aname">' + esc(a.name) + '</span>' +
          '<div class="eh-abar"><i style="width:' + a.avg + '%;background:' + col + '"></i></div>' +
          '<span class="eh-aval">' + fmtPct(a.avg) + '%</span><span class="eh-an">' + a.n + '×</span></div>';
      }).join('') + '</div>' +
      (worst ? '<div class="eh-priority">Priority right now: <b>' + esc(worst.name) + '</b> is averaging ' + fmtPct(worst.avg) + '% — your lowest subject. Schedule it first.</div>' : '') +
      '<div class="eh-recs">' + hist.slice().sort((a, b) => b.ts - a.ts).slice(0, 8).map(m => {
        const s = SUBJECTS.find(x => x.id === m.subject) || { name: m.subject };
        return '<div class="eh-recrow"><span class="eh-rdate">' + esc(m.date) + '</span>' +
          '<span class="eh-rsubj">' + esc(s.name) + '</span>' +
          '<span class="eh-rcomp">' + esc(m.component || '') + '</span>' +
          '<span class="eh-rscore">' + m.mark + '/' + m.total + '</span>' +
          gradeChip(m.grade || '—', 'mini') +
          '<button class="eh-del" data-id="' + m.id + '" aria-label="Delete entry">' + ic('trash', 14) + '</button></div>';
      }).join('') + '</div></div>';

    $$('.eh-del', host).forEach(btn => btn.addEventListener('click', () => {
      store.set(LS.MARKS, store.get(LS.MARKS, []).filter(m => m.id !== btn.dataset.id));
      toast('Entry removed');
      renderRecord();
    }));
  }

  /* ---------------- 10 · Study Vault ---------------- */
  function renderVault(openSubject) {
    setHead('Study Vault', 'Board-mapped study resources');
    state.v = { subj: openSubject || null, filter: 'all', q: '' };
    drawVault();
  }

  function refocusSearch() {
    const inp = $('#eh-vq');
    if (inp) { inp.focus(); const L = inp.value.length; try { inp.setSelectionRange(L, L); } catch (e) {} }
  }

  function vRow(r) {
    const tm = TYPE_META[r.type];
    return '<div class="eh-vrow"><span class="eh-vbadge ' + r.type + '">' + ic(tm.i, 13) + tm.l + '</span>' +
      '<div class="eh-vmain"><a class="eh-vlink" href="' + r.url + '" target="_blank" rel="noopener">' + esc(r.title) + ic('ext', 13) + '</a>' +
      '<div class="eh-vsrc">' + esc(r.source) + ' · ' + r.stages.map(k => STAGE_LABEL[k]).join(', ') + '</div>' +
      '<div class="eh-vdesc">' + esc(r.desc) + '</div></div></div>';
  }

  function drawVault() {
    const prof = store.get(LS.PROF, null);
    const v = state.v, host = $('#eh-body');
    const q = (v.q || '').toLowerCase();

    if (!v.subj) {
      const cards = SUBJECTS.filter(s => !q ||
        s.name.toLowerCase().indexOf(q) > -1 ||
        s.resources.some(r => r.title.toLowerCase().indexOf(q) > -1));
      host.innerHTML = profileStripHTML(prof) +
        '<div class="eh-vsearch">' + ic('search', 16) + '<input id="eh-vq" class="eh-input" placeholder="Search subjects or resources…" value="' + esc(v.q) + '"></div>' +
        '<div class="eh-vgrid">' + (cards.length ? cards.map(s => {
          const res = allResources(s, prof);
          const stages = Object.keys(STAGE_LABEL).filter(k => res.some(r => r.stages.indexOf(k) > -1));
          return '<button class="eh-vcard" data-subj="' + s.id + '">' +
            '<span class="eh-mono big">' + s.mono + '</span>' +
            '<span class="eh-vname">' + esc(s.name) + '</span>' +
            '<span class="eh-vmeta">' + res.length + ' resources · ' + stages.map(k => STAGE_LABEL[k]).join(' · ') + '</span></button>';
        }).join('') : '<div class="eh-empty" style="grid-column:1/-1">Nothing matches “' + esc(v.q) + '”.</div>') + '</div>' +
        '<div class="eh-note">Every link is filtered to your board (' + BOARDS[prof.board].short + ') and opens in a new tab. Video searches are live and always subject-specific.</div>';
    } else {
      const s = SUBJECTS.find(x => x.id === v.subj);
      const all = allResources(s, prof).filter(r =>
        (v.filter === 'all' || r.type === v.filter) &&
        (!q || (r.title + ' ' + r.source + ' ' + r.desc).toLowerCase().indexOf(q) > -1));
      host.innerHTML = profileStripHTML(prof) +
        '<button class="eh-back" id="eh-vback">' + ic('back', 14) + ' All subjects</button>' +
        '<div class="eh-vhead"><span class="eh-mono big">' + s.mono + '</span><div>' +
          '<div class="eh-vtitle">' + esc(s.name) + '</div>' +
          '<div class="eh-vmeta">' + all.length + ' resources mapped to ' + BOARDS[prof.board].short + ' · ' + esc(prof.stage) + '</div></div></div>' +
        '<div class="eh-vsearch">' + ic('search', 16) + '<input id="eh-vq" class="eh-input" placeholder="Search in ' + esc(s.name) + '…" value="' + esc(v.q) + '"></div>' +
        '<div class="eh-vfilters">' + [['all','All'],['video','Videos'],['notes','Notes'],['papers','Past papers'],['practice','Practice']].map(f =>
          '<button class="eh-chip' + (v.filter === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + '</button>').join('') + '</div>' +
        '<div class="eh-vlist">' + (all.length ? all.map(vRow).join('') : '<div class="eh-empty">No items of this type for ' + esc(s.name) + '.</div>') + '</div>';
    }

    const back = $('#eh-vback');
    if (back) back.addEventListener('click', () => { state.v.subj = null; drawVault(); });
    $$('.eh-vfilters .eh-chip', host).forEach(c => c.addEventListener('click', () => { state.v.filter = c.dataset.f; drawVault(); }));
    $$('.eh-vcard', host).forEach(c => c.addEventListener('click', () => { state.v.subj = c.dataset.subj; state.v.filter = 'all'; state.v.q = ''; drawVault(); }));
    const inp = $('#eh-vq');
    if (inp) inp.addEventListener('input', e => { state.v.q = e.target.value; drawVault(); });
    if (state.v.q) refocusSearch();
  }

  /* ---------------- 11 · boot ---------------- */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.EduHub = { open: openFlow };
})();

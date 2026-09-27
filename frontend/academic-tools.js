/* ================================================================
   STUDYHUB ACADEMIC TOOLS
   ================================================================ */

(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    /* ============================================================
       MODAL ENGINE
       ============================================================ */

    function openModal(id) {
        const modal = $(id);
        if (!modal) return;

        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');

        document.body.classList.add('academic-modal-open');
    }

    function closeModal(id) {
        const modal = $(id);
        if (!modal) return;

        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');

        if (!document.querySelector('.academic-modal.open')) {
            document.body.classList.remove('academic-modal-open');
        }
    }

    function initAcademicModals() {

        const markFab = $('markAnalyzerFab');
        const studyFab = $('studyHubFab');

        if (markFab) {
            markFab.addEventListener('click', function () {
                openModal('markAnalyzerModal');
            });
        }

        if (studyFab) {
            studyFab.addEventListener('click', function () {
                openModal('studyHubModal');
            });
        }

        document.querySelectorAll('[data-academic-close]').forEach(function (button) {

            button.addEventListener('click', function () {
                closeModal(button.getAttribute('data-academic-close'));
            });

        });

        document.querySelectorAll('.academic-modal').forEach(function (modal) {

            modal.addEventListener('click', function (event) {

                if (event.target === modal) {
                    closeModal(modal.id);
                }

            });

        });

        document.addEventListener('keydown', function (event) {

            if (event.key !== 'Escape') return;

            const open = document.querySelector('.academic-modal.open');

            if (open) {
                closeModal(open.id);
            }

        });
    }


    /* ============================================================
       AI MARK ANALYZER
       ============================================================ */

    function escapeHtml(value) {

        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    }


    function safeArray(value) {

        if (!Array.isArray(value)) return [];

        return value
            .filter(Boolean)
            .slice(0, 8)
            .map(item => String(item));

    }


    function renderList(items) {

        const safeItems = safeArray(items);

        if (!safeItems.length) {
            return '<li>No specific items returned.</li>';
        }

        return safeItems
            .map(item => `<li>${escapeHtml(item)}</li>`)
            .join('');

    }


    function parseAIJson(text) {

        if (!text) return null;

        let cleaned = String(text).trim();

        cleaned = cleaned
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        try {
            return JSON.parse(cleaned);
        } catch (_) {
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');

            if (start === -1 || end === -1 || end <= start) {
                return null;
            }

            try {
                return JSON.parse(cleaned.slice(start, end + 1));
            } catch (_) {
                return null;
            }
        }
    }


    async function requestMarkAnalysis(payload) {

        const response = await fetch('/api/ai/chat/completions', {

            method: 'POST',

            headers: {
                'Content-Type': 'application/json'
            },

            credentials: 'same-origin',

            body: JSON.stringify({

                task: 'mark_analysis',

                temperature: 0.25,

                max_tokens: 1200,

                response_format: {
                    type: 'json_object'
                },

                messages: [

                    {
                        role: 'system',

                        content:
                            `You are EduHub Academic Performance AI.

You analyse student assessment performance for Cambridge and Edexcel students.

You MUST:
- use only the supplied mark, maximum mark, subject, curriculum and grade;
- calculate percentage correctly;
- never invent an official Cambridge or Edexcel grade boundary;
- clearly distinguish percentage performance from an official qualification grade;
- give actionable academic feedback;
- identify likely areas for improvement without pretending to know questions the student answered;
- tailor advice to the student's subject and level;
- keep recommendations realistic for a student.

Return ONLY valid JSON using exactly this structure:

{
  "summary": "short overall analysis",
  "performance_level": "short description",
  "strengths": ["..."],
  "improvements": ["..."],
  "study_actions": ["..."],
  "seven_day_plan": ["Day 1: ...", "Day 2: ..."],
  "note": "important qualification/boundary note"
}`

                    },

                    {
                        role: 'user',

                        content:
                            JSON.stringify(payload)
                    }

                ]

            })

        });

        const raw = await response.text();

        let body = null;

        try {
            body = JSON.parse(raw);
        } catch (_) {
            throw new Error('The AI server returned an invalid response.');
        }

        if (!response.ok) {
            throw new Error(
                body?.error ||
                'The AI provider could not analyse this result.'
            );
        }

        const text =
            body?.choices?.[0]?.message?.content;

        if (!text) {
            throw new Error('The AI returned an empty analysis.');
        }

        const parsed = parseAIJson(text);

        if (!parsed) {
            throw new Error('The AI returned an unreadable analysis.');
        }

        return parsed;
    }


    async function analyzeMark(event) {

        event.preventDefault();

        const curriculum = $('markCurriculum')?.value;
        const grade = $('markGrade')?.value;
        const subject = $('markSubject')?.value;

        const obtained = Number($('markObtained')?.value);
        const maximum = Number($('markMaximum')?.value);

        const context = $('markContext')?.value.trim() || '';

        const result = $('markAnalyzerResult');
        const button = $('analyzeMarkBtn');

        if (!curriculum || !grade || !subject) {
            result.innerHTML =
                '<p>Please complete curriculum, grade and subject.</p>';
            return;
        }

        if (
            !Number.isFinite(obtained) ||
            !Number.isFinite(maximum) ||
            maximum <= 0 ||
            obtained < 0 ||
            obtained > maximum
        ) {
            result.innerHTML =
                '<p>Please enter a valid mark. The obtained mark cannot be greater than the maximum mark.</p>';
            return;
        }

        const percentage =
            Math.round((obtained / maximum) * 10000) / 100;

        button.disabled = true;

        result.innerHTML = `
            <div class="academic-loading">
                <span class="academic-spinner"></span>
                EduHub AI is analysing your result...
            </div>
        `;

        try {

            const analysis = await requestMarkAnalysis({

                curriculum,
                grade,
                subject,

                mark: obtained,
                maximumMark: maximum,
                percentage,

                studentContext: context

            });

            result.innerHTML = `

                <div class="academic-score-card">

                    <div class="academic-score">
                        <strong>${escapeHtml(percentage)}%</strong>
                        <span>${escapeHtml(obtained)} / ${escapeHtml(maximum)}</span>
                    </div>

                    <div>
                        <h3>${escapeHtml(
                            analysis.performance_level ||
                            'Performance analysis'
                        )}</h3>

                        <p>${escapeHtml(
                            analysis.summary ||
                            'Analysis completed.'
                        )}</p>
                    </div>

                </div>

                <div class="academic-result-grid">

                    <div class="academic-result-card">
                        <h4>Strengths</h4>
                        <ul>
                            ${renderList(analysis.strengths)}
                        </ul>
                    </div>

                    <div class="academic-result-card">
                        <h4>Improve Next</h4>
                        <ul>
                            ${renderList(analysis.improvements)}
                        </ul>
                    </div>

                    <div class="academic-result-card">
                        <h4>Study Actions</h4>
                        <ul>
                            ${renderList(analysis.study_actions)}
                        </ul>
                    </div>

                    <div class="academic-result-card">
                        <h4>7-Day Plan</h4>
                        <ul>
                            ${renderList(analysis.seven_day_plan)}
                        </ul>
                    </div>

                </div>

                <div class="academic-result-card" style="margin-top:.8rem;">
                    <h4>AI Note</h4>
                    <p>${escapeHtml(
                        analysis.note ||
                        'This is an educational performance analysis, not an official examination grade.'
                    )}</p>
                </div>
            `;

        } catch (error) {

            result.innerHTML = `
                <div class="academic-result-card">
                    <h4>AI analysis unavailable</h4>
                    <p>${escapeHtml(
                        error?.message ||
                        'Something went wrong while contacting the AI service.'
                    )}</p>
                </div>
            `;

        } finally {

            button.disabled = false;

        }
    }


    function initMarkAnalyzer() {

        const form = $('markAnalyzerForm');

        if (!form) return;

        form.addEventListener('submit', analyzeMark);

    }


    /* ============================================================
       CURRICULUM RESOURCE ENGINE
       ============================================================ */

    const RESOURCES = {

        Biology: {
            videos: {
                general: {
                    title: 'Biology fundamentals',
                    url: 'https://www.youtube.com/watch?v=0fKBhvDjuy0',
                    description: 'Core biology concepts and foundations.'
                }
            }
        },

        Chemistry: {
            videos: {
                general: {
                    title: 'Chemistry fundamentals',
                    url: 'https://www.youtube.com/watch?v=FSyAehMdpyI',
                    description: 'Core chemistry concepts and foundations.'
                }
            }
        },

        Physics: {
            videos: {
                general: {
                    title: 'Physics fundamentals',
                    url: 'https://www.youtube.com/watch?v=ZM8ECpBuQYE',
                    description: 'Core physics concepts and foundations.'
                }
            }
        },

        Mathematics: {
            videos: {
                general: {
                    title: 'Mathematics fundamentals',
                    url: 'https://www.youtube.com/watch?v=OmJ-4B-mS-Y',
                    description: 'Core mathematics learning and problem solving.'
                }
            }
        },

        'Computer Science': {
            videos: {
                general: {
                    title: 'Computer science fundamentals',
                    url: 'https://www.youtube.com/watch?v=zOjov-2OZ0E',
                    description: 'Computer science concepts and foundations.'
                }
            }
        },

        Economics: {
            videos: {
                general: {
                    title: 'Economics fundamentals',
                    url: 'https://www.youtube.com/watch?v=3ez10ADR_gM',
                    description: 'Core economics concepts and foundations.'
                }
            }
        },

        Business: {
            videos: {
                general: {
                    title: 'Business studies fundamentals',
                    url: 'https://www.youtube.com/watch?v=KjB9K8Y2J4M',
                    description: 'Business concepts and introductory learning.'
                }
            }
        },

        Geography: {
            videos: {
                general: {
                    title: 'Geography fundamentals',
                    url: 'https://www.youtube.com/watch?v=9D4ZqZQ5n3Y',
                    description: 'Core geography concepts and processes.'
                }
            }
        },

        History: {
            videos: {
                general: {
                    title: 'History learning',
                    url: 'https://www.youtube.com/watch?v=5fKQpW1bqN8',
                    description: 'Historical thinking and context.'
                }
            }
        },

        'English Language': {
            videos: {
                general: {
                    title: 'English language skills',
                    url: 'https://www.youtube.com/watch?v=G1tG4bN5K4Q',
                    description: 'English language and communication skills.'
                }
            }
        }

    };


    const OFFICIAL_RESOURCES = {

        Cambridge: 'https://www.cambridgeinternational.org/',

        Edexcel: 'https://qualifications.pearson.com/'

    };


    function buildResourceCard(resource) {

        return `

            <article class="academic-resource-card">

                <div class="academic-resource-icon">
                    <i class="ph ph-play-circle"></i>
                </div>

                <div>

                    <h4>${escapeHtml(resource.title)}</h4>

                    <p>${escapeHtml(resource.description)}</p>

                </div>

                <a
                    href="${escapeHtml(resource.url)}"
                    target="_blank"
                    rel="noopener noreferrer">
                    Open resource →
                </a>

            </article>
        `;
    }


    function loadResources() {

        const curriculum = $('resourceCurriculum')?.value;
        const grade = $('resourceGrade')?.value;
        const subject = $('resourceSubject')?.value;

        const list = $('resourceList');

        if (!list) return;

        if (!grade || !subject) {

            list.innerHTML = `
                <div class="academic-empty">
                    Choose your grade and subject to load matched resources.
                </div>
            `;

            return;
        }

        const subjectData = RESOURCES[subject];

        if (!subjectData) {

            list.innerHTML = `
                <div class="academic-empty">
                    Curated resources for ${escapeHtml(subject)}
                    are being added.
                </div>
            `;

            return;
        }

        const resources = [];

        const video = subjectData.videos?.general;

        if (video) {
            resources.push(video);
        }

        resources.push({

            title: `${curriculum} official qualification resources`,

            description:
                `Official ${curriculum} qualification and syllabus information.`,

            url: OFFICIAL_RESOURCES[curriculum]

        });

        list.innerHTML = resources
            .map(buildResourceCard)
            .join('');

    }


    function initResourceHub() {

        [
            'resourceCurriculum',
            'resourceGrade',
            'resourceSubject'
        ].forEach(function (id) {

            const element = $(id);

            if (element) {
                element.addEventListener('change', loadResources);
            }

        });

    }


    /* ============================================================
       START
       ============================================================ */

    function init() {

        initAcademicModals();
        initMarkAnalyzer();
        initResourceHub();

    }


    if (document.readyState === 'loading') {

        document.addEventListener('DOMContentLoaded', init);

    } else {

        init();

    }

})();

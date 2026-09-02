const PROGRESS_KEY = "mbb_progress_records";

const CATEGORY_ORDER = [
  "market sizing", "profitability", "market entry", "M&A",
  "growth strategy", "pricing", "operations",
];

const DIFFICULTY_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  interview_ready: "Interview Ready",
};

function getProgressRecords() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function saveProgressRecord(record) {
  try {
    const records = getProgressRecords();
    const last = records[records.length - 1];
    // Guard against double-recording on an accidental page refresh of the results page.
    if (last && last.caseId === record.caseId && last.timestamp === record.timestamp) return;
    records.push(record);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(records));
  } catch (err) {
    // localStorage can throw in private-browsing/blocked-storage contexts — progress tracking
    // is a nice-to-have, so fail silently rather than breaking the results page.
  }
}

function computeStreak(records) {
  const days = [...new Set(records.map((r) => r.date))].sort().reverse();
  if (days.length === 0) return 0;

  const msPerDay = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let cursor = today;
  const mostRecent = new Date(days[0] + "T00:00:00");
  const gapFromToday = Math.round((today - mostRecent) / msPerDay);
  if (gapFromToday > 1) return 0; // streak is broken if neither today nor yesterday has an entry

  cursor = mostRecent;
  for (const day of days) {
    const d = new Date(day + "T00:00:00");
    if (d.getTime() === cursor.getTime()) {
      streak += 1;
      cursor = new Date(cursor.getTime() - msPerDay);
    } else {
      break;
    }
  }
  return streak;
}

function computeCategoryStats(records) {
  const stats = {};
  for (const cat of CATEGORY_ORDER) stats[cat] = { count: 0, total: 0 };
  for (const r of records) {
    if (typeof r.overallScore !== "number") continue;
    if (!stats[r.category]) stats[r.category] = { count: 0, total: 0 };
    stats[r.category].count += 1;
    stats[r.category].total += r.overallScore;
  }
  return CATEGORY_ORDER.map((cat) => ({
    category: cat,
    count: stats[cat].count,
    avg: stats[cat].count ? stats[cat].total / stats[cat].count : null,
  }));
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderProgressBadge(container) {
  const records = getProgressRecords();
  if (records.length === 0) {
    container.classList.add("hidden");
    return;
  }
  const streak = computeStreak(records);
  const streakText = streak > 0 ? `${streak}-day streak · ` : "";
  container.innerHTML =
    `<span class="pulse-dot streak-dot"></span> ${streakText}${records.length} case${records.length === 1 ? "" : "s"} completed`;
  container.classList.remove("hidden");
}

function renderFullProgressPage(container) {
  const records = getProgressRecords();

  if (records.length === 0) {
    container.innerHTML = `
      <p class="progress-empty">You haven't completed a case yet — finish one and it'll show up here.</p>
    `;
    return;
  }

  const streak = computeStreak(records);
  const catStats = computeCategoryStats(records).filter((c) => c.count > 0);
  const maxAvg = Math.max(...catStats.map((c) => c.avg || 0), 1);

  const summaryHtml = `
    <div class="progress-summary">
      <div class="progress-stat">
        <span class="progress-stat-value">${records.length}</span>
        <span class="progress-stat-label">Cases completed</span>
      </div>
      <div class="progress-stat">
        <span class="progress-stat-value">${streak}</span>
        <span class="progress-stat-label">Day streak</span>
      </div>
    </div>
  `;

  const catHtml = catStats.length
    ? `<section class="progress-section">
        <h2 class="section-heading">By Category</h2>
        <div class="category-bars">
          ${catStats
            .map((c) => {
              const pct = Math.round(((c.avg || 0) / 10) * 100);
              return `
                <div class="category-bar-row">
                  <div class="category-bar-label">
                    <span>${escapeHtml(c.category)}</span>
                    <span>${c.avg.toFixed(1)}/10 · ${c.count} case${c.count === 1 ? "" : "s"}</span>
                  </div>
                  <div class="category-bar-track">
                    <div class="category-bar-fill" style="width: ${pct}%"></div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>`
    : "";

  const historyHtml = `
    <section class="progress-section">
      <h2 class="section-heading">Recent Cases</h2>
      <div class="history-list">
        ${records
          .slice()
          .reverse()
          .map((r) => {
            const scoreText = typeof r.overallScore === "number" ? `${r.overallScore.toFixed(1)}/10` : "—";
            return `
              <div class="history-item">
                <div class="history-item-main">
                  <span class="history-item-title">${escapeHtml(r.title)}</span>
                  <span class="history-item-meta">
                    <span class="category-badge small">${escapeHtml(r.category)}</span>
                    <span class="difficulty-badge small difficulty-${escapeHtml(r.difficulty)}">${escapeHtml(DIFFICULTY_LABELS[r.difficulty] || r.difficulty)}</span>
                  </span>
                </div>
                <div class="history-item-score">
                  <span class="history-verdict">${escapeHtml(r.verdict || "")}</span>
                  <span class="history-score">${scoreText}</span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;

  container.innerHTML = summaryHtml + catHtml + historyHtml;
}

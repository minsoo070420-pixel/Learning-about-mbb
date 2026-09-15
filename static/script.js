const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const finishBtn = document.getElementById("finish-btn");
const hintBtn = document.getElementById("hint-btn");
const micBtn = document.getElementById("mic-btn");
const listeningIndicator = document.getElementById("listening-indicator");

const CONSULTANT_FACTS = [
  "McKinsey & Company was founded in 1926 by University of Chicago accounting professor James O. McKinsey.",
  "Bain & Company was founded in 1973 by Bill Bain and a group of former BCG consultants.",
  "The BCG Growth-Share Matrix — Stars, Cash Cows, Question Marks, and Dogs — was introduced by BCG founder Bruce Henderson in 1970.",
  "Net Promoter Score, now one of the world's most-used customer loyalty metrics, was created at Bain & Company in 2003.",
  "\"MECE\" (Mutually Exclusive, Collectively Exhaustive) and the Pyramid Principle were both developed by Barbara Minto, a former McKinsey consultant.",
  "McKinsey, BCG, and Bain are collectively nicknamed \"MBB\" — the most selective tier of strategy consulting.",
  "For decades, the classic MBB schedule was \"fly out Monday, fly home Thursday\" — consultants often spent more nights in hotels than at home.",
  "Case interviews were pioneered by McKinsey to test real-time structured thinking, not to see if you already knew the \"right\" answer.",
  "Junior consultants are typically \"staffed\" on a brand-new project every few months — often in an industry they've never touched before.",
  "Many strategy firms use an \"up or out\" model: consultants are expected to reach the next rank within a set number of years or move on.",
  "The 80/20 rule, a staple of consulting frameworks, is named after 19th-century Italian economist Vilfredo Pareto.",
  "A \"deck\" is just consulting slang for a slide presentation — some go through dozens of internal revisions before a client ever sees one.",
  "Consulting alumni networks are famously deep: McKinsey, BCG, and Bain alumni have gone on to run Fortune 500 companies, central banks, and governments.",
  "The average case interview runs 20-40 minutes, and final rounds often stack two or three cases back to back.",
  "Most top firms publish free case-interview prep materials, partly to level the playing field for candidates outside elite \"target schools.\"",
  "\"Answer first\" — leading with the recommendation before the supporting logic — is often called the single most-drilled habit in consulting communication.",
  "Some consultants spend their first weeks on a new project just building an \"issue tree\" before ever touching a spreadsheet.",
  "The term \"trusted advisor\" — an outsider a CEO calls before making a big bet — dates back to consulting's earliest days in the 1920s and 30s.",
];

function addBubble(text, role) {
  const empty = chatLog.querySelector(".chat-empty");
  if (empty) empty.remove();

  const bubble = document.createElement("div");
  bubble.className = `bubble ${role === "user" ? "candidate" : "interviewer"}`;
  bubble.textContent = text;
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
}

// Reveals text into an existing bubble a few characters at a time, the way
// ChatGPT/Claude streams tokens in, rather than dumping the full reply at once.
function streamTextInto(bubble, fullText) {
  return new Promise((resolve) => {
    bubble.textContent = "";
    bubble.classList.add("streaming");
    let i = 0;
    const CHARS_PER_TICK = 3;
    const TICK_MS = 15;
    const tick = () => {
      i = Math.min(i + CHARS_PER_TICK, fullText.length);
      bubble.textContent = fullText.slice(0, i);
      chatLog.scrollTop = chatLog.scrollHeight;
      if (i < fullText.length) {
        setTimeout(tick, TICK_MS);
      } else {
        bubble.classList.remove("streaming");
        resolve();
      }
    };
    tick();
  });
}

function addExhibit(svgMarkup) {
  const empty = chatLog.querySelector(".chat-empty");
  if (empty) empty.remove();

  const card = document.createElement("div");
  card.className = "exhibit-card";
  card.innerHTML = `<p class="exhibit-label">Exhibit 1</p>${svgMarkup}`;
  chatLog.appendChild(card);
  chatLog.scrollTop = chatLog.scrollHeight;
  return card;
}

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
const SILENCE_TIMEOUT_MS = 3000;

let recognition = null;
let silenceTimer = null;
let baseText = "";
let finalTranscript = "";

if (!SpeechRecognitionImpl) {
  micBtn.disabled = true;
  micBtn.classList.add("unsupported");
  micBtn.title = "Voice input isn't supported in this browser";
}

function clearSilenceTimer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

function resetSilenceTimer() {
  clearSilenceTimer();
  silenceTimer = setTimeout(() => {
    if (recognition) recognition.stop();
  }, SILENCE_TIMEOUT_MS);
}

function setListeningUI(isListening) {
  micBtn.classList.toggle("listening", isListening);
  listeningIndicator.classList.toggle("hidden", !isListening);
}

function startListening() {
  if (!SpeechRecognitionImpl || recognition) return;

  baseText = chatInput.value.trim();
  finalTranscript = "";

  recognition = new SpeechRecognitionImpl();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  recognition.onstart = () => {
    setListeningUI(true);
    resetSilenceTimer();
  };

  recognition.onresult = (event) => {
    resetSilenceTimer();
    let interimTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }
    const combined = [baseText, (finalTranscript + interimTranscript).trim()]
      .filter(Boolean)
      .join(" ");
    chatInput.value = combined;
  };

  recognition.onerror = (event) => {
    if (event.error !== "no-speech" && event.error !== "aborted") {
      console.error("Speech recognition error:", event.error);
    }
  };

  recognition.onend = () => {
    clearSilenceTimer();
    setListeningUI(false);
    recognition = null;
    chatInput.focus();
  };

  recognition.start();
}

function stopListening() {
  if (recognition) recognition.stop();
}

micBtn.addEventListener("click", () => {
  if (recognition) {
    stopListening();
  } else {
    startListening();
  }
});

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  stopListening();
  const message = chatInput.value.trim();
  if (!message) return;

  addBubble(message, "user");
  chatInput.value = "";
  chatInput.disabled = true;
  sendBtn.disabled = true;
  micBtn.disabled = true;
  if (hintBtn) hintBtn.disabled = true;

  const thinking = addBubble("Thinking…", "model");
  thinking.classList.add("thinking");

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();

    thinking.classList.remove("thinking");
    if (!res.ok) {
      await streamTextInto(thinking, data.error || "Something went wrong.");
    } else {
      await streamTextInto(thinking, data.reply);
      if (data.exhibit_svg) addExhibit(data.exhibit_svg);
      if (finishBtn && data.case_complete) finishBtn.classList.remove("hidden");
    }
  } catch (err) {
    thinking.classList.remove("thinking");
    await streamTextInto(thinking, "Network error — please try again.");
  } finally {
    chatInput.disabled = false;
    sendBtn.disabled = false;
    if (SpeechRecognitionImpl) micBtn.disabled = false;
    if (hintBtn) hintBtn.disabled = false;
    chatInput.focus();
  }
});

if (hintBtn) {
  hintBtn.addEventListener("click", async () => {
    stopListening();
    chatInput.disabled = true;
    sendBtn.disabled = true;
    micBtn.disabled = true;
    hintBtn.disabled = true;

    const empty = chatLog.querySelector(".chat-empty");
    if (empty) empty.remove();

    const hintBubble = document.createElement("div");
    hintBubble.className = "bubble hint";
    hintBubble.innerHTML = `<span class="hint-label">💡 Hint</span><span class="hint-text">Thinking…</span>`;
    chatLog.appendChild(hintBubble);
    chatLog.scrollTop = chatLog.scrollHeight;
    const hintText = hintBubble.querySelector(".hint-text");

    try {
      const res = await fetch("/hint", { method: "POST" });
      const data = await res.json();
      await streamTextInto(hintText, res.ok ? data.hint : (data.error || "Couldn't get a hint just now."));
    } catch (err) {
      await streamTextInto(hintText, "Network error — please try again.");
    } finally {
      chatInput.disabled = false;
      sendBtn.disabled = false;
      if (SpeechRecognitionImpl) micBtn.disabled = false;
      hintBtn.disabled = false;
      chatInput.focus();
    }
  });
}

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

chatLog.scrollTop = chatLog.scrollHeight;

const consultantFactEl = document.getElementById("consultant-fact");
if (consultantFactEl) {
  const fact = CONSULTANT_FACTS[Math.floor(Math.random() * CONSULTANT_FACTS.length)];
  consultantFactEl.textContent = `💼 ${fact}`;
}

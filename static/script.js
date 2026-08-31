const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const finishBtn = document.getElementById("finish-btn");
const micBtn = document.getElementById("mic-btn");
const listeningIndicator = document.getElementById("listening-indicator");

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

  const thinking = addBubble("Thinking…", "model");
  thinking.classList.add("thinking");

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();

    thinking.remove();
    if (!res.ok) {
      addBubble(data.error || "Something went wrong.", "model");
    } else {
      addBubble(data.reply, "model");
      if (data.exhibit_svg) addExhibit(data.exhibit_svg);
      if (finishBtn) {
        if (finishBtn.dataset.difficulty === "interview_ready") {
          if (data.case_complete) finishBtn.classList.remove("hidden");
        } else {
          finishBtn.disabled = false;
        }
      }
    }
  } catch (err) {
    thinking.remove();
    addBubble("Network error — please try again.", "model");
  } finally {
    chatInput.disabled = false;
    sendBtn.disabled = false;
    if (SpeechRecognitionImpl) micBtn.disabled = false;
    chatInput.focus();
  }
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

chatLog.scrollTop = chatLog.scrollHeight;

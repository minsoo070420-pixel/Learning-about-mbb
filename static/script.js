const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const finishBtn = document.querySelector(".finish-btn");

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

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  addBubble(message, "user");
  chatInput.value = "";
  chatInput.disabled = true;
  sendBtn.disabled = true;

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
      if (finishBtn) finishBtn.disabled = false;
    }
  } catch (err) {
    thinking.remove();
    addBubble("Network error — please try again.", "model");
  } finally {
    chatInput.disabled = false;
    sendBtn.disabled = false;
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

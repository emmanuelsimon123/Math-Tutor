const WORKER_URL = "https://ai-math-tutor-worker.emmanuel-simon.workers.dev/solve";

const chat = document.getElementById("chat");
const form = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const clearButton = document.getElementById("clear-button");
const statusDiv = document.getElementById("status");

let messages = [];

function addMessage(role, content) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}`;

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "message-bubble";
  bubbleEl.textContent = content;

  messageEl.appendChild(bubbleEl);
  chat.appendChild(messageEl);
  chat.scrollTop = chat.scrollHeight;
}

function resetChat() {
  messages = [];
  chat.innerHTML = `
    <div class="message assistant">
      <div class="message-bubble">
        Hi! I’m your math tutor. Ask me a math question, and I’ll help guide you step by step instead of just giving the answer.
      </div>
    </div>
  `;
  statusDiv.textContent = "";
  statusDiv.classList.remove("error");
}

clearButton.addEventListener("click", resetChat);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = userInput.value.trim();

  if (!text) {
    statusDiv.textContent = "Please enter a math question.";
    statusDiv.classList.add("error");
    return;
  }

  addMessage("user", text);
  messages.push({
    role: "user",
    content: text
  });

  userInput.value = "";
  statusDiv.textContent = "Tutor is thinking...";
  statusDiv.classList.remove("error");
  sendButton.disabled = true;
  clearButton.disabled = true;
  sendButton.textContent = "Sending...";

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ messages })
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Invalid server response.");
    }

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    const answer = data.answer || "I’m sorry, I couldn’t generate a response.";
    addMessage("assistant", answer);

    messages.push({
      role: "assistant",
      content: answer
    });

    statusDiv.textContent = "Done.";
  } catch (error) {
    statusDiv.textContent = "Error: " + error.message;
    statusDiv.classList.add("error");
    addMessage("assistant", "Sorry — something went wrong. Please try again.");
  } finally {
    sendButton.disabled = false;
    clearButton.disabled = false;
    sendButton.textContent = "Send";
    userInput.focus();
  }
});

resetChat();

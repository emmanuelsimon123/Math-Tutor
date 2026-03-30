const WORKER_URL = "https://ai-math-tutor-worker.emmanuel-simon.workers.dev/solve";

const chat = document.getElementById("chat");
const form = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const clearButton = document.getElementById("clear-button");
const statusDiv = document.getElementById("status");

// Maximum number of messages to send to the API to avoid token limits.
const MAX_HISTORY = 20;

let messages = [];

/**
 * Appends a chat bubble to the chat section.
 * For assistant messages, KaTeX auto-render is applied so math expressions
 * like $x^2$ (inline) or $$...$$ (display) are rendered as proper notation.
 */
function addMessage(role, content) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}`;

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "message-bubble";

  if (role === "assistant") {
    // Set text first, then let KaTeX auto-render replace math delimiters.
    bubbleEl.textContent = content;
    // renderMathInElement is loaded via the KaTeX auto-render CDN script.
    if (typeof renderMathInElement === "function") {
      renderMathInElement(bubbleEl, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$",  right: "$",  display: false },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false }
        ],
        throwOnError: false
      });
    }
  } else {
    // User messages are always plain text.
    bubbleEl.textContent = content;
  }

  messageEl.appendChild(bubbleEl);
  chat.appendChild(messageEl);
  chat.scrollTop = chat.scrollHeight;
}

/**
 * Resets the chat to its initial welcome state using safe DOM methods
 * (no innerHTML) to avoid any future XSS risk.
 */
function resetChat() {
  messages = [];

  // Clear the chat and rebuild the initial welcome message safely.
  while (chat.firstChild) {
    chat.removeChild(chat.firstChild);
  }

  const welcomeEl = document.createElement("div");
  welcomeEl.className = "message assistant";

  const welcomeBubble = document.createElement("div");
  welcomeBubble.className = "message-bubble";
  welcomeBubble.textContent =
    "Hi! I'm your math tutor. Ask me a math question, and I'll help guide you step by step instead of just giving the answer.";

  welcomeEl.appendChild(welcomeBubble);
  chat.appendChild(welcomeEl);

  statusDiv.textContent = "";
  statusDiv.classList.remove("error");
}

clearButton.addEventListener("click", resetChat);

// Math symbol toolbar: insert symbol/template at cursor position in the textarea.
document.getElementById("math-toolbar").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-insert]");
  if (!button) return;

  const insertText = button.dataset.insert;
  const cursorOffset = button.dataset.cursorOffset ? parseInt(button.dataset.cursorOffset, 10) : 0;
  const start = userInput.selectionStart;
  const end = userInput.selectionEnd;

  userInput.value =
    userInput.value.slice(0, start) + insertText + userInput.value.slice(end);

  const newCursor = start + insertText.length + cursorOffset;
  userInput.setSelectionRange(newCursor, newCursor);
  userInput.focus();
});

// Keyboard shortcut: Ctrl+Enter or Cmd+Enter submits the form.
userInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

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

  // Cap the history sent to the API to the most recent MAX_HISTORY messages
  // to avoid exceeding token limits. The full local array is kept for display.
  const trimmedMessages = messages.slice(-MAX_HISTORY);

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ messages: trimmedMessages })
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

    const answer = data.answer || "I'm sorry, I couldn't generate a response.";
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

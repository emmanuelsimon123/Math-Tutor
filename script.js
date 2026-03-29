const WORKER_URL = "https://ai-math-tutor-worker.emmanuel-simon.workers.dev/solve";

const form = document.getElementById("solver-form");
const problemInput = document.getElementById("problem");
const problemLabel = document.getElementById("problem-label");
const modeHelp = document.getElementById("mode-help");
const modeInput = document.getElementById("mode");
const detailInput = document.getElementById("detail");
const solveButton = document.getElementById("solve-button");
const statusDiv = document.getElementById("status");
const responseDiv = document.getElementById("response");

function updateModeUI() {
  const mode = modeInput.value;

  if (mode === "steps") {
    problemLabel.textContent = "Enter your math problem";
    modeHelp.textContent = "Type the math problem you want solved step by step.";
    problemInput.placeholder = "Example: Solve for x: 2x^2 - 5x - 3 = 0";
  } else if (mode === "hint") {
    problemLabel.textContent = "Enter your math problem";
    modeHelp.textContent = "Type the problem you want help starting. The tutor will give hints instead of the full solution.";
    problemInput.placeholder = "Example: How do I start solving 3x + 7 = 22?";
  } else if (mode === "tutor") {
    problemLabel.textContent = "Ask a math question";
    modeHelp.textContent = "Ask for a concept explanation or help understanding a topic.";
    problemInput.placeholder = "Example: Can you explain how to find the slope of a line?";
  } else if (mode === "check") {
    problemLabel.textContent = "Paste the problem and the student's answer/work";
    modeHelp.textContent = "Include both the original problem and the student's answer or work so the tutor can check it.";
    problemInput.placeholder = "Example:\nProblem: Solve 2x + 3 = 11\nStudent answer: x = 5 because 2(5)+3=11";
  }
}

modeInput.addEventListener("change", updateModeUI);
updateModeUI();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const problem = problemInput.value.trim();
  const mode = modeInput.value;
  const detail = detailInput.value;

  if (!problem) {
    statusDiv.textContent = "Please enter a math problem.";
    statusDiv.classList.add("error");
    return;
  }

  statusDiv.textContent = "Solving...";
  statusDiv.classList.remove("error");
  responseDiv.textContent = "";
  solveButton.disabled = true;
  solveButton.textContent = "Solving...";

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        problem,
        mode,
        detail
      })
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

    responseDiv.textContent = data.answer || "No response received.";
    statusDiv.textContent = "Done.";
  } catch (error) {
    statusDiv.textContent = "Error: " + error.message;
    statusDiv.classList.add("error");
    responseDiv.textContent = "Please try again.";
  } finally {
    solveButton.disabled = false;
    solveButton.textContent = "Solve";
  }
});

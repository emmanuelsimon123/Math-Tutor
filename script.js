const WORKER_URL = "https://ai-math-tutor-worker.emmanuel-simon.workers.dev/solve";

const form = document.getElementById("solver-form");
const problemInput = document.getElementById("problem");
const modeInput = document.getElementById("mode");
const detailInput = document.getElementById("detail");
const solveButton = document.getElementById("solve-button");
const statusDiv = document.getElementById("status");
const responseDiv = document.getElementById("response");

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

    const data = await response.json();

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
  }
});

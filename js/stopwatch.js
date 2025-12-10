let stopwatchInterval = null;
let timeElapsed = 0;

async function initStopwatch() {
  const { currentProject } = await getProjects();
  if (!currentProject) {
    alert("Current project not found")
  }
  timeElapsed = currentProject.workTime || 0;
  startStopwatch(timeElapsed);
}

function createStopwatchElement() {
  let el = document.getElementById('stopwatch');
  if (!el) {
    el = document.createElement('div');
    el.id = 'stopwatch';
    el.style.position = "fixed";
    el.style.bottom = "20px";
    el.style.right = "20px";
    el.style.background = "rgba(0,0,0,0.7)";
    el.style.color = "white";
    el.style.padding = "10px 15px";
    el.style.borderRadius = "8px";
    el.style.fontSize = "16px";
    el.style.zIndex = 9999;
    document.body.appendChild(el);
  }
  return el;
}

async function getProjects() {
  const {projects = []} = await chrome.storage.sync.get("projects");
  console.log(projects)
  const currentUrl = 'johngraydev.com'
  const currentProject = projects.find((p) => p.workplaceUrl === currentUrl)
  return {projects, currentProject}
}

function updateDisplay() {
  const el = createStopwatchElement();
  el.textContent = `Time elapsed: ${timeElapsed}`;
}

async function startStopwatch() {
  clearInterval(stopwatchInterval);
  updateDisplay();

  stopwatchInterval = setInterval(() => {
    timeElapsed++;
    console.log(timeElapsed);
    updateDisplay();
    if (remainingTime <= 0) {
      clearInterval(stopwatchInterval);
      stopwatchInterval = null;
    }
  }, 1000)
}

async function stopTimer(secondsAtStop) {
  const {projects, currentProject} = await getProjects()
  clearInterval(stopwatchInterval)
  const workTime = secondsAtStop;
  const data = {workTime};
  Object.assign(currentProject, data)

  try {
    chrome.storage.sync.set({projects: projects})
  } catch (error) {
    console.error("Error saving worktime", error);
  }

  updateDisplay()
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "initStopwatch") {
    initStopwatch();
    console.log("stopwatch init")
  }
})

function sendVisiblePreBlockToWindow(filename) {
  const text = getVisiblePreBlockText();
  if (text === null) {
    return;
  }

  sendFileContentToWindow(filename, text);
}

function getVisiblePreBlockText() {
  const chatMessages = document
    .getElementById("chat")
    .querySelector("shiny-chat-messages");

  const visibleBlocks = getVisiblePreBlocks(chatMessages);

  if (visibleBlocks.length === 0) {
    return null;
  }

  return visibleBlocks[0].textContent;
}

// Get all <pre> blocks in an element that are currently visible
function getVisiblePreBlocks(el) {
  if (!el) {
    el = document;
  }

  const preBlocks = document.querySelectorAll("pre");

  // Array to store visible code blocks
  const visiblePreBlocks = [];

  preBlocks.forEach((block) => {
    const rect = block.getBoundingClientRect();
    const containerRect = block
      .closest(".scrollable-container")
      ?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };

    // Check if the block is visible within the viewport and its container
    if (
      rect.top < containerRect.bottom &&
      rect.bottom > containerRect.top &&
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    ) {
      visiblePreBlocks.push(block);
    }
  });

  return visiblePreBlocks;
}

function sendFileContentToWindow(filename, msg) {
  document.getElementById("shinylive-panel").contentWindow.postMessage(
    {
      type: "message",
      sender: "app-writer-parent",
      text: "Hello, world!",
      files: [
        {
          name: filename,
          content: msg,
          type: "text",
        },
      ],
    },
    "*"
  );
}

// =====================================================================================
// Code for saving/loading language switch state to localStorage
// =====================================================================================
const LANGUAGE_SWITCH_ID = "language_switch";

function saveCheckboxState(id, value) {
  localStorage.setItem(id, value);
}

function loadCheckboxState(id) {
  return localStorage.getItem(id) === "true";
}

$(document).on("shiny:connected", function () {
  // Load checkbox state when app initializes
  var savedState = loadCheckboxState(LANGUAGE_SWITCH_ID);
  if (savedState !== null) {
    Shiny.setInputValue(LANGUAGE_SWITCH_ID, savedState);
    $("#" + LANGUAGE_SWITCH_ID).prop("checked", savedState);
  }
});
$(document).on("shiny:inputchanged", function (e) {
  if (e.name === LANGUAGE_SWITCH_ID) {
    saveCheckboxState(e.name, e.value);
  }
});

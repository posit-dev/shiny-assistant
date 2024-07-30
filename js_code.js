function chatMessagesContainer() {
  return document.getElementById("chat");
}

function sendVisiblePreBlockToWindow(filename) {
  const text = getVisiblePreBlockText();
  if (text === null) {
    return;
  }

  sendFileContentToWindow(filename, text);
}

function getVisiblePreBlockText() {
  const visibleBlocks = getVisiblePreBlocks(chatMessagesContainer());

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

  const preBlocks = chatMessagesContainer().querySelectorAll("pre");

  // Array to store visible code blocks
  const visiblePreBlocks = [];

  preBlocks.forEach((block) => {
    if (isElementInViewport(block, chatMessagesContainer())) {
      visiblePreBlocks.push(block);
    }
  });

  return visiblePreBlocks;
}

// =====================================================================================
// Functions for setting up button visibility based on visible code blocks
// =====================================================================================

function isElementInViewport(el, container) {
  const rect = el.getBoundingClientRect();
  const containerRect = container?.getBoundingClientRect() || {
    top: 0,
    bottom: window.innerHeight,
  };

  // Check if the block is visible within the viewport and its container
  if (
    rect.top < containerRect.bottom &&
    rect.bottom > containerRect.top &&
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  ) {
    return true;
  }
  return false;
}

function updateConditionalButtonVisibility() {
  const preBlocks = document.querySelectorAll("pre");
  const visiblePreBlocks = [];

  preBlocks.forEach((block) => {
    if (isElementInViewport(block, chatMessagesContainer())) {
      visiblePreBlocks.push(block);
    }
  });

  button = document.getElementById("run_button_ui");
  if (visiblePreBlocks.length > 0) {
    button.classList.remove("hidden");
  } else {
    button.classList.add("hidden");
  }
}

function throttle(func, limit) {
  let inThrottle;
  return function () {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// TODO: Replace this with Shiny.initializePromise when that lands in Shiny for Python
$(document).on("shiny:sessioninitialized", function (event) {
  setTimeout(() => {
    updateConditionalButtonVisibility();
    const throttledUpdate = throttle(updateConditionalButtonVisibility, 100);

    // Event listeners
    window.addEventListener("scroll", throttledUpdate);
    window.addEventListener("resize", throttledUpdate);

    chatMessagesContainer().addEventListener("scroll", throttledUpdate);

    // Use ResizeObserver for container resizing
    const resizeObserver = new ResizeObserver(throttledUpdate);
    resizeObserver.observe(chatMessagesContainer());

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === "PRE") {
              updateConditionalButtonVisibility();
            }
          });
        }
      });
    });
    mutationObserver.observe(chatMessagesContainer(), {
      childList: true,
      subtree: true,
    });

    // When the user clicks on the send button, request the latest version of the files
    // from the shinylive iframe. This communication is async, so the file contents will
    // arrive later on the server side than the user chat message.
    chatMessagesContainer().addEventListener(
      "shiny-chat-input-sent",
      async (e) => {
        const fileContents = await requestFileContentsFromWindow();
        fileContents.files.forEach((fileContent) => {
          if (["app.py", "app.R"].includes(fileContent.name)) {
            Shiny.setInputValue("editor_code", fileContent.content, {
              priority: "event",
            });
          }
        });
      }
    );

    // Receive custom message with app code and send to the shinylive panel.
    Shiny.addCustomMessageHandler("set-shinylive-content", function (message) {
      sendFileContentToWindow(
        "app." + currentLanguageExtension(),
        message.content
      );
    });
  }, 100);
});

// =====================================================================================
// Functions for sending/requesting files from shinylive panel
// =====================================================================================

function sendFileContentToWindow(filename, msg) {
  document.getElementById("shinylive-panel").contentWindow.postMessage(
    {
      type: "setFiles",
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

function requestFileContentsFromWindow() {
  const reply = sendMessageAndGetReply(
    document.getElementById("shinylive-panel").contentWindow,
    { type: "getFiles" }
  );

  return reply;
}

function postMessageAndWaitForReply(targetWindow, message) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    targetWindow.postMessage(message, "*", [channel.port2]);
  });
}

async function sendMessageAndGetReply(targetWindow, message) {
  const reply = await postMessageAndWaitForReply(targetWindow, message);
  // console.log("Received reply:", reply);
  return reply;
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

// =====================================================================================
// Misc utility functions
// =====================================================================================

function currentLanguage() {
  const languageSwitch = document.getElementById("language_switch");
  if (languageSwitch.checked) {
    return "r";
  } else {
    return "python";
  }
}

function currentLanguageExtension() {
  if (currentLanguage() === "r") {
    return "R";
  } else {
    return "py";
  }
}

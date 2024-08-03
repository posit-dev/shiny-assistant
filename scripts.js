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
    messageTriggerCounter = 0;
    chatMessagesContainer().addEventListener(
      "shiny-chat-input-sent",
      async (e) => {
        const fileContents = await requestFileContentsFromWindow();
        fileContents.files.forEach((fileContent) => {
          if (["app.py", "app.R"].includes(fileContent.name)) {
            Shiny.setInputValue("editor_code", fileContent.content, {
              priority: "event",
            });
            // This can be removed once we fix
            // https://github.com/posit-dev/py-shiny/issues/1600
            Shiny.setInputValue("message_trigger", messageTriggerCounter++);
          }
        });
      }
    );

    // Receive custom message with app code and send to the shinylive panel.
    Shiny.addCustomMessageHandler("set-shinylive-content", function (message) {
      sendFileContentsToWindow(message.files);
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

function sendFileContentsToWindow(fileContents) {
  document.getElementById("shinylive-panel").contentWindow.postMessage(
    {
      type: "setFiles",
      files: fileContents,
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

// =====================================================================================
// Recovery code
// =====================================================================================

// Client mirror of server side chat history state
let chat_history = [];

// Server sends this on new user input or assistant response
Shiny.addCustomMessageHandler("sync-chat-messages", (msg) => {
  chat_history.push(...msg.messages);
});

$(document).on("shiny:disconnected", async () => {
  // On disconnect, we save all the state needed for restoration to the URL hash
  // and update the URL immediately. This way, the user can either hit Reload,
  // or click the Reconnect button, and either way they'll get back to the same
  // state.
  //
  // The restore state starts out as two pieces of JSON that look like:
  //
  // chat_history =
  //   [
  //     { "role": "user", "content": "Hello" },
  //     { "role": "assistant", "content": "Certainly! I can help you with that." }
  //   ];
  //
  // files =
  //   [
  //     { "name": "app.py", "content": "print('Hello, world!')" }
  //   ]
  // }
  //
  // Each value is JSONified, base64 encoded, and then turned into query string
  // pairs. The final URL looks like:
  // #chat_history=<base64>&files=<base64>

  // We can save the chat history immediately, since we already have the data.
  // Go ahead and do that, in case something goes wrong with the (much more
  // complicated) process to get the file data.
  let hash =
    "#chat_history=" +
    encodeURIComponent(encodeToBase64(JSON.stringify(chat_history)));
  window.location.hash = hash;

  try {
    // If we successfully get the code from the shinylive panel, we'll add that
    // to the hash as well.
    const fileContents = await requestFileContentsFromWindow();
    hash +=
      "&files=" +
      encodeURIComponent(encodeToBase64(JSON.stringify(fileContents.files)));
    window.location.hash = hash;
  } catch (e) {
    console.error("Failed to get file contents from shinylive panel", e);
  }

  // Now that we're done updating the hash, we can show the reconnect modal to
  // encourage the user to reconnect.
  const template = document.querySelector("template#custom_reconnect_modal");
  const clone = document.importNode(template.content, true);
  document.body.appendChild(clone);
});

$(document).on("click", "#custom-reconnect-link", () => {
  window.location.reload();
});

const shinyliveReadyPromise = new Promise((resolve) => {
  window.addEventListener("message", (event) => {
    if (event.data.type === "shinyliveReady") {
      resolve();
    }
  });
});

// Now restore shinylive file contents from window.location.hash, if any. (We
// don't need to worry about restoring the chat history here; that's being
// handled by the server, which always has access to the initial value of
// window.location.hash.)
async function restoreFileContents() {
  // Drop "#" from hash
  let hash = window.location.hash?.replace(/^#/, "");
  if (!hash) {
    return;
  }
  const params = new URLSearchParams(hash);
  if (!params.has("files")) {
    return;
  }
  // Wait for shinylive to come online
  await shinyliveReadyPromise;
  const files = JSON.parse(
    decodeFromBase64(decodeURIComponent(params.get("files")))
  );
  files.forEach((file) => {
    console.log("Restoring file content:", file.name);
    sendFileContentToWindow(file.name, file.content);
  });
  window.location.hash = "";
}
restoreFileContents().catch((err) => {
  console.error("Failed to restore", err);
});

// =====================================================================================
// Unicode-aware base64 encoding/decoding
// =====================================================================================

function encodeToBase64(str) {
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(str);
  return btoa(String.fromCharCode.apply(null, uint8Array));
}

function decodeFromBase64(base64) {
  const binaryString = atob(base64);
  const uint8Array = Uint8Array.from(binaryString, (char) =>
    char.charCodeAt(0)
  );
  const decoder = new TextDecoder();
  return decoder.decode(uint8Array);
}

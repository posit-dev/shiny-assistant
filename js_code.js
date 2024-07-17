function sendVisiblePreBlockToWindow() {
  const text = getVisiblePreBlockText();
  if (text === null) {
    return;
  }

  sendMessageToWindow(text);
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

function sendMessageToWindow(msg) {
  document.getElementById("shinylive-panel").contentWindow.postMessage(
    {
      type: "message",
      sender: "app-writer-parent",
      text: "Hello, world!",
      files: [
        {
          name: "app.py",
          // content: "from shiny.express import ui\n\nui.div('Hello, world!')",
          content: msg,
          type: "text",
        },
      ],
    },
    "*"
  );
}

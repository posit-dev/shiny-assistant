function getInputText() {
  // return document.getElementById("chat_user_input").value;
  return document
    .getElementById("chat")
    .querySelector("shiny-chat-messages")
    .lastChild.querySelector("pre").innerText;
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

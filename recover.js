let chat_history = [];

Shiny.addCustomMessageHandler("sync_chat_messages", (messages) => {
  chat_history.push(...messages);
  console.log(messages);
});

$(document).on("shiny:disconnected", () => {
  console.log(
    "#chat_history=" + encodeURIComponent(btoa(JSON.stringify(chat_history)))
  );
  const template = document.querySelector("template#custom_reconnect_modal");
  const clone = document.importNode(template.content, true);
  const link = clone.querySelector("#custom-reconnect-link");
  debugger;
  link.addEventListener("click", () => {
    // Form complete URL from current location, replacing only the hash
    window.location.hash =
      "#chat_history=" + encodeURIComponent(btoa(JSON.stringify(chat_history)));
    window.location.reload();
  });
  document.body.appendChild(clone);
});

$(document).on("shiny:connected", () => {
  window.location.hash = "";
});

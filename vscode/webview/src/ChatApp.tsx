import React, { useEffect, useRef, useState } from "react";
import type { Message } from "../../src/extension";

const SendIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    stroke="currentColor"
    fill="none"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 2L11 13" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
  </svg>
);

const vscode = acquireVsCodeApi();

vscode.postMessage({ type: "getState" });

// Receive messages from the extension
window.addEventListener("message", (event) => {
  const message = event.data; // The JSON data our extension sent

  console.log(event);
  console.log("Webview received message: ", message);
});

// Send messages to the extension
const sendMessageToExtension = (message: string) => {
  vscode.postMessage({ type: "userMessage", content: message });
};

const ChatMessage = ({
  message,
  role,
}: {
  message: string;
  role: "assistant" | "user";
}) => {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`rounded-lg px-4 py-2 max-w-[80%] ${
          isUser ? "bg-blue-500 text-white" : "bg-gray-100"
        }`}
      >
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
};

const ChatApp = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    // messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Event listener for messages from extension
    const messageHandler = (event: MessageEvent) => {
      const msg = event.data;

      if (msg.type === "currentState") {
        console.log("Received current state: ", msg.data);
        setMessages(msg.data.messages);
        // If the last message is _not_ a user message, set isThinking to false.
        if (
          msg.data.messages &&
          msg.data.messages[msg.data.messages.length - 1].role !== "user"
        ) {
          setIsThinking(false);
        }
      } else {
        console.log("Webview received message: ", msg);
      }
    };

    window.addEventListener("message", messageHandler);

    // Cleanup function to remove event listener
    return () => {
      window.removeEventListener("message", messageHandler);
    };
  }, [messages]);

  const sendMessage = () => {
    if (!inputText.trim()) return;

    const userInputMessage: Message = {
      content: inputText,
      role: "user",
    };

    // Add user message
    const newMessages: Array<Message> = [...messages, userInputMessage];
    console.log("setting messages from input", newMessages);
    setMessages(newMessages);
    setInputText("");
    setIsThinking(true);

    sendMessageToExtension(inputText);
    vscode.postMessage({ type: "newUserMessage", content: userInputMessage });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendMessage();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <div className="h-96 overflow-y-auto mb-4 p-4">
        {messages
          .filter((message) => {
            return message.role === "user" || message.role === "assistant";
          })
          .map((message, index) => {
            return (
              <ChatMessage
                key={index}
                message={message.content}
                role={message.role as "assistant" | "user"}
              />
            );
          })}
        {isThinking && (
          <div className="text-sm text-gray-500 italic">Bot is thinking...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={sendMessage}
          className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          disabled={!inputText.trim()}
        >
          <SendIcon />
        </button>
      </form>
    </>
  );
};

export default ChatApp;

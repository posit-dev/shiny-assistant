import React, { useEffect, useRef, useState } from "react";
import type { Message, ToWebviewStateMessage } from "../../src/extension";

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
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`px-2 py-1 ${isUser ? "msg-user rounded-sm" : "msg-assistant"}`}
      >
        <p>{message}</p>
      </div>
    </div>
  );
};

const ChatApp = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasUserMessages = messages.some((message) => message.role === "user");

  useEffect(() => {
    if (textareaRef.current) {
      adjustTextareaHeight(textareaRef.current);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Event listener for messages from extension
    const messageHandler = (event: MessageEvent) => {
      const msg = event.data;

      if (msg.type === "currentState") {
        const data = msg.data as ToWebviewStateMessage;
        setMessages(data.messages);
        setHasApiKey(data.hasApiKey);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
    element.style.height = "1px";
    element.style.height = `${element.scrollHeight + 2}px`;
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    adjustTextareaHeight(e.target);
  };

  return (
    <div
      className={`flex flex-col h-full p-1 pt-2 ${hasUserMessages ? "" : "justify-start"}`}
    >
      {!hasApiKey ? (
        <div className="text-center p-4">
          <p>
            To use Shiny Assistant, please set your Anthropic API key in VS Code
            settings:
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Settings → Extensions → Shiny Assistant → Anthropic API Key
          </p>
        </div>
      ) : (
        <>
          {hasUserMessages && (
            <div className={"flex-1 overflow-y-auto"}>
              {messages
                .filter((message) => {
                  return (
                    message.role === "user" || message.role === "assistant"
                  );
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
                <div className="text-gray-500 italic">Bot is thinking...</div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          <form onSubmit={handleSubmit} className={`flex gap-1`}>
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="flex-1 px-2 py-1 rounded-sm input-textbox"
              rows={1}
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={sendMessage}
                className="p-1 input-send-button rounded-sm"
                disabled={!inputText.trim()}
              >
                <SendIcon />
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default ChatApp;

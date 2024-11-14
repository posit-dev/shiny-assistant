import React, { useState, useRef, useEffect } from "react";

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
  isUser,
}: {
  message: string;
  isUser: boolean;
}) => (
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

const ChatApp = () => {
  const [messages, setMessages] = useState([
    { text: "Hello! I'm a simple chat bot. Try saying hello!", isUser: false },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    // messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateResponse = (input: string) => {
    const lowerInput = input.toLowerCase();

    // Basic response patterns
    if (lowerInput.includes("hello") || lowerInput.includes("hi")) {
      return "👋 Hello! Nice to meet you!";
    }
    if (lowerInput.includes("how are you")) {
      return "I'm doing well, thank you for asking! How about you?";
    }
    if (lowerInput.includes("weather")) {
      return "I'm sorry, I can't check the actual weather, but I hope it's nice where you are!";
    }
    if (lowerInput.includes("name")) {
      return "I'm ChatBot, a simple demonstration AI!";
    }
    if (lowerInput.includes("bye") || lowerInput.includes("goodbye")) {
      return "Goodbye! Have a great day! 👋";
    }

    // Default response formats
    const responses = [
      `You said: "${input}"`,
      `I received your message: "${input}"`,
      `Here's what you typed: "${input}"`,
      `Your message was: "${input}"`,
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  };

  const sendMessage = () => {
    if (!inputText.trim()) return;

    // Add user message
    const newMessages = [...messages, { text: inputText, isUser: true }];
    setMessages(newMessages);
    setInputText("");
    setIsTyping(true);

    sendMessageToExtension(inputText);

    // Simulate AI response with typing delay
    setTimeout(() => {
      const response = generateResponse(inputText);
      setMessages((prev) => [...prev, { text: response, isUser: false }]);
      setIsTyping(false);
    }, 1000);
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
        {messages.map((message, index) => (
          <ChatMessage
            key={index}
            message={message.text}
            isUser={message.isUser}
          />
        ))}
        {isTyping && (
          <div className="text-sm text-gray-500 italic">Bot is typing...</div>
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

import * as vscode from "vscode";

console.log("Shiny Assistant extension loaded");

export type Message = {
  role: "system" | "assistant" | "user";
  content: string;
};

export type State = {
  messages: Array<Message>;
};

const newChatMessages: Array<Message> = [
  { role: "system", content: "You are a helpful assistant." },
];

let state: State = {
  messages: structuredClone(newChatMessages),
};

export function activate(context: vscode.ExtensionContext) {
  console.log("Shiny Assistant activated");

  // Load saved state or use default
  state = context.globalState.get<State>("chatState") || state;

  const provider = new ShinyAssistantViewProvider(
    context.extensionUri,
    context,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("shiny-assistant.view", provider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("shiny-assistant.sendMessage", () => {
      provider.sendMessage("Hello from Shiny Assistant!");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("shiny-assistant.clearChat", () => {
      provider.clearChat();
    }),
  );
}

export function deactivate(context: vscode.ExtensionContext) {
  // Save state on deactivation
  context.globalState.update("chatState", state);
  console.log("Shiny Assistant deactivated");
}

class ShinyAssistantViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "shiny-assistant.view";
  public _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.onDidChangeVisibility(() => {
      console.log("Shiny Assistant webview visibility changed");
    });

    webviewView.onDidDispose(() => {
      console.log("Shiny Assistant webview disposed");
    });

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message) => {
        if (message.type === "getState") {
          webviewView.webview.postMessage({
            type: "currentState",
            data: state,
          });
        } else if (message.type === "userMessage") {
          state.messages.push({ role: "user", content: message.content });
          this.context.globalState.update("chatState", state);

          // Simulate AI response with typing delay
          setTimeout(() => {
            const response = generateResponse(message.content);
            state.messages.push({ role: "assistant", content: response });
            this.context.globalState.update("chatState", state);
            this.sendCurrentState();
          }, 1000);
        }
        console.log("Shiny Assistant extension received message: ", message);
      },
      undefined,
      this.context.subscriptions,
    );
  }

  public sendMessage(message: string) {
    this._view?.webview.postMessage(message);
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    const scriptPathOnDisk = vscode.Uri.joinPath(
      this.extensionUri,
      "dist",
      "webview",
      "main.js",
    );
    const stylePathOnDisk = vscode.Uri.joinPath(
      this.extensionUri,
      "dist",
      "webview",
      "main.css",
    );

    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
    const styleUri = webview.asWebviewUri(stylePathOnDisk);

    // Update the CSP to include necessary permissions for React
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `connect-src ${webview.cspSource} https:`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en" style="height: 100%">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Shiny Assistant</title>
    <link href="${styleUri}" rel="stylesheet">
    <style>
      body {
        padding: 0;
        margin: 0;
        height: 100%;
      }
      #root {
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  public clearChat() {
    state.messages = structuredClone(newChatMessages);
    this.context.globalState.update("chatState", state);

    this.sendCurrentState();
  }

  public sendCurrentState() {
    this._view?.webview.postMessage({
      type: "currentState",
      data: state,
    });
  }
}

// ========================================================
// Utility functions
// ========================================================
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

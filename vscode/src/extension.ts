import Anthropic from "@anthropic-ai/sdk";
import type {
  Model,
  TextBlock,
  TextDelta,
} from "@anthropic-ai/sdk/resources/messages";
import * as vscode from "vscode";

export type Message = {
  role: "assistant" | "user";
  content: string;
};

// The state of the extension
type ExtensionState = {
  messages: Array<Message>;
  anthropicApiKey: string;
};

// The state that is persisted across restarts.
type ExtensionSaveState = {
  messages: Array<Message>;
};

// The state that is sent to the webview. This is a subset of the extension
// state. In the future it might not be a strict subset; it might have some
// different information, like if the user's view of the messages is different
// from the actual messages sent to the LLM.
export type ToWebviewStateMessage = {
  messages: Array<Message>;
  hasApiKey: boolean;
};

const systemPrompt = `You are a coding assistant that generates Python code.

You are given a user's prompt and a codebase.

You will generate Python code that satisfies the user's prompt.

Put the generated code in triple backticks.
`;

// The chat messages that are shown with a new chat.
const initialChatMessages: Array<Message> = [];

let state: ExtensionState = {
  messages: structuredClone(initialChatMessages),
  anthropicApiKey: "",
};

export function activate(context: vscode.ExtensionContext) {
  // Load saved state or use default
  state = context.globalState.get<ExtensionState>("savedState") || state;

  // Load API key from configuration
  state.anthropicApiKey =
    vscode.workspace
      .getConfiguration("shinyAssistant")
      .get("anthropicApiKey") || "";

  const provider = new ShinyAssistantViewProvider(
    context.extensionUri,
    context,
  );

  // Add configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("shinyAssistant.anthropicApiKey")) {
        state.anthropicApiKey =
          vscode.workspace
            .getConfiguration("shinyAssistant")
            .get("anthropicApiKey") || "";
        provider.sendCurrentStateToWebView();
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("shiny-assistant.view", provider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("shiny-assistant.clearChat", () => {
      provider.clearChat();
    }),
  );
}

export function deactivate(context: vscode.ExtensionContext) {
  saveState(context);
}

function saveState(context: vscode.ExtensionContext) {
  const saveState: ExtensionSaveState = {
    messages: state.messages,
  };

  context.globalState.update("savedState", saveState);
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
          this.sendCurrentStateToWebView();
        } else if (message.type === "userInput") {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.handleUserInput(message.content);
        } else {
          console.log(
            "Shiny Assistant extension received message with unknown type: ",
            message,
          );
        }
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
    state.messages = structuredClone(initialChatMessages);
    saveState(this.context);

    this.sendCurrentStateToWebView();
  }

  public sendCurrentStateToWebView() {
    const webviewState: ToWebviewStateMessage = {
      messages: state.messages,
      hasApiKey: state.anthropicApiKey !== "",
    };

    this._view?.webview.postMessage({
      type: "currentState",
      data: webviewState,
    });
  }

  private async handleUserInput(message: string) {
    const anthropic = new Anthropic({
      apiKey: state.anthropicApiKey,
    });

    state.messages.push({ role: "user", content: message });
    // Create a placeholder for the assistant's message
    const assistantMessage: Message = { role: "assistant", content: "" };

    try {
      const stream = await anthropic.messages.create({
        model: vscode.workspace
          .getConfiguration("shinyAssistant")
          .get("anthropicModel") as Model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: state.messages,
        stream: true,
      });

      for await (const chunk of stream) {
        // TODO: Check for start and stop events, and also send them along.
        // if chunk is a message delta, update the assistant's message
        if (chunk.type === "content_block_delta") {
          if (chunk.delta.type === "text_delta") {
            assistantMessage.content += chunk.delta.text;
          }
        }

        // Send the streaming update to the webview
        this._view?.webview.postMessage({
          type: "streamContent",
          data: {
            messageIndex: state.messages.length,
            content: assistantMessage.content,
          },
        });
      }

      state.messages.push(assistantMessage);
      saveState(this.context);
    } catch (error) {
      console.error("Error:", error);
      // Handle error appropriately
    }
  }
}

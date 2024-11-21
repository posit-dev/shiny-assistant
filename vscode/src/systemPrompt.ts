import * as fs from "fs/promises";
import * as path from "path";
import type * as vscode from "vscode";

// The system prompt directory relative to the extension
const SYSTEM_PROMPT_DIR = path.join("..", "shinyapp");

interface PromptVariables {
  language: string;
  language_specific_prompt: string;
  verbosity: string;
}

async function loadLanguageSpecificPrompt(
  context: vscode.ExtensionContext,
  language: "r" | "python",
): Promise<string> {
  try {
    const promptPath = path.join(
      context.extensionPath,
      SYSTEM_PROMPT_DIR,
      `app_prompt_${language.toLowerCase()}.md`,
    );
    return await fs.readFile(promptPath, "utf8");
  } catch (error) {
    console.error(`Failed to load ${language}-specific prompt:`, error);
    return "";
  }
}

export async function loadSystemPrompt(
  context: vscode.ExtensionContext,
): Promise<string> {
  try {
    const promptPath = path.join(
      context.extensionPath,
      SYSTEM_PROMPT_DIR,
      "app_prompt.md",
    );
    const promptTemplate = await fs.readFile(promptPath, "utf8");

    // Default to Python for now
    const language = "python";

    // Load language-specific prompt
    const languageSpecificPrompt = await loadLanguageSpecificPrompt(
      context,
      language,
    );

    // Substitute variables
    const variables: PromptVariables = {
      language,
      language_specific_prompt: languageSpecificPrompt,
      verbosity: "",
    };

    return substituteVariables(promptTemplate, variables);
  } catch (error) {
    console.error("Failed to load system prompt:", error);
    // TODO: Use different default prompt
    return "";
  }
}

function substituteVariables(
  template: string,
  variables: PromptVariables,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key as keyof PromptVariables] || match;
  });
}

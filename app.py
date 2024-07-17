import os
from pathlib import Path

from anthropic import AsyncAnthropic
from app_utils import load_dotenv

from shiny.express import ui

load_dotenv()
llm = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


js_file = Path(__file__).parent / "js_code.js"
with open(js_file, "r") as f:
    js_code = f.read()

app_prompt_file = Path(__file__).parent / "app_prompt.md"
with open(app_prompt_file, "r") as f:
    app_prompt = f.read()


ui.page_opts(fillable=True)

ui.tags.script(js_code)

ui.head_content(
    ui.tags.style(
        """
.bslib-sidebar-layout > .main {
  padding: 0;
}
"""
    )
)

with ui.sidebar(
    open="desktop", width=400, style="height: 100%;", gap="3px", padding="3px"
):
    ui.tags.button(
        "Run code",
        style="margin: 10px 80px;",
        onclick="sendMessageToWindow(getInputText())",
    )

    chat = ui.Chat(
        "chat",
        messages=[],
    )
    chat.ui(height="100%")

    @chat.on_user_submit
    async def perform_chat():
        messages = chat.messages(token_limits=(8000, 2000), format="anthropic")
        print(messages)
        # Create a response message stream
        response = await llm.messages.create(
            model="claude-3-5-sonnet-20240620",
            system=app_prompt,
            messages=messages,
            stream=True,
            max_tokens=2000,
        )
        # Append the response stream into the chat
        await chat.append_message_stream(response)


ui.tags.iframe(
    id="shinylive-panel",
    src="https://posit-dev.github.io/shinylive/py/editor/#code=NobwRAdghgtgpmAXGKAHVA6VBPMAaMAYwHsIAXOcpMASxlWICcyACAZwAsaJsM4APVIzhs2YAL4BdIA",
    style="border: 1px solid black; flex: 1 1 auto;",
)

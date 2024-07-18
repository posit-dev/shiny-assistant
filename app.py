import os
from pathlib import Path

from anthropic import AsyncAnthropic
from app_utils import load_dotenv

from shiny import reactive
from shiny.express import input, render, ui

SHINYLIVE_BASE_URL = "https://posit-dev.github.io/shinylive/"

load_dotenv()
llm = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


js_file = Path(__file__).parent / "js_code.js"
with open(js_file, "r") as f:
    js_code = f.read()

app_prompt_file = Path(__file__).parent / "app_prompt.md"
with open(app_prompt_file, "r") as f:
    app_prompt_template = f.read()


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


@reactive.calc
def app_prompt():
    return app_prompt_template.format(language=language())


with ui.sidebar(
    open="desktop", width=400, style="height: 100%;", gap="3px", padding="3px"
):
    with ui.div():
        switch_tag = ui.input_switch("language_switch", "R", False)
        switch_tag.insert(0, ui.tags.span("Python ", style="padding-right: 0.3em;"))
        switch_tag.children[1].attrs.update({"style": "display: inline-block;"})
        switch_tag

    @render.express
    def run_button_ui():
        file_ext = language()
        if file_ext == "python":
            file_ext = "py"
        elif file_ext == "r":
            file_ext = "R"

        ui.tags.button(
            "Run visible code block",
            style="margin: 10px 80px;",
            onclick=f"sendVisiblePreBlockToWindow('app.{file_ext}')",
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
            system=app_prompt(),
            messages=messages,
            stream=True,
            max_tokens=2000,
        )
        # Append the response stream into the chat
        await chat.append_message_stream(response)


@render.ui
def shinylive_iframe():
    if language() == "python":
        url = (
            SHINYLIVE_BASE_URL
            + "py/editor/#code=NobwRAdghgtgpmAXGKAHVA6VBPMAaMAYwHsIAXOcpMASxlWICcyACAZwAsaJsM4APVIzhs2YAL4BdIA"
        )
    else:
        url = (
            SHINYLIVE_BASE_URL
            + "r/editor/#code=NobwRAdghgtgpmAXGKAHVA6ASmANGAYwHsIAXOMpMAZwAsBLCATwEF0AKAHTG9wAIAZgFcIBUvRLtGqIaX5FZM0gEo+IAL7Kw6gLpA"
        )

    return ui.tags.iframe(
        id="shinylive-panel",
        src=url,
        style="border: 1px solid black; flex: 1 1 auto;",
    )


@reactive.calc
def language():
    if input.language_switch() == False:
        return "python"
    else:
        return "r"

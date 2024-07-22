import os
from pathlib import Path

from anthropic import AsyncAnthropic
from app_utils import load_dotenv

from shiny import reactive
from shiny.express import input, render, ui

SHINYLIVE_BASE_URL = "https://posit-dev.github.io/shinylive/"

load_dotenv()
llm = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


app_dir = Path(__file__).parent


# Read the contents of a file, where the base path defaults to current dir of this file.
def read_file(filename: Path | str, base_dir: Path = app_dir) -> str:
    with open(base_dir / filename, "r") as f:
        res = f.read()
        return res


js_code = read_file("js_code.js")

app_prompt_template = read_file("app_prompt.md")

app_prompt_extra = {
    "r": "",
    "python": read_file("app_prompt_python.md"),
}


ui.page_opts(fillable=True)

ui.tags.script(js_code)

ui.head_content(
    ui.tags.style(
        """
.bslib-sidebar-layout > .main {
  padding: 0;
}

.hidden {
  visibility: hidden;
}

.sidebar-content {
  position: relative;
}

.run-code-button {
  display: block;
  position: absolute;
  top: 50px;
  left: 60px;
  border: 1px solid black;
  border-radius: 20px;
  padding: 3px 10px;
  z-index: 10;
}

"""
    )
)


@reactive.calc
def app_prompt():
    prompt = app_prompt_template.format(language=language())
    prompt += app_prompt_extra[language()]
    return prompt


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
            "Run code block →",
            class_="run-code-button",
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
        allow="clipboard-write",
    )


@reactive.calc
def language():
    if input.language_switch() == False:
        return "python"
    else:
        return "r"

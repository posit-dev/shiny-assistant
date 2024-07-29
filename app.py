import asyncio
import base64
import json
import os
from pathlib import Path
from urllib.parse import parse_qs

from anthropic import AsyncAnthropic
from app_utils import load_dotenv

from shiny import App, reactive, render, ui

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
recover_code = read_file("recover.js")

app_prompt_template = read_file("app_prompt.md")

app_prompt_language_specific = {
    "r": "",
    "python": read_file("app_prompt_python.md"),
}

switch_tag = ui.input_switch("language_switch", "R", False)
switch_tag.insert(0, ui.tags.span("Python ", style="padding-right: 0.3em;"))
switch_tag.children[1].attrs.update({"style": "display: inline-block;"})
switch_tag


app_ui = ui.page_sidebar(
    ui.sidebar(
        ui.div(switch_tag),
        ui.output_ui("run_button_ui"),
        ui.chat_ui("chat", height="100%"),
        open="desktop",
        width=400,
        style="height: 100%;",
        gap="3px",
        padding="3px",
    ),
    ui.tags.script(js_code),
    ui.tags.script(recover_code),
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
    ),
    ui.output_ui("shinylive_iframe"),
    ui.tags.template(
        ui.modal(
            "You've been disconnected",
            footer=[
                ui.tags.a(
                    "Reconnect",
                    href="#",
                    class_="btn btn-primary",
                    id="custom-reconnect-link",
                )
            ],
            title="Disconnected",
        ),
        id="custom_reconnect_modal",
    ),
    fillable=True,
)


def server(input, output, session):
    @reactive.calc
    def app_prompt():
        prompt = app_prompt_template.format(
            language=language(),
            language_specific_prompt=app_prompt_language_specific[language()],
        )
        return prompt

    @render.ui
    def run_button_ui():
        file_ext = language()
        if file_ext == "python":
            file_ext = "py"
        elif file_ext == "r":
            file_ext = "R"

        return ui.tags.button(
            "Run code block →",
            class_="run-code-button btn btn-primary",
            onclick=f"sendVisiblePreBlockToWindow('app.{file_ext}')",
        )

    restored_messages = []

    def parse_hash(input):
        with reactive.isolate():
            if ".clientdata_url_hash" not in input:
                return {}
            hash = input[".clientdata_url_hash_initial"]()
            if hash == "":
                return {}
            # Remove leading # from qs, if present
            if hash.startswith("#"):
                hash = hash[1:]
            return parse_qs(hash, strict_parsing=True)

    parsed_qs = parse_hash(input)
    if "chat_history" in parsed_qs:
        restored_messages = json.loads(
            base64.b64decode(parsed_qs["chat_history"][0]).decode("utf-8")
        )

    chat = ui.Chat(
        "chat",
        messages=restored_messages,
    )

    async def sync_latest_messages_locked():
        async with reactive.lock():
            await sync_latest_messages()
            await reactive.flush()

    @chat.transform_assistant_response
    async def transform_response(content: str, chunk: str, done: bool):
        if done:
            asyncio.create_task(sync_latest_messages_locked())
        return content

    # @chat.on_user_submit
    # async def perform_chat():
    #     messages = chat.messages(token_limits=(8000, 2000), format="anthropic")

    #     # Create a response message stream
    #     response = await llm.messages.create(
    #         model="claude-3-5-sonnet-20240620",
    #         system=app_prompt(),
    #         messages=messages,
    #         stream=True,
    #         max_tokens=2000,
    #     )
    #     # Append the response stream into the chat
    #     await chat.append_message_stream(response)

    @render.ui
    def shinylive_iframe():
        if language() == "python":
            url = (
                SHINYLIVE_BASE_URL
                + "py/editor/#code=NobwRAdghgtgpmAXGKAHVA6VBPMAaMAYwHsIAXOcpMMAXwF0g"
            )
        else:
            url = (
                SHINYLIVE_BASE_URL
                + "r/editor/#code=NobwRAdghgtgpmAXGKAHVA6ASmANGAYwHsIAXOMpMMAXwF0g"
            )

        return ui.tags.iframe(
            id="shinylive-panel",
            src=url,
            style="border: 1px solid black; flex: 1 1 auto;",
            allow="clipboard-write",
        )

    # TODO: Instead of using this hack for submitting submitting editor content.
    @reactive.effect
    @reactive.event(input.editor_code)
    async def print_editor_code():
        messages = chat.messages(token_limits=(8000, 2000), format="anthropic")
        messages[-1][
            "content"
        ] = f"""

The following code is the current state of the app code. The text that comes after this
app code might ask you to modify this code. If it does, please modify the code. If the
text does not ask you to modify the code, then ignore the code.

```
{input.editor_code()}
```

{ messages[-1]["content"] }
"""
        print(messages[-1]["content"])

        await sync_latest_messages()

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

    @reactive.calc
    def language():
        if input.language_switch() == False:
            return "python"
        else:
            return "r"

    last_message_sent = 0

    async def sync_latest_messages():
        nonlocal last_message_sent

        with reactive.isolate():
            messages = chat.messages(
                format="anthropic",
                token_limits=None,
                transform_user="all",
                transform_assistant=False,
            )

        new_messages = messages[last_message_sent:]
        last_message_sent = len(messages)
        if len(new_messages) > 0:
            print(f"Synchronizing {len(new_messages)} messages")
            await session.send_custom_message("sync_chat_messages", new_messages)


app = App(app_ui, server)

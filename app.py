from __future__ import annotations

import asyncio
import base64
import json
import os
import re
from pathlib import Path
from typing import Literal, TypedDict
from urllib.parse import parse_qs

from anthropic import AsyncAnthropic
from app_utils import load_dotenv

from shiny import App, Inputs, Outputs, Session, reactive, render, ui

SHINYLIVE_BASE_URL = "https://shinylive.io/"

load_dotenv()
llm = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


app_dir = Path(__file__).parent


# Read the contents of a file, where the base path defaults to current dir of this file.
def read_file(filename: Path | str, base_dir: Path = app_dir) -> str:
    with open(base_dir / filename, "r") as f:
        res = f.read()
        return res


app_prompt_template = read_file("app_prompt.md")

app_prompt_language_specific = {
    "r": read_file("app_prompt_r.md"),
    "python": read_file("app_prompt_python.md"),
}

switch_tag = ui.input_switch("language_switch", "R", False)
switch_tag.insert(0, ui.tags.span("Python ", style="padding-right: 0.3em;"))
switch_tag.children[1].attrs.update({"style": "display: inline-block;"})


greeting = """
Hello! I'm here to help you with Shiny. You can ask me questions about how to use Shiny,
to explain how certain things work in Shiny, or even ask me to build a Shiny app for
you.

Here are some examples:

- "How do I add a plot to an application?"
- "Create an app that demonstrates a linear regression."
- "Show me how make it so a table will update only after a button is clicked."

Let's get started! 🚀
"""


class FileContent(TypedDict):
    name: str
    content: str
    type: Literal["text", "binary"]


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
    ui.tags.script(read_file("scripts.js")),
    ui.head_content(ui.tags.style(read_file("style.css"))),
    ui.output_ui("shinylive_iframe"),
    ui.tags.template(
        ui.modal(
            "Your session has been disconnected due to inactivity or network "
            "interruption. Click the button below to pick up where you left "
            "off.",
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
    ui.tags.template(
        ui.modal(
            "Please wait while we reconnect...",
            footer=[],
            easy_close=False,
            title="Reconnecting...",
        ),
        id="custom_reconnecting_modal",
    ),
    fillable=True,
)


def server(input: Inputs, output: Outputs, session: Session):
    restoring = True

    @reactive.calc
    def app_prompt() -> str:
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

    restored_messages: list[dict[str, str]] = []

    def parse_hash(input: Inputs) -> dict[str, list[str]]:
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

    # Add a starting message, but only if no messages were restored.
    if len(restored_messages) == 0:
        restored_messages.insert(0, {"role": "assistant", "content": greeting})

    chat = ui.Chat(
        "chat",
        messages=restored_messages,
    )

    async def sync_latest_messages_locked():
        async with reactive.lock():
            await sync_latest_messages()

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

    # TODO: Instead of using this hack for submitting editor content, use
    # @chat.on_user_submit. This will require some changes to the chat component.
    @reactive.effect
    @reactive.event(input.message_trigger)
    async def _send_user_message():
        nonlocal restoring
        restoring = False

        messages = chat.messages(token_limits=(8000, 2000), format="anthropic")
        messages[-1][
            "content"
        ] = f"""
The following is the current app code in JSON format. The text that comes after this app
code might ask you to modify the code. If it does, please modify the code. If the text
does not ask you to modify the code, then ignore the code.

```
{input.editor_code()}
```

{ messages[-1]["content"] }
"""
        print(messages[-1]["content"])

        await sync_latest_messages()

        # Create a response message stream
        response_stream = await llm.messages.create(
            model="claude-3-5-sonnet-20240620",
            system=app_prompt(),
            messages=messages,
            stream=True,
            max_tokens=2000,
        )

        files_in_shinyapp_tags.set(None)

        # Append the response stream into the chat
        await chat.append_message_stream(response_stream)

    # ==================================================================================
    # Code for finding content in the <SHINYAPP> tags and sending to the client
    # ==================================================================================

    files_in_shinyapp_tags: reactive.Value[list[FileContent] | None] = reactive.Value(
        None
    )

    @chat.transform_assistant_response
    async def transform_response(content: str, chunk: str, done: bool) -> str:
        if done:
            asyncio.create_task(sync_latest_messages_locked())

        # TODO: This is inefficient because it does this processing for every chunk,
        # which means it will process the same content multiple times. It would be
        # better to do this incrementally as the content streams in.

        # Only do this when streaming. (We don't to run it when restoring messages,
        # which does not use streaming.)
        if chunk != "":
            async with reactive.lock():
                with reactive.isolate():
                    # The first time we see the </SHINYAPP> tag, set the
                    if files_in_shinyapp_tags() is None and "</SHINYAPP>" in content:
                        files = shinyapp_tag_contents_to_filecontents(content)
                        files_in_shinyapp_tags.set(files)

                await reactive.flush()

        content = content.replace("\n<SHINYAPP>", "")
        content = content.replace("\n</SHINYAPP>", "")
        content = re.sub('\n<FILE NAME="(.*?)">', r"\n```\n## file: \1\n", content)
        content = content.replace("\n</FILE>", "\n```")

        return content

    @reactive.effect
    @reactive.event(files_in_shinyapp_tags)
    async def _send_shinyapp_code():
        # If in the process of restoring from a previous session, don't send the
        # code automatically.
        if restoring:
            return
        if files_in_shinyapp_tags() is None:
            return
        await session.send_custom_message(
            "set-shinylive-content", {"files": files_in_shinyapp_tags()}
        )

    # ==================================================================================
    # Misc utility functions
    # ==================================================================================
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
            await session.send_custom_message(
                "sync-chat-messages", {"messages": new_messages}
            )


def shinyapp_tag_contents_to_filecontents(input: str) -> list[FileContent]:
    """
    Extracts the files and their contents from the <SHINYAPP>...</SHINYAPP> tags in the
    input string.
    """
    # Keep the text between the SHINYAPP tags
    shinyapp_code = re.sub(
        r".*<SHINYAPP>(.*)</SHINYAPP>.*",
        r"\1",
        input,
        flags=re.DOTALL,
    )
    if shinyapp_code.startswith("\n"):
        shinyapp_code = shinyapp_code[1:]

    # Find each <FILE NAME="...">...</FILE> tag and extract the contents and file name
    file_contents: list[FileContent] = []
    for match in re.finditer(r"<FILE NAME=\"(.*?)\">(.*?)</FILE>", input, re.DOTALL):
        name = match.group(1)
        content = match.group(2)
        if content.startswith("\n"):
            content = content[1:]
        file_contents.append({"name": name, "content": content, "type": "text"})

    return file_contents


app = App(app_ui, server)

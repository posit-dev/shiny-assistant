from playwright.sync_api import Page
from shiny.run import ShinyAppProc

from tests.utils import send_message_and_verify


def test_shiny_assistant(page: Page, local_app: ShinyAppProc) -> None:
    page.goto(local_app.url)

    send_message_and_verify(
        page, "Help me write a shiny app with orange cards", "orange"
    )

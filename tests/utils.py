import time
from playwright.sync_api import Page


def send_message_and_verify(page: Page, message: str, expected_text: str) -> None:
    page.get_by_label("Python").check()
    page.get_by_text("Who can see my activity?").click()
    page.get_by_text("Who can see my activity?").click()
    page.get_by_role("textbox", name="Enter a message...").click()
    page.get_by_role("textbox", name="Enter a message...").fill(message)
    page.get_by_label("Send message").click()
    time.sleep(12)  # required since we are streaming responses
    message_contents = page.query_selector_all(".message-content")
    last_message_content = message_contents[-1].text_content()
    if expected_text not in last_message_content:
        raise AssertionError(
            f"Expected '{expected_text}' in last message content but got: {last_message_content}"
        )

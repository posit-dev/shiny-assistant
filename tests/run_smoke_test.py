import time

from playwright.sync_api import Playwright, sync_playwright


def run(playwright: Playwright):
    chromium = playwright.chromium
    browser = chromium.launch()
    page = browser.new_page()
    page.goto("https://gallery.shinyapps.io/assistant")
    page.get_by_label("Python").check()
    page.get_by_text("Who can see my activity?").click()
    page.get_by_text("Who can see my activity?").click()
    page.get_by_role("textbox", name="Enter a message...").click()
    page.get_by_role("textbox", name="Enter a message...").fill(
        """
Help me write a shiny app with orange cards
"""
    )
    page.get_by_label("Send message").click()
    time.sleep(12)  # required since we are streaming responses
    message_contents = page.query_selector_all(".message-content")
    last_message_content = message_contents[-1].text_content()
    if "orange" not in last_message_content:
        raise AssertionError("Expected orange in last message content")
    browser.close()


with sync_playwright() as playwright:
    run(playwright)

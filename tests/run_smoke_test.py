from playwright.sync_api import Playwright, sync_playwright
from utils import send_message_and_verify


def run(playwright: Playwright):
    chromium = playwright.chromium
    browser = chromium.launch()
    page = browser.new_page()
    page.goto("https://gallery.shinyapps.io/assistant")

    send_message_and_verify(
        page,
        "Help me write a shiny app with orange cards",
        "orange"
    )
    browser.close()


with sync_playwright() as playwright:
    run(playwright)

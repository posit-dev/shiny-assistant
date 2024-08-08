import hmac
import json
import os

import dotenv
import markdown
import requests
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

script_dir = os.path.dirname(__file__)
parent_dir = os.path.dirname(script_dir)
token_json_path = os.path.join(script_dir, "token.json")
template_path = os.path.join(script_dir, "template.md")
dotenv.load_dotenv(os.path.join(parent_dir, ".env"))

# Mailgun configuration
MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY", None)
MAILGUN_DOMAIN = "mg.shiny.express"
MAILGUN_FROM_EMAIL = "invites@mg.shiny.express"
if not MAILGUN_API_KEY:
    raise ValueError("MAILGUN_API_KEY is not set in environment or .env file")

EMAIL_SIGNATURE_KEY = os.getenv("EMAIL_SIGNATURE_KEY", None)
if not EMAIL_SIGNATURE_KEY:
    raise ValueError("EMAIL_SIGNATURE_KEY is not set in environment or .env file")
EMAIL_SIGNATURE_KEY = bytes.fromhex(EMAIL_SIGNATURE_KEY)

# If modifying these scopes, delete the file token.json.
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# The ID and range of the spreadsheet.
SHEET_ID = "1uXXu3phsi64CtKd52d5NKW5PTS9aBJQbzlp3qsUnGTc"
SHEET_RANGE = "Form Responses 1!A:H"
COL_EMAIL = 1
COL_NAME = 2
COL_INVITE_SENT = 7

# Column A: Timestamp
# Column B: Email Address
# Column C: Your name
# Column D: Company/Affiliation
# Column E: Job title/Occupation
# Column F: What Shiny language(s) are you interested in writing apps in?
# Column G: Do you already have an Anthropic API key?
# Column H: Invite sent?


def get_google_sheet_service():
    creds = None
    if os.path.exists(token_json_path):
        creds = Credentials.from_authorized_user_file(token_json_path, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                os.path.join(script_dir, "credentials.json"), SCOPES
            )
            creds = flow.run_local_server(port=0)
        with open(token_json_path, "w") as token:
            token.write(creds.to_json())

    return build("sheets", "v4", credentials=creds)


def read_email_template():
    try:
        with open(template_path, "r") as file:
            markdown_content = file.read()
        html_content = markdown.markdown(markdown_content)
        return html_content
    except FileNotFoundError:
        print(f"Error: template.md not found in {script_dir}")
        return None
    except Exception as e:
        print(f"Error reading template file: {str(e)}")
        return None


def send_bulk_emails(recipients):
    successful_emails = []

    # Read email template
    html_content = read_email_template()
    if not html_content:
        print("Failed to read email template. Aborting email send.")
        return successful_emails

    # Prepare the recipient variables
    recipient_variables = {
        recipient["email"]: {
            "name": recipient["name"],
            "url": create_signed_url(recipient["email"]),
        }
        for recipient in recipients
    }

    try:
        response = requests.post(
            f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages",
            auth=("api", MAILGUN_API_KEY),
            data={
                "from": MAILGUN_FROM_EMAIL,
                "to": [recipient["email"] for recipient in recipients],
                "subject": "Your Shiny Assistant invitation is here",
                "html": html_content,
                "recipient-variables": json.dumps(recipient_variables),
            },
        )

        if response.status_code == 200:
            successful_emails = [recipient["email"] for recipient in recipients]
            print(
                f"Bulk email sent successfully to {len(successful_emails)} recipients."
            )
        else:
            print(f"Failed to send bulk email: {response.text}")
    except Exception as e:
        print(f"Error sending bulk email: {str(e)}")

    return successful_emails


def get_sheet_data(service):
    try:
        result = (
            service.spreadsheets()
            .values()
            .get(
                spreadsheetId=SHEET_ID,
                range=SHEET_RANGE,
            )
            .execute()
        )

        values = result.get("values", [])
        return values
    except HttpError as error:
        print(f"An error occurred: {error}")
        return None


def update_sheet(service, sent_emails):
    try:
        values = get_sheet_data(service)
        updates = []
        for i, row in enumerate(values[1:], start=2):  # Start from 2 to skip header
            email = row[COL_EMAIL]
            invite_sent = row[COL_INVITE_SENT] if len(row) > COL_INVITE_SENT else ""
            if email in sent_emails and not invite_sent:
                updates.append({"range": f"Form Responses 1!H{i}", "values": [["Yes"]]})

        if updates:
            body = {"valueInputOption": "RAW", "data": updates}
            result = (
                service.spreadsheets()
                .values()
                .batchUpdate(spreadsheetId=SHEET_ID, body=body)
            ).execute()
            print(f"Sheet updated for {len(updates)} rows.")
        else:
            print("No updates needed.")
    except HttpError as error:
        print(f"An error occurred while updating the sheet: {error}")


def main():
    service = get_google_sheet_service()

    try:
        values = get_sheet_data(service)

        if not values:
            print("No data found.")
            return

        recipients = []
        for row in values[1:]:  # Start from 2 to skip header
            if len(recipients) >= 147:
                break

            name = row[COL_NAME]
            email = row[COL_EMAIL]
            invite_sent = row[COL_INVITE_SENT] if len(row) > COL_INVITE_SENT else ""

            if not invite_sent:
                recipients.append({"name": name, "email": email})

        if recipients:
            sent_emails = send_bulk_emails(recipients)
            if sent_emails:
                update_sheet(service, sent_emails)
            else:
                print("No emails were sent successfully.")
        else:
            print("No recipients found to email.")

    except HttpError as err:
        print(f"An error occurred: {err}")


def create_signed_url(email):
    sig = hmac.digest(EMAIL_SIGNATURE_KEY, email.encode("utf-8"), "sha256").hex()
    # URL encode the email and signature
    email = requests.utils.quote(email)
    sig = requests.utils.quote(sig)
    return f"https://gallery.shinyapps.io/assistant/?email={email}&sig={sig}"


if __name__ == "__main__":
    main()

#!/usr/bin/env python3

import argparse
import hmac
import json
import os
import re
import sys

import dotenv
import markdown
import pandas as pd
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
MAILGUN_DOMAIN = "t.mx.posit.co"
MAILGUN_FROM_EMAIL = "shiny-assistant-invite@t.mx.posit.co"
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


def get_sheet_data(service):
    try:
        result = (
            service.spreadsheets()
            .values()
            .get(spreadsheetId=SHEET_ID, range=SHEET_RANGE)
            .execute()
        )
        values = result.get("values", [])
        df = pd.DataFrame(values[1:], columns=values[0])
        df.columns = [
            "timestamp",
            "email",
            "name",
            "company",
            "title",
            "shiny_languages",
            "anthropic_api_key",
            "invite_sent",
        ]
        return df
    except HttpError as error:
        print(f"An error occurred: {error}")
        return None


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


def send_bulk_emails(recipients_df):
    successful_emails = []

    html_content = read_email_template()
    if not html_content:
        print("Failed to read email template. Aborting email send.")
        return successful_emails

    recipient_variables = {
        row["email"]: {
            "name": row["name"],
            "url": create_signed_url(row["email"]),
        }
        for _, row in recipients_df.iterrows()
    }

    try:
        response = requests.post(
            f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages",
            auth=("api", MAILGUN_API_KEY),
            data={
                "from": MAILGUN_FROM_EMAIL,
                "h:Reply-To": "winston+shinyassistant@posit.co",
                "to": recipients_df["email"].tolist(),
                "subject": "Your Shiny Assistant invitation is here",
                "html": html_content,
                "recipient-variables": json.dumps(recipient_variables),
            },
        )

        if response.status_code == 200:
            successful_emails = recipients_df["email"].tolist()
            print(
                f"Bulk email sent successfully to {len(successful_emails)} recipients."
            )
        else:
            print(f"Failed to send bulk email: {response.text}")
    except Exception as e:
        print(f"Error sending bulk email: {str(e)}")

    return successful_emails


def update_sheet(service, sent_emails):
    try:
        df = get_sheet_data(service)
        df.loc[
            df["email"].isin(sent_emails) & (df["invite_sent"] != "Yes"), "invite_sent"
        ] = "Yes"

        updates = []
        for index, row in df.iterrows():
            if row["email"] in sent_emails and row["invite_sent"] == "Yes":
                updates.append(
                    {"range": f"Form Responses 1!H{index + 2}", "values": [["Yes"]]}
                )

        if updates:
            body = {"valueInputOption": "RAW", "data": updates}
            service.spreadsheets().values().batchUpdate(
                spreadsheetId=SHEET_ID, body=body
            ).execute()
            print(f"Sheet updated for {len(updates)} rows.")
        else:
            print("No updates needed.")
    except HttpError as error:
        print(f"An error occurred while updating the sheet: {error}")


def is_valid_email(email):
    email_regex = re.compile(r"[^@]+@[^@]+\.[^@]+")
    return email_regex.match(email) is not None


def process_single_email(service, email):
    df = get_sheet_data(service)
    if df.empty:
        print("No data found in the sheet.")
        return

    row = df[df["email"].str.lower() == email.lower()]
    if not row.empty:
        if row["invite_sent"].values[0] == "Yes":
            print(f"An invite has already been sent to {email}.")
        else:
            recipients = row[["name", "email"]]
            sent_emails = send_bulk_emails(recipients)
            if sent_emails:
                update_sheet(service, sent_emails)
                print(f"Invite sent to {email}.")
            else:
                print(f"Failed to send invite to {email}.")
    else:
        print(f"Email address {email} not found in the sheet.")


def print_pending_invites(df):
    pending_invites = df[df["invite_sent"] != "Yes"].drop(columns=["invite_sent"])
    if not pending_invites.empty:
        print("Pending invites:")
        print(pending_invites)
        print(f"\nTotal pending invites: {len(pending_invites)}")
    else:
        print("No pending invites found.")


def create_signed_url(email):
    sig = hmac.digest(EMAIL_SIGNATURE_KEY, email.encode("utf-8"), "sha256").hex()
    email = requests.utils.quote(email)
    sig = requests.utils.quote(sig)
    return f"https://gallery.shinyapps.io/assistant/?email={email}&sig={sig}"


def main(arg=None):
    service = get_google_sheet_service()
    df = get_sheet_data(service)

    if df is None or df.empty:
        print("No data found.")
        return

    try:
        if arg is None:
            print_pending_invites(df)
        elif isinstance(arg, str) and is_valid_email(arg):
            process_single_email(service, arg)
        else:
            max_recipients = arg
            recipients = df[(df["invite_sent"] != "Yes")].head(max_recipients)
            if not recipients.empty:
                sent_emails = send_bulk_emails(recipients)
                if sent_emails:
                    update_sheet(service, sent_emails)
                else:
                    print("No emails were sent successfully.")
            else:
                print("No recipients found to email.")

    except HttpError as err:
        print(f"An error occurred: {err}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Send bulk emails to recipients, process a single email, or list pending invites."
    )
    parser.add_argument(
        "arg",
        nargs="?",
        help="Either the maximum number of recipients to email or a single email address. If not provided, lists pending invites.",
    )
    args = parser.parse_args()

    if args.arg is None:
        main()
    elif args.arg.isdigit():
        main(int(args.arg))
    elif is_valid_email(args.arg):
        main(args.arg)
    else:
        print(
            "Invalid argument. Please provide either a number, a valid email address, or no argument to list pending invites."
        )
        sys.exit(1)

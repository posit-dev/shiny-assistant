from __future__ import annotations

import hmac
import os
from urllib.parse import parse_qs

from shiny import Inputs, Outputs, Session, module, ui

with open(os.path.join(os.path.dirname(__file__), "denied.md")) as f:
    denied_message = ui.markdown(f.read())


def verify_hmac(key: bytes | str, email: str, sig: str) -> bool:
    if isinstance(key, str):
        key = bytes.fromhex(key)
    correct_sig = hmac.digest(key, email.encode("utf-8"), "sha256").hex()
    return hmac.compare_digest(sig, correct_sig)


@module.ui
def validate_email_ui() -> ui.Tag | None:
    return ui.div()


@module.server
def validate_email_server(
    input: Inputs,
    output: Outputs,
    session: Session,
    *,
    hostname: str,
    querystring: str,
    key: bytes | str | None,
) -> bool:
    if key is None:
        # No signature; anyone is allowed
        return True
    if not os.getenv("ENFORCE_SIG_ON_LOCALHOST") and hostname == "localhost":
        # Bypass signature check for localhost. Note that this is the hostname
        # as seen by the client, not the server.
        return True

    if querystring.startswith("?"):
        querystring = querystring[1:]
    qs = parse_qs(querystring)
    email = qs.get("email", [""])[0]
    digest = qs.get("sig", [""])[0]

    if verify_hmac(key, email, digest):
        return True
    else:
        ui.modal_show(
            ui.modal(
                denied_message,
                title="Invitation required",
                footer=[],
            )
        )
        return False

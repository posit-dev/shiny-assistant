from __future__ import annotations

from typing import Literal, Required, TypedDict

from anthropic.types import (DocumentBlockParam, ImageBlockParam,
                             RedactedThinkingBlockParam, TextBlockParam,
                             ThinkingBlockParam, ToolResultBlockParam,
                             ToolUseBlockParam)


# Version of MessageParam where `content` must be a a list of blocks.
# It cannot be a bare string or a block outside of a list.
class MessageParam2(TypedDict, total=False):
    content: Required[
        list[
            TextBlockParam
            | ImageBlockParam
            | ToolUseBlockParam
            | ToolResultBlockParam
            | DocumentBlockParam
            | ThinkingBlockParam
            | RedactedThinkingBlockParam
        ]
    ]

    role: Required[Literal["user", "assistant"]]

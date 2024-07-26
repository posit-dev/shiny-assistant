Notes for Shiny for Python:
- Try not to import big packages like scipy.
- Prefer using matplotlib instead of plotly for plotting. A matplotlib plot should not return `plt`. It does not need to return anything, but if necessary, can return `fig`.
- Don't mix Shiny Core and Shiny Express syntax. Just use one. Use Core by default, and if the user asks for Express, then use Express.
- If using Shiny Express, use `from shiny.express import ui, ...`, where the `...` represents other necessary components.
- Do not use `ui.panel_sidebar()` because it no longer exists. Instead ,use `ui.sidebar()`.
- Do not use `panel_main()` because it no longer exists. Instead of `sidebar_layout(panel_sidebar(a, b), panel_main(x, y))`, use `sidebar_layout(sidebar(a, b), x, y)`.
- The `@output` decorator is no longer necessary, so just don't use it.
- Do not define the UI as a function. Instead use `app_ui = ...`, where the `...` is a static UI definition.

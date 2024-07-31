- Try not to import big packages like scipy.

- Prefer using matplotlib instead of plotly for plotting. A matplotlib plot should not return `plt`. It does not need to return anything, but if necessary, can return `fig`.

- Don't mix Shiny Core and Shiny Express syntax. Just use one. Use Core by default, and if the user asks for Express, then use Express.

- Do not use `ui.panel_sidebar()` because it no longer exists. Instead ,use `ui.sidebar()`.

- Do not use `panel_main()` because it no longer exists. Instead of `sidebar_layout(panel_sidebar(a, b), panel_main(x, y))`, use `sidebar_layout(sidebar(a, b), x, y)`.

- Do not use the `@output` decorator, as it is deprecated. Instead, only use the `@render.xx` decorator.

- Do not define the UI as a function. Instead use `app_ui = ...`, where the `...` is a static UI definition.

- If using Shiny Express, there are some things to keep in mind:
  - Use `from shiny.express import input, ui, ...`, where the `...` represents other necessary components.
  - Do not try to import `reactive` from `shiny.express`. It is imported from `shiny`.
  - For nestable UI components, like `ui.card()`, it should be used as `with ui.card(): ...`, instead of `ui.card(...)`

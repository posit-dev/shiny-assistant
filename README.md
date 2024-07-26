Shiny app for using LLMs to create Shiny apps
=============================================


## Setup and usage

Install the required packages:

```
pip install -r requirements.txt
```


Create a file `.env` that contains your Anthropic API key:

```
ANTHROPIC_API_KEY="xxxxxxxxxxxxxxxxx"
```


Run the app:

```
shiny run app.py
```


To deploy (replace `my-shinyapps` with your server's nickname):

```
rsconnect deploy shiny -n my-shinyapps .
```

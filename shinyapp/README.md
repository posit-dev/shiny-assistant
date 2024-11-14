Shiny Assistant implemented in Shiny for Python
===============================================


## Prequisites

This is a Shiny for Python application, so you will need Python installed on your system.

Get an Anthropic API key from [Anthropic](https://console.anthropic.com/).

You can run this Shiny application locally on your computer, or you can deploy to a hosted service like [shinyapps.io](https://www.shinyapps.io/) (Posit's managed cloud hosting service) or your own server running [Posit Connect](https://posit.co/products/enterprise/connect/) (Posit's hosting platform which you run on your own server).


## Setup and usage

Install the required packages:

```
pip install -r requirements.txt
```


Create a file `.env` that contains your Anthropic API key:

```
ANTHROPIC_API_KEY="xxxxxxxxxxxxxxxxx"
```

You can also include these optional environment variables:

* `GOOGLE_ANALYTICS_ID` - Google Analytics ID to use for tracking page views. If provided, the Google Analytics tracking code will be included in the app.

Run the app locally:

```
shiny run app.py
```

## Deploying to a server

You can deploy this app to a server for others to access.

Learn about:

- Deploying to the cloud with [shinyapps.io](https://shiny.posit.co/py/docs/deploy-cloud.html)
- Deploying to a [self-hosted server]([https://shiny.posit.co/py/docs/deploy-on-prem.html])


Once you have your server set up, you can deploy the app with:

```
# Deploy (replace `gallery` with your server's nickname)
rsconnect deploy shiny -n gallery -t assistant .
```

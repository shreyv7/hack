from pydantic import BaseModel


class SnippetOutput(BaseModel):
    html: str
    npm_install: str
    gtm_template_url: str


class SnippetEmailRequest(BaseModel):
    email: str

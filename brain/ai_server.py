# Import required modules
from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
from pathlib import Path
from typing import Optional

# 1. Get the exact path to the .env file in the 'brain' folder
# This finds the folder where ai_server.py is, then looks for .env there
env_path = Path(__file__).parent / ".env"

# load the environment variables
load_dotenv(dotenv_path=env_path, override=True) 
# Debug Print
print(f"📁 Looking for .env at: {env_path}")

# Create FastAPI app
app = FastAPI()

# Define expected input structure
class SessionData(BaseModel):
    totalSaves: int
    lastFile: str
    mostEditedFile: str
    timeline: list
    recentFiles: list = []
    codeSnippet: Optional[str] = ""
    gitDiff: Optional[str] = ""

# Create API endpoint
@app.post("/summarize")
async def summarize_session(data: SessionData, authorization: Optional[str] = Header(None)):
    print("--- RECEIVED GIT DIFF FROM VS CODE ---")
    try:
        gd = data.gitDiff if data.gitDiff is not None else ""
        print(repr(gd))
        print(f"(gitDiff length: {len(gd)})")
    except Exception as e:
        print("Error printing gitDiff:", e)

    # 1. Retrieve the API key from Authorization header or environment
    api_key = None
    if authorization and authorization.startswith("Bearer "):
        api_key = authorization.split(" ")[1].strip()

    if not api_key:
        api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Gemini API Key is missing. Please set it in VS Code settings or the backend .env file."
        )

    # 2. Configure Gemini dynamically for this request
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name="models/gemini-2.5-flash-lite")

    # 🧠 Create AI prompt from session data
    prompt = f"""You are an elite developer's code memory assistant. Analyze the following local session telemetry (saves, file timeline, code snippet, and git diff) to generate a structured, highly actionable resume-work summary.

Session Data:
- Total Saves: {data.totalSaves}
- Last File Worked On: {data.lastFile}
- Most Edited File: {data.mostEditedFile}
- Recent Files: {data.recentFiles}

Timeline of Saves (Newest last):
{data.timeline}

Recent Code Snippet (End of last active file):
```
{data.codeSnippet}
```

Git Diff:
```diff
{data.gitDiff}
```

Please structure your response in clean Markdown using exactly the following headings:
### 📝 Summary
(Provide a concise, detailed paragraph dissecting exactly what files were changed and what code was added/modified, specifically analyzing the git diff and code snippet above.)

### 🎯 Intent
(Explain what the developer was trying to achieve, the architectural/logical goal of their changes, and the context behind the diff.)

### 🚀 Actionable Next Steps
(List clear, bulleted tasks the developer should perform next to resume and finish their current task, referencing specific files or lines if relevant.)

Keep the tone professional, technical, direct, and practical. Avoid boilerplate greetings or generic sign-offs.
"""

    try:
        # 🔥 Call Gemini
        response = model.generate_content(prompt)

        return {
            "summary": response.text
        }

    except Exception as e:
        # Fallback if AI fails
        return {
            "summary": f"⚠️ AI Error: {str(e)}"
        }
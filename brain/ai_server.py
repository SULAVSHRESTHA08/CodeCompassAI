# Import required modules
from fastapi import FastAPI
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
from pathlib import Path

# 1. Get the exact path to the .env file in the 'brain' folder
# This finds the folder where ai_server.py is, then looks for .env there
env_path = Path(__file__).parent / ".env"

#load the environment variables
load_dotenv(dotenv_path = env_path, override=True) 
# 3. Debug Print
print(f"📁 Looking for .env at: {env_path}")

# Create FastAPI app
app = FastAPI()

# Configure Gemini API
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("❌ ERROR: GEMINI_API_KEY not found in .env file!")
else:
    genai.configure(api_key=api_key)


# Load model
model = genai.GenerativeModel(model_name="models/gemini-2.5-flash-lite") #gemini model 2.5 worked 
# Define expected input structure
class SessionData(BaseModel):
    totalSaves: int
    lastFile: str
    mostEditedFile: str
    timeline: list
    recentFiles: list = []
    codeSnippet: str 
# Create API endpoint
@app.post("/summarize")
def summarize(data: SessionData):

    # 🧠 Create AI prompt from session data
    prompt = f"""
You are a coding assistant helping a developer resume work.

FILE:
{data.lastFile}

RECENT CODE:
{data.codeSnippet}

CONTEXT:
- Total Saves: {data.totalSaves}
- Most Edited File: {data.mostEditedFile}

Explain clearly:

SUMMARY:
What this code is doing

INTENT:
What the developer is trying to build

NEXT STEP:
What they should do next (very specific)

Keep it short and useful.
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
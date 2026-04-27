# Import required modules
from fastapi import FastAPI
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv

#load the environment variables
load_dotenv() 

# Create FastAPI app
app = FastAPI()

# Configure Gemini API
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("❌ ERROR: GEMINI_API_KEY not found in .env file!")
else:
    genai.configure(api_key=api_key)


# Load model
model = genai.GenerativeModel("gemini-pro")

# Define expected input structure
class SessionData(BaseModel):
    totalSaves: int
    lastFile: str
    mostEditedFile: str
    timeline: list

# Create API endpoint
@app.post("/summarize")
def summarize(data: SessionData):

    # 🧠 Create AI prompt from session data
    prompt = f"""
You are a coding assistant.

Here is a developer's session data:
- Total Saves: {data.totalSaves}
- Last File: {data.lastFile}
- Most Edited File: {data.mostEditedFile}

Timeline:
{data.timeline}

Explain:
1. What the developer was working on
2. What they were likely trying to do
3. Suggest the next coding step

Keep it short, clear, and helpful.
"""

    try:
        # 🔥 Call Gemini
        response = model.generate_content(prompt)

        return {"summary": response.text}

    except Exception as e:
        # Fallback if AI fails
        return {"summary": f"⚠️ AI Error: {str(e)}"}
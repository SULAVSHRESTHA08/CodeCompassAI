# import the required modules from fastAPI and
#pydantic for data validation and setting management 
from fastapi import FastAPI
from pydantic import BaseModel 

# Creates an app 
app = FastAPI()

# Define expected input structure 
class SessionData(BaseModel):
    totalSaves: int 
    lastFile: str
    mostEditedFile: str
    timeline: list
    
# Create API endpoint
@app.post("/summarize")
def summarize(data: SessionData):
    
    #Simple mock summary 
    summary = f"""
    you made {data.totalSaves} saves.
    you mainly worked on {data.mostEditedFile}.
    your lastfile was {data.lastFile}.
    """
    
    return {"summary": summary}    
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
// Node.js module for reading/writing files to disk
import * as fs from 'fs';
// Node.js module for safely constructing file paths
import * as path from 'path';
interface AISummaryResponse {
    summary: string;
}
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	try {
	// Create a safe, OS specific directory for extension storage 
	//globalStorageUri persists even after VS Code is closed 
	const storageDir = path.join(context.globalStorageUri.fsPath);

    // Define Full path to the session file where we store data 
	const sessionFile = path.join(storageDir,'session.json');

    // ensure the storage directory exists before writing any files 
	// prevents runtime errors when saving data for the first time 
    if (!fs.existsSync(storageDir)){
		//makes sure this folder exists safely and permanently
		fs.mkdirSync(storageDir, {recursive: true});
	}

	//Create a Status Bar Item on the left side 
	const statusBar = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,100
	);
	// Set initial text
	statusBar.text = '🧭 CodeCompass';
	// Show in Vs Code
	statusBar.show();
    context.subscriptions.push(statusBar);

	
	//Load existing timeline or create a new one
	let timelineData: { timeline: { file: string; time: string }[] } = {
        timeline: []
    };

    // ===============================
    //SAFE SESSION LOADING
    // ===============================
    if (fs.existsSync(sessionFile)) {
        try {
            const rawData = fs.readFileSync(sessionFile, 'utf-8');
            const parsed = JSON.parse(rawData);

            // Validate structure before using it
            if (Array.isArray(parsed.timeline)) {
                timelineData = parsed;

                const lastEntry = timelineData.timeline.at(-1);
                if (lastEntry) {
                    statusBar.text = `🧭 Last: ${path.basename(lastEntry.file)} at ${lastEntry.time}`;
                }
            } else {
                // Old or invalid format → reset safely
                timelineData = { timeline: [] };
                fs.writeFileSync(
                    sessionFile,
                    JSON.stringify(timelineData, null, 2)
                );
            }

        } catch (err) {
            console.error('Failed to read session.json:', err);
        }
    }
	 // Saves the file name whenever the file is saved
    const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
	 //Add new save entry
	timelineData.timeline.push({
		file: document.fileName,
		time: new Date().toISOString()
	 });
	 //keep only last 20 saves 
	 timelineData.timeline = timelineData.timeline.slice(-20);
     // Save updated timeline 
	 try {
            fs.writeFileSync(sessionFile, JSON.stringify(timelineData, null, 2));
        } catch (err) {
            console.error('Failed to write session.json:', err);
        }
	  //Update status bar text
	  statusBar.text = `🧭 Last: ${path.basename(document.fileName)} at: ${new Date().toISOString()}`;		
	}); 
    context.subscriptions.push(saveListener);
    
	// Register command to show session summary panel 
	const summaryCommand = vscode.commands.registerCommand(
		'codecompassai.showSessionSummary',
		() => {
			showSessionSummary(context);
		}
	);
	// Keep command alive
	context.subscriptions.push(summaryCommand);

    // Register Resume Work command
    const resumeCommand = vscode.commands.registerCommand(
    'codecompassai.resumeWork',
    async () => {

        // Path to session file
        const sessionFile = path.join(context.globalStorageUri.fsPath, 'session.json');

        if (!fs.existsSync(sessionFile)) {
            vscode.window.showInformationMessage("No session data found.");
            return;
        }

        // Read session data
        const raw = fs.readFileSync(sessionFile, 'utf-8');
        const data = JSON.parse(raw);

        const timeline = data.timeline || [];

        if (timeline.length === 0) {
            vscode.window.showInformationMessage("No recent activity.");
            return;
        }

        // Get last worked file
        const lastFile = timeline[timeline.length - 1].file;

        try {
            // Open file in editor
            const doc = await vscode.workspace.openTextDocument(lastFile);
            await vscode.window.showTextDocument(doc);

            vscode.window.showInformationMessage(`Resumed: ${path.basename(lastFile)}`);
        } catch (err) {
            vscode.window.showErrorMessage("Could not open last file.");
        }
    }
);

context.subscriptions.push(resumeCommand);

    

	console.log('Session file path:', sessionFile);
 
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "codecompassai" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('codecompassai.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const message = 'CodeCompassAI!';
		vscode.window.showInformationMessage(message);
	});
    // Cleans up the listner inorder to maintain the latest update
	context.subscriptions.push(disposable);
	} catch (error) {
		console.error('CODECOMPASS ACTIVATION ERROR:', error);
		vscode.window.showErrorMessage(`CodeCompassAI activation failed: ${error}`);
	}
}
async function showSessionSummary(context: vscode.ExtensionContext){
	// Create a new panel
	const panel = vscode.window.createWebviewPanel('sessionSummary',
		'CodeCompass - Session Summary',
		vscode.ViewColumn.One,
		{enableScripts: true} //It allows the javascript  otherise the onclick will do nothing 
	);
	//Path to session file
	const sessionFile = path.join(context.globalStorageUri.fsPath,'session.json');
    
	let timeline = [];
	// Read timeline data if it exists
	if (fs.existsSync(sessionFile)){
		const raw = fs.readFileSync(sessionFile, 'utf-8');
		const data = JSON.parse(raw);
		timeline = data.timeline || [];
	}
    vscode.window.showInformationMessage('Session Summary opened');
    // Build basic summary 
	const summaryData = buildSessionSummary(timeline);
	
    
    //Creating a clean object that matches the python 'SessionData' class
    const payload = {
        totalSaves: summaryData.totalSaves,
        lastFile: summaryData.lastFile,
        mostEditedFile: summaryData.mostEditedFile,
        recentFiles: summaryData.recentFiles, // This was likely missing or misnamed before
        timeline: timeline
    };
	// Call Python AI
	const aiSummary = await getAISummary(
	     payload	
    );
	
	// Set HTML content for panel to UI
	panel.webview.html = getSummaryHtml(timeline, summaryData, aiSummary);
    panel.webview.onDidReceiveMessage(
    async (message) => {
        if (message.command === 'resumeWork') {
            // This triggers the existing command you registered
            vscode.commands.executeCommand('codecompassai.resumeWork');
        }
    }
);

}
// gives the html summary of the file
function getSummaryHtml(timeline: any[], summary: any, aiSummary: string) {
    const items = timeline.map(entry => `
        <li>
            <strong>${path.basename(entry.file)}</strong><br/>
            <small>${new Date(entry.time).toLocaleString()}</small>
        </li>
    `).reverse().join(''); // .reverse() puts the newest saves at the top!

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: sans-serif; padding: 20px; line-height: 1.6; }
            .card { background: rgba(120, 120, 120, 0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            h2 { color: #3794ef; }
            .stats { display: flex; gap: 20px; font-weight: bold; }
        </style>
    </head>
    <body>
        <h2>🧭 Session Summary</h2>

        <button class="resume-btn" onclick="resumeWork()">
            🚀 Resume Work
        </button>

        <div class="card">
            <div class="stats">
                <span>Total Saves: ${summary.totalSaves || 0}</span> | 
                <span>Most Edited: ${summary.mostEditedFile || 'None yet'}</span>
            </div>
            <p><strong>Last File Worked On:</strong> ${summary.lastFile || 'None'}</p>
        </div>

        <div class="card" style="border-left: 4px solid #3794ef;">
            <h3>🤖 AI Insights</h3>

            ${formatAI(aiSummary) || "<p>Thinking.....</p>"}
        </div>

        <hr/>

        <h3>📜 Recent Activity</h3>
        <ul>
            ${items || '<li>No activity recorded yet. Save a file to see it here!</li>'}
        </ul>
        <script>
          const vscode = acquireVsCodeApi();

          function resumeWork() {
          vscode.postMessage({ command: 'resumeWork' });
         }
        </script>
    </body>
    </html>
    `;
}
// Updated AI summary Visuals
function formatAI(text: string) {
    // This Regex looks for the keywords even if they are all on one line
    const summaryMatch = text.match(/SUMMARY:(.*?)(?=INTENT:|NEXT STEP:|$)/is);
    const intentMatch = text.match(/INTENT:(.*?)(?=SUMMARY:|NEXT STEP:|$)/is);
    const nextMatch = text.match(/NEXT STEP:(.*?)(?=SUMMARY:|INTENT:|$)/is);

    const sections = {
        summary: summaryMatch ? summaryMatch[1].trim() : "",
        intent: intentMatch ? intentMatch[1].trim() : "",
        next: nextMatch ? nextMatch[1].trim() : ""
    };

    // If Regex fails (maybe AI didn't use keywords), show the raw text as fallback
    if (!sections.summary && !sections.intent && !sections.next) {
        return `<p>${text}</p>`;
    }

    return `
        <div>
            <p><strong>📌 Summary:</strong> ${sections.summary || "Not detected"}</p>
            <p><strong>🎯 Intent:</strong> ${sections.intent || "Not detected"}</p>
            <p><strong>🚀 Next Step:</strong> ${sections.next || "Not detected"}</p>
        </div>
    `;
}// Send session data to python AI server
async function getAISummary(sessionData: any)
{
  try
  {
const response = await fetch('http://127.0.0.1:8000/summarize', {
	method: 'POST',
	headers: {
		'Content-Type' : 'application/json'
	},
    body: JSON.stringify(sessionData)
   });
   const data = await response.json() as AISummaryResponse;
   return data.summary || "No summary provided by AI.";
  }
  catch(error) 
  {
    console.error('AI server error:', error);
	return "AI server not reachable";
  }
}
function buildSessionSummary(timeline: any[]) {
    if (timeline.length === 0) {
        return { totalSaves: 0, lastFile: 'None', mostEditedFile: 'None' };
    }

    const totalSaves = timeline.length;
    const lastFile = path.basename(timeline[timeline.length - 1].file);
    const recentFiles = timeline.slice(-5).map(e => e.file);
    // Count which file appears most in the timeline
    const counts: { [key: string]: number } = {};
    timeline.forEach(entry => {
        const name = path.basename(entry.file);
        counts[name] = (counts[name] || 0) + 1;
    });

    const mostEditedFile = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);

    return {
        totalSaves,
        lastFile,
        mostEditedFile,
        recentFiles
    };
}

// This method is called when your extension is deactivated
export function deactivate() {}

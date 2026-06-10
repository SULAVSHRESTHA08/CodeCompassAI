// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
// Node.js module for reading/writing files to disk
import * as fs from 'fs';
// Node.js module for safely constructing file paths
import * as path from 'path';
// lets typescript run terminal commands
import  { execSync } from 'child_process';
interface AISummaryResponse {
    summary: string;
}
interface AISummaryRequest{
    totalSaves: number;
    lastFile: string;
    mostEditedFile: string;
    recentFiles: string[];
    timeline: any[];
    codeSnippet: string;
    gitDiff: string;
}

function shouldTrackPath(filePath: string): boolean {
    try {
        if (!filePath) {
            return false;
        }
        const uri = vscode.Uri.file(filePath);
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder) {
            return false;
        }

        const normalizedPath = filePath.replace(/\\/g, '/');
        const ignoredDirs = ['/node_modules/', '/.git/', '/.vscode/', '/.vscode-test/', '/dist/', '/out/'];
        if (ignoredDirs.some(dir => normalizedPath.includes(dir))) {
            return false;
        }

        const ignoredExtensions = ['.json', '.md', '.txt', '.yaml', '.yml', '.vsix', '.xml', '.config', '.lock'];
        const ext = path.extname(filePath).toLowerCase();
        if (ignoredExtensions.includes(ext)) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

function shouldTrackDocument(document: vscode.TextDocument): boolean {
    if (document.uri.scheme !== 'file') {
        return false;
    }
    return shouldTrackPath(document.fileName);
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
    // Make status bar clickable to open a small menu of actions
    statusBar.command = 'codecompassai.showMenu';
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
                parsed.timeline = parsed.timeline.filter((entry: any) => shouldTrackPath(entry.file));
                timelineData = parsed;

                const lastEntry = timelineData.timeline.at(-1);
                if (lastEntry) {
                    statusBar.text = `🧭 Last: ${path.basename(lastEntry.file)} at ${lastEntry.time}`;
                }
                // Save the cleaned timeline back
                fs.writeFileSync(sessionFile, JSON.stringify(timelineData, null, 2));
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
        // Only track files inside the active workspace and ignore config/md/node_modules files
        if (!shouldTrackDocument(document)) {
            return;
        }

        // Add new save entry
        timelineData.timeline.push({
            file: document.fileName,
            time: new Date().toISOString()
        });
        // keep only last 20 saves 
        timelineData.timeline = timelineData.timeline.slice(-20);
        // Save updated timeline 
        try {
            fs.writeFileSync(sessionFile, JSON.stringify(timelineData, null, 2));
        } catch (err) {
            console.error('Failed to write session.json:', err);
        }
        // Update status bar text
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

    // Register Set API Key command
    const setApiKeyCommand = vscode.commands.registerCommand(
        'codecompassai.setApiKey',
        async () => {
            const currentKey = await context.secrets.get('gemini_api_key');
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your Gemini API Key (leave empty to clear existing key)',
                placeHolder: currentKey ? 'Key is currently set. Enter new key or clear...' : 'AIzaSy...',
                ignoreFocusOut: true,
                password: true
            });
            if (apiKey === undefined) {
                return;
            }
            if (apiKey === '') {
                await context.secrets.delete('gemini_api_key');
                vscode.window.showInformationMessage('Gemini API Key cleared.');
            } else {
                await context.secrets.store('gemini_api_key', apiKey);
                vscode.window.showInformationMessage('Gemini API Key updated successfully.');
            }
        }
    );
    context.subscriptions.push(setApiKeyCommand);

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

    // Register a small status-bar menu command to open quick actions
    const menuCommand = vscode.commands.registerCommand('codecompassai.showMenu', async () => {
        const choice = await vscode.window.showQuickPick([
            { label: 'Open Session Summary', id: 'summary' },
            { label: 'Resume Work', id: 'resume' },
            { label: 'Dismiss', id: 'dismiss' }
        ], { placeHolder: 'CodeCompass actions' });

        if (!choice) { return; }

        if (choice.id === 'summary') {
            vscode.commands.executeCommand('codecompassai.showSessionSummary');
        } else if (choice.id === 'resume') {
            vscode.commands.executeCommand('codecompassai.resumeWork');
        } else if (choice.id === 'dismiss') {
            vscode.window.showInformationMessage('CodeCompass dismissed');
        }
    });
    context.subscriptions.push(menuCommand);
    // Timeout to show the session summary automatically 
    setTimeout(async() => {
    if (!fs.existsSync(sessionFile)) {
        return;
    }
    try{
        const raw = fs.readFileSync(sessionFile, 'utf-8');
        const data = JSON.parse(raw);

       // No timeline → do nothing
        if (!data.timeline || data.timeline.length === 0) {
            return;
        }

        // Get last file
        const lastEntry = data.timeline[data.timeline.length - 1];
        const lastFile = path.basename(lastEntry.file);
        const lastTime = new Date(lastEntry.time).getTime();
        const now = Date.now();

        // difference in hours
        const hoursSinceLastSession =
        (now - lastTime) / (1000 * 60 * 60);

        // Ignore very old sessions
        if (hoursSinceLastSession > 48) {
          return;
        }
        // Show professional notification
        const selection = await vscode.window.showInformationMessage(
            `🧭 Resume your previous session?\nLast file: ${lastFile}`,
            "Open Summary",
            "Resume Work",
            "Dismiss"
        );

        // Handle button actions
        if (selection === "Open Summary")
        {
          vscode.commands.executeCommand(
                'codecompassai.showSessionSummary'
            );
        } 
        else if (selection === "Resume Work") {
            vscode.commands.executeCommand(
                'codecompassai.resumeWork'
            );
        }

    } catch (err) {
        console.error("Resume notification error:", err);
    }
}, 3000);

    // Diagnostics
	console.log('Session file path:', sessionFile);
	console.log('Congratulations, your extension "codecompassai" is now active!');

	} catch (error) {
		console.error('CODECOMPASS ACTIVATION ERROR:', error);
		vscode.window.showErrorMessage(`CodeCompassAI activation failed: ${error}`);
	}
}
async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    let apiKey = await context.secrets.get('gemini_api_key');
    if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Gemini API Key to enable CodeCompass AI features',
            placeHolder: 'AIzaSy...',
            ignoreFocusOut: true,
            password: true
        });
        if (apiKey) {
            await context.secrets.store('gemini_api_key', apiKey);
            vscode.window.showInformationMessage('Gemini API Key saved successfully.');
        }
    }
    return apiKey;
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
    // Filter the timeline dynamically to exclude legacy tracked files
    timeline = timeline.filter((entry: any) => shouldTrackPath(entry.file));

    vscode.window.showInformationMessage('Session Summary opened');
    // Build basic summary 
	const summaryData = buildSessionSummary(timeline);
    
    let codeSnippet = "";

    try {
      const lastEntry = timeline[timeline.length - 1];

      if (lastEntry && fs.existsSync(lastEntry.file)) {
        const fullCode = fs.readFileSync(lastEntry.file, 'utf-8');

        // take last 1500 characters (recent work)
        codeSnippet = fullCode.slice(-1500);
       }
    } catch (err) {
    console.error("Error reading code file:", err);
    }
    // Get the value form Git diff
    const gitDiff = getGitDiff();
    console.log('🔍 Git diff value (preview):', gitDiff ? gitDiff.slice(0,200) : gitDiff);
    console.log('🔍 Git diff length:', gitDiff ? gitDiff.length : 0);

    const apiKey = await getApiKey(context);

	// Call Python AI
   const aiSummary = await getAISummary({
    totalSaves: summaryData.totalSaves,
    lastFile: summaryData.lastFile,
    mostEditedFile: summaryData.mostEditedFile,
    recentFiles: summaryData.recentFiles,
    timeline,
    codeSnippet,
    gitDiff
   }, apiKey);
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
    const items = timeline.slice().reverse().map(entry => {
        const baseName = path.basename(entry.file);
        const relativeDir = path.dirname(entry.file);
        const displayTime = new Date(entry.time).toLocaleString();
        return `
            <li class="activity-item">
                <div>
                    <span class="activity-file" title="${entry.file}">${baseName}</span><br/>
                    <small style="opacity: 0.5; font-size: 11px;">${relativeDir}</small>
                </div>
                <span class="activity-time">${displayTime}</span>
            </li>
        `;
    }).join('');

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CodeCompass - Session Summary</title>
        <style>
            :root {
                --bg-color: var(--vscode-editor-background, #1e1e1e);
                --text-color: var(--vscode-editor-foreground, #d4d4d4);
                --card-bg: rgba(255, 255, 255, 0.03);
                --card-border: rgba(255, 255, 255, 0.08);
                --btn-bg: var(--vscode-button-background, #007acc);
                --btn-hover: var(--vscode-button-hoverBackground, #0062a3);
                --btn-text: var(--vscode-button-foreground, #ffffff);
                --accent-color: var(--vscode-textLink-foreground, #3794ef);
                --divider-color: rgba(255, 255, 255, 0.1);
                --font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
            }

            body.vscode-light {
                --card-bg: rgba(0, 0, 0, 0.03);
                --card-border: rgba(0, 0, 0, 0.08);
                --divider-color: rgba(0, 0, 0, 0.1);
            }

            body {
                font-family: var(--font-family);
                background-color: var(--bg-color);
                color: var(--text-color);
                padding: 24px;
                margin: 0;
                line-height: 1.6;
            }

            .container {
                max-width: 800px;
                margin: 0 auto;
            }

            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                border-bottom: 1px solid var(--divider-color);
                padding-bottom: 16px;
            }

            h2, h3 {
                margin: 0 0 12px 0;
                font-weight: 600;
            }

            h2 {
                color: var(--accent-color);
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 24px;
            }

            h3 {
                font-size: 18px;
                color: var(--text-color);
            }

            .resume-btn {
                background: var(--btn-bg);
                color: var(--btn-text);
                border: none;
                padding: 10px 20px;
                font-size: 14px;
                font-weight: 600;
                border-radius: 6px;
                cursor: pointer;
                transition: background 0.2s ease, transform 0.1s ease;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }

            .resume-btn:hover {
                background: var(--btn-hover);
                transform: translateY(-1px);
            }

            .resume-btn:active {
                transform: translateY(0);
            }

            /* Glassmorphism Cards */
            .card {
                background: var(--card-bg);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 1px solid var(--card-border);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 24px;
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.1);
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }

            .card:hover {
                border-color: var(--accent-color);
                box-shadow: 0 8px 32px 0 rgba(55, 148, 239, 0.15);
            }

            .stats {
                display: flex;
                gap: 24px;
                margin-bottom: 12px;
                font-size: 14px;
            }

            .stats-label {
                opacity: 0.7;
            }

            .stats-value {
                color: var(--accent-color);
                font-weight: bold;
                margin-left: 4px;
            }

            /* AI Insights specific styling */
            .ai-card {
                border-left: 4px solid var(--accent-color);
            }

            .ai-content h3 {
                margin-top: 20px;
                margin-bottom: 10px;
                border-bottom: 1px solid var(--divider-color);
                padding-bottom: 4px;
                font-size: 16px;
                color: var(--accent-color);
            }

            .ai-content p {
                margin: 0 0 12px 0;
            }

            .ai-content ul, .ai-content ol {
                margin: 0 0 12px 0;
                padding-left: 20px;
            }

            .ai-content li {
                margin-bottom: 6px;
            }

            .ai-content code {
                font-family: var(--vscode-editor-font-family, monospace);
                background: rgba(120, 120, 120, 0.15);
                padding: 2px 5px;
                border-radius: 4px;
                font-size: 13px;
            }

            .ai-content pre {
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid var(--card-border);
                border-radius: 8px;
                padding: 12px;
                overflow-x: auto;
                margin: 12px 0;
            }

            .ai-content pre code {
                background: transparent;
                padding: 0;
                font-size: 12px;
            }

            /* Recent Activity List */
            .activity-list {
                list-style: none;
                padding: 0;
                margin: 0;
            }

            .activity-item {
                padding: 12px;
                border-bottom: 1px solid var(--divider-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: background-color 0.2s ease;
                border-radius: 6px;
            }

            .activity-item:hover {
                background-color: rgba(255, 255, 255, 0.02);
            }

            body.vscode-light .activity-item:hover {
                background-color: rgba(0, 0, 0, 0.02);
            }

            .activity-file {
                font-weight: 500;
                color: var(--text-color);
            }

            .activity-time {
                font-size: 12px;
                opacity: 0.6;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>🧭 CodeCompass - Session Summary</h2>
                <button class="resume-btn" onclick="resumeWork()">
                    🚀 Resume Work
                </button>
            </div>

            <div class="card">
                <div class="stats">
                    <div>
                        <span class="stats-label">Total Saves:</span>
                        <span class="stats-value">${summary.totalSaves || 0}</span>
                    </div>
                    <div>
                        <span class="stats-label">Most Edited:</span>
                        <span class="stats-value">${summary.mostEditedFile || 'None yet'}</span>
                    </div>
                </div>
                <p style="margin: 8px 0 0 0;"><strong>Last File Worked On:</strong> ${summary.lastFile || 'None'}</p>
            </div>

            <div class="card ai-card">
                <h3>🤖 AI Insights</h3>
                <div id="ai-insights-content" class="ai-content">
                    <p>Analyzing changes and generating summary...</p>
                </div>
            </div>

            <h3>📜 Recent Activity</h3>
            <div class="card">
                <ul class="activity-list">
                    ${items || '<li class="activity-item">No activity recorded yet. Save a file to see it here!</li>'}
                </ul>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js"></script>
        <script>
            const vscode = acquireVsCodeApi();

            function resumeWork() {
                vscode.postMessage({ command: 'resumeWork' });
            }

            // Parse and render raw markdown inside the webview using markdown-it
            const rawAiText = ${JSON.stringify(aiSummary)};
            try {
                const md = window.markdownit({ 
                    html: true, 
                    linkify: true, 
                    typographer: true 
                });
                document.getElementById('ai-insights-content').innerHTML = md.render(rawAiText);
            } catch (e) {
                document.getElementById('ai-insights-content').innerHTML = '<p>' + rawAiText.replace(/\\n/g, '<br>') + '</p>';
            }
        </script>
    </body>
    </html>
    `;
}

// Send session data to python AI server
async function getAISummary(sessionData: any, apiKey?: string)
{
  try
  {
    const headers: Record<string, string> = {
        'Content-Type' : 'application/json'
    };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const response = await fetch('http://127.0.0.1:8000/summarize', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(sessionData)
    });
    
    if (response.status === 401) {
        return "⚠️ Unauthorized: Gemini API Key is invalid or missing. Run the command `CodeCompass: Set Gemini API Key` to set it.";
    }

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
function findGitRepoRoot(): string {
    const folders = vscode.workspace.workspaceFolders || [];
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;

    // 1. Check active file first and search upwards for a .git directory
    if (activeFile) {
        let current = path.dirname(activeFile);
        while (true) {
            if (fs.existsSync(path.join(current, '.git'))) {
                return current;
            }
            const parent = path.dirname(current);
            if (parent === current) {
                break;
            }
            current = parent;
        }
    }

    // 2. Check workspace folders and search upwards for a .git directory
    for (const folder of folders) {
        const candidate = folder.uri.fsPath;
        let current = candidate;
        while (true) {
            if (fs.existsSync(path.join(current, '.git'))) {
                return current;
            }
            const parent = path.dirname(current);
            if (parent === current) {
                break;
            }
            current = parent;
        }
    }

    // 3. Fallback to the first workspace folder path if any folders are open
    if (folders.length > 0) {
        return folders[0].uri.fsPath;
    }

    // 4. Fallback to the active file directory if available
    if (activeFile) {
        return path.dirname(activeFile);
    }

    // Last resort fallback
    return process.cwd();
}

 // Get recent git changes from repository 
 function getGitDiff(): string {
 try {
    console.log('🚀 GIT FUNCTION STARTED');

    const cwd = findGitRepoRoot();

    const status = execSync('git status --short', {
        encoding: 'utf-8',
        cwd,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const unstaged = execSync('git --no-pager diff --no-ext-diff --unified=3', {
        encoding: 'utf-8',
        cwd,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const staged = execSync('git --no-pager diff --cached --no-ext-diff --unified=3', {
        encoding: 'utf-8',
        cwd,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const combined = [status.trim(), unstaged.trim(), staged.trim()]
        .filter(Boolean)
        .join('\n\n');

    let result = combined;

    if (!result) {
        try {
            const lastCommit = execSync('git --no-pager show --stat --summary --format=fuller -1 HEAD', {
                encoding: 'utf-8',
                cwd,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            if (lastCommit.trim()) {
                result = 'LAST COMMIT\n' + lastCommit.trim();
            }
        } catch {
            // Ignore and fall back to the standard empty message.
        }
    }

    console.log('🔎 git diff cwd:', cwd);
    console.log('🚀 GIT DIFF RESULT:', result ? result.slice(0, 200) : 'No git changes found.');

    if (!result) {
        return 'No git changes found.';
    }

    return result.slice(0, 4000);
 } catch (error) {
    console.error('Git diff error: ', error);
    return 'No git changes found.';
 }
 }

// This method is called when your extension is deactivated
export function deactivate() {}

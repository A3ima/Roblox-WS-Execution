const vscode    = require("vscode");
const helmet    = require("helmet");
const express   = require("express");
const expressWs = require("express-ws");

const connections = [];
const app        = expressWs(express()).app;

/* -------------------------------------------------- */
/* HTTP / WS security                                 */
/* -------------------------------------------------- */
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc:  ["'self'"],
            connectSrc: ["'self'", "ws://localhost:9000"]
        },
    })
);

app.all("/", (_, res) => res.end("Roblox WS Execution"));

/* -------------------------------------------------- */
/* VS Code output channel for logs                    */
/* -------------------------------------------------- */
const output = vscode.window.createOutputChannel("Roblox‑WS Logs");

/* -------------------------------------------------- */
/* WebSocket handling                                 */
/* -------------------------------------------------- */
app.ws("/", ws => {
    // Kill unauthenticated sockets after 0.5 s
    setTimeout(() => {
        if (connections.every(c => c.ws !== ws)) ws.close();
    }, 500);

    ws.on("message", raw => {
        let data;
        try { data = JSON.parse(raw); } catch { return ws.send(JSON.stringify({ Code: 10 })); }
        if (!data.Method) return ws.send(JSON.stringify({ Code: 20 }));

        /* ---------- Authorisation ---------- */
        if (data.Method === "Authorization") {
            const existing = connections.find(c => c.name === data.Name);
            if (existing) {
                existing.ws = ws;
                vscode.window.showInformationMessage(`Updated WS for ${data.Name}.`);
            } else {
                connections.push({ ws, name: data.Name });
                vscode.window.showInformationMessage(`User ${data.Name} connected.`);
            }
        }

        /* ---------- Execute‑side errors ---------- */
        if (data.Method === "Error") {
            vscode.window.showErrorMessage(data.Message);
        }

        /* ---------- Log output from Roblox ---------- */
        if (data.Method === "LogOutput") {
            output.appendLine(`[${data.Name}] ${data.Message}`);
            output.show(true);
        }

        ws.send(JSON.stringify({ Code: 30 }));
    });

    ws.on("close", () => {
        const idx = connections.findIndex(c => c.ws === ws);
        if (idx !== -1) connections.splice(idx, 1);
        console.log("WebSocket disconnected.");
    });
});

app.listen(9000);

/* -------------------------------------------------- */
/* VS Code extension commands                         */
/* -------------------------------------------------- */
function activate(context) {
    /* Status‑bar “Execute” button */
    const execBtn           = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -1000);
    execBtn.command         = "roblox-ws-server.execute";
    execBtn.text            = "$(notebook-execute) WS Execute";
    execBtn.show();
    context.subscriptions.push(execBtn);

    /* Run script in active editor */
    context.subscriptions.push(
        vscode.commands.registerCommand("roblox-ws-server.execute", () => {
            if (connections.length === 0)
                return vscode.window.showErrorMessage("No connected clients.");

            if (!vscode.window.activeTextEditor)
                return vscode.window.showErrorMessage("No active editor.");

            const code = vscode.window.activeTextEditor.document.getText();

            const chooseClient = client => {
                client.ws.send(JSON.stringify({ Method: "Execute", Data: code, Code: 30 }));
                vscode.window.showInformationMessage("Ran file.");
            };

            if (connections.length === 1) return chooseClient(connections[0]);

            vscode.window
                .showQuickPick(connections.map(c => ({ label: c.name })), { placeHolder: "Select a user." })
                .then(sel => sel && chooseClient(connections.find(c => c.name === sel.label)));
        })
    );

    /* Misc. helper commands */
    context.subscriptions.push(
        vscode.commands.registerCommand("roblox-ws-server.debug", () =>
            vscode.window.showInformationMessage("Roblox WS Execution running.")
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("roblox-ws-server.resetglobals", () =>
            vscode.window.showInformationMessage("Globals reset.")
        )
    );
}

function deactivate() {
    connections.forEach(c => c.ws.readyState === c.ws.OPEN && c.ws.close());
}

module.exports = { activate, deactivate };

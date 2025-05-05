const vscode    = require("vscode");
const helmet    = require("helmet");
const express   = require("express");
const expressWs = require("express-ws");

// Every connection now carries its own OutputChannel
const connections = []; // [{ name, ws, channel }]
const app         = expressWs(express()).app;

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
/* WebSocket handling                                 */
/* -------------------------------------------------- */
app.ws("/", ws => {
    // Drop unauthenticated sockets after 0.5 s
    setTimeout(() => {
        if (connections.every(c => c.ws !== ws)) ws.close();
    }, 500);

    ws.on("message", raw => {
        let data;
        try { data = JSON.parse(raw); } catch { return ws.send(JSON.stringify({ Code: 10 })); }
        if (!data.Method) return ws.send(JSON.stringify({ Code: 20 }));

        /* ---------- Authorisation ---------- */
        if (data.Method === "Authorization") {
            let entry = connections.find(c => c.name === data.Name);

            if (entry) {
                // Re‑use existing channel, just swap socket
                entry.ws = ws;
                vscode.window.showInformationMessage(`Updated WS for ${data.Name}.`);
            } else {
                const channel = vscode.window.createOutputChannel(`Roblox‑WS Logs — ${data.Name}`);
                entry = { name: data.Name, ws, channel };
                connections.push(entry);
                vscode.window.showInformationMessage(`User ${data.Name} connected.`);
            }
            return ws.send(JSON.stringify({ Code: 30 }));
        }

        /* ---------- Execute‑side errors ---------- */
        if (data.Method === "Error") {
            vscode.window.showErrorMessage(data.Message);
            return ws.send(JSON.stringify({ Code: 30 }));
        }

        /* ---------- Log output from Roblox ---------- */
        if (data.Method === "LogOutput") {
            const entry = connections.find(c => c.name === data.Name);
            if (!entry) return; // Shouldn't occur

            entry.channel.appendLine(data.Message);
            entry.channel.show(true);
            return ws.send(JSON.stringify({ Code: 30 }));
        }

        // Unknown method → just ACK
        ws.send(JSON.stringify({ Code: 30 }));
    });

    ws.on("close", () => {
        const idx = connections.findIndex(c => c.ws === ws);
        if (idx === -1) return;

        // Dispose the per‑user output channel
        connections[idx].channel.dispose();
        connections.splice(idx, 1);
        console.log("WebSocket disconnected.");
    });
});

app.listen(9000);

/* -------------------------------------------------- */
/* VS Code extension commands                         */
/* -------------------------------------------------- */
function activate(context) {
    /* Status‑bar “Execute” button */
    const execBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -1000);
    execBtn.command = "roblox-ws-server.execute";
    execBtn.text    = "$(notebook-execute) WS Execute";
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

            const sendTo = client => {
                client.ws.send(JSON.stringify({ Method: "Execute", Data: code, Code: 30 }));
                vscode.window.showInformationMessage("Ran file.");
            };

            if (connections.length === 1) return sendTo(connections[0]);

            vscode.window
                .showQuickPick(connections.map(c => ({ label: c.name })), { placeHolder: "Select a user." })
                .then(sel => sel && sendTo(connections.find(c => c.name === sel.label)));
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
    connections.forEach(c => {
        if (c.ws.readyState === c.ws.OPEN) c.ws.close();
        c.channel.dispose();
    });
}

module.exports = { activate, deactivate };

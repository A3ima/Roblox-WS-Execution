local Services        = setmetatable({}, { __index = function(_, k) return game:GetService(k) end })
local Client          = Services.Players.LocalPlayer
local Connect         = (WebSocket and WebSocket.connect)

if not Connect then
    return Client:Kick("Executor is too shitty.")
end

local function Main()
    local ok, Socket = pcall(Connect, "ws://localhost:9000/")
    if not ok then return end
    local Closed = false
    local Http   = Services.HttpService

    -- Authorise
    Socket:Send(Http:JSONEncode({ Method = "Authorization", Name = Client.Name }))

    -- Receive
    Socket.OnMessage:Connect(function(raw)
        local data = Http:JSONDecode(raw)
        if data.Method == "Execute" then
            local fn, err = loadstring(data.Data)
            if not fn then
                return Socket:Send(Http:JSONEncode({ Method = "Error", Message = err }))
            end
            pcall(fn)
        end
    end)

    -- Forward every MessageOut line to VS Code
    Services.LogService.MessageOut:Connect(function(msg)
        Socket:Send(Http:JSONEncode({
            Method  = "LogOutput",
            Name    = Client.Name,
            Message = msg
        }))
    end)

    Socket.OnClose:Connect(function() Closed = true end)
    repeat task.wait() until Closed
end

while task.wait(1) do
    local ok, err = pcall(Main)
    if not ok then warn(err) end
end

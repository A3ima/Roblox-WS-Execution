repeat task.wait() until game:IsLoaded()

local Success, Data       = pcall(game.HttpGet, game, "https://raw.githubusercontent.com/A3ima/Roblox-WS-Execution/main/Client.lua")
local Success, Function   = pcall(loadstring, Data)

Function()

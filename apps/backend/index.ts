import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import { WorkspaceModel } from "db";
import { CreateWorkspaceSchema } from "commons";
import { UserManager } from "./UserManager";

await mongoose.connect(process.env.DB_URL!);

const server = new WebSocketServer({ port: 8080 });

server.on("connection", (ws) => {
  UserManager.getInstance().addUser(ws);
})
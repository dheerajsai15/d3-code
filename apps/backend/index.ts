import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import { WorkspaceModel } from "db";

await mongoose.connect(process.env.DB_URL!);

const server = new WebSocketServer({ port: 8080 });

server.on("connection", (ws) => {
  ws.on("message", (msg) => {
    console.log(msg)

    WorkspaceModel.create({
      path: "11/23123/11",
      name: "Test WorkspaceModel"
    })
  })
})
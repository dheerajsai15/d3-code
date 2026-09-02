import type { WebSocket } from "ws"
import { User } from "./User";
import { uuid } from "uuidv4";
import { SessionModel, WorkspaceModel } from "db";
import type { Message, Session, Workspace } from "commons";

export class UserManager{
  private users: User[];
  private static instance: UserManager | null;
  private constructor() {
    this.users = [];
  }

  static getInstance() {
    if (UserManager.instance == null)
      UserManager.instance = new UserManager();
    return UserManager.instance;
  }

  async addUser(ws: WebSocket) {
    const id = uuid();
    const user = new User(id, ws);
    this.users.push(user);

    const workspaces = await WorkspaceModel.find();
    const sessions = await SessionModel.find();

    const response: Workspace[] = [];

    workspaces.forEach(w => {
      const sesArr: Session[] = [];

      sessions.forEach(s => {
        // ObjectId instances are compared by identity with ===, which is never
        // true for two separately-loaded documents. equals() compares the value.
        if (s.workspace?.equals(w._id)) {
          sesArr.push({
            id: s._id.toString(),
            messages: (s.conversation ?? []) as Message[]
          })
        }
      })

      response.push({
        id: w._id.toString(),
        name: w.name!,
        path: w.path!,
        sessions: sesArr
      })
    })
    
    ws.send(JSON.stringify({
      type: "init",
      workspaces: response
    }))

    ws.on("message",async (msg) => {
      try{
        const parsedMessage = JSON.parse(msg.toString());
        console.log(parsedMessage)
        const responsePayload = await user.handleIncomingMessage(parsedMessage);
        if(responsePayload.type != "message-added")
          user.sendMessage(responsePayload)
      } catch (e) {
        
        console.error(`User sent non JSON format input`)
        console.log(msg.toString())
      }
    })

    ws.on("close", () => {
      this.users = this.users.filter(user => user.getId() != id)
    })
  }
}
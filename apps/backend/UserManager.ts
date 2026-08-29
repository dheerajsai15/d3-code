import type { WebSocket } from "ws"
import { User } from "./User";
import { uuid } from "uuidv4";

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

  addUser(ws: WebSocket) {
    const id = uuid();
    const user = new User(id, ws);
    this.users.push(user);

    ws.on("message",async (msg) => {
      try{
        const parsedMessage = JSON.parse(msg.toString());
        const responsePayload = await user.handleIncomingMessage(parsedMessage);
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
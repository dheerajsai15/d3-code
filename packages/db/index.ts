import mongoose, { Schema } from "mongoose";

export const Workspace = new mongoose.Schema({
  path: String,
  name: String
}); 

export const Session = new mongoose.Schema({
  conversation: [Schema.Types.Mixed],
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace' },
  anthropicSessionId: String
});

export const SessionModel = mongoose.model("Session", Session);
export const WorkspaceModel = mongoose.model("Workspace", Workspace);
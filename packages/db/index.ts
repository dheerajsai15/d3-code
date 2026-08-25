import mongoose, { Schema } from "mongoose";

export const Workspace = new mongoose.Schema({
  path: String,
  name: String
}); 

export const Session = new mongoose.Schema({
  conversation: [Object],
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace'}
}); 

export const SessionModel = mongoose.model("Session", Session);
export const WorkspaceModel = mongoose.model("Workspace", Workspace);
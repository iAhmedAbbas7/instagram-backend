// <= IMPORTS =>
import { Message } from "../models/message.model.js";
import expressAsyncHandler from "express-async-handler";
import { Conversation } from "../models/conversation.model.js";

// <= SEND MESSAGE =>
export const sendMessage = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT SENDER ID FROM REQUEST ID
  const senderId = req.id;
  // GETTING THE RECEIVER ID FROM REQUEST PARAMS
  const receiverId = req.params.id;
  // GETTING THE MESSAGE FROM REQUEST BODY
  const { message } = req.body;
  // CHECKING IF THE MESSAGE IS EMPTY
  if (!message || message.trim() === "") {
    return res
      .status(400)
      .json({ message: "Message Cannot be Empty!", success: false });
  }
  // CHECKING IF THEY ALREADY HAVE AN ACTIVE CONVERSATION
  const haveConversation = await Conversation.findOne({
    participants: { $all: [senderId, receiverId] },
  });
  // IF THEY DO NOT HAVE AN ACTIVE CONVERSATION
  if (!haveConversation) {
    // CREATING NEW CONVERSATION BETWEEN THEM
    const newConversation = await Conversation.create({
      participants: [senderId, receiverId],
    });
    // CREATING THE MESSAGE
    const newMessage = await Message.create({
      senderId,
      receiverId,
      message,
    });
    // PUSHING THE MESSAGE IN THE NEW CONVERSATION
    newConversation.messages.push(newMessage._id);
    // SAVING THE CONVERSATION
    await newConversation.save();
    // RETURNING RESPONSE
    return res.status(201).json({ success: true, newMessage });
  } else {
    // CREATING THE MESSAGE
    const newMessage = await Message.create({
      senderId,
      receiverId,
      message,
    });
    // PUSHING THE MESSAGE IN THE EXISTING CONVERSATION
    haveConversation.messages.push(newMessage._id);
    // SAVING THE CONVERSATION
    await haveConversation.save();
    // RETURNING RESPONSE
    return res.status(201).json({ success: true, newMessage });
  }
});

// <= GET ALL MESSAGES =>
export const getAllMessages = expressAsyncHandler(async (req, res) => {
  // GETTING THE CURRENT LOGGED IN USER ID
  const userId = req.id;
  // GETTING THE OTHER PARTICIPANT ID FROM REQUEST PARAMS
  const receiverId = req.params.id;
  // CHECKING IF THEY HAVE AN ACTIVE CONVERSATION
  const conversation = await Conversation.findOne({
    participants: { $all: [userId, receiverId] },
  });
  // IF THEY DO NOT HAVE AN ACTIVE CONVERSATION THEN SENDING EMPTY MESSAGES ARRAY
  if (!conversation)
    return res.status(200).json({ success: true, messages: [] });
  // IF THEY HAVE AN ACTIVE CONVERSATION THEN GETTING ALL THE MESSAGES
  return res
    .status(200)
    .json({ success: true, messages: conversation?.messages });
});
